const express = require('express');
const { query, transaction } = require('../config/database');
const { authenticate, requireMinRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const { isSuperAdmin, tenantAdminId, verifyCaseAccess } = require('../utils/tenantAccess');
const { loadCompanySettings } = require('./settings');
const { formatNumberSequence, getCompanyNumberFormat, getCompanyNumberStart } = require('../utils/numberFormatting');

const router = express.Router();
router.use(authenticate);

// Payments routes
router.get('/case/:case_id', async (req, res) => {
  try {
    if (!isSuperAdmin(req.user) && !(await verifyCaseAccess(req.params.case_id, req.user))) {
      return res.status(404).json({ error: 'Case not found' });
    }
    const result = await query(
      `SELECT p.*, q.estimated_cost, q.parts_cost, q.service_cost, q.total_amount as quoted_total, u.full_name as recorded_by_name
       FROM payments p
       LEFT JOIN quotations q ON p.quotation_id = q.id
       LEFT JOIN users u ON p.recorded_by = u.id
       WHERE p.case_id = $1 ORDER BY p.created_at DESC`,
      [req.params.case_id]
    );
    const summary = await query(
      `SELECT COALESCE(SUM(amount) FILTER (WHERE status='paid'),0) as total_paid, COALESCE(SUM(amount) FILTER (WHERE status='pending'),0) as pending FROM payments WHERE case_id = $1`,
      [req.params.case_id]
    );
    res.json({ payments: result.rows, summary: summary.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/quotations', requireMinRole('staff'), auditLog('create_quotation', 'payment'), async (req, res) => {
  try {
    const { case_id, estimated_cost, parts_cost, service_cost, tax_pct, valid_until, notes } = req.body;
    if (!isSuperAdmin(req.user) && !(await verifyCaseAccess(case_id, req.user))) {
      return res.status(404).json({ error: 'Case not found' });
    }
    const total = parseFloat(estimated_cost || 0) * (1 + parseFloat(tax_pct || 18) / 100);
    const companySettings = await loadCompanySettings();
    const qNumResult = await query('SELECT COUNT(*) FROM quotations');
    const qCount = parseInt(qNumResult.rows[0].count, 10) || 0;
    const qStart = getCompanyNumberStart(companySettings, 'quote_number_start');
    const qSequence = qCount + qStart;
    const qNum = formatNumberSequence(
      getCompanyNumberFormat(companySettings, 'quote_number_format', 'QT-{YYYY}-{NNNN}'),
      qSequence
    );

    const result = await query(
      `INSERT INTO quotations (case_id, quote_number, estimated_cost, parts_cost, service_cost, tax_pct, total_amount, valid_until, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [case_id, qNum, estimated_cost, parts_cost||0, service_cost||0, tax_pct||18, total.toFixed(2), valid_until||null, notes||null, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', requireMinRole('staff'), auditLog('record_payment', 'payment'), async (req, res) => {
  try {
    const { case_id, quotation_id, amount, method, reference_number, notes } = req.body;
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'A valid payment amount is required' });
    }
    if (!isSuperAdmin(req.user) && !(await verifyCaseAccess(case_id, req.user))) {
      return res.status(404).json({ error: 'Case not found' });
    }
    const result = await transaction(async (client) => {
      const pay = await client.query(
        `INSERT INTO payments (case_id, quotation_id, amount, method, reference_number, status, paid_at, notes, recorded_by)
         VALUES ($1,$2,$3,$4,$5,'paid',NOW(),$6,$7) RETURNING *`,
        [case_id, quotation_id||null, parsedAmount, method, reference_number||null, notes||null, req.user.id]
      );
      await client.query(
        'UPDATE clients SET total_paid = COALESCE(total_paid,0) + $1 WHERE id = (SELECT client_id FROM cases WHERE id = $2)',
        [parsedAmount, case_id]
      );
      return pay.rows[0];
    });
    res.status(201).json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/quotations/:id/approve', requireMinRole('staff'), async (req, res) => {
  try {
    const { approved } = req.body;
    if (!isSuperAdmin(req.user)) {
      const access = await query(
        `SELECT q.id FROM quotations q
         WHERE q.id = $1 AND q.tenant_id = $2`,
        [req.params.id, tenantAdminId(req.user)]
      );
      if (!access.rows.length) return res.status(404).json({ error: 'Quotation not found' });
    }
    const result = await query(
      `UPDATE quotations SET approved_by_client = $1, approved_at = NOW(), updated_at = NOW() WHERE id = $2 RETURNING *`,
      [approved, req.params.id]
    );
    if (approved) {
      // Auto-transition case to approved
      await query(`UPDATE cases SET stage = 'approved', updated_at = NOW() WHERE id = (SELECT case_id FROM quotations WHERE id = $1) AND stage = 'quotation'`, [req.params.id]);
    }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticate, requireMinRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const { isSuperAdmin, tenantClientCondition, tenantAdminId, verifyClientAccess } = require('../utils/tenantAccess');

const router = express.Router();
router.use(authenticate);

// ─── GET /api/clients ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, is_corporate, is_vip, sort = 'created_at', order = 'desc' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params = [];
    let pi = 1;

    if (!isSuperAdmin(req.user)) {
      const tenantCondition = tenantClientCondition(req.user, 'cl', pi);
      conditions.push(tenantCondition.clause);
      params.push(...tenantCondition.params);
      pi += tenantCondition.params.length;
    }
    if (search) {
      conditions.push(`(cl.first_name ILIKE $${pi} OR cl.last_name ILIKE $${pi} OR cl.phone ILIKE $${pi} OR cl.email ILIKE $${pi} OR cl.client_code ILIKE $${pi} OR cl.company ILIKE $${pi})`);
      params.push(`%${search}%`); pi++;
    }
    if (is_corporate !== undefined) { conditions.push(`cl.is_corporate = $${pi++}`); params.push(is_corporate === 'true'); }
    if (is_vip !== undefined) { conditions.push(`cl.is_vip = $${pi++}`); params.push(is_vip === 'true'); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const countResult = await query(`SELECT COUNT(*) FROM clients cl ${where}`, params);

    const allowedSort = ['client_code', 'first_name', 'last_name', 'company', 'created_at', 'active_cases', 'total_cases', 'pending_amount', 'total_paid'];
    const sortKey = allowedSort.includes(sort) ? sort : 'created_at';
    const dir = order === 'asc' ? 'ASC' : 'DESC';

    let orderBy = 'cl.created_at DESC';
    if (sortKey === 'client_code') orderBy = `cl.client_code ${dir}`;
    else if (sortKey === 'first_name') orderBy = `cl.first_name ${dir}, cl.last_name ${dir}`;
    else if (sortKey === 'last_name') orderBy = `cl.last_name ${dir}, cl.first_name ${dir}`;
    else if (sortKey === 'company') orderBy = `cl.company ${dir} NULLS LAST`;
    else if (sortKey === 'active_cases') orderBy = `active_cases ${dir}`;
    else if (sortKey === 'total_cases') orderBy = `total_cases ${dir}`;
    else if (sortKey === 'pending_amount') orderBy = `pending_amount ${dir}`;
    else if (sortKey === 'total_paid') orderBy = `cl.total_paid ${dir}`;
    else orderBy = `cl.created_at ${dir}`;

    const result = await query(
      `SELECT cl.*, 
              COUNT(c.id) FILTER (WHERE c.stage NOT IN ('completed','delivered','failed')) AS active_cases,
              COUNT(c.id) AS total_cases,
              MAX(c.created_at) AS last_case_date,
              COALESCE(SUM(
                CASE
                  WHEN q.total_amount IS NULL THEN 0
                  ELSE GREATEST(q.total_amount - COALESCE(q.paid_on_quote, 0), 0)
                END
              ), 0) AS pending_amount
       FROM clients cl
       LEFT JOIN cases c ON cl.id = c.client_id
       LEFT JOIN LATERAL (
         SELECT q.total_amount,
                COALESCE((SELECT SUM(amount) FILTER (WHERE status = 'paid')
                          FROM payments p
                          WHERE p.case_id = c.id AND p.quotation_id = q.id), 0) AS paid_on_quote
         FROM quotations q
         WHERE q.case_id = c.id
         ORDER BY q.created_at DESC
         LIMIT 1
       ) q ON TRUE
       ${where}
       GROUP BY cl.id
       ORDER BY ${orderBy}
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      clients: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit))
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/clients ────────────────────────────────────────────
router.post('/',
  requireMinRole('staff'),
  [
    body('first_name').trim().notEmpty().isLength({ max: 100 }),
    body('last_name').trim().notEmpty().isLength({ max: 100 }),
    body('phone').trim().notEmpty().isLength({ max: 30 }),
    body('email').optional().isEmail().normalizeEmail(),
  ],
  auditLog('create_client', 'client'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    try {
      const {
        first_name, last_name, email, phone, phone_alt, company, address,
        city, country, id_type, id_number, referral_source, notes, is_corporate, is_vip
      } = req.body;

      const result = await query(
        `INSERT INTO clients (
          first_name, last_name, email, phone, phone_alt, company, address,
          city, country, id_type, id_number, referral_source, notes,
          is_corporate, is_vip, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
        [first_name, last_name, email||null, phone, phone_alt||null, company||null, address||null, city||null, country||'India', id_type||null, id_number||null, referral_source||null, notes||null, is_corporate||false, is_vip||false, req.user.id]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      if (err.constraint === 'clients_email_key') {
        return res.status(409).json({ error: 'A client with this email already exists' });
      }
      res.status(500).json({ error: err.message });
    }
  }
);

// ─── GET /api/clients/:id ─────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    if (!isSuperAdmin(req.user) && !(await verifyClientAccess(req.params.id, req.user))) {
      return res.status(404).json({ error: 'Client not found' });
    }
    const result = await query(`SELECT cl.*, u.full_name as created_by_name FROM clients cl LEFT JOIN users u ON cl.created_by = u.id WHERE cl.id = $1`, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Client not found' });

    const cases = await query(
      `SELECT c.id, c.case_number, c.stage, c.priority, c.failure_type, c.device_brand, c.device_model, c.created_at, c.completed_at,
              COALESCE(q.total_amount, 0) AS quotation_total,
              COALESCE(paid.total_paid, 0) AS total_paid,
              GREATEST(COALESCE(q.total_amount, 0) - COALESCE(paid.total_paid, 0), 0) AS pending_amount
       FROM cases c
       LEFT JOIN LATERAL (
         SELECT q.total_amount
         FROM quotations q
         WHERE q.case_id = c.id
         ORDER BY q.created_at DESC LIMIT 1
       ) q ON TRUE
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) AS total_paid
         FROM payments p
         WHERE p.case_id = c.id
       ) paid ON TRUE
       WHERE c.client_id = $1 ORDER BY c.created_at DESC`,
      [req.params.id]
    );

    const comms = await query(
      `SELECT cc.*, u.full_name as staff_name FROM client_communications cc
       LEFT JOIN users u ON cc.user_id = u.id
       WHERE cc.client_id = $1 ORDER BY cc.created_at DESC LIMIT 20`,
      [req.params.id]
    );

    const payments = await query(
      `SELECT COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'paid'), 0) as total_paid,
              COUNT(p.*) as payment_count
       FROM payments p
       JOIN cases c ON p.case_id = c.id
       WHERE c.client_id = $1`,
      [req.params.id]
    );

    const pendingSummary = await query(
      `SELECT COALESCE(SUM(GREATEST(COALESCE(q.total_amount, 0) - COALESCE(paid.total_paid, 0), 0)), 0) AS pending
       FROM cases c
       LEFT JOIN LATERAL (
         SELECT q.total_amount
         FROM quotations q
         WHERE q.case_id = c.id
         ORDER BY q.created_at DESC LIMIT 1
       ) q ON TRUE
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) AS total_paid
         FROM payments p
         WHERE p.case_id = c.id
       ) paid ON TRUE
       WHERE c.client_id = $1`,
      [req.params.id]
    );

    res.json({
      ...result.rows[0],
      cases: cases.rows,
      communications: comms.rows,
      paymentSummary: {
        ...payments.rows[0],
        pending: pendingSummary.rows[0].pending,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/clients/:id ─────────────────────────────────────────
router.put('/:id', requireMinRole('staff'), auditLog('update_client', 'client'), async (req, res) => {
  try {
    const { first_name, last_name, email, phone, phone_alt, company, address, city, country, notes, is_corporate, is_vip } = req.body;
    if (!isSuperAdmin(req.user) && !(await verifyClientAccess(req.params.id, req.user))) {
      return res.status(404).json({ error: 'Client not found' });
    }
    const result = await query(
      `UPDATE clients SET first_name=COALESCE($1,first_name), last_name=COALESCE($2,last_name), email=COALESCE($3,email), phone=COALESCE($4,phone), phone_alt=$5, company=$6, address=$7, city=$8, country=COALESCE($9,country), notes=$10, is_corporate=COALESCE($11,is_corporate), is_vip=COALESCE($12,is_vip), updated_at=NOW() WHERE id=$13 RETURNING *`,
      [first_name, last_name, email, phone, phone_alt, company, address, city, country, notes, is_corporate, is_vip, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Client not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/clients/:id/communications ────────────────────────
router.post('/:id/communications', requireMinRole('staff'), async (req, res) => {
  try {
    if (!isSuperAdmin(req.user) && !(await verifyClientAccess(req.params.id, req.user))) {
      return res.status(404).json({ error: 'Client not found' });
    }
    const { type, direction, summary, follow_up_date } = req.body;
    const result = await query(
      `INSERT INTO client_communications (client_id, user_id, type, direction, summary, follow_up_date)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, req.user.id, type, direction||'outbound', summary, follow_up_date||null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/clients/:id/collect-pending ────────────────────────
router.post('/:id/collect-pending', requireMinRole('staff'), auditLog('collect_client_pending', 'payment'), async (req, res) => {
  try {
    if (!isSuperAdmin(req.user) && !(await verifyClientAccess(req.params.id, req.user))) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const pendingCases = await query(
      `SELECT
         c.id AS case_id,
         c.case_number,
         q.id AS quotation_id,
         COALESCE(q.total_amount, 0) AS quotation_total,
         COALESCE(paid.total_paid, 0) AS total_paid,
         GREATEST(COALESCE(q.total_amount, 0) - COALESCE(paid.total_paid, 0), 0) AS pending_amount
       FROM cases c
       LEFT JOIN LATERAL (
         SELECT q.id, q.total_amount
         FROM quotations q
         WHERE q.case_id = c.id
         ORDER BY q.created_at DESC
         LIMIT 1
       ) q ON TRUE
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) AS total_paid
         FROM payments p
         WHERE p.case_id = c.id
       ) paid ON TRUE
       WHERE c.client_id = $1`,
      [req.params.id]
    );

    const toCollect = pendingCases.rows.filter((row) => parseFloat(row.pending_amount || 0) > 0);
    if (!toCollect.length) {
      return res.json({
        ok: true,
        message: 'No pending amount to collect.',
        collected_amount: 0,
        updated_cases: 0,
      });
    }

    let collectedAmount = 0;
    for (const row of toCollect) {
      const amount = parseFloat(row.pending_amount || 0);
      await query(
        `INSERT INTO payments (case_id, quotation_id, amount, status, method, notes, paid_at, recorded_by)
         VALUES ($1, $2, $3, 'paid', 'Client Collect', $4, NOW(), $5)`,
        [row.case_id, row.quotation_id || null, amount, 'Collected from Clients page', req.user.id]
      );
      collectedAmount += amount;
    }

    await query('UPDATE clients SET total_paid = total_paid + $1, updated_at = NOW() WHERE id = $2', [collectedAmount, req.params.id]);

    res.json({
      ok: true,
      message: `Collected ₹${collectedAmount.toLocaleString('en-IN')} successfully.`,
      collected_amount: collectedAmount,
      updated_cases: toCollect.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

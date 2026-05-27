const express = require('express');
const { query } = require('../config/database');
const { authenticate, requireMinRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const { isSuperAdmin, tenantAdminId } = require('../utils/tenantAccess');

const router = express.Router();
router.use(authenticate);

function tenantScope(req, alias = '') {
  if (isSuperAdmin(req.user)) return { clause: '', params: [] };
  const prefix = alias ? `${alias}.` : '';
  return {
    clause: `${prefix}tenant_id = $1`,
    params: [tenantAdminId(req.user)],
  };
}

// ─── GET /api/accounting/summary ─────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    const quoteScope = tenantScope(req);
    const invoiceScope = tenantScope(req);
    const expenseScope = tenantScope(req);
    const [qStats, invStats, expStats] = await Promise.all([
      query(`SELECT
        COUNT(*) as total_quotes,
        COUNT(*) FILTER (WHERE status IN ('accepted','invoiced')) as accepted_quotes,
        COALESCE(SUM(total) FILTER (WHERE status IN ('accepted','invoiced')), 0) as accepted_value
        FROM accounting_quotes${quoteScope.clause ? ` WHERE ${quoteScope.clause}` : ''}`,
        quoteScope.params),
      query(`SELECT
        COUNT(*) as total_invoices,
        COALESCE(SUM(total), 0) as total_invoiced,
        COALESCE(SUM(amount_paid), 0) as total_collected,
        COALESCE(SUM(total - amount_paid) FILTER (WHERE status NOT IN ('cancelled','paid')), 0) as outstanding,
        COALESCE(SUM(total) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days'), 0) as revenue_month,
        COALESCE(SUM(amount_paid) FILTER (WHERE status = 'paid' AND updated_at >= NOW() - INTERVAL '30 days'), 0) as collected_month
        FROM accounting_invoices${invoiceScope.clause ? ` WHERE ${invoiceScope.clause}` : ''}`,
        invoiceScope.params),
      query(`SELECT
        COALESCE(SUM(total), 0) as total_expenses,
        COALESCE(SUM(total) FILTER (WHERE date >= NOW() - INTERVAL '30 days'), 0) as expenses_month
        FROM accounting_expenses${expenseScope.clause ? ` WHERE ${expenseScope.clause}` : ''}`,
        expenseScope.params),
    ]);

    const inv = invStats.rows[0];
    const exp = expStats.rows[0];
    const profit_month = parseFloat(inv.collected_month) - parseFloat(exp.expenses_month);

    res.json({
      ...qStats.rows[0],
      ...inv,
      ...exp,
      profit_month,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Quotes ───────────────────────────────────────────────────────
router.get('/quotes', async (req, res) => {
  try {
    const { search, status } = req.query;
    const conditions = [], params = [];
    let pi = 1;
    if (!isSuperAdmin(req.user)) {
      conditions.push(`tenant_id = $${pi++}`);
      params.push(tenantAdminId(req.user));
    }
    if (status) { conditions.push(`status = $${pi++}`); params.push(status); }
    if (search) {
      conditions.push(`(title ILIKE $${pi} OR client_name ILIKE $${pi} OR quote_number ILIKE $${pi})`);
      params.push(`%${search}%`); pi++;
    }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const result = await query(`SELECT * FROM accounting_quotes ${where} ORDER BY created_at DESC`, params);
    res.json({ quotes: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/quotes', requireMinRole('staff'), auditLog('create_quote', 'accounting'), async (req, res) => {
  try {
    const { title, client_name, company, case_number, line_items, discount_pct, tax_pct, valid_until, notes } = req.body;
    const li = line_items || [];
    const subtotal = li.reduce((s, l) => s + (l.qty || 1) * (l.unit_price || 0), 0);
    const discountAmt = Math.round(subtotal * (discount_pct || 0) / 100 * 100) / 100;
    const taxAmt = Math.round((subtotal - discountAmt) * (tax_pct || 18) / 100 * 100) / 100;
    const total = subtotal - discountAmt + taxAmt;

    const numResult = await query('SELECT COUNT(*) FROM accounting_quotes');
    const qNum = `QT-${String(parseInt(numResult.rows[0].count) + 1).padStart(5, '0')}`;

    const result = await query(
      `INSERT INTO accounting_quotes
         (quote_number, title, client_name, company, case_number, line_items,
          discount_pct, discount_amt, tax_pct, tax_amt, subtotal, total, valid_until, notes, created_by, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [qNum, title, client_name, company || null, case_number || null, JSON.stringify(li),
       discount_pct || 0, discountAmt, tax_pct || 18, taxAmt, subtotal, total,
       valid_until || null, notes || null, req.user.id, tenantAdminId(req.user)]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/quotes/:id', requireMinRole('staff'), auditLog('update_quote', 'accounting'), async (req, res) => {
  try {
    const { title, client_name, company, case_number, line_items, discount_pct, tax_pct, valid_until, notes } = req.body;
    const li = line_items || [];
    const subtotal = li.reduce((s, l) => s + (l.qty || 1) * (l.unit_price || 0), 0);
    const discountAmt = Math.round(subtotal * (discount_pct || 0) / 100 * 100) / 100;
    const taxAmt = Math.round((subtotal - discountAmt) * (tax_pct || 18) / 100 * 100) / 100;
    const total = subtotal - discountAmt + taxAmt;

    const result = await query(
      `UPDATE accounting_quotes SET
         title=$1, client_name=$2, company=$3, case_number=$4, line_items=$5,
         discount_pct=$6, discount_amt=$7, tax_pct=$8, tax_amt=$9, subtotal=$10,
         total=$11, valid_until=$12, notes=$13, updated_at=NOW()
       WHERE id=$14${!isSuperAdmin(req.user) ? ' AND tenant_id = $15' : ''} RETURNING *`,
      !isSuperAdmin(req.user)
        ? [title, client_name, company || null, case_number || null, JSON.stringify(li),
       discount_pct || 0, discountAmt, tax_pct || 18, taxAmt, subtotal,
       total, valid_until || null, notes || null, req.params.id, tenantAdminId(req.user)]
        : [title, client_name, company || null, case_number || null, JSON.stringify(li),
       discount_pct || 0, discountAmt, tax_pct || 18, taxAmt, subtotal,
       total, valid_until || null, notes || null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Quote not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/quotes/:id/status', requireMinRole('staff'), async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['draft', 'sent', 'accepted', 'rejected', 'invoiced'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const result = await query(
      `UPDATE accounting_quotes SET status=$1, updated_at=NOW() WHERE id=$2${!isSuperAdmin(req.user) ? ' AND tenant_id = $3' : ''} RETURNING *`,
      !isSuperAdmin(req.user) ? [status, req.params.id, tenantAdminId(req.user)] : [status, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Quote not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/quotes/:id', requireMinRole('staff'), auditLog('delete_quote', 'accounting'), async (req, res) => {
  try {
    const result = await query(
      `DELETE FROM accounting_quotes WHERE id=$1${!isSuperAdmin(req.user) ? ' AND tenant_id = $2' : ''} RETURNING id`,
      !isSuperAdmin(req.user) ? [req.params.id, tenantAdminId(req.user)] : [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Quote not found' });
    res.json({ message: 'Quote deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/quotes/:id/invoice', requireMinRole('staff'), auditLog('convert_quote_invoice', 'accounting'), async (req, res) => {
  try {
    const { client_address, client_gstin } = req.body;
    const quote = await query(
      `SELECT * FROM accounting_quotes WHERE id=$1${!isSuperAdmin(req.user) ? ' AND tenant_id = $2' : ''}`,
      !isSuperAdmin(req.user) ? [req.params.id, tenantAdminId(req.user)] : [req.params.id]
    );
    if (!quote.rows.length) return res.status(404).json({ error: 'Quote not found' });
    const q = quote.rows[0];

    const numResult = await query('SELECT COUNT(*) FROM accounting_invoices');
    const invNum = `INV-${String(parseInt(numResult.rows[0].count) + 1).padStart(5, '0')}`;
    const dueDate = new Date(Date.now() + 15 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    const result = await query(
      `INSERT INTO accounting_invoices
         (invoice_number, quote_id, title, client_name, company, client_address, client_gstin,
          case_number, line_items, discount_pct, discount_amt, tax_pct, tax_amt, subtotal, total, due_date, notes, created_by, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
      [invNum, q.id, q.title, q.client_name, q.company, client_address || null, client_gstin || null,
       q.case_number, q.line_items, q.discount_pct, q.discount_amt, q.tax_pct, q.tax_amt,
       q.subtotal, q.total, dueDate, q.notes, req.user.id, q.tenant_id || tenantAdminId(req.user)]
    );

    await query(
      `UPDATE accounting_quotes SET status='invoiced', updated_at=NOW() WHERE id=$1${!isSuperAdmin(req.user) ? ' AND tenant_id = $2' : ''}`,
      !isSuperAdmin(req.user) ? [q.id, tenantAdminId(req.user)] : [q.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Invoices ─────────────────────────────────────────────────────
router.get('/invoices', async (req, res) => {
  try {
    const { search, status } = req.query;
    const conditions = [], params = [];
    let pi = 1;
    if (!isSuperAdmin(req.user)) {
      conditions.push(`tenant_id = $${pi++}`);
      params.push(tenantAdminId(req.user));
    }
    if (status) { conditions.push(`status = $${pi++}`); params.push(status); }
    if (search) {
      conditions.push(`(title ILIKE $${pi} OR client_name ILIKE $${pi} OR invoice_number ILIKE $${pi})`);
      params.push(`%${search}%`); pi++;
    }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const result = await query(`SELECT * FROM accounting_invoices ${where} ORDER BY created_at DESC`, params);
    res.json({ invoices: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/invoices', requireMinRole('staff'), auditLog('create_invoice', 'accounting'), async (req, res) => {
  try {
    const { title, client_name, company, client_address, client_gstin, case_number, line_items, discount_pct, tax_pct, due_date, notes } = req.body;
    const li = line_items || [];
    const subtotal = li.reduce((s, l) => s + (l.qty || 1) * (l.unit_price || 0), 0);
    const discountAmt = Math.round(subtotal * (discount_pct || 0) / 100 * 100) / 100;
    const taxAmt = Math.round((subtotal - discountAmt) * (tax_pct || 18) / 100 * 100) / 100;
    const total = subtotal - discountAmt + taxAmt;

    const numResult = await query('SELECT COUNT(*) FROM accounting_invoices');
    const invNum = `INV-${String(parseInt(numResult.rows[0].count) + 1).padStart(5, '0')}`;

    const result = await query(
      `INSERT INTO accounting_invoices
         (invoice_number, title, client_name, company, client_address, client_gstin, case_number,
          line_items, discount_pct, discount_amt, tax_pct, tax_amt, subtotal, total, due_date, notes, created_by, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [invNum, title, client_name, company || null, client_address || null, client_gstin || null,
       case_number || null, JSON.stringify(li), discount_pct || 0, discountAmt, tax_pct || 18,
       taxAmt, subtotal, total, due_date || null, notes || null, req.user.id, tenantAdminId(req.user)]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/invoices/:id/status', requireMinRole('staff'), async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['unpaid', 'paid', 'partial', 'overdue', 'cancelled'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const result = await query(
      `UPDATE accounting_invoices SET status=$1, updated_at=NOW() WHERE id=$2${!isSuperAdmin(req.user) ? ' AND tenant_id = $3' : ''} RETURNING *`,
      !isSuperAdmin(req.user) ? [status, req.params.id, tenantAdminId(req.user)] : [status, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Invoice not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/invoices/:id', requireMinRole('staff'), auditLog('delete_invoice', 'accounting'), async (req, res) => {
  try {
    const result = await query(
      `DELETE FROM accounting_invoices WHERE id=$1${!isSuperAdmin(req.user) ? ' AND tenant_id = $2' : ''} RETURNING id`,
      !isSuperAdmin(req.user) ? [req.params.id, tenantAdminId(req.user)] : [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Invoice not found' });
    res.json({ message: 'Invoice deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/invoices/:id/payments', requireMinRole('staff'), auditLog('record_invoice_payment', 'accounting'), async (req, res) => {
  try {
    const { amount, method, reference, note } = req.body;
    const inv = await query(
      `SELECT * FROM accounting_invoices WHERE id=$1${!isSuperAdmin(req.user) ? ' AND tenant_id = $2' : ''}`,
      !isSuperAdmin(req.user) ? [req.params.id, tenantAdminId(req.user)] : [req.params.id]
    );
    if (!inv.rows.length) return res.status(404).json({ error: 'Invoice not found' });

    await query(
      `INSERT INTO accounting_invoice_payments (invoice_id, amount, method, reference, note, recorded_by, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [req.params.id, amount, method || null, reference || null, note || null, req.user.id, inv.rows[0].tenant_id || tenantAdminId(req.user)]
    );

    const newPaid = parseFloat(inv.rows[0].amount_paid) + parseFloat(amount);
    const newStatus = newPaid >= parseFloat(inv.rows[0].total) ? 'paid' : 'partial';

    await query(
      `UPDATE accounting_invoices SET amount_paid=$1, status=$2, updated_at=NOW() WHERE id=$3${!isSuperAdmin(req.user) ? ' AND tenant_id = $4' : ''}`,
      !isSuperAdmin(req.user)
        ? [newPaid, newStatus, req.params.id, tenantAdminId(req.user)]
        : [newPaid, newStatus, req.params.id]
    );

    res.json({ message: 'Payment recorded', amount_paid: newPaid, status: newStatus });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Expenses ─────────────────────────────────────────────────────
router.get('/expenses', async (req, res) => {
  try {
    const { search } = req.query;
    const params = [];
    let where = '';
    let pi = 1;
    if (!isSuperAdmin(req.user)) {
      where = `WHERE tenant_id = $${pi++}`;
      params.push(tenantAdminId(req.user));
    }
    if (search) {
      where += where ? ` AND (description ILIKE $${pi} OR vendor ILIKE $${pi})` : `WHERE description ILIKE $${pi} OR vendor ILIKE $${pi}`;
      params.push(`%${search}%`);
    }
    const result = await query(
      `SELECT * FROM accounting_expenses ${where} ORDER BY date DESC, created_at DESC`,
      params
    );
    res.json({ expenses: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/expenses', requireMinRole('staff'), auditLog('create_expense', 'accounting'), async (req, res) => {
  try {
    const { date, category, description, vendor, amount, tax_amt, receipt_note } = req.body;
    const total = (parseFloat(amount) || 0) + (parseFloat(tax_amt) || 0);
    const result = await query(
      `INSERT INTO accounting_expenses (date, category, description, vendor, amount, tax_amt, total, receipt_note, created_by, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [date, category || 'other', description, vendor || null, amount, tax_amt || 0, total, receipt_note || null, req.user.id, tenantAdminId(req.user)]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/expenses/:id', requireMinRole('staff'), auditLog('delete_expense', 'accounting'), async (req, res) => {
  try {
    const result = await query(
      `DELETE FROM accounting_expenses WHERE id=$1${!isSuperAdmin(req.user) ? ' AND tenant_id = $2' : ''} RETURNING id`,
      !isSuperAdmin(req.user) ? [req.params.id, tenantAdminId(req.user)] : [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Expense not found' });
    res.json({ message: 'Expense deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

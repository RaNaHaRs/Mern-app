const express = require('express');
const { query, transaction } = require('../config/database');
const { authenticate, requireMinRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const automationService = require('../services/automationService');
const { isSuperAdmin, tenantAdminId } = require('../utils/tenantAccess');
const { loadCompanySettings } = require('./settings');
const { formatNumberSequence, getCompanyNumberFormat, getCompanyNumberStart } = require('../utils/numberFormatting');
const { normalizeUiCategory, toDbCategory } = require('../utils/hddCategoryMap');

const router = express.Router();
router.use(authenticate);

// Ensure soft-delete column exists on accounting tables (non-blocking)
['accounting_expenses', 'accounting_purchases', 'accounting_invoices'].forEach(table => {
  query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`).catch(() => {});
});

function tenantScope(req, alias = '') {
  if (isSuperAdmin(req.user)) return { clause: '', params: [] };
  const pre = alias ? `${alias}.` : '';
  return {
    clause: `(${pre}created_by = $1 OR EXISTS (SELECT 1 FROM users cu WHERE cu.id = ${pre}created_by AND cu.tenant_owner_id = $1))`,
    params: [req.user.id],
  };
}

async function getNextInvoiceSequence(companySettings) {
  await query(`CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1`);
  const invoiceStart = getCompanyNumberStart(companySettings, 'invoice_number_start');

  const seqInfo = await query(`SELECT last_value, is_called FROM invoice_number_seq`);
  const lastValue = seqInfo.rows.length ? parseInt(seqInfo.rows[0].last_value, 10) : 0;

  const maxRow = await query(
    `SELECT MAX((substring(invoice_number FROM '([0-9]+)$'))::int) AS max_seq
     FROM accounting_invoices
     WHERE invoice_number ~ '([0-9]+)$'`
  );
  const maxExisting = maxRow.rows.length && maxRow.rows[0].max_seq ? parseInt(maxRow.rows[0].max_seq, 10) : 0;

  const targetValue = Math.max(invoiceStart - 1, lastValue, maxExisting);
  if (targetValue > lastValue) {
    await query(`SELECT setval('invoice_number_seq', $1, true)`, [targetValue]);
  } else if (!seqInfo.rows.length || (!seqInfo.rows[0].is_called && lastValue < invoiceStart)) {
    await query(`SELECT setval('invoice_number_seq', $1, false)`, [invoiceStart - 1]);
  } else if (lastValue < invoiceStart - 1) {
    await query(`SELECT setval('invoice_number_seq', $1, false)`, [invoiceStart - 1]);
  }

  const seqRes = await query(`SELECT nextval('invoice_number_seq') AS seq`);
  return parseInt(seqRes.rows[0].seq, 10);
}

async function invoiceExistsForCase({ caseId, caseNumber, quoteId }) {
  const conditions = [];
  const params = [];
  let pi = 1;
  if (quoteId) {
    conditions.push(`quote_id = $${pi++}`);
    params.push(quoteId);
  }
  if (caseId) {
    conditions.push(`case_id = $${pi++}`);
    params.push(caseId);
  }
  if (caseNumber) {
    conditions.push(`case_number = $${pi++}`);
    params.push(caseNumber);
  }
  if (!conditions.length) return false;
  const existing = await query(`SELECT 1 FROM accounting_invoices WHERE ${conditions.join(' OR ')} LIMIT 1`, params);
  return existing.rows.length > 0;
}

// ─── GET /api/accounting/summary ─────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    const quoteScope = tenantScope(req);
    const invoiceScope = tenantScope(req);
    const expenseScope = tenantScope(req);
    const caseScope = tenantScope(req, 'c');

    const purchaseScope = tenantScope(req);

    const [qStats, invStats, expStats, casePaymentStats, purchStats] = await Promise.all([
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
      query(`SELECT
        COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'paid'), 0) AS total_paid,
        COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'pending'), 0) AS total_pending,
        COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'paid' AND p.paid_at >= DATE_TRUNC('month', NOW())), 0) AS revenue_month
        FROM payments p
        JOIN cases c ON p.case_id = c.id
        ${caseScope.clause ? `WHERE ${caseScope.clause}` : ''}`,
        caseScope.params),
      query(`SELECT
        COALESCE(SUM(total), 0) as total_purchases,
        COALESCE(SUM(total) FILTER (WHERE purchase_date >= NOW() - INTERVAL '30 days'), 0) as purchases_month
        FROM accounting_purchases${purchaseScope.clause ? ` WHERE ${purchaseScope.clause}` : ''}`,
        purchaseScope.params),
    ]);

    const pendingQuotes = await query(
      `SELECT
        COALESCE(SUM(GREATEST(COALESCE(q.total_amount, 0) - COALESCE(paid.total_paid, 0), 0)), 0) AS pending_amount,
        COALESCE(SUM(CASE WHEN GREATEST(COALESCE(q.total_amount, 0) - COALESCE(paid.total_paid, 0), 0) > 0
              AND q.created_at <= NOW() - INTERVAL '30 days' THEN GREATEST(COALESCE(q.total_amount, 0) - COALESCE(paid.total_paid, 0), 0) ELSE 0 END), 0) AS overdue_amount
         FROM cases c
         LEFT JOIN LATERAL (
           SELECT q.total_amount, q.created_at
           FROM quotations q
           WHERE q.case_id = c.id
           ORDER BY q.created_at DESC LIMIT 1
         ) q ON TRUE
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) AS total_paid
           FROM payments p
           WHERE p.case_id = c.id
         ) paid ON TRUE
         ${caseScope.clause ? `WHERE ${caseScope.clause}` : ''}`,
      caseScope.params
    );

    const inv = invStats.rows[0];
    const exp = expStats.rows[0];
    const caseStats = casePaymentStats.rows[0];
    const pendingStats = pendingQuotes.rows[0];
    const purch = purchStats.rows[0];
    const profit_month = parseFloat(caseStats.revenue_month) - parseFloat(exp.expenses_month);

    // Get invoice counts by status
    const invoiceCountsQuery = await query(
      `SELECT status, COUNT(*)::int as count FROM accounting_invoices
       ${invoiceScope.clause ? `WHERE ${invoiceScope.clause}` : ''}
       GROUP BY status`,
      invoiceScope.params
    );
    const invoiceCounts = {};
    invoiceCountsQuery.rows.forEach(r => { invoiceCounts[r.status] = r.count; });

    // Get expense breakdown by category
    const expenseByCat = await query(
      `SELECT category, COALESCE(SUM(total), 0) as total FROM accounting_expenses
       ${expenseScope.clause ? `WHERE ${expenseScope.clause}` : ''}
       GROUP BY category ORDER BY total DESC`,
      expenseScope.params
    );
    const expenseByCategory = {};
    expenseByCat.rows.forEach(r => { expenseByCategory[r.category] = parseFloat(r.total); });

    // Monthly revenue vs expenses (last 6 months) — uses case payments for revenue
    const monthlyData = await query(
      `SELECT TO_CHAR(d, 'YYYY-MM') as month,
              COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'paid'), 0) as revenue,
              COALESCE(SUM(exp.total), 0) as expenses
       FROM generate_series(
         DATE_TRUNC('month', NOW()) - INTERVAL '5 months',
         DATE_TRUNC('month', NOW()),
         INTERVAL '1 month'
       ) d
       LEFT JOIN (
         SELECT p.amount, p.status, p.paid_at
         FROM payments p
         JOIN cases c ON p.case_id = c.id
         ${caseScope.clause ? `WHERE ${caseScope.clause}` : ''}
       ) p ON DATE_TRUNC('month', p.paid_at) = d
       LEFT JOIN accounting_expenses exp ON DATE_TRUNC('month', exp.date) = d
         ${expenseScope.clause ? `AND ${expenseScope.clause.replace(/tenant_id/, 'exp.tenant_id')}` : ''}
       GROUP BY d ORDER BY d`,
      [...new Set([...caseScope.params, ...expenseScope.params])]
    );

    // Quote conversion rate
    const totalQuotes = parseInt(qStats.rows[0].total_quotes, 10) || 0;
    const acceptedQuotes = parseInt(qStats.rows[0].accepted_quotes, 10) || 0;
    const conversionRate = totalQuotes ? Math.round((acceptedQuotes / totalQuotes) * 100) : 0;

    res.json({
      ...qStats.rows[0],
      ...inv,
      ...exp,
      ...purch,
      profit_month,
      totalRevenue: parseFloat(caseStats.total_paid),
      pendingRevenue: parseFloat(pendingStats.pending_amount),
      overdueRevenue: parseFloat(pendingStats.overdue_amount),
      revenue_month: parseFloat(caseStats.revenue_month),
      case_total_paid: parseFloat(caseStats.total_paid),
      case_total_pending: parseFloat(pendingStats.pending_amount),
      case_total_pending_overdue: parseFloat(pendingStats.overdue_amount),
      accounting_total_collected: parseFloat(inv.total_collected),
      accounting_outstanding: parseFloat(inv.outstanding),
      invoiceCounts,
      expenseByCategory,
      monthlyRevenue: monthlyData.rows,
      conversionRate,
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
      conditions.push(`(created_by = $${pi} OR EXISTS (SELECT 1 FROM users cu WHERE cu.id = created_by AND cu.tenant_owner_id = $${pi}))`);
      params.push(req.user.id);
      pi++;
    }
    if (status) { conditions.push(`status = $${pi++}`); params.push(status); }
    if (search) {
      conditions.push(`(title ILIKE $${pi} OR client_name ILIKE $${pi} OR quote_number ILIKE $${pi})`);
      params.push(`%${search}%`); pi++;
    }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const result = await query(
      `SELECT q.*,
        EXISTS(
          SELECT 1 FROM accounting_invoices i
          WHERE i.quote_id = q.id
            OR (q.case_number IS NOT NULL AND i.case_number = q.case_number)
        ) AS has_invoice
       FROM accounting_quotes q
       ${where}
       ORDER BY q.created_at DESC`, params);
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

    const companySettings = await loadCompanySettings();
    const numResult = await query('SELECT COUNT(*) FROM accounting_quotes');
    const quoteCount = parseInt(numResult.rows[0].count, 10) || 0;
    const quoteStart = getCompanyNumberStart(companySettings, 'quote_number_start');
    const quoteSequence = quoteCount + quoteStart;
    const qNum = formatNumberSequence(
      getCompanyNumberFormat(companySettings, 'quote_number_format', 'QT-{YYYY}-{NNNN}'),
      quoteSequence
    );

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
       WHERE id=$14${!isSuperAdmin(req.user) ? ` AND (created_by = $15 OR EXISTS (SELECT 1 FROM users cu WHERE cu.id = created_by AND cu.tenant_owner_id = $15))` : ''} RETURNING *`,
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
      `UPDATE accounting_quotes SET status=$1, updated_at=NOW() WHERE id=$2${!isSuperAdmin(req.user) ? ` AND (created_by = $3 OR EXISTS (SELECT 1 FROM users cu WHERE cu.id = created_by AND cu.tenant_owner_id = $3))` : ''} RETURNING *`,
      !isSuperAdmin(req.user) ? [status, req.params.id, tenantAdminId(req.user)] : [status, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Quote not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/quotes/:id', requireMinRole('staff'), auditLog('delete_quote', 'accounting'), async (req, res) => {
  try {
    const result = await query(
      `DELETE FROM accounting_quotes WHERE id=$1${!isSuperAdmin(req.user) ? ` AND (created_by = $2 OR EXISTS (SELECT 1 FROM users cu WHERE cu.id = created_by AND cu.tenant_owner_id = $2))` : ''} RETURNING id`,
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
      `SELECT * FROM accounting_quotes WHERE id=$1${!isSuperAdmin(req.user) ? ` AND (created_by = $2 OR EXISTS (SELECT 1 FROM users cu WHERE cu.id = created_by AND cu.tenant_owner_id = $2))` : ''}`,
      !isSuperAdmin(req.user) ? [req.params.id, tenantAdminId(req.user)] : [req.params.id]
    );
    if (!quote.rows.length) return res.status(404).json({ error: 'Quote not found' });
    const q = quote.rows[0];

    const companySettings = await loadCompanySettings();
    const dueDate = new Date(Date.now() + 15 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    // Resolve case_id from case_number
    let caseId = null;
    if (q.case_number) {
      const caseRes = await query('SELECT id FROM cases WHERE case_number = $1', [q.case_number]);
      if (caseRes.rows.length) caseId = caseRes.rows[0].id;
    }

    const result = await query(
      `INSERT INTO accounting_invoices
         (invoice_number, quote_id, title, client_name, company, client_address, client_gstin,
          case_number, case_id, line_items, discount_pct, discount_amt, tax_pct, tax_amt, subtotal, total, due_date, notes, created_by, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
      [invNum, q.id, q.title, q.client_name, q.company, client_address || null, client_gstin || null,
       q.case_number, caseId, q.line_items, q.discount_pct, q.discount_amt, q.tax_pct, q.tax_amt,
       q.subtotal, q.total, dueDate, q.notes, req.user.id, q.tenant_id || tenantAdminId(req.user)]
    );

    await query(
      `UPDATE accounting_quotes SET status='invoiced', updated_at=NOW() WHERE id=$1${!isSuperAdmin(req.user) ? ` AND (created_by = $2 OR EXISTS (SELECT 1 FROM users cu WHERE cu.id = created_by AND cu.tenant_owner_id = $2))` : ''}`,
      !isSuperAdmin(req.user) ? [q.id, tenantAdminId(req.user)] : [q.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Invoices ─────────────────────────────────────────────────────
router.get('/invoices', async (req, res) => {
  try {
    const { search, status, case_number, case_id } = req.query;
    const conditions = ['deleted_at IS NULL'], params = [];
    let pi = 1;
    if (!isSuperAdmin(req.user)) {
      conditions.push(`(created_by = $${pi} OR EXISTS (SELECT 1 FROM users cu WHERE cu.id = created_by AND cu.tenant_owner_id = $${pi}))`);
      params.push(req.user.id);
      pi++;
    }
    if (status) { conditions.push(`status = $${pi++}`); params.push(status); }
    if (case_number) { conditions.push(`case_number = $${pi++}`); params.push(case_number); }
    if (case_id) { conditions.push(`case_id = $${pi++}`); params.push(case_id); }
    if (search) {
      conditions.push(`(title ILIKE $${pi} OR client_name ILIKE $${pi} OR invoice_number ILIKE $${pi} OR case_number ILIKE $${pi})`);
      params.push(`%${search}%`); pi++;
    }
    const where = 'WHERE ' + conditions.join(' AND ');
    const result = await query(`SELECT * FROM accounting_invoices ${where} ORDER BY created_at DESC`, params);
    res.json({ invoices: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/invoices/recycle-bin', requireMinRole('staff'), async (req, res) => {
  try {
    const conditions = ['deleted_at IS NOT NULL'];
    const params = [];
    let pi = 1;
    if (!isSuperAdmin(req.user)) { conditions.push(`(created_by = $${pi} OR EXISTS (SELECT 1 FROM users cu WHERE cu.id = created_by AND cu.tenant_owner_id = $${pi}))`); params.push(req.user.id); pi++; }
    const where = 'WHERE ' + conditions.join(' AND ');
    const result = await query(`SELECT * FROM accounting_invoices ${where} ORDER BY deleted_at DESC`, params);
    res.json({ invoices: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/invoices/:id/restore', requireMinRole('staff'), async (req, res) => {
  try {
    const result = await query(
      `UPDATE accounting_invoices SET deleted_at = NULL WHERE id=$1${!isSuperAdmin(req.user) ? ` AND (created_by = $2 OR EXISTS (SELECT 1 FROM users cu WHERE cu.id = created_by AND cu.tenant_owner_id = $2))` : ''} AND deleted_at IS NOT NULL RETURNING *`,
      !isSuperAdmin(req.user) ? [req.params.id, tenantAdminId(req.user)] : [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Invoice not found in recycle bin' });
    res.json({ message: 'Invoice restored', invoice: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/invoices', requireMinRole('staff'), auditLog('create_invoice', 'accounting'), async (req, res) => {
  try {
    const { title, client_name, company, client_address, client_gstin, case_number, line_items, discount_pct, tax_pct, due_date, notes, case_id, client_id, invoice_date } = req.body;
    const li = line_items || [];
    const subtotal = li.reduce((s, l) => s + (l.qty || 1) * (l.unit_price || 0), 0);
    const discountAmt = Math.round(subtotal * (discount_pct || 0) / 100 * 100) / 100;
    const taxAmt = Math.round((subtotal - discountAmt) * (tax_pct || 18) / 100 * 100) / 100;
    const total = subtotal - discountAmt + taxAmt;

    if (await invoiceExistsForCase({ caseId: case_id || null, caseNumber: case_number || null })) {
      return res.status(409).json({ error: 'An invoice already exists for this case.' });
    }

    const companySettings = await loadCompanySettings();
    let caseId = case_id || null;
    if (!caseId && case_number) {
      const caseRes = await query('SELECT id FROM cases WHERE case_number = $1', [case_number]);
      if (caseRes.rows.length) caseId = caseRes.rows[0].id;
    }

    let result;
    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const invoiceSequence = await getNextInvoiceSequence(companySettings);
      const invNum = formatNumberSequence(
        getCompanyNumberFormat(companySettings, 'invoice_number_format', 'INV-{YYYY}-{NNNN}'),
        invoiceSequence
      );
      try {
        result = await query(
          `INSERT INTO accounting_invoices
             (invoice_number, title, client_name, company, client_address, client_gstin, case_number,
              case_id, line_items, discount_pct, discount_amt, tax_pct, tax_amt, subtotal, total, due_date, notes, created_by, tenant_id,
              client_id, invoice_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
          [invNum, title, client_name, company || null, client_address || null, client_gstin || null,
           case_number || null, caseId, JSON.stringify(li), discount_pct || 0, discountAmt, tax_pct || 18,
           taxAmt, subtotal, total, due_date || null, notes || null, req.user.id, tenantAdminId(req.user),
           client_id || null, invoice_date || null]
        );
        break;
      } catch (err) {
        if (err && err.code === '23505' && err.constraint === 'accounting_invoices_invoice_number_key' && attempt < maxAttempts) {
          continue;
        }
        throw err;
      }
    }

    try {
      await automationService.handleEvent('INVOICE_CREATED', {
        invoice_id: result.rows[0].id,
        invoice_number: result.rows[0].invoice_number,
        title: result.rows[0].title,
        company: result.rows[0].company || '',
        amount: result.rows[0].total,
        case_number: result.rows[0].case_number || '',
        client_name: result.rows[0].client_name || ''
      });
    } catch (eventErr) {
      console.warn('INVOICE_CREATED event emission failed:', eventErr.message);
    }

    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/invoices/:id/status', requireMinRole('staff'), async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['unpaid', 'paid', 'partial', 'overdue', 'cancelled'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const result = await query(
      `UPDATE accounting_invoices SET status=$1, updated_at=NOW() WHERE id=$2${!isSuperAdmin(req.user) ? ` AND (created_by = $3 OR EXISTS (SELECT 1 FROM users cu WHERE cu.id = created_by AND cu.tenant_owner_id = $3))` : ''} RETURNING *`,
      !isSuperAdmin(req.user) ? [status, req.params.id, tenantAdminId(req.user)] : [status, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Invoice not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/invoices/:id', requireMinRole('staff'), auditLog('delete_invoice', 'accounting'), async (req, res) => {
  try {
    const result = await query(
      `UPDATE accounting_invoices SET deleted_at = NOW() WHERE id=$1${!isSuperAdmin(req.user) ? ` AND (created_by = $2 OR EXISTS (SELECT 1 FROM users cu WHERE cu.id = created_by AND cu.tenant_owner_id = $2))` : ''} AND deleted_at IS NULL RETURNING id`,
      !isSuperAdmin(req.user) ? [req.params.id, tenantAdminId(req.user)] : [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Invoice not found' });
    res.json({ message: 'Invoice moved to recycle bin' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/invoices/:id/payments', requireMinRole('staff'), auditLog('record_invoice_payment', 'accounting'), async (req, res) => {
  try {
    const { amount, method, reference, note, discount } = req.body;
    const inv = await query(
      `SELECT * FROM accounting_invoices WHERE id=$1${!isSuperAdmin(req.user) ? ` AND (created_by = $2 OR EXISTS (SELECT 1 FROM users cu WHERE cu.id = created_by AND cu.tenant_owner_id = $2))` : ''}`,
      !isSuperAdmin(req.user) ? [req.params.id, tenantAdminId(req.user)] : [req.params.id]
    );
    if (!inv.rows.length) return res.status(404).json({ error: 'Invoice not found' });

    const { transaction } = require('../config/database');
    const result = await transaction(async (client) => {
      await client.query(
        `INSERT INTO accounting_invoice_payments (invoice_id, amount, method, reference, note, recorded_by, tenant_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [req.params.id, amount, method || null, reference || null, note || null, req.user.id, inv.rows[0].tenant_id || tenantAdminId(req.user)]
      );

      const discountAmt = parseFloat(discount || 0);
      const effectiveAmount = parseFloat(amount);
      const newPaid = parseFloat(inv.rows[0].amount_paid) + effectiveAmount;
      const newTotal = discountAmt > 0
        ? Math.max(0, parseFloat(inv.rows[0].total) - discountAmt)
        : parseFloat(inv.rows[0].total);
      const newStatus = newPaid >= newTotal ? 'paid' : 'partial';

      let updateSQL = 'UPDATE accounting_invoices SET amount_paid=$1, status=$2, updated_at=NOW()';
      let updateParams = [newPaid, newStatus];
      let pi = 3;
      if (discountAmt > 0) {
        updateSQL += `, total = GREATEST(total - $${pi}, 0)`;
        updateParams.push(discountAmt);
        pi++;
      }
      if (!isSuperAdmin(req.user)) {
        updateSQL += ` WHERE id=$${pi} AND (created_by = $${pi+1} OR EXISTS (SELECT 1 FROM users cu WHERE cu.id = created_by AND cu.tenant_owner_id = $${pi+1}))`;
        updateParams.push(req.params.id, tenantAdminId(req.user));
      } else {
        updateSQL += ` WHERE id=$${pi}`;
        updateParams.push(req.params.id);
      }
      await client.query(updateSQL, updateParams);

      // Sync to case-level payments table so case/client pending amounts update
      const invRow = inv.rows[0];
      let caseId = invRow.case_id;
      if (!caseId && invRow.case_number) {
        const caseResult = await client.query(
          'SELECT id FROM cases WHERE case_number = $1 LIMIT 1',
          [invRow.case_number]
        );
        if (caseResult.rows.length) {
          caseId = caseResult.rows[0].id;
          await client.query(
            'UPDATE accounting_invoices SET case_id = $1 WHERE id = $2',
            [caseId, req.params.id]
          );
        }
      }
      if (caseId) {
        await client.query(
          `INSERT INTO payments (case_id, amount, status, method, notes, paid_at, recorded_by)
           VALUES ($1, $2, 'paid', $3, $4, NOW(), $5)`,
          [caseId, effectiveAmount, method || 'Invoice Payment', note || `Payment for invoice ${invRow.invoice_number}`, req.user.id]
        );
        // Update case pending_amount cache so case-level queries reflect the payment
        await client.query(
          `UPDATE cases SET pending_amount = (
            SELECT GREATEST(
              COALESCE((SELECT q.total_amount FROM quotations q WHERE q.case_id = $1 ORDER BY q.created_at DESC LIMIT 1), 0) -
              COALESCE((SELECT SUM(p.amount) FILTER (WHERE p.status = 'paid') FROM payments p WHERE p.case_id = $1), 0),
              0
            )
          ) WHERE id = $1`,
          [caseId]
        );
      }
      if (invRow.client_id) {
        await client.query(
          'UPDATE clients SET total_paid = COALESCE(total_paid,0) + $1, updated_at = NOW() WHERE id = $2',
          [effectiveAmount, invRow.client_id]
        );
      }

      return { newPaid, newStatus, newTotal };
    });

    try {
      const invoice = inv.rows[0];
      await automationService.handleEvent('PAYMENT_RECEIVED', {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        case_id: invoice.case_id,
        case_number: invoice.case_number || '',
        amount: parseFloat(amount),
        payment_method: method || 'Invoice Payment',
        note: note || ''
      });
    } catch (eventErr) {
      console.warn('PAYMENT_RECEIVED event emission failed:', eventErr.message);
    }
    res.json({ message: 'Payment recorded', amount_paid: result.newPaid, status: result.newStatus });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Expenses ─────────────────────────────────────────────────────
router.get('/expenses', async (req, res) => {
  try {
    const { search } = req.query;
    const params = [];
    const conditions = ['deleted_at IS NULL'];
    let pi = 1;
    if (!isSuperAdmin(req.user)) {
      conditions.push(`(created_by = $${pi} OR EXISTS (SELECT 1 FROM users cu WHERE cu.id = created_by AND cu.tenant_owner_id = $${pi}))`);
      params.push(req.user.id);
      pi++;
    }
    if (search) {
      conditions.push(`(description ILIKE $${pi} OR vendor ILIKE $${pi})`);
      params.push(`%${search}%`); pi++;
    }
    const where = 'WHERE ' + conditions.join(' AND ');
    const result = await query(
      `SELECT * FROM accounting_expenses ${where} ORDER BY date DESC, created_at DESC`,
      params
    );
    res.json({ expenses: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/expenses/recycle-bin', requireMinRole('staff'), async (req, res) => {
  try {
    const conditions = ['deleted_at IS NOT NULL'];
    const params = [];
    let pi = 1;
    if (!isSuperAdmin(req.user)) { conditions.push(`(created_by = $${pi} OR EXISTS (SELECT 1 FROM users cu WHERE cu.id = created_by AND cu.tenant_owner_id = $${pi}))`); params.push(req.user.id); pi++; }
    const where = 'WHERE ' + conditions.join(' AND ');
    const result = await query(`SELECT * FROM accounting_expenses ${where} ORDER BY deleted_at DESC`, params);
    res.json({ expenses: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/expenses/:id/restore', requireMinRole('staff'), async (req, res) => {
  try {
    const result = await query(
      `UPDATE accounting_expenses SET deleted_at = NULL WHERE id=$1${!isSuperAdmin(req.user) ? ` AND (created_by = $2 OR EXISTS (SELECT 1 FROM users cu WHERE cu.id = created_by AND cu.tenant_owner_id = $2))` : ''} AND deleted_at IS NOT NULL RETURNING *`,
      !isSuperAdmin(req.user) ? [req.params.id, tenantAdminId(req.user)] : [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Expense not found in recycle bin' });
    res.json({ message: 'Expense restored', expense: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/expenses', requireMinRole('staff'), auditLog('create_expense', 'accounting'), async (req, res) => {
  try {
    let { date, category, description, vendor, amount, tax_amt, receipt_note, case_number, case_id } = req.body;
    const total = (parseFloat(amount) || 0) + (parseFloat(tax_amt) || 0);

    // Resolve case_number to case_id
    if (!case_id && case_number) {
      const caseRes = await query('SELECT id FROM cases WHERE case_number = $1', [case_number]);
      if (caseRes.rows.length) case_id = caseRes.rows[0].id;
    }

    const result = await query(
      `INSERT INTO accounting_expenses (date, category, description, vendor, amount, tax_amt, total, receipt_note, case_id, case_number, created_by, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [date, category || 'other', description, vendor || null, amount, tax_amt || 0, total, receipt_note || null,
       case_id || null, case_number || null, req.user.id, tenantAdminId(req.user)]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/expenses/:id', requireMinRole('staff'), auditLog('update_expense', 'accounting'), async (req, res) => {
  try {
    let { date, category, description, vendor, amount, tax_amt, receipt_note, case_number, case_id } = req.body;
    const total = (parseFloat(amount) || 0) + (parseFloat(tax_amt) || 0);

    if (!case_id && case_number) {
      const caseRes = await query('SELECT id FROM cases WHERE case_number = $1', [case_number]);
      if (caseRes.rows.length) case_id = caseRes.rows[0].id;
    }

    const result = await query(
      `UPDATE accounting_expenses SET date=$1, category=$2, description=$3, vendor=$4, amount=$5, tax_amt=$6, total=$7,
       receipt_note=$8, case_id=$9, case_number=$10, updated_at=NOW()
       WHERE id=$11${!isSuperAdmin(req.user) ? ` AND (created_by = $12 OR EXISTS (SELECT 1 FROM users cu WHERE cu.id = created_by AND cu.tenant_owner_id = $12))` : ''} RETURNING *`,
      [date, category, description, vendor, amount, tax_amt || 0, total, receipt_note,
       case_id || null, case_number || null, req.params.id, ...(!isSuperAdmin(req.user) ? [tenantAdminId(req.user)] : [])]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Expense not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/expenses/:id', requireMinRole('staff'), auditLog('delete_expense', 'accounting'), async (req, res) => {
  try {
    const result = await query(
      `UPDATE accounting_expenses SET deleted_at = NOW() WHERE id=$1${!isSuperAdmin(req.user) ? ` AND (created_by = $2 OR EXISTS (SELECT 1 FROM users cu WHERE cu.id = created_by AND cu.tenant_owner_id = $2))` : ''} AND deleted_at IS NULL RETURNING id`,
      !isSuperAdmin(req.user) ? [req.params.id, tenantAdminId(req.user)] : [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Expense not found' });
    res.json({ message: 'Expense moved to recycle bin' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Purchases ─────────────────────────────────────────────────────
router.get('/purchases', async (req, res) => {
  try {
    const { search, case_id } = req.query;
    const conditions = ['p.deleted_at IS NULL'], params = [];
    let pi = 1;
    if (!isSuperAdmin(req.user)) {
      conditions.push(`(p.created_by = $${pi} OR EXISTS (SELECT 1 FROM users cu WHERE cu.id = p.created_by AND cu.tenant_owner_id = $${pi}))`);
      params.push(req.user.id);
      pi++;
    }
    if (case_id) { conditions.push(`p.case_id = $${pi++}`); params.push(case_id); }
    if (search) {
      conditions.push(`(p.description ILIKE $${pi} OR p.vendor_name ILIKE $${pi} OR p.purchase_number ILIKE $${pi})`);
      params.push(`%${search}%`); pi++;
    }
    const where = 'WHERE ' + conditions.join(' AND ');
    const result = await query(
      `SELECT p.*, u.full_name as created_by_name
       FROM accounting_purchases p
       LEFT JOIN users u ON p.created_by = u.id
       ${where} ORDER BY p.purchase_date DESC, p.created_at DESC`,
      params
    );
    res.json({ purchases: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/purchases/recycle-bin', requireMinRole('staff'), async (req, res) => {
  try {
    const conditions = ['p.deleted_at IS NOT NULL'];
    const params = [];
    let pi = 1;
    if (!isSuperAdmin(req.user)) { conditions.push(`(p.created_by = $${pi} OR EXISTS (SELECT 1 FROM users cu WHERE cu.id = p.created_by AND cu.tenant_owner_id = $${pi}))`); params.push(req.user.id); pi++; }
    const where = 'WHERE ' + conditions.join(' AND ');
    const result = await query(
      `SELECT p.*, u.full_name as created_by_name FROM accounting_purchases p LEFT JOIN users u ON p.created_by = u.id ${where} ORDER BY p.deleted_at DESC`,
      params
    );
    res.json({ purchases: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/purchases/:id/restore', requireMinRole('staff'), async (req, res) => {
  try {
    await transaction(async (client) => {
      const r = await client.query(
        `UPDATE accounting_purchases SET deleted_at = NULL WHERE id=$1${!isSuperAdmin(req.user) ? ` AND (created_by = $2 OR EXISTS (SELECT 1 FROM users cu WHERE cu.id = created_by AND cu.tenant_owner_id = $2))` : ''} AND deleted_at IS NOT NULL RETURNING *`,
        !isSuperAdmin(req.user) ? [req.params.id, tenantAdminId(req.user)] : [req.params.id]
      );
      if (!r.rows.length) throw Object.assign(new Error('Purchase not found in recycle bin'), { status: 404 });
      // Restore linked expense too
      await client.query(`UPDATE accounting_expenses SET deleted_at = NULL WHERE purchase_id=$1 AND deleted_at IS NOT NULL`, [req.params.id]);
      return r.rows[0];
    });
    res.json({ message: 'Purchase restored' });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

router.post('/purchases', requireMinRole('staff'), auditLog('create_purchase', 'accounting'), async (req, res) => {
  try {
    let { vendor_name, description, case_id, case_number, amount, tax_amt, purchase_date, notes,
          add_to_inventory, inv_stock_number, inv_brand, inv_model, inv_serial_number, inv_quantity,
          inv_condition, inv_location, inv_company, inv_name, inv_category,
          inv_status, inv_min_quantity, inv_notes } = req.body;
    const total = (parseFloat(amount) || 0) + (parseFloat(tax_amt) || 0);

    // Resolve case_number to case_id
    if (!case_id && case_number) {
      const caseRes = await query('SELECT id FROM cases WHERE case_number = $1', [case_number]);
      if (caseRes.rows.length) case_id = caseRes.rows[0].id;
    }

    const numResult = await query('SELECT COUNT(*) FROM accounting_purchases');
    const count = parseInt(numResult.rows[0].count, 10) || 0;
    const seq = String(count + 1).padStart(4, '0');
    const purchaseNumber = `PUR-${new Date().getFullYear()}-${seq}`;

    // Create purchase + linked expense + optional inventory item (atomic)
    let purchase;
    let inventoryItem = null;
    await transaction(async (client) => {
      // 1. Create the purchase
      const result = await client.query(
        `INSERT INTO accounting_purchases
           (purchase_number, vendor_name, description, case_id, case_number, amount, tax_amt, total, purchase_date, notes, created_by, tenant_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [purchaseNumber, vendor_name, description, case_id || null, case_number || null,
         amount, tax_amt || 0, total, purchase_date, notes || null, req.user.id, tenantAdminId(req.user)]
      );
      purchase = result.rows[0];

      // 2. Create the linked expense
      await client.query(
        `INSERT INTO accounting_expenses
           (date, category, description, vendor, amount, tax_amt, total, receipt_note, created_by, tenant_id, purchase_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [purchase_date, 'purchase', `[Purchase ${purchaseNumber}] ${description}`, vendor_name,
         amount, tax_amt || 0, total, notes || null, req.user.id, tenantAdminId(req.user), purchase.id]
      );

      // 3. Optionally create inventory item
      if (add_to_inventory && inv_stock_number) {
        const uiCategory = normalizeUiCategory(inv_category);
        const invCat = toDbCategory(uiCategory);
        const itemName = inv_name || description || 'Inventory Item';
        const itemQty = parseInt(inv_quantity, 10) || 1;
        const unitCost = parseFloat(amount) || 0;

        const invResult = await client.query(
          `INSERT INTO inventory_items
             (sku, stock_number, name, category, ui_category, brand, model, serial_number, quantity, unit_cost, condition, location, company, notes, tenant_id, added_by, status, min_quantity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
          [inv_stock_number, inv_stock_number, itemName, invCat, uiCategory,
           inv_brand || null, inv_model || null, inv_serial_number || null,
           itemQty, unitCost, inv_condition || 'new', inv_location || null,
           inv_company || null, inv_notes || null, tenantAdminId(req.user), req.user.id,
           inv_status || 'available', parseInt(inv_min_quantity, 10) || 1]
        );
        inventoryItem = invResult.rows[0];

        // Record inventory transaction
        await client.query(
          `INSERT INTO inventory_transactions (item_id, type, quantity, notes, performed_by)
           VALUES ($1,'in',$2,$3,$4)`,
          [inventoryItem.id, itemQty, `Initial stock from purchase ${purchaseNumber}`, req.user.id]
        );

        // Link purchase to inventory item
        await client.query(
          `UPDATE accounting_purchases SET inventory_item_id=$1 WHERE id=$2`,
          [inventoryItem.id, purchase.id]
        );
        purchase.inventory_item_id = inventoryItem.id;
      }
    });

    res.status(201).json({ purchase, inventoryItem });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/purchases/:id', requireMinRole('staff'), auditLog('delete_purchase', 'accounting'), async (req, res) => {
  try {
    await transaction(async (client) => {
      // Soft-delete the linked expense too
      await client.query(
        `UPDATE accounting_expenses SET deleted_at = NOW() WHERE purchase_id=$1 AND deleted_at IS NULL`,
        [req.params.id]
      );
      const result = await client.query(
        `UPDATE accounting_purchases SET deleted_at = NOW() WHERE id=$1${!isSuperAdmin(req.user) ? ` AND (created_by = $2 OR EXISTS (SELECT 1 FROM users cu WHERE cu.id = created_by AND cu.tenant_owner_id = $2))` : ''} AND deleted_at IS NULL RETURNING id`,
        !isSuperAdmin(req.user) ? [req.params.id, tenantAdminId(req.user)] : [req.params.id]
      );
      if (!result.rows.length) throw new Error('Purchase not found');
    });
    res.json({ message: 'Purchase moved to recycle bin' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

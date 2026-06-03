const express = require('express');
const { query } = require('../config/database');
const { authenticate, requireMinRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const { isSuperAdmin, tenantAdminId } = require('../utils/tenantAccess');
const { loadCompanySettings } = require('./settings');
const { formatNumberSequence, getCompanyNumberFormat, getCompanyNumberStart } = require('../utils/numberFormatting');

const router = express.Router();
router.use(authenticate);

// Ensure new columns exist on accounting_invoices
(async () => {
  try {
    await query(`ALTER TABLE accounting_invoices ADD COLUMN IF NOT EXISTS case_id UUID REFERENCES cases(id)`);
    await query(`ALTER TABLE accounting_invoices ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id)`);
    await query(`ALTER TABLE accounting_invoices ADD COLUMN IF NOT EXISTS invoice_date TIMESTAMPTZ`);
  } catch (e) {
    // columns may already exist or table may not exist yet
  }
})();

function tenantScope(req, alias = '') {
  if (isSuperAdmin(req.user)) return { clause: '', params: [] };
  const prefix = alias ? `${alias}.` : '';
  return {
    clause: `${prefix}tenant_id = $1`,
    params: [tenantAdminId(req.user)],
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

    const [qStats, invStats, expStats, casePaymentStats] = await Promise.all([
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
        COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'paid' AND p.paid_at >= NOW() - INTERVAL '30 days'), 0) AS revenue_month
        FROM payments p
        JOIN cases c ON p.case_id = c.id
        ${caseScope.clause ? `WHERE ${caseScope.clause}` : ''}`,
        caseScope.params),
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
    const profit_month = parseFloat(inv.collected_month) - parseFloat(exp.expenses_month);

    res.json({
      ...qStats.rows[0],
      ...inv,
      ...exp,
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

    const companySettings = await loadCompanySettings();
    const dueDate = new Date(Date.now() + 15 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    let caseId = null;
    if (q.case_number) {
      const caseResult = await query('SELECT id FROM cases WHERE case_number = $1 LIMIT 1', [q.case_number]);
      if (caseResult.rows.length) caseId = caseResult.rows[0].id;
    }

    if (await invoiceExistsForCase({ quoteId: q.id, caseId, caseNumber: q.case_number })) {
      return res.status(409).json({ error: 'An invoice already exists for this quote/case.' });
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
             (invoice_number, quote_id, title, client_name, company, client_address, client_gstin,
              case_number, line_items, discount_pct, discount_amt, tax_pct, tax_amt, subtotal, total, due_date, notes, created_by, tenant_id, case_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
          [invNum, q.id, q.title, q.client_name, q.company, client_address || null, client_gstin || null,
           q.case_number, q.line_items, q.discount_pct, q.discount_amt, q.tax_pct, q.tax_amt,
           q.subtotal, q.total, dueDate, q.notes, req.user.id, q.tenant_id || tenantAdminId(req.user), caseId]
        );
        break;
      } catch (err) {
        if (err && err.code === '23505' && err.constraint === 'accounting_invoices_invoice_number_key' && attempt < maxAttempts) {
          continue;
        }
        throw err;
      }
    }


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
    const { search, status, case_id } = req.query;
    const conditions = [], params = [];
    let pi = 1;
    if (!isSuperAdmin(req.user)) {
      conditions.push(`tenant_id = $${pi++}`);
      params.push(tenantAdminId(req.user));
    }
    if (status) { conditions.push(`status = $${pi++}`); params.push(status); }
    if (case_id) { conditions.push(`case_id = $${pi++}`); params.push(case_id); }
    if (search) {
      conditions.push(`(title ILIKE $${pi} OR client_name ILIKE $${pi} OR invoice_number ILIKE $${pi} OR case_number ILIKE $${pi})`);
      params.push(`%${search}%`); pi++;
    }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const result = await query(`SELECT * FROM accounting_invoices ${where} ORDER BY created_at DESC`, params);
    res.json({ invoices: result.rows });
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
              line_items, discount_pct, discount_amt, tax_pct, tax_amt, subtotal, total, due_date, notes, created_by, tenant_id,
              case_id, client_id, invoice_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
          [invNum, title, client_name, company || null, client_address || null, client_gstin || null,
           case_number || null, JSON.stringify(li), discount_pct || 0, discountAmt, tax_pct || 18,
           taxAmt, subtotal, total, due_date || null, notes || null, req.user.id, tenantAdminId(req.user),
           case_id || null, client_id || null, invoice_date || null]
        );
        break;
      } catch (err) {
        if (err && err.code === '23505' && err.constraint === 'accounting_invoices_invoice_number_key' && attempt < maxAttempts) {
          continue;
        }
        throw err;
      }
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
    const { amount, method, reference, note, discount } = req.body;
    const inv = await query(
      `SELECT * FROM accounting_invoices WHERE id=$1${!isSuperAdmin(req.user) ? ' AND tenant_id = $2' : ''}`,
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
        updateSQL += ` WHERE id=$${pi} AND tenant_id = $${pi+1}`;
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
      }
      if (invRow.client_id) {
        await client.query(
          'UPDATE clients SET total_paid = COALESCE(total_paid,0) + $1, updated_at = NOW() WHERE id = $2',
          [effectiveAmount, invRow.client_id]
        );
      }

      return { newPaid, newStatus, newTotal };
    });

    res.json({ message: 'Payment recorded', amount_paid: result.newPaid, status: result.newStatus });
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

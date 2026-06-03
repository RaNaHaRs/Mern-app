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
              COUNT(c.id) FILTER (WHERE c.stage NOT IN ('completed','delivered','failed') AND c.deleted_at IS NULL) AS active_cases,
              COUNT(c.id) FILTER (WHERE c.deleted_at IS NULL) AS total_cases,
              MAX(c.created_at) FILTER (WHERE c.deleted_at IS NULL) AS last_case_date,
              COALESCE(SUM(
                CASE
                  WHEN q.total_amount IS NULL THEN 0
                  ELSE GREATEST(q.total_amount - COALESCE(paid.total_paid, 0), 0)
                END
              ) FILTER (WHERE c.deleted_at IS NULL), 0) AS pending_amount
       FROM clients cl
       LEFT JOIN cases c ON cl.id = c.client_id
       LEFT JOIN LATERAL (
         SELECT q.total_amount
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
        first_name, last_name, middle_name, email, phone, phone_alt, company,
        address, city, state, pincode, country, whatsapp,
        id_type, id_number, referral_source, notes, is_corporate, is_vip
      } = req.body;

      const result = await query(
        `INSERT INTO clients (
          first_name, last_name, middle_name, email, phone, phone_alt, company,
          address, city, state, pincode, country, whatsapp,
          id_type, id_number, referral_source, notes,
          is_corporate, is_vip, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
        [
          first_name, last_name, middle_name||null, email||null, phone,
          phone_alt||null, company||null, address||null,
          city||null, state||null, pincode||null, country||'India', whatsapp||null,
          id_type||null, id_number||null, referral_source||null, notes||null,
          is_corporate||false, is_vip||false, req.user.id
        ]
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
              GREATEST(COALESCE(q.total_amount, 0) - COALESCE(paid.total_paid, 0), 0) AS pending_amount,
              COALESCE(purch.total_purchase_cost, 0) AS total_purchase_cost,
              COALESCE(q.total_amount, 0) - COALESCE(purch.total_purchase_cost, 0) AS profit
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
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(total), 0) AS total_purchase_cost
         FROM accounting_purchases ap
         WHERE ap.case_id = c.id
       ) purch ON TRUE
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
              COUNT(p.*) FILTER (WHERE p.status = 'paid') as payment_count
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
       WHERE c.client_id = $1 AND c.deleted_at IS NULL`,
      [req.params.id]
    );

    const totalPurchaseCost = cases.rows.reduce((s, c) => s + parseFloat(c.total_purchase_cost||0), 0);
    const totalQuotation = cases.rows.reduce((s, c) => s + parseFloat(c.quotation_total||0), 0);
    const overallProfit = totalQuotation - totalPurchaseCost;

    res.json({
      ...result.rows[0],
      cases: cases.rows,
      communications: comms.rows,
      total_purchase_cost: totalPurchaseCost,
      overall_profit: overallProfit,
      paymentSummary: {
        ...payments.rows[0],
        pending: pendingSummary.rows[0].pending,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/clients/:id/payments ───────────────────────────────
router.get('/:id/payments', async (req, res) => {
  try {
    if (!isSuperAdmin(req.user) && !(await verifyClientAccess(req.params.id, req.user))) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const result = await query(
      `SELECT
         p.id, p.amount, p.method, p.reference_number, p.status,
         p.paid_at, p.notes, p.created_at,
         c.id as case_id, c.case_number, c.device_brand, c.device_model, c.stage,
         u.full_name as recorded_by_name,
         COALESCE(q.total_amount, 0) as case_total
       FROM payments p
       JOIN cases c ON p.case_id = c.id
       LEFT JOIN users u ON p.recorded_by = u.id
       LEFT JOIN LATERAL (
         SELECT total_amount FROM quotations
         WHERE case_id = c.id ORDER BY created_at DESC LIMIT 1
       ) q ON TRUE
       WHERE c.client_id = $1
         AND p.status = 'paid'
       ORDER BY COALESCE(p.paid_at, p.created_at) DESC`,
      [req.params.id]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/clients/:id ─────────────────────────────────────────
router.put('/:id', requireMinRole('staff'), auditLog('update_client', 'client'), async (req, res) => {
  try {
    const {
      first_name, last_name, middle_name, email, phone, phone_alt, company,
      address, city, state, pincode, country, whatsapp,
      id_type, id_number, referral_source, notes, is_corporate, is_vip
    } = req.body;
    if (!isSuperAdmin(req.user) && !(await verifyClientAccess(req.params.id, req.user))) {
      return res.status(404).json({ error: 'Client not found' });
    }
    const result = await query(
      `UPDATE clients SET
        first_name=COALESCE($1,first_name), last_name=COALESCE($2,last_name),
        middle_name=$3, email=$4, phone=COALESCE($5,phone),
        phone_alt=$6, company=$7, address=$8,
        city=$9, state=$10, pincode=$11,
        country=COALESCE($12,country), whatsapp=$13,
        id_type=$14, id_number=$15, referral_source=$16,
        notes=$17, is_corporate=COALESCE($18,is_corporate), is_vip=COALESCE($19,is_vip),
        updated_at=NOW()
       WHERE id=$20 RETURNING *`,
      [
        first_name, last_name, middle_name||null, email||null, phone,
        phone_alt||null, company||null, address||null,
        city||null, state||null, pincode||null,
        country||'India', whatsapp||null,
        id_type||null, id_number||null, referral_source||null,
        notes||null, is_corporate, is_vip,
        req.params.id
      ]
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

<<<<<<< HEAD
    const { case_id } = req.body;
    const paymentAmount = parseFloat(req.body.amount || 0);
    const notes = req.body.notes || 'Collected from Clients page';

    if (!case_id) {
      return res.status(400).json({ error: 'Case ID is required' });
    }

    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
=======
    const { case_selections, notes } = req.body;
    if (!Array.isArray(case_selections) || case_selections.length === 0) {
      return res.status(400).json({ error: 'case_selections array is required with at least one entry' });
>>>>>>> 0f385f328665c375ec46fff5a5933abf09cd030d
    }

    // Verify case belongs to client and get pending amount
    const caseRes = await query(
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
       WHERE c.id = $1 AND c.client_id = $2`,
      [case_id, req.params.id]
    );

<<<<<<< HEAD
    if (!caseRes.rows.length) {
      return res.status(400).json({ error: 'Case not found for this client' });
    }

    const caseData = caseRes.rows[0];
    const pendingAmt = parseFloat(caseData.pending_amount || 0);

    if (pendingAmt <= 0) {
      return res.status(400).json({ error: 'This case has no pending amount' });
    }

    if (paymentAmount > pendingAmt) {
      return res.status(400).json({ error: 'Amount exceeds case pending amount', pending_amount: pendingAmt });
=======
    const pendingMap = {};
    for (const row of pendingCases.rows) {
      const pending = parseFloat(row.pending_amount || 0);
      if (pending > 0) {
        pendingMap[row.case_id] = { ...row, pending_amount: pending };
      }
    }

    const pendingIds = Object.keys(pendingMap);
    if (!pendingIds.length) {
      return res.json({ ok: true, message: 'No pending amount to collect.', collected_amount: 0, updated_cases: 0, allocation_details: [] });
    }

    // Validate case_selections
    let totalRequested = 0;
    for (const sel of case_selections) {
      if (!sel.case_id) {
        return res.status(400).json({ error: 'Each case_selection must have a case_id' });
      }
      if (!pendingMap[sel.case_id]) {
        return res.status(400).json({ error: `Case ${sel.case_id} has no pending amount or does not belong to this client` });
      }
      const amount = parseFloat(sel.amount);
      if (isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: `Invalid amount for case ${sel.case_id}` });
      }
      if (amount > pendingMap[sel.case_id].pending_amount) {
        return res.status(400).json({
          error: `Amount (${amount}) exceeds pending amount (${pendingMap[sel.case_id].pending_amount}) for case ${sel.case_id}`
        });
      }
      totalRequested += amount;
    }

    if (totalRequested <= 0) {
      return res.status(400).json({ error: 'Total amount to collect must be greater than zero' });
>>>>>>> 0f385f328665c375ec46fff5a5933abf09cd030d
    }

    // Process selections inside a transaction
    const result = await require('../config/database').transaction(async (client) => {
<<<<<<< HEAD
      await client.query(
        `INSERT INTO payments (case_id, quotation_id, amount, status, method, notes, paid_at, recorded_by)
         VALUES ($1, $2, $3, 'paid', 'Client Collect', $4, NOW(), $5)`,
        [caseData.case_id, caseData.quotation_id || null, paymentAmount, notes, req.user.id]
      );

      await client.query(
        'UPDATE clients SET total_paid = COALESCE(total_paid,0) + $1, updated_at = NOW() WHERE id = $2',
        [paymentAmount, req.params.id]
      );

      return { collected: paymentAmount };
=======
      let updatedCases = 0;
      const allocationDetails = [];

      for (const sel of case_selections) {
        const row = pendingMap[sel.case_id];
        const pay = parseFloat(sel.amount);

        await client.query(
          `INSERT INTO payments (case_id, quotation_id, amount, status, method, notes, paid_at, recorded_by)
           VALUES ($1, $2, $3, 'paid', 'Client Collect', $4, NOW(), $5)`,
          [row.case_id, row.quotation_id || null, pay, notes || 'Collected from Clients page', req.user.id]
        );

        allocationDetails.push({
          case_id: row.case_id,
          case_number: row.case_number,
          allocated_amount: pay,
          previous_pending: row.pending_amount,
          new_pending: Math.max(0, row.pending_amount - pay)
        });

        updatedCases += 1;
      }

      if (totalRequested > 0) {
        await client.query('UPDATE clients SET total_paid = COALESCE(total_paid,0) + $1, updated_at = NOW() WHERE id = $2', [totalRequested, req.params.id]);
      }

      return { collected: totalRequested, updatedCases, allocationDetails };
>>>>>>> 0f385f328665c375ec46fff5a5933abf09cd030d
    });

    res.json({
      ok: true,
      message: `Collected ₹${result.collected.toLocaleString('en-IN')} successfully.`,
      collected_amount: result.collected,
<<<<<<< HEAD
      updated_cases: 1,
      allocation_details: [{
        case_id: caseData.case_id,
        case_number: caseData.case_number,
        allocated_amount: paymentAmount,
        previous_pending: pendingAmt,
        new_pending: Math.max(0, pendingAmt - paymentAmount)
      }]
=======
      updated_cases: result.updatedCases,
      allocation_details: result.allocationDetails || []
>>>>>>> 0f385f328665c375ec46fff5a5933abf09cd030d
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

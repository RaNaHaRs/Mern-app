const express = require('express');
const fs = require('fs');
const { body, query: queryValidator, validationResult, param } = require('express-validator');
const { query, transaction } = require('../config/database');
const { authenticate, requireMinRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const { upload } = require('../middleware/upload');
const { solutionUpload } = require('../middleware/solutionUpload');
const { isSuperAdmin, tenantAdminId, tenantCaseCondition, caseTenantExpression, verifyClientAccess, syncInvoiceFromCasePayment } = require('../utils/tenantAccess');
const solutionsRouter = require('./solutions');
const mediaRecycle = require('../services/mediaRecycle');
const { normalizeFailureType, isValidFailureType } = require('../utils/failureTypes');
const { loadCompanySettings } = require('./settings');
const { formatNumberSequence, getCompanyNumberFormat, getCompanyNumberStart } = require('../utils/numberFormatting');
const automationService = require('../services/automationService');
const casePdfService = require('../services/casePdfService');

const router = express.Router();
router.use(authenticate);

let cachedCasesDeletedAtColumn = null;
async function casesDeletedAtColumnExists() {
  if (cachedCasesDeletedAtColumn !== null) return cachedCasesDeletedAtColumn;
  try {
    const result = await query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'cases'
         AND column_name = 'deleted_at'
       LIMIT 1`
    );
    cachedCasesDeletedAtColumn = result.rows.length > 0;
  } catch (err) {
    cachedCasesDeletedAtColumn = false;
  }
  return cachedCasesDeletedAtColumn;
}

function normalizeCapacityGb(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value === 'string') {
    const raw = value.trim().toUpperCase();
    if (!raw) return null;
    const tuned = raw.replace(/GB$/i, '').replace(/TB$/i, '').replace(/CAPACITY\s*/i, '').trim();
    const parsed = Number(tuned);
    if (!Number.isNaN(parsed)) {
      if (raw.includes('TB')) return Math.round(parsed * 1000);
      return Math.round(parsed);
    }
  }
  return null;
}

function normalizeCasePayload(body = {}) {
  const normalized = { ...body };

  if (!normalized.device_model && normalized.model) {
    normalized.device_model = normalized.model;
  }

  if ((!normalized.device_brand || !String(normalized.device_brand).trim()) && normalized.brand) {
    normalized.device_brand = normalized.brand;
  }

  if ((!normalized.device_brand || !String(normalized.device_brand).trim()) && normalized.hdd_type) {
    const normalizedHddType = String(normalized.hdd_type).replace(/\./g, '_').replace(/-/g, '_').toLowerCase();
    const hddBrandMap = {
      wd_25: 'Western Digital',
      wd_35: 'Western Digital',
      seagate_25: 'Seagate',
      seagate_35: 'Seagate',
    };
    if (hddBrandMap[normalizedHddType]) {
      normalized.device_brand = hddBrandMap[normalizedHddType];
    }
  }

  if (!normalized.failure_type && Array.isArray(normalized.failure_types) && normalized.failure_types.length > 0) {
    normalized.failure_type = normalized.failure_types[0];
  }

  if (normalized.failure_type) {
    normalized.failure_type = normalizeFailureType(normalized.failure_type);
  }

  const problemText = normalized.problem_description ?? normalized.problemDescription;
  if (problemText && !normalized.symptom_notes) {
    normalized.symptom_notes = String(problemText).trim();
  }

  if (normalized.capacity_gb === undefined || normalized.capacity_gb === null || normalized.capacity_gb === '') {
    const parsedCapacity = normalizeCapacityGb(normalized.capacity);
    if (parsedCapacity !== null) {
      normalized.capacity_gb = parsedCapacity;
    }
  } else if (typeof normalized.capacity_gb === 'string') {
    const parsedCapacity = normalizeCapacityGb(normalized.capacity_gb);
    if (parsedCapacity !== null) {
      normalized.capacity_gb = parsedCapacity;
    }
  }

  return normalized;
}

function normalizeCasePayloadMiddleware(req, res, next) {
  req.body = normalizeCasePayload(req.body);
  next();
}

async function ensureCaseAccessible(caseId, user) {
  if (isSuperAdmin(user)) return true;
  const deletedClause = (await casesDeletedAtColumnExists()) ? ' AND c.deleted_at IS NULL' : '';
  // Allow access if the case belongs to the user's tenant OR the user is the assigned engineer
  const result = await query(
    `SELECT c.id FROM cases c WHERE c.id = $1${deletedClause}
     AND (${caseTenantExpression('c')} = $2 OR c.assigned_engineer = $3)`,
    [caseId, tenantAdminId(user), user.id]
  );
  return result.rows.length > 0;
}

// ─── GET /api/cases ───────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const {
      page = 1, limit = 20, stage, assigned_to, client_id,
      search, priority, failure_type, sort = 'created_at', order = 'desc'
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params = [];
    let pi = 1;

    if (stage) { conditions.push(`c.stage = $${pi++}`); params.push(stage); }
    if (assigned_to) { conditions.push(`c.assigned_engineer = $${pi++}`); params.push(assigned_to); }
    if (client_id) { conditions.push(`c.client_id = $${pi++}`); params.push(client_id); }
    if (priority) { conditions.push(`c.priority = $${pi++}`); params.push(parseInt(priority)); }
    if (failure_type) { conditions.push(`c.failure_type = $${pi++}`); params.push(failure_type); }
    if (search) {
      conditions.push(`(c.case_number ILIKE $${pi} OR cl.first_name ILIKE $${pi} OR cl.last_name ILIKE $${pi} OR c.serial_number ILIKE $${pi})`);
      params.push(`%${search}%`);
      pi++;
    }

    if (!isSuperAdmin(req.user)) {
      const tenantCondition = tenantCaseCondition(req.user, 'c', pi);
      conditions.push(tenantCondition.clause);
      params.push(...tenantCondition.params);
      pi += tenantCondition.params.length;
    }

    // Engineers/Staff can only see their own cases (unless admin)
    if (!['super_admin', 'admin', 'billing_admin', 'content_admin'].includes(req.user.role)) {
      conditions.push(`c.assigned_engineer = $${pi++}`);
      params.push(req.user.id);
    }

    if (await casesDeletedAtColumnExists()) {
      conditions.push('c.deleted_at IS NULL');
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const allowedSort = ['created_at', 'updated_at', 'priority', 'stage', 'case_number', 'pending_amount'];
    const sortCol = allowedSort.includes(sort) ? sort : 'created_at';
    const orderDir = order === 'asc' ? 'ASC' : 'DESC';

    const countResult = await query(
      `SELECT COUNT(*) FROM cases c LEFT JOIN clients cl ON c.client_id = cl.id ${where}`,
      params
    );

    const result = await query(
      `SELECT c.id, c.case_number, c.stage, c.priority, c.failure_type, c.symptoms,
              c.device_brand, c.device_model, c.serial_number, c.capacity_gb, c.interface,
              c.ai_risk_level, c.recovery_progress_pct, c.assigned_engineer,
              c.received_at, c.deadline_at, c.completed_at, c.created_at, c.updated_at,
              c.transfer_to_client,
              cl.id as client_id, cl.first_name, cl.last_name, cl.phone, cl.company,
              u.full_name as engineer_name, u.role as engineer_role,
              sm.model_number as storage_model_number,
               (SELECT amount FROM payments WHERE case_id = c.id ORDER BY created_at LIMIT 1) as first_payment,
               (SELECT q2.total_amount FROM quotations q2 WHERE q2.case_id = c.id ORDER BY q2.created_at DESC LIMIT 1) as quotation_amount,
               (SELECT COALESCE(SUM(p2.amount) FILTER (WHERE p2.status = 'paid'), 0) FROM payments p2 WHERE p2.case_id = c.id) as total_paid,
               GREATEST(
                 COALESCE((SELECT q2.total_amount FROM quotations q2 WHERE q2.case_id = c.id ORDER BY q2.created_at DESC LIMIT 1), 0) -
                 COALESCE((SELECT SUM(p2.amount) FILTER (WHERE p2.status = 'paid') FROM payments p2 WHERE p2.case_id = c.id), 0),
                 0
               ) as pending_amount
       FROM cases c
       LEFT JOIN clients cl ON c.client_id = cl.id
       LEFT JOIN users u ON c.assigned_engineer = u.id
       LEFT JOIN storage_models sm ON c.storage_model_id = sm.id
       ${where}
       ORDER BY c.${sortCol} ${orderDir}
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      cases: result.rows,
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

// ─── POST /api/cases ──────────────────────────────────────────────
router.post('/',
  requireMinRole('staff'),
  normalizeCasePayloadMiddleware,
  upload.single('inward_pdf'),
  [
    body('client_id').optional().isUUID(),
    body('device_brand').trim().notEmpty(),
    body('device_model').trim().notEmpty(),
    body('symptoms').isArray().optional(),
    body('failure_type').optional().custom((val) => isValidFailureType(val)),
    body('priority').optional().isInt({ min: 1, max: 5 }),
    body('interface').optional().isIn(['SATA', 'NVMe', 'SAS', 'IDE', 'USB', 'PCIe', 'mSATA', 'M2', 'eSATA']),
    body('form_factor').optional().isIn(['3.5', '2.5', 'M.2', 'mSATA', 'U.2', 'PCIe_card']),
  ],
  auditLog('create_case', 'case'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    try {
      const {
        client_id, device_brand, device_model, storage_model_id, serial_number,
        capacity_gb, interface: iface, form_factor, failure_type, symptoms,
        symptom_notes, initial_diagnosis, priority, deadline_at, internal_notes,
        assigned_engineer, quotation_amount, advance_amount
      } = req.body;
      if (client_id && !isSuperAdmin(req.user) && !(await verifyClientAccess(client_id, req.user))) {
        return res.status(404).json({ error: 'Client not found' });
      }

      const companySettings = await loadCompanySettings();
      const startValue = getCompanyNumberStart(companySettings, 'case_number_start');
      const formatString = getCompanyNumberFormat(companySettings, 'case_number_format', 'DR-{YYYY}-{NNNNN}');

      // Per-tenant case numbering
      let sequence;
      const tenantId = tenantAdminId(req.user);
      if (tenantId) {
        const seqRes = await query(
          `INSERT INTO tenant_case_sequences (tenant_id, last_sequence)
           VALUES ($1, $2)
           ON CONFLICT (tenant_id)
           DO UPDATE SET last_sequence = tenant_case_sequences.last_sequence + 1
           RETURNING last_sequence`,
          [tenantId, startValue]
        );
        sequence = parseInt(seqRes.rows[0].last_sequence, 10);
      } else {
        // Fallback to global sequence for super admin
        const seqState = await query(`SELECT last_value FROM case_number_seq`);
        const currentLast = seqState.rows.length ? parseInt(seqState.rows[0].last_value, 10) : 0;
        if (currentLast < startValue - 1) {
          await query(`SELECT setval('case_number_seq', $1, false)`, [startValue - 1]);
        }
        const seqRes = await query(`SELECT nextval('case_number_seq') AS seq`);
        sequence = parseInt(seqRes.rows[0].seq, 10);
      }
      const caseNumber = formatNumberSequence(formatString, sequence);

      // Run smart assist
      let aiData = {};
      try {
        const { analyzeCase } = require('../services/smartAssist');
        // Get brand name for smart assist
        let brandName = device_brand;
        const smartResult = await analyzeCase({
          brandName,
          modelNumber: device_model,
          symptoms: symptoms || [],
          failureType: failure_type
        });
        aiData = {
          ai_risk_level: smartResult.riskLevel,
          ai_suggested_strategy: smartResult,
          ai_confidence: smartResult.confidence
        };
      } catch (e) { /* non-fatal */ }

      const insertSql = `INSERT INTO cases (
          case_number, client_id, device_brand, device_model, storage_model_id, serial_number,
          capacity_gb, interface, form_factor, failure_type, symptoms, symptom_notes,
          initial_diagnosis, priority, deadline_at, internal_notes, assigned_engineer,
          ai_risk_level, ai_suggested_strategy, ai_confidence, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
        RETURNING *`;

      const insertParams = [
        caseNumber, client_id, device_brand, device_model, storage_model_id || null, serial_number,
        capacity_gb, iface, form_factor, failure_type || 'unknown', symptoms || [], symptom_notes,
        initial_diagnosis, priority || 3, deadline_at || null, internal_notes,
        assigned_engineer || null,
        aiData.ai_risk_level || null,
        JSON.stringify(aiData.ai_suggested_strategy || {}),
        aiData.ai_confidence || null,
        req.user.id
      ];

      // Retry insert on case_number unique-violation — regenerate a new sequence each attempt
      let result;
      const maxAttempts = 5;
      let currentCaseNumber = caseNumber;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          insertParams[0] = currentCaseNumber;
          result = await query(insertSql, insertParams);
          break;
        } catch (err) {
          if (err && err.code === '23505' && String(err.detail || '').includes('case_number')) {
            console.warn(`Case insert conflict on case_number (attempt ${attempt}): ${err.message}`);
            if (attempt === maxAttempts) throw err;
            // Advance the sequence and get a fresh case number for next attempt
            await new Promise(r => setTimeout(r, 50 * attempt));
            if (tenantId) {
              const seqRes = await query(
                `INSERT INTO tenant_case_sequences (tenant_id, last_sequence)
                 VALUES ($1, $2)
                 ON CONFLICT (tenant_id)
                 DO UPDATE SET last_sequence = tenant_case_sequences.last_sequence + 1
                 RETURNING last_sequence`,
                [tenantId, startValue]
              );
              currentCaseNumber = formatNumberSequence(formatString, parseInt(seqRes.rows[0].last_sequence, 10));
            } else {
              const seqRes = await query(`SELECT nextval('case_number_seq') AS seq`);
              currentCaseNumber = formatNumberSequence(formatString, parseInt(seqRes.rows[0].seq, 10));
            }
            continue;
          }
          throw err;
        }
      }

      // Log initial stage
      await query(
        `INSERT INTO case_workflow_logs (case_id, from_stage, to_stage, engineer_id, notes)
         VALUES ($1, NULL, 'received', $2, 'Case created')`,
        [result.rows[0].id, req.user.id]
      );

      // Create quotation if quotation_amount is provided
      let quotation = null;
      if (quotation_amount) {
        const quotValue = parseFloat(quotation_amount);
        const advanceValue = parseFloat(advance_amount || 0);
        const totalAmount = quotValue;
        const balanceRemaining = Math.max(0, totalAmount - advanceValue);

        const quotRes = await query(
          `INSERT INTO quotations (
            case_id, estimated_cost, parts_cost, service_cost, total_amount, 
            approved_by_client, created_by
          ) VALUES ($1, $2, 0, 0, $3, true, $4) RETURNING id, case_id, total_amount, created_at`,
          [result.rows[0].id, quotValue, totalAmount, req.user.id]
        );
        quotation = quotRes.rows[0];

        // If advance_amount provided, record it as a payment
        if (advanceValue > 0) {
          await query(
            `INSERT INTO payments (case_id, quotation_id, amount, status, paid_at, recorded_by)
             VALUES ($1, $2, $3, 'paid', NOW(), $4)`,
            [result.rows[0].id, quotation.id, advanceValue, req.user.id]
          );
        }
      }

      // Update client case count
      // Update client case count if client_id provided
if (client_id) {
  await query('UPDATE clients SET total_cases = total_cases + 1 WHERE id = $1', [client_id]);
}

      // Save custom field values if provided
      if (req.body.customFields && typeof req.body.customFields === 'object') {
        for (const [fieldId, fieldValue] of Object.entries(req.body.customFields)) {
          try {
            await query(
              `INSERT INTO case_custom_field_values (case_id, custom_field_id, field_value)
               VALUES ($1, $2, $3)
               ON CONFLICT (case_id, custom_field_id) 
               DO UPDATE SET field_value = $3, updated_at = NOW()`,
              [result.rows[0].id, fieldId, fieldValue || null]
            );
          } catch (e) {
            // Log but don't fail if custom field save fails
            console.error('Failed to save custom field:', e.message);
          }
        }
      }

      // Also save standard HDD fields from the form
      const hddFields = ['serial_number', 'model', 'manufacture_country', 'manufacture_date', 
                         'pcb_number', 'pn_number', 'dcm', 'dcx', 'date_code', 'site_code', 
                         'firmware', 'company_name', 'mlc', 'hdd_code', 'four_code'];
      hddFields.forEach(field => {
        if (req.body[field]) {
          // These would need to be stored in a separate table or JSON field if needed
          // For now, they're handled via the main case fields
        }
      });

      const responseData = { ...result.rows[0] };
      if (quotation) {
        const advanceValue = parseFloat(advance_amount || 0);
        responseData.quotation = {
          ...quotation,
          balance_remaining: Math.max(0, quotation.total_amount - advanceValue),
          advance_received: advanceValue
        };
      }

      // Emit CASE_CREATED event for automation triggers, unless the client requested a delayed email
      const skipCaseCreated = String(req.body.skip_case_created || '').toLowerCase() === 'true' || req.body.skip_case_created === true;
      if (!skipCaseCreated) {
        try {
          const clientInfo = client_id ? await query('SELECT email, first_name FROM clients WHERE id = $1', [client_id]) : null;
          const recipientEmail = clientInfo?.rows[0]?.email || req.body.email || req.body.client_email || '';
          const recipientName = clientInfo?.rows[0]?.first_name || req.body.first_name || req.body.name || 'Client';
          // Generate clean summary PDF for email attachment
          const summaryPdf = await casePdfService.generateEmailSummaryPdf({
            ...result.rows[0],
            first_name: recipientName,
            email: recipientEmail,
            company_name: req.body.company || '',
            quotation_amount: req.body.quotation_amount,
            advance_amount: req.body.advance_amount,
            problem_description: req.body.problem_description || req.body.symptom_notes || '',
          });

          const attachments = summaryPdf && summaryPdf.filePath && fs.existsSync(summaryPdf.filePath)
            ? [{ filename: summaryPdf.fileName, path: summaryPdf.filePath, contentType: summaryPdf.mimeType }]
            : [];

          await automationService.handleEvent('CASE_CREATED', {
            case_id: result.rows[0].id,
            case_number: result.rows[0].case_number || '',
            name: recipientName,
            email: recipientEmail,
            device_brand: device_brand,
            device_model: device_model,
            failure_type: failure_type,
            attachments
          });
        } catch (eventErr) {
          console.warn('CASE_CREATED event emission failed:', eventErr.message);
        }
      }

      res.status(201).json(responseData);
    } catch (err) {
      // Handle duplicate case_number unique constraint with a clear 409 response
      if (err && err.code === '23505' && (err.constraint === 'cases_case_number_key' || (err.detail && String(err.detail).includes('case_number')))) {
        return res.status(409).json({ error: 'Case number already exists. Please retry creating the case.' });
      }
      res.status(500).json({ error: err.message });
    }
  }
);

// ─── GET /api/cases/next-number ───────────────────────────────────
router.get('/next-number', async (req, res) => {
  try {
    const companySettings = await loadCompanySettings();
    const startValue = getCompanyNumberStart(companySettings, 'case_number_start');
    const formatString = getCompanyNumberFormat(companySettings, 'case_number_format', 'DR-{YYYY}-{NNNNN}');
    const tenantId = tenantAdminId(req.user);
    let nextSeq = startValue;

    if (tenantId) {
      const seqRes = await query(
        `SELECT last_sequence FROM tenant_case_sequences WHERE tenant_id = $1`,
        [tenantId]
      );
      if (seqRes.rows.length > 0) {
        nextSeq = parseInt(seqRes.rows[0].last_sequence, 10) + 1;
      }
    } else {
      const seqState = await query(`SELECT last_value FROM case_number_seq`);
      const currentLast = seqState.rows.length ? parseInt(seqState.rows[0].last_value, 10) : 0;
      nextSeq = Math.max(currentLast + 1, startValue);
    }

    const caseNumber = formatNumberSequence(formatString, nextSeq);
    res.json({ case_number: caseNumber });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/cases/:id ───────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    if (!await ensureCaseAccessible(req.params.id, req.user)) {
      return res.status(404).json({ error: 'Case not found' });
    }
    const result = await query(
      `SELECT c.*,
              cl.first_name, cl.last_name, cl.phone, cl.email, cl.company, cl.client_code,
              u.full_name as engineer_name,
              sm.model_number as storage_model_number, sm.controller_chip, sm.pcb_number,
              sm.firmware_family, sm.risk_level as model_risk_level,
              sm.known_issues, sm.recovery_strategy as model_recovery_strategy,
              sm.do_notes, sm.dont_notes
       FROM cases c
       LEFT JOIN clients cl ON c.client_id = cl.id
       LEFT JOIN users u ON c.assigned_engineer = u.id
       LEFT JOIN storage_models sm ON c.storage_model_id = sm.id
       WHERE c.id = $1${await casesDeletedAtColumnExists() ? ' AND c.deleted_at IS NULL' : ''}`,
      [req.params.id]
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Case not found' });

    const caseData = result.rows[0];

    // Get workflow logs
    const logs = await query(
      `SELECT cwl.*, u.full_name as engineer_name
       FROM case_workflow_logs cwl
       LEFT JOIN users u ON cwl.engineer_id = u.id
       WHERE cwl.case_id = $1
       ORDER BY cwl.created_at ASC`,
      [req.params.id]
    );

    // Get files
    const files = await query(
      `SELECT id, file_name, original_name, file_size, mime_type, file_type, description, created_at
       FROM case_files WHERE case_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    );

    // Get payments
    const payments = await query(
      `SELECT p.*, q.estimated_cost, q.total_amount as quoted_amount
       FROM payments p
       LEFT JOIN quotations q ON p.quotation_id = q.id
       WHERE p.case_id = $1 AND p.status = 'paid' ORDER BY p.created_at DESC`,
      [req.params.id]
    );

    // Get quotations
    const quotations = await query(
      'SELECT * FROM quotations WHERE case_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );

    // Get purchases (expenses) linked to this case
    const purchases = await query(
      `SELECT * FROM accounting_purchases WHERE case_id = $1 ORDER BY purchase_date DESC`,
      [req.params.id]
    );

    // Get case expenses (inventory usage, direct purchases, etc.)
    const caseExpensesSum = await query(
      `SELECT COALESCE(SUM(amount), 0) as total_expenses FROM case_expenses WHERE case_id = $1`,
      [req.params.id]
    );

    // Calculate case-level payment metrics (per-case tracking)
    const latestQuotation = quotations.rows[0];
    const quotationTotal = latestQuotation ? parseFloat(latestQuotation.total_amount || 0) : 0;
    const totalPaid = payments.rows.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    const balanceDue = Math.max(0, quotationTotal - totalPaid);
    const pendingAmount = balanceDue;
    const totalPurchaseCost = purchases.rows.reduce((sum, p) => sum + parseFloat(p.total || 0), 0);
    const totalCaseExpenses = parseFloat(caseExpensesSum.rows[0]?.total_expenses || 0);
    const totalCost = totalPurchaseCost + totalCaseExpenses;
    const profit = quotationTotal - totalCost;

    res.json({
      ...caseData,
      quotation_total: quotationTotal,
      total_paid: totalPaid,
      balance_due: balanceDue,
      pending_amount: pendingAmount,
      total_purchase_cost: totalPurchaseCost,
      total_case_expenses: totalCaseExpenses,
      total_cost: totalCost,
      profit: profit,
      workflowLogs: logs.rows,
      files: files.rows,
      payments: payments.rows,
      quotations: quotations.rows,
      purchases: purchases.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/cases/:id — soft delete to recycle bin
router.delete('/:id', requireMinRole('staff'), auditLog('soft_delete_case', 'case'), async (req, res) => {
  try {
    if (!await casesDeletedAtColumnExists()) {
      return res.status(501).json({ error: 'Soft delete is not available on this database schema.' });
    }
    if (!await ensureCaseAccessible(req.params.id, req.user)) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const deleted = await transaction(async client => {
      const caseResult = await client.query(
        `SELECT c.id, c.case_number, c.client_id,
                COALESCE(cl.first_name || ' ' || cl.last_name, '') AS client_name
         FROM cases c
         LEFT JOIN clients cl ON c.client_id = cl.id
         WHERE c.id = $1 AND c.deleted_at IS NULL`,
        [req.params.id]
      );
      if (!caseResult.rows.length) return null;

      await client.query(
        `UPDATE cases c SET deleted_at = NOW(), is_recycle = true, updated_at = NOW()
         WHERE c.id = $1`,
        [req.params.id]
      );

      const row = caseResult.rows[0];
      await client.query(
        `INSERT INTO cases_recycle_bin (case_id, case_number, client_id, client_name, deleted_by, deleted_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [row.id, row.case_number, row.client_id, row.client_name || null, req.user.id]
      );
      return row;
    });

    if (!deleted) {
      return res.status(404).json({ error: 'Case not found or already deleted' });
    }

    res.json({ message: 'Case moved to Recycle Bin', case: deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/cases/bulk-delete — soft delete multiple cases to recycle bin
router.post('/bulk-delete', requireMinRole('staff'), auditLog('bulk_soft_delete_case', 'case'), async (req, res) => {
  try {
    if (!await casesDeletedAtColumnExists()) {
      return res.status(501).json({ error: 'Soft delete is not available on this database schema.' });
    }
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No case IDs specified' });
    }

    const deletedIds = await transaction(async client => {
      const placeholders = ids.map((_, index) => `$${index + 1}`).join(',');
      const params = [...ids];
      const tenantClause = !isSuperAdmin(req.user)
        ? ` AND ${tenantCaseCondition(req.user, 'c', ids.length + 1).clause}`
        : '';
      if (!isSuperAdmin(req.user)) params.push(tenantAdminId(req.user));

      const caseResult = await client.query(
        `SELECT c.id, c.case_number, c.client_id,
                COALESCE(cl.first_name || ' ' || cl.last_name, '') AS client_name
         FROM cases c
         LEFT JOIN clients cl ON c.client_id = cl.id
         WHERE c.id IN (${placeholders}) AND c.deleted_at IS NULL${tenantClause}`,
        params
      );

      if (!caseResult.rows.length) return [];
      const validIds = caseResult.rows.map(row => row.id);
      const updatePlaceholders = validIds.map((_, index) => `$${index + 1}`).join(',');
      const updateParams = [...validIds];
      const updateTenantClause = !isSuperAdmin(req.user)
        ? ` AND ${tenantCaseCondition(req.user, 'c', validIds.length + 1).clause}`
        : '';
      if (!isSuperAdmin(req.user)) updateParams.push(tenantAdminId(req.user));

      await client.query(
        `UPDATE cases c SET deleted_at = NOW(), is_recycle = true, updated_at = NOW()
         WHERE c.id IN (${updatePlaceholders})${updateTenantClause}`,
        updateParams
      );

      const insertValues = [];
      const insertParams = [];
      let pi = 1;
      caseResult.rows.forEach((row) => {
        insertValues.push(`($${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++}, NOW())`);
        insertParams.push(row.id, row.case_number, row.client_id, row.client_name || null, req.user.id);
      });
      await client.query(
        `INSERT INTO cases_recycle_bin (case_id, case_number, client_id, client_name, deleted_by, deleted_at)
         VALUES ${insertValues.join(',')}`,
        insertParams
      );

      return validIds;
    });

    if (!deletedIds.length) {
      return res.status(404).json({ error: 'No cases found or already deleted' });
    }

    res.json({ message: `${deletedIds.length} case(s) moved to Recycle Bin`, deleted_ids: deletedIds });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/cases/:id/stage ───────────────────────────────────
router.patch('/:id/stage',
  [body('stage').notEmpty()],
  auditLog('transition_case', 'case'),
  async (req, res) => {
    const { stage, notes, timeSpentMinutes, actionsPerformed, toolsUsed } = req.body;

    try {
      if (!await ensureCaseAccessible(req.params.id, req.user)) {
        return res.status(404).json({ error: 'Case not found' });
      }
      const { transitionCase } = require('../services/workflowEngine');
      const result = await transitionCase(
        req.params.id, stage, req.user.id, req.user.role,
        { notes, timeSpentMinutes, actionsPerformed, toolsUsed }
      );

      try {
        const caseInfo = await query(
          `SELECT c.case_number, c.client_id, cl.first_name, cl.email
           FROM cases c
           LEFT JOIN clients cl ON c.client_id = cl.id
           WHERE c.id = $1`,
          [req.params.id]
        );
        const caseRow = caseInfo.rows[0] || {};
        const eventType = stage === 'completed' ? 'CASE_COMPLETED'
          : stage === 'delivered' ? 'CASE_DELIVERED'
          : 'CASE_UPDATED';
        await automationService.handleEvent(eventType, {
          case_id: req.params.id,
          case_number: caseRow.case_number || '',
          name: caseRow.first_name || 'Client',
          email: caseRow.email || '',
          stage: stage
        });
      } catch (eventErr) {
        console.warn('CASE stage event emission failed:', eventErr.message);
      }

      res.json(result);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  }
);

// ─── PUT /api/cases/:id ───────────────────────────────────────────
router.put('/:id', requireMinRole('junior_engineer'), auditLog('update_case', 'case'), async (req, res) => {
  try {
    const {
      device_brand, device_model, serial_number, failure_type, symptoms,
      symptom_notes, initial_diagnosis, final_diagnosis, priority, deadline_at,
      internal_notes, assigned_engineer, recovery_progress_pct, data_recovered_gb,
      total_data_gb, imaging_tool, recovery_tool, storage_model_id, transfer_to_client
    } = req.body;

    if (!await ensureCaseAccessible(req.params.id, req.user)) {
      return res.status(404).json({ error: 'Case not found' });
    }
    const result = await query(
      `UPDATE cases SET
         device_brand = COALESCE($1, device_brand),
         device_model = COALESCE($2, device_model),
         serial_number = COALESCE($3, serial_number),
         failure_type = COALESCE($4, failure_type),
         symptoms = COALESCE($5, symptoms),
         symptom_notes = COALESCE($6, symptom_notes),
         initial_diagnosis = COALESCE($7, initial_diagnosis),
         final_diagnosis = COALESCE($8, final_diagnosis),
         priority = COALESCE($9, priority),
         deadline_at = COALESCE($10, deadline_at),
         internal_notes = COALESCE($11, internal_notes),
         assigned_engineer = COALESCE($12, assigned_engineer),
         recovery_progress_pct = COALESCE($13, recovery_progress_pct),
         data_recovered_gb = COALESCE($14, data_recovered_gb),
         total_data_gb = COALESCE($15, total_data_gb),
         imaging_tool = COALESCE($16, imaging_tool),
         recovery_tool = COALESCE($17, recovery_tool),
         storage_model_id = COALESCE($18, storage_model_id),
         transfer_to_client = COALESCE($19, transfer_to_client),
         updated_at = NOW()
       WHERE id = $20 RETURNING *`,
      [device_brand, device_model, serial_number, failure_type, symptoms,
       symptom_notes, initial_diagnosis, final_diagnosis, priority, deadline_at,
       internal_notes, assigned_engineer, recovery_progress_pct, data_recovered_gb,
       total_data_gb, imaging_tool, recovery_tool, storage_model_id, 
       transfer_to_client !== undefined ? transfer_to_client : null, req.params.id]
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Case not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/cases/:id/transfer-to-client ──────────────────────
router.patch('/:id/transfer-to-client', requireMinRole('junior_engineer'), auditLog('update_case', 'case'), async (req, res) => {
  try {
    if (!await ensureCaseAccessible(req.params.id, req.user)) {
      return res.status(404).json({ error: 'Case not found' });
    }
    const { transfer_to_client } = req.body;
    const result = await query(
      `UPDATE cases SET transfer_to_client = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [!!transfer_to_client, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Case not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/cases/:id/smart-assist ─────────────────────────────
router.get('/:id/smart-assist', async (req, res) => {
  try {
    if (!await ensureCaseAccessible(req.params.id, req.user)) {
      return res.status(404).json({ error: 'Case not found' });
    }
    const caseResult = await query(
      `SELECT c.device_brand, c.device_model, c.symptoms, c.failure_type, c.storage_model_id,
              sb.name as brand_name
       FROM cases c
       LEFT JOIN storage_models sm ON c.storage_model_id = sm.id
       LEFT JOIN storage_brands sb ON sm.brand_id = sb.id
       WHERE c.id = $1`,
      [req.params.id]
    );

    if (!caseResult.rows.length) return res.status(404).json({ error: 'Case not found' });

    const c = caseResult.rows[0];
    const { analyzeCase } = require('../services/smartAssist');
    const analysis = await analyzeCase({
      brandName: c.brand_name || c.device_brand,
      modelNumber: c.device_model,
      symptoms: c.symptoms || [],
      failureType: c.failure_type
    });

    res.json(analysis);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/cases/:id/donors ────────────────────────────────────
router.get('/:id/donors', async (req, res) => {
  try {
    if (!await ensureCaseAccessible(req.params.id, req.user)) {
      return res.status(404).json({ error: 'Case not found' });
    }
    const caseResult = await query('SELECT storage_model_id FROM cases WHERE id = $1', [req.params.id]);
    if (!caseResult.rows.length) return res.status(404).json({ error: 'Case not found' });
    if (!caseResult.rows[0].storage_model_id) {
      return res.json({ donors: [], message: 'No storage model linked to case' });
    }

    const { findDonors } = require('../services/donorEngine');
    const tenantId = isSuperAdmin(req.user) ? null : tenantAdminId(req.user);
    const result = await findDonors(caseResult.rows[0].storage_model_id, {}, tenantId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/cases/:id/solution ─────────────────────────────────
router.get('/:id/solution', async (req, res) => {
  try {
    if (!await ensureCaseAccessible(req.params.id, req.user)) {
      return res.status(404).json({ error: 'Case not found' });
    }
    const solution = await query(
      'SELECT * FROM case_solutions WHERE case_id = $1',
      [req.params.id]
    );
    const notesRes = await query(
      `SELECT n.id, n.note_text, n.created_at, n.created_by, u.username AS created_by_name
       FROM case_solution_notes n
       LEFT JOIN users u ON u.id = n.created_by
       WHERE n.case_id = $1
       ORDER BY n.created_at DESC`,
      [req.params.id]
    );
    let notes = notesRes.rows.map(n => ({
      id: n.id,
      text: n.note_text,
      createdAt: n.created_at,
      createdBy: n.created_by,
      createdByName: n.created_by_name,
    }));

    const legacyNote = solution.rows[0]?.text_note;
    if (!notes.length && legacyNote) {
      notes = [{
        id: 'legacy',
        text: legacyNote,
        createdAt: solution.rows[0]?.updated_at,
        createdBy: solution.rows[0]?.updated_by,
        createdByName: null,
      }];
    }

    const media = await query(
      'SELECT id, name, mime_type, data, size, caption, created_at FROM case_solution_media WHERE case_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json({
      textNote: notes[0]?.text || legacyNote || '',
      notes,
      mediaFiles: media.rows.map(m => ({
        id: m.id, name: m.name, mimeType: m.mime_type,
        data: m.data, size: m.size, caption: m.caption,
        createdAt: m.created_at,
        uploadedAt: m.created_at,
      })),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── PUT /api/cases/:id/solution ─────────────────────────────────
router.put('/:id/solution', requireMinRole('junior_engineer'), async (req, res) => {
  try {
    if (!await ensureCaseAccessible(req.params.id, req.user)) {
      return res.status(404).json({ error: 'Case not found' });
    }
    const { textNote } = req.body;
    if (!textNote || !String(textNote).trim()) {
      return res.status(400).json({ error: 'Note text is required' });
    }

    const noteRes = await query(
      `INSERT INTO case_solution_notes (case_id, note_text, created_by)
       VALUES ($1, $2, $3)
       RETURNING id, note_text, created_at, created_by`,
      [req.params.id, textNote.trim(), req.user.id]
    );

    await query(
      `INSERT INTO case_solutions (case_id, text_note, updated_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (case_id) DO UPDATE SET text_note = $2, updated_by = $3, updated_at = NOW()`,
      [req.params.id, textNote.trim(), req.user.id]
    );

    const noteRow = noteRes.rows[0];
    noteRow.created_by_name = req.user.username;
    try {
      await solutionsRouter.syncCaseToKnowledgeBase(req.params.id, req.user);
    } catch (syncErr) {
      console.warn('KB sync warning:', syncErr.message);
    }

    res.json({ message: 'Solution note saved', note: {
      id: noteRow.id,
      text: noteRow.note_text,
      createdAt: noteRow.created_at,
      createdBy: noteRow.created_by,
      createdByName: req.user.username,
    }});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /api/cases/:id/solution/media ──────────────────────────
router.post('/:id/solution/media', requireMinRole('junior_engineer'), solutionUpload.array('files', 20), async (req, res) => {
  try {
    if (!await ensureCaseAccessible(req.params.id, req.user)) {
      if (req.files) req.files.forEach(f => { try { fs.unlinkSync(f.path); } catch {} });
      return res.status(404).json({ error: 'Case not found' });
    }
    const saved = [];
    for (const file of (req.files || [])) {
      const buf = fs.readFileSync(file.path);
      const b64 = `data:${file.mimetype};base64,${buf.toString('base64')}`;
      try { fs.unlinkSync(file.path); } catch {}
      const r = await query(
        `INSERT INTO case_solution_media (case_id, name, mime_type, data, size, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, mime_type, data, size, created_at`,
        [req.params.id, file.originalname, file.mimetype, b64, file.size, req.user.id]
      );
      saved.push({
        id: r.rows[0].id, name: r.rows[0].name,
        mimeType: r.rows[0].mime_type, data: r.rows[0].data, size: r.rows[0].size,
        createdAt: r.rows[0].created_at,
        uploadedAt: r.rows[0].created_at,
      });
    }
    try {
      await solutionsRouter.syncCaseToKnowledgeBase(req.params.id, req.user);
    } catch (syncErr) {
      console.warn('KB sync warning:', syncErr.message);
    }

    res.status(201).json({ uploaded: saved.length, files: saved });
  } catch (err) {
    if (req.files) req.files.forEach(f => { try { fs.unlinkSync(f.path); } catch {} });
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/cases/:id/solution/media/:fileId ────────────────
router.delete('/:id/solution/media/:fileId', requireMinRole('junior_engineer'), async (req, res) => {
  try {
    if (!await ensureCaseAccessible(req.params.id, req.user)) {
      return res.status(404).json({ error: 'Case not found' });
    }
    const result = await query(
      'SELECT * FROM case_solution_media WHERE id=$1 AND case_id=$2',
      [req.params.fileId, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Media not found' });

    const row = result.rows[0];
    const parentLabel = await mediaRecycle.getCaseLabel(req.params.id);
    try {
      await mediaRecycle.archiveMediaRow({
        row,
        sourceModule: 'case_solution_media',
        parentType: 'case',
        parentId: req.params.id,
        parentLabel,
        user: req.user,
      });
    } catch (archiveErr) {
      console.warn('Media recycle archive warning:', archiveErr.message);
    }

    await query('DELETE FROM case_solution_media WHERE id=$1 AND case_id=$2', [req.params.fileId, req.params.id]);

    try {
      await solutionsRouter.syncCaseToKnowledgeBase(req.params.id, req.user);
    } catch (syncErr) {
      console.warn('KB sync warning:', syncErr.message);
    }

    res.json({ message: 'Media moved to recycle bin' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/cases/:id/images ────────────────────────────────────
router.get('/:id/images', async (req, res) => {
  try {
    if (!await ensureCaseAccessible(req.params.id, req.user)) {
      return res.status(404).json({ error: 'Case not found' });
    }
    const result = await query(
      'SELECT id, name, mime_type, data, size, caption, created_at FROM case_images WHERE case_id=$1 ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json(result.rows.map(r => ({
      id: r.id, name: r.name, mimeType: r.mime_type,
      data: r.data, size: r.size, caption: r.caption,
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /api/cases/:id/images ───────────────────────────────────
router.post('/:id/images', requireMinRole('junior_engineer'), upload.array('images', 20), async (req, res) => {
  try {
    if (!await ensureCaseAccessible(req.params.id, req.user)) {
      if (req.files) req.files.forEach(f => { try { fs.unlinkSync(f.path); } catch {} });
      return res.status(404).json({ error: 'Case not found' });
    }
    const saved = [];
    for (const file of (req.files || [])) {
      const buf = fs.readFileSync(file.path);
      const b64 = `data:${file.mimetype};base64,${buf.toString('base64')}`;
      try { fs.unlinkSync(file.path); } catch {}
      const r = await query(
        `INSERT INTO case_images (case_id, name, mime_type, data, size, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, mime_type, data, size`,
        [req.params.id, file.originalname, file.mimetype, b64, file.size, req.user.id]
      );
      saved.push({
        id: r.rows[0].id, name: r.rows[0].name,
        mimeType: r.rows[0].mime_type, data: r.rows[0].data, size: r.rows[0].size,
      });
    }
    res.status(201).json(saved);
  } catch (err) {
    if (req.files) req.files.forEach(f => { try { fs.unlinkSync(f.path); } catch {} });
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/cases/:id/images/:imgId ─────────────────────────
router.delete('/:id/images/:imgId', requireMinRole('junior_engineer'), async (req, res) => {
  try {
    if (!await ensureCaseAccessible(req.params.id, req.user)) {
      return res.status(404).json({ error: 'Case not found' });
    }
    const result = await query(
      'SELECT * FROM case_images WHERE id=$1 AND case_id=$2',
      [req.params.imgId, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Image not found' });

    const row = result.rows[0];
    const parentLabel = await mediaRecycle.getCaseLabel(req.params.id);
    try {
      await mediaRecycle.archiveMediaRow({
        row,
        sourceModule: 'case_images',
        parentType: 'case',
        parentId: req.params.id,
        parentLabel,
        user: req.user,
      });
    } catch (archiveErr) {
      console.warn('Media recycle archive warning:', archiveErr.message);
    }

    await query('DELETE FROM case_images WHERE id=$1 AND case_id=$2', [req.params.imgId, req.params.id]);
    res.json({ message: 'Image moved to recycle bin' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /api/cases/:id/payments ──────────────────────────────
router.post('/:id/payments', requireMinRole('junior_engineer'), auditLog('record_payment', 'payment'), async (req, res) => {
  try {
    if (!await ensureCaseAccessible(req.params.id, req.user)) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const { amount, gross_amount, discount_amount, quotation_id, method, reference_number, notes } = req.body;
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'A valid payment amount is required' });
    }

    const paymentRes = await transaction(async client => {
      // Get case and quotation data
      const caseResult = await client.query(
        'SELECT id, case_number, client_id FROM cases WHERE id = $1',
        [req.params.id]
      );
      if (!caseResult.rows.length) throw new Error('Case not found');

      const caseRow = caseResult.rows[0];

      // Get latest quotation for this case
      const quotRes = await client.query(
        `SELECT q.id, q.total_amount FROM quotations q WHERE q.case_id = $1 ORDER BY q.created_at DESC LIMIT 1`,
        [req.params.id]
      );
      const quotation = quotRes.rows[0];

      // Insert payment record
      const parsedGross = gross_amount ? parseFloat(gross_amount) : null;
      const parsedDiscount = discount_amount ? parseFloat(discount_amount) : 0;
      const insertRes = await client.query(
        `INSERT INTO payments (case_id, quotation_id, amount, gross_amount, discount_amount, method, reference_number, status, paid_at, notes, recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'paid',NOW(),$8,$9) RETURNING *`,
        [req.params.id, quotation?.id || quotation_id || null, parsedAmount,
         parsedGross, parsedDiscount, method || null, reference_number || null,
         notes || null, req.user.id]
      );

      // Update client total_paid (for historical tracking)
      if (caseRow.client_id) {
        await client.query(
          'UPDATE clients SET total_paid = COALESCE(total_paid,0) + $1 WHERE id = $2',
          [parsedAmount, caseRow.client_id]
        );
      }

      // Sync linked invoice status
      await syncInvoiceFromCasePayment(client, req.params.id);

      return insertRes.rows[0];
    });

    // Get updated case payment metrics
    const payments = await query(
      `SELECT p.*, q.total_amount as quoted_amount
       FROM payments p
       LEFT JOIN quotations q ON p.quotation_id = q.id
       WHERE p.case_id = $1 ORDER BY p.created_at DESC`,
      [req.params.id]
    );
    
    const quotations = await query(
      'SELECT * FROM quotations WHERE case_id = $1 ORDER BY created_at DESC LIMIT 1',
      [req.params.id]
    );

    const latestQuotation = quotations.rows[0];
    const quotationTotal = latestQuotation ? parseFloat(latestQuotation.total_amount || 0) : 0;
    const totalPaid = payments.rows.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    const balanceDue = Math.max(0, quotationTotal - totalPaid);

    try {
      const caseInfo = await query(
        `SELECT c.case_number, cl.first_name, cl.email
         FROM cases c
         LEFT JOIN clients cl ON c.client_id = cl.id
         WHERE c.id = $1`,
        [req.params.id]
      );
      const caseRow = caseInfo.rows[0] || {};
      await automationService.handleEvent('PAYMENT_RECEIVED', {
        case_id: req.params.id,
        case_number: caseRow.case_number || '',
        name: caseRow.first_name || 'Client',
        email: caseRow.email || '',
        amount: paymentRes.amount,
        payment_method: paymentRes.method || '',
        reference_number: paymentRes.reference_number || ''
      });
    } catch (eventErr) {
      console.warn('PAYMENT_RECEIVED event emission failed:', eventErr.message);
    }

    res.status(201).json({ 
      payment: paymentRes,
      case_payment_status: {
        case_id: req.params.id,
        quotation_total: quotationTotal,
        total_paid: totalPaid,
        balance_due: balanceDue,
        pending_amount: balanceDue
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/cases/:id/collect-payment ──────────────────────────
router.post('/:id/collect-payment', requireMinRole('junior_engineer'), auditLog('collect_payment', 'case'), async (req, res) => {
  try {
    if (!await ensureCaseAccessible(req.params.id, req.user)) {
      return res.status(404).json({ error: 'Case not found' });
    }

    // Get current case and quotation data
    const caseRes = await query(
      `SELECT c.id, c.case_number, c.client_id FROM cases c WHERE c.id = $1`,
      [req.params.id]
    );
    if (!caseRes.rows.length) return res.status(404).json({ error: 'Case not found' });

    const caseData = caseRes.rows[0];

    // Get latest quotation
    const quotRes = await query(
      `SELECT q.id, q.total_amount FROM quotations q WHERE q.case_id = $1 ORDER BY q.created_at DESC LIMIT 1`,
      [req.params.id]
    );

    if (!quotRes.rows.length) {
      return res.status(400).json({ error: 'No quotation found for this case' });
    }

    const quotation = quotRes.rows[0];

    // Get total paid amount so far
    const paidRes = await query(
      `SELECT COALESCE(SUM(amount), 0) as total_paid FROM payments WHERE case_id = $1 AND status = 'paid'`,
      [req.params.id]
    );

    const totalPaid = parseFloat(paidRes.rows[0].total_paid || 0);
    const pendingAmount = Math.max(0, quotation.total_amount - totalPaid);

    if (pendingAmount <= 0) {
      return res.status(400).json({ error: 'This case is already fully paid. No pending amount to collect.' });
    }

    // Create collection payment record + update client total_paid (atomic)
    const paymentResult = await transaction(async (client) => {
      const pay = await client.query(
        `INSERT INTO payments (case_id, quotation_id, amount, status, paid_at, recorded_by)
         VALUES ($1, $2, $3, 'paid', NOW(), $4)
         RETURNING id, amount, paid_at, status`,
        [req.params.id, quotation.id, pendingAmount, req.user.id]
      );
      if (caseData.client_id) {
        await client.query(
          'UPDATE clients SET total_paid = COALESCE(total_paid,0) + $1 WHERE id = $2',
          [pendingAmount, caseData.client_id]
        );
      }
      // Sync linked invoice status
      await syncInvoiceFromCasePayment(client, req.params.id);
      return pay.rows[0];
    });

    const payment = paymentResult;

    // Get updated pending amount (should reflect the collected payment)
    const updatedPendingRes = await query(
      `SELECT COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) as total_paid
       FROM payments WHERE case_id = $1`,
      [req.params.id]
    );

    const newTotalPaid = parseFloat(updatedPendingRes.rows[0].total_paid || 0);
    const newPending = Math.max(0, quotation.total_amount - newTotalPaid);

    res.json({
      success: true,
      message: 'Payment collected successfully',
      payment: {
        id: payment.id,
        amount: parseFloat(payment.amount),
        collected_at: payment.paid_at,
        status: payment.status
      },
      case: {
        id: caseData.id,
        case_number: caseData.case_number,
        quotation_total: parseFloat(quotation.total_amount),
        total_paid: newTotalPaid,
        balance_due: newPending,
        pending_amount: newPending
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// INVENTORY ↔ CASES INTEGRATION ENDPOINTS
// ============================================================

// GET /api/cases/:caseId/inventory — Get all inventory items in a case
router.get('/:caseId/inventory', async (req, res) => {
  try {
    if (!await ensureCaseAccessible(req.params.caseId, req.user)) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const result = await query(
      `SELECT cii.*, ii.name, ii.sku, ii.category, ii.serial_number,
              u_created.full_name as created_by_name,
              u_updated.full_name as updated_by_name
       FROM case_inventory_items cii
       LEFT JOIN inventory_items ii ON cii.inventory_item_id = ii.id
       LEFT JOIN users u_created ON cii.created_by = u_created.id
       LEFT JOIN users u_updated ON cii.updated_by = u_updated.id
       WHERE cii.case_id = $1
       ORDER BY cii.created_at DESC`,
      [req.params.caseId]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cases/:caseId/inventory — Add inventory item to case
router.post('/:caseId/inventory',
  requireMinRole('staff'),
  [
    body('inventory_item_id').isUUID().withMessage('Invalid inventory item ID'),
    body('qty_allocated').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
    body('usage_type').isIn(['CONSUMED', 'TEMPORARY_TOOL']).withMessage('Invalid usage type'),
    body('unit_cost').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('Invalid unit cost'),
    body('charge_to_client').optional().isBoolean(),
    body('client_charge_amount').optional({ nullable: true }).isFloat({ min: 0 }),
  ],
  auditLog('add_case_inventory', 'case_inventory_item'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

      if (!await ensureCaseAccessible(req.params.caseId, req.user)) {
        return res.status(404).json({ error: 'Case not found' });
      }

      const { inventory_item_id, qty_allocated, usage_type, unit_cost, notes,
              charge_to_client = false, client_charge_amount } = req.body;

      // Get inventory item
      const itemResult = await query(
        'SELECT id, sku, name, quantity, unit_cost as default_unit_cost FROM inventory_items WHERE id = $1',
        [inventory_item_id]
      );
      if (!itemResult.rows.length) {
        return res.status(404).json({ error: 'Inventory item not found' });
      }

      const item = itemResult.rows[0];
      const finalUnitCost = unit_cost || item.default_unit_cost || 0;
      const totalCost = qty_allocated * finalUnitCost;

      // Resolve client charge: only applicable for CONSUMED items with a cost
      const shouldChargeClient = charge_to_client && usage_type === 'CONSUMED' && totalCost > 0;
      const finalClientCharge = shouldChargeClient
        ? (client_charge_amount !== undefined ? parseFloat(client_charge_amount) : totalCost)
        : 0;

      const result = await transaction(async client => {
        // For CONSUMED type, mark as consumed immediately on allocation
        const initialStatus = usage_type === 'CONSUMED' ? 'consumed' : 'allocated';
        const initialQtyUsed = usage_type === 'CONSUMED' ? qty_allocated : 0;

        // Create case_inventory_item record
        const ciiResult = await client.query(
          `INSERT INTO case_inventory_items (
            case_id, inventory_item_id, usage_type, qty_allocated, qty_used,
            unit_cost, status, created_by, notes, charge_to_client, client_charge_amount
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING *`,
          [req.params.caseId, inventory_item_id, usage_type, qty_allocated, initialQtyUsed,
           finalUnitCost, initialStatus, req.user.id, notes,
           shouldChargeClient, finalClientCharge]
        );

        // Create inventory usage log
        const qtyBefore = item.quantity;
        const qtyAfter = qtyBefore - qty_allocated;
        await client.query(
          `INSERT INTO inventory_usage_logs (
            inventory_item_id, case_id, log_type, quantity_change,
            quantity_before, quantity_after, unit_cost, cost_impact, user_id, notes
          ) VALUES ($1, $2, 'ALLOCATED', $3, $4, $5, $6, $7, $8, $9)`,
          [inventory_item_id, req.params.caseId, -qty_allocated, qtyBefore,
           qtyAfter, finalUnitCost, -totalCost, req.user.id, `Allocated to case: ${notes || ''}`]
        );

        // Deduct from inventory stock only for CONSUMED items
        if (usage_type !== 'TEMPORARY_TOOL') {
          await client.query(
            'UPDATE inventory_items SET quantity = quantity - $1 WHERE id = $2',
            [qty_allocated, inventory_item_id]
          );
        }

        // Record case expense ONLY for CONSUMED items (temp tools have no cost to case)
        if (usage_type === 'CONSUMED') {
          await client.query(
            `INSERT INTO case_expenses (
              case_id, expense_type, amount, description, reference_id, reference_type, recorded_by
            ) VALUES ($1, 'inventory', $2, $3, $4, 'case_inventory_item', $5)`,
            [req.params.caseId, totalCost,
             `${item.name} (${item.sku}) - ${qty_allocated} qty @ ₹${finalUnitCost}`,
             ciiResult.rows[0].id, req.user.id]
          );
        }

        // If admin chose to charge inventory cost to client, add it to the quotation total
        // so it flows through to pending_amount (= quotation_total - paid)
        if (shouldChargeClient && finalClientCharge > 0) {
          const quotResult = await client.query(
            `SELECT id, total_amount FROM quotations WHERE case_id = $1 ORDER BY created_at DESC LIMIT 1`,
            [req.params.caseId]
          );
          if (quotResult.rows.length) {
            // Add to existing quotation total
            await client.query(
              `UPDATE quotations SET total_amount = total_amount + $1, updated_at = NOW() WHERE id = $2`,
              [finalClientCharge, quotResult.rows[0].id]
            );
          } else {
            // No quotation yet — create one with just the inventory charge
            await client.query(
              `INSERT INTO quotations (case_id, estimated_cost, total_amount, approved_by_client, created_by, notes)
               VALUES ($1, $2, $2, true, $3, $4)`,
              [req.params.caseId, finalClientCharge, req.user.id,
               `Auto-created: inventory charge for ${item.name} (${item.sku})`]
            );
          }
        }

        return ciiResult.rows[0];
      });

      res.status(201).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// PATCH /api/cases/:caseId/inventory/:itemId/cost — Admin: edit unit cost / apply discount
router.patch('/:caseId/inventory/:itemId/cost',
  requireMinRole('staff'),
  [
    body('unit_cost').isFloat({ min: 0 }).withMessage('Unit cost must be a non-negative number'),
    body('discount').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('Discount must be non-negative'),
    body('charge_to_client').optional().isBoolean(),
    body('client_charge_amount').optional({ nullable: true }).isFloat({ min: 0 }),
    body('notes').optional().isString(),
  ],
  auditLog('update_case_inventory_cost', 'case_inventory_item'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    try {
      if (!await ensureCaseAccessible(req.params.caseId, req.user)) {
        return res.status(404).json({ error: 'Case not found' });
      }

      const { unit_cost, discount = 0, notes, charge_to_client, client_charge_amount } = req.body;

      const ciiResult = await query(
        `SELECT * FROM case_inventory_items WHERE id = $1 AND case_id = $2`,
        [req.params.itemId, req.params.caseId]
      );
      if (!ciiResult.rows.length) return res.status(404).json({ error: 'Item not found in case' });

      const cii = ciiResult.rows[0];
      const newUnitCost = parseFloat(unit_cost);
      const discountAmt = parseFloat(discount || 0);
      const newTotalCost = Math.max(0, (cii.qty_allocated * newUnitCost) - discountAmt);

      // Resolve whether client charge is changing
      const prevChargeToClient = cii.charge_to_client || false;
      const prevClientCharge = parseFloat(cii.client_charge_amount || 0);
      const newChargeToClient = charge_to_client !== undefined ? charge_to_client : prevChargeToClient;
      const newClientCharge = newChargeToClient
        ? (client_charge_amount !== undefined ? parseFloat(client_charge_amount) : newTotalCost)
        : 0;
      // Delta to apply to pending_amount (can be negative if charge is reduced/removed)
      const pendingDelta = newClientCharge - (prevChargeToClient ? prevClientCharge : 0);

      const result = await transaction(async client => {
        // Update the inventory item record
        // total_allocated_cost is a generated column (qty_allocated * unit_cost), do not set it directly
        const updated = await client.query(
          `UPDATE case_inventory_items
           SET unit_cost = $1, discount_amount = $2,
               charge_to_client = $3, client_charge_amount = $4,
               notes = COALESCE($5, notes), updated_by = $6, updated_at = NOW()
           WHERE id = $7 AND case_id = $8
           RETURNING *`,
          [newUnitCost, discountAmt, newChargeToClient, newClientCharge,
           notes || null, req.user.id, req.params.itemId, req.params.caseId]
        );

        // Update the linked case_expense if this is a CONSUMED item
        if (cii.usage_type === 'CONSUMED') {
          const existingExp = await client.query(
            `SELECT id FROM case_expenses WHERE case_id = $1 AND reference_id = $2 AND reference_type = 'case_inventory_item'`,
            [req.params.caseId, req.params.itemId]
          );
          if (existingExp.rows.length) {
            await client.query(
              `UPDATE case_expenses SET amount = $1 WHERE id = $2`,
              [newTotalCost, existingExp.rows[0].id]
            );
          } else {
            const itemData = await client.query('SELECT name, sku FROM inventory_items WHERE id = $1', [cii.inventory_item_id]);
            const item = itemData.rows[0] || {};
            await client.query(
              `INSERT INTO case_expenses (case_id, expense_type, amount, description, reference_id, reference_type, recorded_by)
               VALUES ($1, 'inventory', $2, $3, $4, 'case_inventory_item', $5)`,
              [req.params.caseId, newTotalCost,
               `${item.name || 'Item'} (${item.sku || ''}) - ${cii.qty_allocated} qty @ ₹${newUnitCost}${discountAmt > 0 ? ` - ₹${discountAmt} discount` : ''}`,
               req.params.itemId, req.user.id]
            );
          }
        }

        // Adjust the quotation total by the delta so pending_amount (quotation - paid) is correct
        if (pendingDelta !== 0) {
          const quotResult = await client.query(
            `SELECT id, total_amount FROM quotations WHERE case_id = $1 ORDER BY created_at DESC LIMIT 1`,
            [req.params.caseId]
          );
          if (quotResult.rows.length) {
            const newTotal = Math.max(0, parseFloat(quotResult.rows[0].total_amount || 0) + pendingDelta);
            await client.query(
              `UPDATE quotations SET total_amount = $1, updated_at = NOW() WHERE id = $2`,
              [newTotal, quotResult.rows[0].id]
            );
          } else if (pendingDelta > 0) {
            // No quotation — create one for the charge amount
            await client.query(
              `INSERT INTO quotations (case_id, estimated_cost, total_amount, approved_by_client, created_by)
               VALUES ($1, $2, $2, true, $3)`,
              [req.params.caseId, pendingDelta, req.user.id]
            );
          }
        }

        return updated.rows[0];
      });

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// PUT /api/cases/:caseId/inventory/:itemId — Update item usage (return, consume, etc.)
router.put('/:caseId/inventory/:itemId',
  requireMinRole('staff'),
  [
    body('action').isIn(['consume', 'return', 'damage']),
    body('qty').optional().isInt({ min: 0 }),
    body('condition_on_return').optional().isString(),
  ],
  auditLog('update_case_inventory', 'case_inventory_item'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    try {
      if (!await ensureCaseAccessible(req.params.caseId, req.user)) {
        return res.status(404).json({ error: 'Case not found' });
      }

      const { action, qty, condition_on_return, notes } = req.body;

      const ciiResult = await query(
        `SELECT * FROM case_inventory_items WHERE case_id = $1 AND id = $2`,
        [req.params.caseId, req.params.itemId]
      );
      if (!ciiResult.rows.length) {
        return res.status(404).json({ error: 'Item not found in case' });
      }

      const cii = ciiResult.rows[0];
      const updateQty = qty || cii.qty_allocated;

      const result = await transaction(async client => {
        let updateData = { updated_by: req.user.id };
        let logType = 'ADJUSTED';
        let quantityChange = 0;
        let newStatus = cii.status;

        if (action === 'consume') {
          updateData.qty_used = (cii.qty_used || 0) + updateQty;
          newStatus = 'consumed';
          logType = 'CONSUMED';
          quantityChange = -updateQty;
        } else if (action === 'return') {
          updateData.qty_returned = (cii.qty_returned || 0) + updateQty;
          updateData.returned_at = new Date().toISOString();
          updateData.condition_on_return = condition_on_return;
          logType = 'RETURNED';
          quantityChange = updateQty;  // Return to inventory
          newStatus = 'returned';
        } else if (action === 'damage') {
          updateData.qty_damaged = (cii.qty_damaged || 0) + updateQty;
          logType = 'ADJUSTED';
          quantityChange = 0;  // Damaged items don't return
          newStatus = 'damaged';
        }

        updateData.status = newStatus;

        // Update case_inventory_item
        const setClauses = [];
        const params = [];
        let pi = 1;
        for (const [key, value] of Object.entries(updateData)) {
          setClauses.push(`${key} = $${pi++}`);
          params.push(value);
        }
        params.push(req.params.itemId);
        params.push(req.params.caseId);

        const updated = await client.query(
          `UPDATE case_inventory_items SET ${setClauses.join(', ')}, updated_at = NOW()
           WHERE id = $${pi} AND case_id = $${pi + 1}
           RETURNING *`,
          params
        );

        // Create inventory usage log
        if (quantityChange !== 0) {
          const itemData = await client.query(
            'SELECT quantity FROM inventory_items WHERE id = $1',
            [cii.inventory_item_id]
          );
          const qtyBefore = itemData.rows[0].quantity;
          const qtyAfter = qtyBefore + quantityChange;

          await client.query(
            `INSERT INTO inventory_usage_logs (
              inventory_item_id, case_id, log_type, quantity_change,
              quantity_before, quantity_after, unit_cost, cost_impact, user_id, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [cii.inventory_item_id, req.params.caseId, logType, quantityChange,
             qtyBefore, qtyAfter, cii.unit_cost, quantityChange * cii.unit_cost,
             req.user.id, notes]
          );

          // Update inventory quantity
          if (quantityChange !== 0) {
            await client.query(
              'UPDATE inventory_items SET quantity = quantity + $1 WHERE id = $2',
              [quantityChange, cii.inventory_item_id]
            );
          }
        }

        return updated.rows[0];
      });

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// DELETE /api/cases/:caseId/inventory/:itemId — Remove inventory item from case
router.delete('/:caseId/inventory/:itemId',
  requireMinRole('staff'),
  auditLog('remove_case_inventory', 'case_inventory_item'),
  async (req, res) => {
    try {
      if (!await ensureCaseAccessible(req.params.caseId, req.user)) {
        return res.status(404).json({ error: 'Case not found' });
      }

      await transaction(async client => {
        // Get the item to reverse the allocation
        const ciiResult = await client.query(
          `SELECT * FROM case_inventory_items WHERE id = $1 AND case_id = $2`,
          [req.params.itemId, req.params.caseId]
        );
        if (!ciiResult.rows.length) throw new Error('Item not found');

        const cii = ciiResult.rows[0];

        // Remove case_inventory_item
        await client.query(
          'DELETE FROM case_inventory_items WHERE id = $1',
          [req.params.itemId]
        );

        // Remove related expenses
        await client.query(
          `DELETE FROM case_expenses WHERE case_id = $1 AND reference_id = $2`,
          [req.params.caseId, req.params.itemId]
        );

        // Reverse inventory changes
        if (cii.usage_type !== 'TEMPORARY_TOOL') {
          await client.query(
            'UPDATE inventory_items SET quantity = quantity + $1 WHERE id = $2',
            [cii.qty_allocated - (cii.qty_used || 0) - (cii.qty_damaged || 0), cii.inventory_item_id]
          );
        }
      });

      res.json({ message: 'Inventory item removed from case' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/cases/:caseId/expenses — Get all case expenses
router.get('/:caseId/expenses', async (req, res) => {
  try {
    if (!await ensureCaseAccessible(req.params.caseId, req.user)) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const result = await query(
      `SELECT ce.*, u.full_name as recorded_by_name
       FROM case_expenses ce
       LEFT JOIN users u ON ce.recorded_by = u.id
       WHERE ce.case_id = $1
       ORDER BY ce.created_at DESC`,
      [req.params.caseId]
    );

    // Calculate totals by type
    const totals = {};
    let grandTotal = 0;
    result.rows.forEach(row => {
      if (!totals[row.expense_type]) totals[row.expense_type] = 0;
      totals[row.expense_type] += parseFloat(row.amount || 0);
      grandTotal += parseFloat(row.amount || 0);
    });

    res.json({
      expenses: result.rows,
      totals,
      grand_total: grandTotal
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cases/:caseId/expenses — Add case expense
router.post('/:caseId/expenses',
  requireMinRole('staff'),
  [
    body('expense_type').isIn(['inventory', 'direct_purchase', 'shipping', 'vendor', 'lab', 'misc']),
    body('amount').isDecimal(),
    body('description').notEmpty(),
  ],
  auditLog('add_case_expense', 'case_expense'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

      if (!await ensureCaseAccessible(req.params.caseId, req.user)) {
        return res.status(404).json({ error: 'Case not found' });
      }

      const { expense_type, amount, description, category, vendor_name, notes } = req.body;

      const result = await query(
        `INSERT INTO case_expenses (
          case_id, expense_type, amount, description, category, vendor_name, notes, recorded_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [req.params.caseId, expense_type, parseFloat(amount), description,
         category || null, vendor_name || null, notes || null, req.user.id]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/cases/:caseId/profit — Get case profit calculation
router.get('/:caseId/profit', async (req, res) => {
  try {
    if (!await ensureCaseAccessible(req.params.caseId, req.user)) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const result = await query(
      `SELECT *
       FROM case_financials
       WHERE id = $1`,
      [req.params.caseId]
    );

    if (!result.rows.length) {
      return res.json({
        case_id: req.params.caseId,
        revenue: 0,
        inventory_expense: 0,
        direct_purchase_expense: 0,
        shipping_expense: 0,
        vendor_expense: 0,
        lab_expense: 0,
        misc_expense: 0,
        total_expenses: 0,
        gross_profit: 0
      });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventory/:itemId/usage-history — Get item usage across cases
router.get('/inventory/:itemId/usage-history', async (req, res) => {
  try {
    const caseResult = await query(
      `SELECT ii.id FROM inventory_items ii WHERE ii.id = $1`,
      [req.params.itemId]
    );
    if (!caseResult.rows.length) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Get usage logs
    const logs = await query(
      `SELECT iul.*, u.full_name as user_name, c.case_number, c.id as case_id
       FROM inventory_usage_logs iul
       LEFT JOIN users u ON iul.user_id = u.id
       LEFT JOIN cases c ON iul.case_id = c.id
       WHERE iul.inventory_item_id = $1
       ORDER BY iul.created_at DESC`,
      [req.params.itemId]
    );

    // Get cases this item was used in
    const casesResult = await query(
      `SELECT DISTINCT c.id, c.case_number, c.stage,
              SUM(cii.qty_allocated) as qty_used,
              SUM(cii.qty_returned) as qty_returned,
              SUM(cii.total_allocated_cost) as total_cost
       FROM case_inventory_items cii
       JOIN cases c ON cii.case_id = c.id
       WHERE cii.inventory_item_id = $1
       GROUP BY c.id, c.case_number, c.stage`,
      [req.params.itemId]
    );

    // Get analytics
    const analyticsResult = await query(
      `SELECT
        COUNT(DISTINCT CASE WHEN log_type = 'PURCHASED' THEN 1 END) as purchase_count,
        SUM(CASE WHEN log_type = 'PURCHASED' THEN ABS(quantity_change) ELSE 0 END) as total_purchased_qty,
        SUM(CASE WHEN log_type = 'CONSUMED' THEN ABS(quantity_change) ELSE 0 END) as total_consumed_qty,
        SUM(CASE WHEN log_type = 'RETURNED' THEN ABS(quantity_change) ELSE 0 END) as total_returned_qty,
        SUM(CASE WHEN log_type = 'CONSUMED' THEN cost_impact ELSE 0 END) as total_consumed_value
       FROM inventory_usage_logs
       WHERE inventory_item_id = $1`,
      [req.params.itemId]
    );

    res.json({
      logs: logs.rows,
      cases: casesResult.rows,
      analytics: analyticsResult.rows[0] || {
        purchase_count: 0,
        total_purchased_qty: 0,
        total_consumed_qty: 0,
        total_returned_qty: 0,
        total_consumed_value: 0
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventory/:itemId/analytics — Get item analytics
router.get('/inventory/:itemId/analytics', async (req, res) => {
  try {
    const itemResult = await query(
      `SELECT ii.*, 
              COUNT(DISTINCT cii.case_id) as cases_used_in,
              SUM(cii.qty_used) as total_qty_used,
              SUM(cii.qty_returned) as total_qty_returned,
              SUM(cii.total_used_cost) as total_used_cost,
              SUM(CASE WHEN c.stage = 'completed' THEN 1 ELSE 0 END) as completed_cases,
              SUM(CASE WHEN c.stage IN ('completed', 'delivered') THEN p.amount ELSE 0 END) as related_case_revenue
       FROM inventory_items ii
       LEFT JOIN case_inventory_items cii ON ii.id = cii.inventory_item_id
       LEFT JOIN cases c ON cii.case_id = c.id
       LEFT JOIN payments p ON c.id = p.case_id AND p.status = 'paid'
       WHERE ii.id = $1
       GROUP BY ii.id`,
      [req.params.itemId]
    );

    if (!itemResult.rows.length) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const item = itemResult.rows[0];

    res.json({
      ...item,
      gross_profit: (item.related_case_revenue || 0) - (item.total_used_cost || 0)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

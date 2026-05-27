const express = require('express');
const fs = require('fs');
const { body, query: queryValidator, validationResult, param } = require('express-validator');
const { query } = require('../config/database');
const { authenticate, requireMinRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const { upload } = require('../middleware/upload');
const { solutionUpload } = require('../middleware/solutionUpload');
const { isSuperAdmin, tenantCaseCondition, verifyCaseAccess, verifyClientAccess } = require('../utils/tenantAccess');
const solutionsRouter = require('./solutions');
const mediaRecycle = require('../services/mediaRecycle');
const { normalizeFailureType, isValidFailureType } = require('../utils/failureTypes');

const router = express.Router();
router.use(authenticate);

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
  return await verifyCaseAccess(caseId, user);
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

    // Engineers can only see their own cases (unless admin/senior)
    if (req.user.role === 'junior_engineer') {
      conditions.push(`c.assigned_engineer = $${pi++}`);
      params.push(req.user.id);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const allowedSort = ['created_at', 'updated_at', 'priority', 'stage', 'case_number'];
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
              (SELECT amount FROM payments WHERE case_id = c.id ORDER BY created_at LIMIT 1) as first_payment
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
  [
    body('client_id').optional().isUUID(),
    body('device_brand').trim().notEmpty(),
    body('device_model').trim().notEmpty(),
    body('symptoms').isArray().optional(),
    body('failure_type').optional().custom((val) => isValidFailureType(val)),
    body('priority').optional().isInt({ min: 1, max: 5 }),
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
        assigned_engineer
      } = req.body;
      if (client_id && !isSuperAdmin(req.user) && !(await verifyClientAccess(client_id, req.user))) {
        return res.status(404).json({ error: 'Client not found' });
      }

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

      const result = await query(
        `INSERT INTO cases (
          client_id, device_brand, device_model, storage_model_id, serial_number,
          capacity_gb, interface, form_factor, failure_type, symptoms, symptom_notes,
          initial_diagnosis, priority, deadline_at, internal_notes, assigned_engineer,
          ai_risk_level, ai_suggested_strategy, ai_confidence, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
        RETURNING *`,
        [
          client_id, device_brand, device_model, storage_model_id || null, serial_number,
          capacity_gb, iface, form_factor, failure_type || 'unknown', symptoms || [], symptom_notes,
          initial_diagnosis, priority || 3, deadline_at || null, internal_notes,
          assigned_engineer || null,
          aiData.ai_risk_level || null,
          JSON.stringify(aiData.ai_suggested_strategy || {}),
          aiData.ai_confidence || null,
          req.user.id
        ]
      );

      // Log initial stage
      await query(
        `INSERT INTO case_workflow_logs (case_id, from_stage, to_stage, engineer_id, notes)
         VALUES ($1, NULL, 'received', $2, 'Case created')`,
        [result.rows[0].id, req.user.id]
      );

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

      res.status(201).json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

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
       WHERE c.id = $1`,
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
       WHERE p.case_id = $1 ORDER BY p.created_at DESC`,
      [req.params.id]
    );

    // Get quotations
    const quotations = await query(
      'SELECT * FROM quotations WHERE case_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );

    res.json({
      ...caseData,
      workflowLogs: logs.rows,
      files: files.rows,
      payments: payments.rows,
      quotations: quotations.rows,
    });
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
    const result = await findDonors(caseResult.rows[0].storage_model_id);
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

module.exports = router;

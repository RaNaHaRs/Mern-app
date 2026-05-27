const express = require('express');
const { query } = require('../config/database');
const { authenticate, requireMinRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const { isSuperAdmin, tenantCaseCondition } = require('../utils/tenantAccess');

const router = express.Router();
router.use(authenticate);

// ─── GET /api/storage-models ──────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { page=1, limit=20, brand_id, search, interface: iface, risk_level } = req.query;
    const offset = (parseInt(page)-1)*parseInt(limit);
    const conditions = [], params = [];
    let pi = 1;

    if (brand_id) { conditions.push(`sm.brand_id = $${pi++}`); params.push(brand_id); }
    if (iface) { conditions.push(`sm.interface = $${pi++}`); params.push(iface); }
    if (risk_level) { conditions.push(`sm.risk_level = $${pi++}`); params.push(risk_level); }
    if (search) {
      conditions.push(`(sm.model_number ILIKE $${pi} OR sm.series ILIKE $${pi} OR sm.controller_chip ILIKE $${pi} OR sm.firmware_family ILIKE $${pi})`);
      params.push(`%${search}%`); pi++;
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const count = await query(`SELECT COUNT(*) FROM storage_models sm ${where}`, params);
    const tenantCase = !isSuperAdmin(req.user) ? tenantCaseCondition(req.user, 'c', 1) : null;
    const result = await query(
      `SELECT sm.*, sb.name as brand_name,
              COUNT(c.id) as case_count,
              AVG(CASE WHEN c.stage = 'completed' THEN 1 WHEN c.stage = 'failed' THEN 0 END) * 100 as success_rate
       FROM storage_models sm
       JOIN storage_brands sb ON sm.brand_id = sb.id
       LEFT JOIN cases c ON c.storage_model_id = sm.id ${tenantCase ? `AND ${tenantCase.clause}` : ''}
       ${where}
       GROUP BY sm.id, sb.name
       ORDER BY sm.model_number ASC
       LIMIT $${pi} OFFSET $${pi+1}`,
      tenantCase ? [...tenantCase.params, ...params, parseInt(limit), offset] : [...params, parseInt(limit), offset]
    );

    res.json({
      models: result.rows,
      pagination: { total: parseInt(count.rows[0].count), page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(parseInt(count.rows[0].count)/parseInt(limit)) }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/storage-models/brands ──────────────────────────────
router.get('/brands', async (req, res) => {
  try {
    const result = await query('SELECT * FROM storage_brands ORDER BY name');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /api/storage-models ─────────────────────────────────────
router.post('/', requireMinRole('senior_engineer'), auditLog('create_storage_model', 'storage_model'), async (req, res) => {
  try {
    const {
      brand_id, model_number, series, capacity_gb, rpm, nand_type, interface: iface, form_factor,
      controller_chip, pcb_number, firmware_family, microcode_version, head_map,
      platter_count, rom_type, risk_level, common_failures, known_issues,
      recovery_strategy, tool_compatibility, do_notes, dont_notes, notes
    } = req.body;

    const result = await query(
      `INSERT INTO storage_models (brand_id, model_number, series, capacity_gb, rpm, nand_type, interface, form_factor,
        controller_chip, pcb_number, firmware_family, microcode_version, head_map, platter_count, rom_type,
        risk_level, common_failures, known_issues, recovery_strategy, tool_compatibility,
        do_notes, dont_notes, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       RETURNING *`,
      [brand_id, model_number, series, capacity_gb, rpm||null, nand_type||null, iface, form_factor,
       controller_chip||null, pcb_number||null, firmware_family||null, microcode_version||null, head_map||null, platter_count||null, rom_type||null,
       risk_level||'medium', common_failures||[], JSON.stringify(known_issues||{}), JSON.stringify(recovery_strategy||{}), tool_compatibility||[],
       do_notes||null, dont_notes||null, notes||null, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.constraint === 'storage_models_brand_id_model_number_key') return res.status(409).json({ error: 'Model already exists for this brand' });
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/storage-models/:id ──────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT sm.*, sb.name as brand_name,
              u.full_name as created_by_name, u2.full_name as verified_by_name
       FROM storage_models sm
       JOIN storage_brands sb ON sm.brand_id = sb.id
       LEFT JOIN users u ON sm.created_by = u.id
       LEFT JOIN users u2 ON sm.verified_by = u2.id
       WHERE sm.id = $1`, [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Model not found' });

    // Get failure library entries
    const failures = await query('SELECT * FROM failure_library WHERE model_id = $1 ORDER BY success_rate DESC', [req.params.id]);

    // Get donor matches
    const donors = await query(
      `SELECT dm.*, sm2.model_number as donor_model, sb2.name as donor_brand
       FROM donor_matching dm
       JOIN storage_models sm2 ON dm.donor_model_id = sm2.id
       JOIN storage_brands sb2 ON sm2.brand_id = sb2.id
       WHERE dm.model_id = $1 ORDER BY dm.compatibility_score DESC`, [req.params.id]
    );

    res.json({ ...result.rows[0], failureLibrary: failures.rows, donorMatches: donors.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── PUT /api/storage-models/:id ──────────────────────────────────
router.put('/:id', requireMinRole('senior_engineer'), auditLog('update_storage_model', 'storage_model'), async (req, res) => {
  try {
    const fields = ['controller_chip','pcb_number','firmware_family','microcode_version','head_map','platter_count','rom_type','risk_level','common_failures','known_issues','recovery_strategy','tool_compatibility','do_notes','dont_notes','notes'];
    const updates = [], params = [];
    let pi = 1;
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = $${pi++}`);
        params.push(['known_issues','recovery_strategy'].includes(f) ? JSON.stringify(req.body[f]) : req.body[f]);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    updates.push(`updated_at = NOW()`);
    params.push(req.params.id);
    const result = await query(`UPDATE storage_models SET ${updates.join(',')} WHERE id = $${pi} RETURNING *`, params);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /api/storage-models/:id/failure-entries ────────────────
router.post('/:id/failure-entries', requireMinRole('junior_engineer'), async (req, res) => {
  try {
    const { failure_type, title, symptoms, root_cause, solution_steps, tools_required, success_rate, difficulty_level, notes } = req.body;
    const result = await query(
      `INSERT INTO failure_library (model_id, failure_type, title, symptoms, root_cause, solution_steps, tools_required, success_rate, difficulty_level, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.params.id, failure_type, title, symptoms||[], root_cause, JSON.stringify(solution_steps||[]), tools_required||[], success_rate, difficulty_level, notes, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

const express = require('express');
const fs = require('fs');
const { query } = require('../config/database');
const { authenticate, requireMinRole } = require('../middleware/auth');
const { solutionUpload } = require('../middleware/solutionUpload');
const { isSuperAdmin, tenantAdminId } = require('../utils/tenantAccess');

const router = express.Router();

function knowledgeBaseScope(req, alias = 'kb', paramIndex = 1) {
  if (isSuperAdmin(req.user)) return { clause: '1=1', params: [] };
  return {
    clause: `${alias}.tenant_id = $${paramIndex}`,
    params: [tenantAdminId(req.user)],
  };
}

function mapKbRow(row) {
  const noteHistory = row.note_history || [];
  const latestNote = noteHistory[0]?.text || noteHistory[noteHistory.length - 1]?.text || '';
  return {
    id: row.id,
    title: row.title,
    device_type: row.device_type,
    category: row.category,
    problem: row.problem,
    tags: row.tags || [],
    notes: latestNote,
    note_history: noteHistory,
    case_refs: row.case_refs || [],
    files: row.files || [],
    source: row.source,
    created_by: row.created_by,
    created_by_name: row.created_by_name,
    created_at: row.created_at,
    updated_at: row.updated_at,
    related_case_count: (row.case_refs || []).length,
    has_media: (row.files || []).length > 0,
  };
}

function inferDeviceType(c) {
  const model = `${c.device_model || ''}`.toLowerCase();
  if (model.includes('ssd') || model.includes('nvme') || model.includes('m.2')) return 'SSD';
  if (model.includes('usb') || model.includes('flash') || model.includes('sd ')) return 'Flash';
  if (model.includes('raid') || model.includes('nas')) return 'RAID/NAS';
  return 'HDD';
}

function buildCaseProblem(c) {
  return c.final_diagnosis || c.initial_diagnosis || c.symptom_notes || '';
}

function buildCaseTags(c) {
  const tags = [];
  if (c.failure_type) tags.push(c.failure_type);
  if (Array.isArray(c.symptoms)) {
    c.symptoms.slice(0, 5).forEach(s => { if (s && !tags.includes(s)) tags.push(s); });
  }
  return tags;
}

async function syncCaseToKnowledgeBase(caseId, user) {
  const caseRes = await query(
    `SELECT id, case_number, device_brand, device_model, failure_type, symptoms,
            initial_diagnosis, final_diagnosis, symptom_notes, tenant_id
     FROM cases WHERE id = $1`,
    [caseId]
  );
  const c = caseRes.rows[0];
  if (!c) return;

  let notesRes = await query(
    `SELECT n.id, n.note_text, n.created_at, n.created_by, u.username AS created_by_name
     FROM case_solution_notes n
     LEFT JOIN users u ON u.id = n.created_by
     WHERE n.case_id = $1
     ORDER BY n.created_at DESC`,
    [caseId]
  );

  if (!notesRes.rows.length) {
    const legacy = await query(
      `SELECT text_note, updated_at, updated_by FROM case_solutions WHERE case_id = $1 AND text_note IS NOT NULL AND TRIM(text_note) <> ''`,
      [caseId]
    );
    if (legacy.rows[0]) {
      notesRes = {
        rows: [{
          id: 'legacy',
          note_text: legacy.rows[0].text_note,
          created_at: legacy.rows[0].updated_at,
          created_by: legacy.rows[0].updated_by,
          created_by_name: null,
        }],
      };
    }
  }

  const media = await query(
    `SELECT id, name, mime_type, data, size, created_at FROM case_solution_media WHERE case_id = $1 ORDER BY created_at ASC`,
    [caseId]
  );

  if (!notesRes.rows.length && !media.rows.length) return;

  const titleBase = `${c.device_brand || ''} ${c.device_model || ''}`.trim() || `Case ${c.case_number || caseId}`;
  const deviceType = inferDeviceType(c);
  const category = c.failure_type || deviceType;
  const tags = buildCaseTags(c);
  const noteHistory = notesRes.rows.map(n => ({
    id: n.id,
    text: n.note_text,
    createdAt: n.created_at,
    createdBy: n.created_by,
    createdByName: n.created_by_name,
  }));

  const caseRef = { case_id: caseId, case_number: c.case_number };
  const files = media.rows.map(m => ({
    id: m.id,
    name: m.name,
    mimeType: m.mime_type,
    data: m.data,
    size: m.size,
    uploadedAt: m.created_at,
  }));

  const kbTitle = `${titleBase} — ${c.case_number || 'Case'}`;
  const payload = {
    title: kbTitle,
    deviceType,
    category,
    problem: buildCaseProblem(c),
    tags: JSON.stringify(tags),
    noteHistory: JSON.stringify(noteHistory),
    caseRefs: JSON.stringify([caseRef]),
    files: JSON.stringify(files),
  };

  const existing = await query(
    `SELECT id, created_by FROM knowledge_base_entries
     WHERE source = 'case'
       AND tenant_id = $2
       AND EXISTS (
         SELECT 1 FROM jsonb_array_elements(case_refs) AS ref
         WHERE ref->>'case_id' = $1
       )
     LIMIT 1`,
    [caseId, c.tenant_id || user?.tenant_id || tenantAdminId(user)]
  );

  if (existing.rows.length) {
    await query(
      `UPDATE knowledge_base_entries SET
        title = $2,
        device_type = $3,
        category = $4,
        problem = $5,
        tags = $6::jsonb,
        note_history = $7::jsonb,
        case_refs = $8::jsonb,
        files = $9::jsonb,
        updated_at = NOW()
      WHERE id = $1`,
      [
        existing.rows[0].id,
        payload.title,
        payload.deviceType,
        payload.category,
        payload.problem,
        payload.tags,
        payload.noteHistory,
        payload.caseRefs,
        payload.files,
      ]
    );
    return;
  }

  await query(
    `INSERT INTO knowledge_base_entries (
      tenant_id, title, device_type, category, problem, tags, note_history, case_refs, files, source, created_by
    ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,'case',$10)`,
    [
      c.tenant_id || user?.tenant_id || tenantAdminId(user),
      payload.title,
      payload.deviceType,
      payload.category,
      payload.problem,
      payload.tags,
      payload.noteHistory,
      payload.caseRefs,
      payload.files,
      user?.id || null,
    ]
  );
}

async function syncCaseNoteToKnowledgeBase(caseId, _noteRow, user) {
  await syncCaseToKnowledgeBase(caseId, user);
}

router.syncCaseToKnowledgeBase = syncCaseToKnowledgeBase;
router.syncCaseNoteToKnowledgeBase = syncCaseNoteToKnowledgeBase;

router.get('/', authenticate, async (req, res) => {
  try {
    const { search, device_type, tag, category } = req.query;
    const scope = knowledgeBaseScope(req, 'kb', 1);
    let sql = `
      SELECT kb.*, u.username AS created_by_name
      FROM knowledge_base_entries kb
      LEFT JOIN users u ON u.id = kb.created_by
      WHERE ${scope.clause}`;
    const params = [...scope.params];
    let n = params.length + 1;

    if (search) {
      sql += ` AND (kb.title ILIKE $${n} OR kb.problem ILIKE $${n} OR kb.note_history::text ILIKE $${n})`;
      params.push(`%${search}%`);
      n++;
    }
    if (device_type) {
      sql += ` AND kb.device_type = $${n}`;
      params.push(device_type);
      n++;
    }
    if (category) {
      sql += ` AND kb.category = $${n}`;
      params.push(category);
      n++;
    }
    if (tag) {
      sql += ` AND kb.tags @> $${n}::jsonb`;
      params.push(JSON.stringify([tag]));
      n++;
    }

    sql += ` ORDER BY kb.created_at DESC`;
    const result = await query(sql, params);
    let solutions = result.rows.map(mapKbRow);
    if (tag && !params.length) {
      solutions = solutions.filter(s => (s.tags || []).includes(tag));
    }
    res.json({ solutions, total: solutions.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const scope = knowledgeBaseScope(req, 'kb', 2);
    const result = await query(
      `SELECT kb.*, u.username AS created_by_name
       FROM knowledge_base_entries kb
       LEFT JOIN users u ON u.id = kb.created_by
       WHERE kb.id = $1 AND ${scope.clause}`,
      [req.params.id, ...scope.params]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(mapKbRow(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticate, requireMinRole('junior_engineer'), solutionUpload.array('files', 20), async (req, res) => {
  try {
    const { title, device_type, problem, notes, company, tags } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });

    let parsedTags = [];
    try { parsedTags = JSON.parse(tags || '[]'); } catch { parsedTags = []; }

    const files = [];
    for (const file of (req.files || [])) {
      const buf = fs.readFileSync(file.path);
      const b64 = `data:${file.mimetype};base64,${buf.toString('base64')}`;
      try { fs.unlinkSync(file.path); } catch {}
      files.push({
        id: `sf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
        data: b64,
        uploadedAt: new Date().toISOString(),
      });
    }

    const noteEntry = notes ? [{
      id: `nh_${Date.now()}`,
      text: notes,
      createdAt: new Date().toISOString(),
      createdBy: req.user.id,
      createdByName: req.user.username,
    }] : [];

    const result = await query(
      `INSERT INTO knowledge_base_entries (
        tenant_id, title, device_type, category, problem, tags, note_history, case_refs, files, source, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'manual',$10)
      RETURNING *`,
      [
        tenantAdminId(req.user),
        title,
        device_type || 'Other',
        company || device_type || 'General',
        problem || '',
        JSON.stringify(parsedTags),
        JSON.stringify(noteEntry),
        JSON.stringify([]),
        JSON.stringify(files),
        req.user.id,
      ]
    );

    const row = result.rows[0];
    row.created_by_name = req.user.username;
    res.status(201).json({ solution: mapKbRow(row) });
  } catch (err) {
    if (req.files) req.files.forEach(f => { try { fs.unlinkSync(f.path); } catch {} });
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authenticate, requireMinRole('junior_engineer'), solutionUpload.array('files', 20), async (req, res) => {
  try {
    const scope = knowledgeBaseScope(req, 'knowledge_base_entries', 2);
    const existing = await query(
      `SELECT * FROM knowledge_base_entries WHERE id = $1 AND ${scope.clause}`,
      [req.params.id, ...scope.params]
    );
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });

    const row = existing.rows[0];
    const { title, device_type, problem, notes, company, tags } = req.body;

    let parsedTags = row.tags;
    if (tags !== undefined) {
      try { parsedTags = JSON.parse(tags || '[]'); } catch { parsedTags = []; }
    }

    let noteHistory = row.note_history || [];
    if (notes !== undefined && String(notes).trim()) {
      noteHistory = [{
        id: `nh_${Date.now()}`,
        text: notes,
        createdAt: new Date().toISOString(),
        createdBy: req.user.id,
        createdByName: req.user.username,
      }, ...noteHistory.filter(n => n.id !== 'edit-preview')];
    }

    let files = row.files || [];
    for (const file of (req.files || [])) {
      const buf = fs.readFileSync(file.path);
      const b64 = `data:${file.mimetype};base64,${buf.toString('base64')}`;
      try { fs.unlinkSync(file.path); } catch {}
      files.push({
        id: `sf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
        data: b64,
        uploadedAt: new Date().toISOString(),
      });
    }

    const result = await query(
      `UPDATE knowledge_base_entries SET
        title = COALESCE($2, title),
        device_type = COALESCE($3, device_type),
        category = COALESCE($4, category),
        problem = COALESCE($5, problem),
        tags = COALESCE($6, tags),
        note_history = $7,
        files = $8,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
      [
        req.params.id,
        title || null,
        device_type || null,
        company || null,
        problem !== undefined ? problem : null,
        parsedTags ? JSON.stringify(parsedTags) : null,
        JSON.stringify(noteHistory),
        JSON.stringify(files),
      ]
    );

    const updated = result.rows[0];
    const userRow = await query('SELECT username FROM users WHERE id = $1', [updated.created_by]);
    updated.created_by_name = userRow.rows[0]?.username;
    res.json({ solution: mapKbRow(updated) });
  } catch (err) {
    if (req.files) req.files.forEach(f => { try { fs.unlinkSync(f.path); } catch {} });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authenticate, requireMinRole('admin'), async (req, res) => {
  try {
    const scope = knowledgeBaseScope(req, 'knowledge_base_entries', 2);
    const result = await query(
      `DELETE FROM knowledge_base_entries WHERE id = $1 AND ${scope.clause} RETURNING id`,
      [req.params.id, ...scope.params]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

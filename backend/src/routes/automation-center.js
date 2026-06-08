const express = require('express');
const { query } = require('../config/database');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const automation = require('../services/automationService');

const router = express.Router();

router.use(authenticate, requireSuperAdmin);

// Triggers CRUD
router.get('/triggers', async (req, res) => {
  try { res.json(await automation.listTriggers()); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/triggers', auditLog('create_trigger','automation'), async (req, res) => {
  try {
    const t = await automation.createTrigger({ ...req.body, created_by: req.user.id });
    res.status(201).json(t);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/triggers/:id', async (req, res) => { try { res.json(await automation.getTrigger(req.params.id)); } catch (e) { res.status(500).json({ error: e.message }); } });
router.put('/triggers/:id', auditLog('update_trigger','automation'), async (req, res) => { try { res.json(await automation.updateTrigger(req.params.id, req.body)); } catch (e) { res.status(500).json({ error: e.message }); } });
router.delete('/triggers/:id', auditLog('delete_trigger','automation'), async (req, res) => { try { await automation.deleteTrigger(req.params.id); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

// Templates CRUD
router.get('/templates', async (req, res) => { try { res.json(await automation.listTemplates()); } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/templates/:id', async (req, res) => { try { res.json(await automation.getTemplate(req.params.id)); } catch (e) { res.status(500).json({ error: e.message }); } });
router.post('/templates', auditLog('create_template','automation'), async (req, res) => { try { const t = await automation.createTemplate({ ...req.body, created_by: req.user.id }); res.status(201).json(t); } catch (e) { res.status(500).json({ error: e.message }); } });
router.put('/templates/:id', auditLog('update_template','automation'), async (req, res) => { try { res.json(await automation.updateTemplate(req.params.id, req.body)); } catch (e) { res.status(500).json({ error: e.message }); } });
router.delete('/templates/:id', auditLog('delete_template','automation'), async (req, res) => { try { await automation.deleteTemplate(req.params.id); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

// Trigger logs - simple listing with search
router.get('/logs', async (req, res) => {
  try {
    const { q, event, status, limit = 100 } = req.query;
    const filters = [];
    const params = [];
    let idx = 1;
    if (event) { filters.push(`event = $${idx++}`); params.push(event); }
    if (status) { filters.push(`status = $${idx++}`); params.push(status); }
    if (q) { filters.push(`(trigger_name ILIKE $${idx} OR recipient_email ILIKE $${idx})`); params.push(`%${q}%`); idx++; }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const r = await query(`SELECT * FROM trigger_logs ${where} ORDER BY created_at DESC LIMIT $${idx}`, [...params, Number(limit)]);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

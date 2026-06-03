const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate, requireMinRole } = require('../middleware/auth');

function buildFilters(req) {
  const user = req.user;
  const filters = [];
  const params = [];

  if (user.role !== 'super_admin') {
    params.push(user.tenant_id);
    params.push(user.id);
    filters.push(`(a.tenant_id = $${params.length - 1} OR a.user_id = $${params.length})`);
  }

  const q = (req.query.q || '').trim();
  if (req.query.module) { params.push(req.query.module); filters.push(`a.module = $${params.length}`); }
  if (req.query.action) { params.push(req.query.action); filters.push(`a.action = $${params.length}`); }
  if (q) {
    params.push('%' + q + '%');
    filters.push(`(a.description ILIKE $${params.length} OR a.action ILIKE $${params.length} OR a.title ILIKE $${params.length} OR a.resource_type ILIKE $${params.length})`);
  }
  if (req.query.start) { params.push(req.query.start); filters.push(`a.created_at >= $${params.length}`); }
  if (req.query.end) { params.push(req.query.end); filters.push(`a.created_at <= $${params.length}`); }

  return { filters, params };
}

const SELECT_COLS = `a.id, a.tenant_id, a.user_id, COALESCE(u.full_name, u.username, u.email) AS user_name,
                     a.action, a.module, a.resource_type, a.resource_id, a.title, a.description, a.metadata, a.ip_address, a.user_agent, a.request_id, a.created_at`;

// GET /api/activity-logs — paginated, filtered
router.get('/', authenticate, async (req, res) => {
  try {
    const { filters, params } = buildFilters(req);
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const limit = Math.min(200, Math.max(10, parseInt(req.query.limit || '50')));
    const offset = (page - 1) * limit;
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const countRes = await query(`SELECT COUNT(1) AS total FROM activity_logs a ${where}`, params);
    const total = parseInt(countRes.rows[0].total || 0);

    const rows = await query(
      `SELECT ${SELECT_COLS} FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id ${where} ORDER BY a.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    res.json({ logs: rows.rows, page, limit, total });
  } catch (err) {
    console.error('Failed to fetch activity logs', err.message);
    res.status(500).json({ error: 'Failed to fetch activity logs' });
  }
});

// GET /api/activity-logs/export — all matching rows (no pagination)
router.get('/export', authenticate, async (req, res) => {
  try {
    const { filters, params } = buildFilters(req);
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const rows = await query(
      `SELECT ${SELECT_COLS} FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id ${where} ORDER BY a.created_at DESC`,
      params
    );

    res.json({ logs: rows.rows, total: rows.rows.length });
  } catch (err) {
    console.error('Failed to export activity logs', err.message);
    res.status(500).json({ error: 'Failed to export activity logs' });
  }
});

module.exports = router;

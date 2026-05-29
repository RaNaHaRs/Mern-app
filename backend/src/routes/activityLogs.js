const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');

// GET /api/activity-logs
// Query params: q, module, action, userId, tenantId, limit, page, start, end
router.get('/', authenticate, async (req, res) => {
  try {
    const user = req.user;
    const q = (req.query.q || '').trim();
    const moduleFilter = req.query.module || null;
    const actionFilter = req.query.action || null;
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const limit = Math.min(200, Math.max(10, parseInt(req.query.limit || '50')));
    const offset = (page - 1) * limit;

    const filters = [];
    const params = [];

    // Tenant-safety: super_admin may view all; others only their tenant or own actions
    if (user.role !== 'super_admin') {
      params.push(user.tenant_id);
      params.push(user.id);
      filters.push(`(tenant_id = $${params.length - 1} OR user_id = $${params.length})`);
    }

    if (moduleFilter) { params.push(moduleFilter); filters.push(`module = $${params.length}`); }
    if (actionFilter) { params.push(actionFilter); filters.push(`action = $${params.length}`); }
    if (q) {
      params.push('%' + q + '%');
      filters.push(`(description ILIKE $${params.length} OR action ILIKE $${params.length} OR title ILIKE $${params.length} OR resource_type ILIKE $${params.length})`);
    }
    if (req.query.start) { params.push(req.query.start); filters.push(`created_at >= $${params.length}`); }
    if (req.query.end) { params.push(req.query.end); filters.push(`created_at <= $${params.length}`); }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    // Count total
    const countSql = `SELECT COUNT(1) AS total FROM activity_logs ${where}`;
    const countRes = await query(countSql, params);
    const total = parseInt(countRes.rows[0].total || 0);

    // Fetch rows ordered latest-first
    const sql = `SELECT a.id, a.tenant_id, a.user_id, COALESCE(u.full_name, u.username, u.email) AS user_name,
                        a.action, a.module, a.resource_type, a.resource_id, a.title, a.description, a.metadata, a.ip_address, a.user_agent, a.request_id, a.created_at
                 FROM activity_logs a
                 LEFT JOIN users u ON u.id = a.user_id
                 ${where}
                 ORDER BY a.created_at DESC
                 LIMIT ${limit} OFFSET ${offset}`;

    const rows = await query(sql, params);

    res.json({ logs: rows.rows, page, limit, total });
  } catch (err) {
    console.error('Failed to fetch activity logs', err.message);
    res.status(500).json({ error: 'Failed to fetch activity logs' });
  }
});

module.exports = router;

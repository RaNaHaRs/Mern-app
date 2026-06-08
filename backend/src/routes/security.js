const express = require('express');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

router.get('/audit', authenticate, async (req, res) => {
  try {
    const params = [];
    const filters = [];

    if (req.user.role !== 'super_admin') {
      params.push(req.user.tenant_id);
      params.push(req.user.id);
      filters.push(`(a.tenant_id = $${params.length - 1} OR a.user_id = $${params.length})`);
    }

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(200, Math.max(10, parseInt(req.query.limit || '50', 10)));
    const offset = (page - 1) * limit;
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const countRes = await query(`SELECT COUNT(1) AS total FROM activity_logs a ${where}`, params);
    const total = parseInt(countRes.rows[0]?.total || 0, 10);

    const rows = await query(
      `SELECT a.id, a.action, a.module, COALESCE(u.full_name, u.username, u.email) AS username,
              a.ip_address, a.user_agent, a.created_at
       FROM activity_logs a
       LEFT JOIN users u ON u.id = a.user_id
       ${where ? where + ' AND ' : 'WHERE '}(a.action LIKE 'login_%' OR a.action LIKE 'logout_%')
       ORDER BY a.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const logs = rows.rows.map(row => ({
      event: row.action,
      username: row.username,
      ip: row.ip_address,
      user_agent: row.user_agent,
      at: row.created_at,
      module: row.module,
    }));

    res.json({ logs, page, limit, total });
  } catch (err) {
    console.error('Failed to fetch security audit logs', err.message);
    res.status(500).json({ error: 'Failed to fetch security audit logs' });
  }
});

module.exports = router;

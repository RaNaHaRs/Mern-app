const express = require('express');
const { query, transaction } = require('../config/database');
const { authenticate, requireMinRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const { isSuperAdmin, tenantCaseCondition, tenantAdminId } = require('../utils/tenantAccess');

const router = express.Router();
router.use(authenticate);

// GET /api/recycle-bin
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 200, search } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const conditions = ['cr.deleted_at IS NOT NULL'];
    const params = [];
    let pi = 1;

    if (!isSuperAdmin(req.user)) {
      const tenantCondition = tenantCaseCondition(req.user, 'c', pi);
      conditions.push(tenantCondition.clause);
      params.push(...tenantCondition.params);
      pi += tenantCondition.params.length;
    }

    if (search) {
      conditions.push(`(
        cr.case_number ILIKE $${pi} OR
        cr.client_name ILIKE $${pi} OR
        c.device_brand ILIKE $${pi} OR
        c.device_model ILIKE $${pi}
      )`);
      params.push(`%${search}%`);
      pi++;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const countResult = await query(`SELECT COUNT(*) FROM cases_recycle_bin cr LEFT JOIN cases c ON c.id = cr.case_id ${where}`, params);
    const result = await query(
      `SELECT cr.id, cr.case_id, cr.case_number, cr.client_id, cr.client_name,
              cr.deleted_by, cr.deleted_at, cr.deletion_reason, cr.can_restore,
              c.device_type, c.device_brand AS brand, c.device_model AS model,
              c.stage AS status, c.serial_number,
              u.full_name AS deleted_by_name
       FROM cases_recycle_bin cr
       LEFT JOIN cases c ON c.id = cr.case_id
       LEFT JOIN users u ON u.id = cr.deleted_by
       ${where}
       ORDER BY cr.deleted_at DESC
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, parseInt(limit, 10), offset]
    );

    const total = parseInt(countResult.rows[0].count, 10);
    res.json({
      items: result.rows,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        pages: Math.ceil(total / parseInt(limit, 10)),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/recycle-bin/:id/restore
router.post('/:id/restore', requireMinRole('staff'), auditLog('restore_case', 'case'), async (req, res) => {
  try {
    const restored = await transaction(async client => {
      const rowResult = await client.query(
        `SELECT case_id FROM cases_recycle_bin WHERE id = $1`,
        [req.params.id]
      );
      if (!rowResult.rows.length) return null;

      const caseId = rowResult.rows[0].case_id;
      if (!isSuperAdmin(req.user)) {
        const tenantCondition = tenantCaseCondition(req.user, 'c', 2);
        const accessResult = await client.query(
          `SELECT c.id FROM cases c WHERE c.id = $1 AND ${tenantCondition.clause}`,
          [caseId, tenantAdminId(req.user)]
        );
        if (!accessResult.rows.length) return null;
      }

      const updateResult = await client.query(
        `UPDATE cases SET deleted_at = NULL, is_recycle = false, updated_at = NOW()
         WHERE id = $1 AND deleted_at IS NOT NULL
         RETURNING *`,
        [caseId]
      );
      if (!updateResult.rows.length) return null;

      await client.query('DELETE FROM cases_recycle_bin WHERE id = $1', [req.params.id]);
      return updateResult.rows[0];
    });

    if (!restored) {
      return res.status(404).json({ error: 'Case not found in recycle bin' });
    }

    res.json({ message: 'Case restored successfully', case: restored });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/recycle-bin/:id/permanent-delete
router.delete('/:id/permanent-delete', requireMinRole('admin'), auditLog('permanent_delete_case', 'case'), async (req, res) => {
  try {
    const deleted = await transaction(async client => {
      const rowResult = await client.query(
        `SELECT case_id FROM cases_recycle_bin WHERE id = $1`,
        [req.params.id]
      );
      if (!rowResult.rows.length) return null;

      const caseId = rowResult.rows[0].case_id;
      if (!isSuperAdmin(req.user)) {
        const tenantCondition = tenantCaseCondition(req.user, 'c', 2);
        const accessResult = await client.query(
          `SELECT c.id FROM cases c WHERE c.id = $1 AND ${tenantCondition.clause}`,
          [caseId, tenantAdminId(req.user)]
        );
        if (!accessResult.rows.length) return null;
      }

      const deleteResult = await client.query(
        `DELETE FROM cases WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id`,
        [caseId]
      );
      return deleteResult.rows[0] || null;
    });

    if (!deleted) {
      return res.status(404).json({ error: 'Case not found in recycle bin' });
    }

    res.json({ message: 'Case permanently deleted', deleted_id: deleted.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

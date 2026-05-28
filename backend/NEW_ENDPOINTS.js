/**
 * NEW ENDPOINTS TO ADD TO backend/src/routes/cases.js
 * These endpoints handle soft-delete, recycle bin, and pending amount collection
 */

// ─── GET /api/cases/recycle-bin ──────────────────────────────────
// List all deleted cases in the recycle bin
router.get('/recycle-bin', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, client_id } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = ['c.deleted_at IS NOT NULL'];
    const params = [];
    let pi = 1;

    if (client_id) {
      conditions.push(`c.client_id = $${pi++}`);
      params.push(client_id);
    }

    if (search) {
      conditions.push(`(c.case_number ILIKE $${pi} OR cl.first_name ILIKE $${pi} OR cl.last_name ILIKE $${pi})`);
      params.push(`%${search}%`);
      pi++;
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const countResult = await query(
      `SELECT COUNT(*) FROM cases c LEFT JOIN clients cl ON c.client_id = cl.id ${where}`,
      params
    );

    const result = await query(
      `SELECT c.id, c.case_number, c.stage, c.priority, c.failure_type,
              c.device_brand, c.device_model, c.deleted_at,
              c.created_at, c.updated_at,
              cl.id as client_id, cl.first_name, cl.last_name, cl.phone, cl.company,
              u.full_name as deleted_by_name
       FROM cases c
       LEFT JOIN clients cl ON c.client_id = cl.id
       LEFT JOIN users u ON u.id = (SELECT created_by FROM cases_recycle_bin WHERE case_id = c.id LIMIT 1)
       ${where}
       ORDER BY c.deleted_at DESC
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

// ─── POST /api/cases/:id/delete (Soft-delete) ────────────────────
// Move a case to recycle bin (soft delete)
router.post('/:id/delete', requireMinRole('staff'), auditLog('soft_delete_case', 'case'), async (req, res) => {
  try {
    const caseId = req.params.id;
    const { reason } = req.body;

    // Get case info for recycle bin record
    const caseRes = await query(
      `SELECT id, case_number, client_id, cl.first_name, cl.last_name
       FROM cases c
       LEFT JOIN clients cl ON c.client_id = cl.id
       WHERE c.id = $1 AND deleted_at IS NULL`,
      [caseId]
    );

    if (!caseRes.rows.length) {
      return res.status(404).json({ error: 'Case not found or already deleted' });
    }

    const caseData = caseRes.rows[0];
    const clientName = `${caseData.first_name || ''} ${caseData.last_name || ''}`.trim() || null;

    // Use transaction to update case and add to recycle bin record
    const { transaction } = require('../config/database');
    const result = await transaction(async client => {
      // Soft delete the case
      const updatedCase = await client.query(
        `UPDATE cases SET deleted_at = NOW(), is_recycle = true, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [caseId]
      );

      // Record in recycle bin
      const recycleRecord = await client.query(
        `INSERT INTO cases_recycle_bin (case_id, case_number, client_id, client_name, deleted_by, deletion_reason)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [caseId, caseData.case_number, caseData.client_id, clientName, req.user.id, reason || null]
      );

      return { case: updatedCase.rows[0], recycleRecord: recycleRecord.rows[0] };
    });

    res.json({
      message: 'Case moved to recycle bin',
      case: result.case,
      recycleRecord: result.recycleRecord
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/cases/:id/restore (Restore from Recycle Bin) ──────
// Restore a case from recycle bin
router.post('/:id/restore', requireMinRole('staff'), auditLog('restore_case', 'case'), async (req, res) => {
  try {
    const caseId = req.params.id;

    const caseRes = await query(
      `SELECT id, case_number FROM cases WHERE id = $1 AND deleted_at IS NOT NULL`,
      [caseId]
    );

    if (!caseRes.rows.length) {
      return res.status(404).json({ error: 'Case not found in recycle bin' });
    }

    // Restore the case
    const result = await query(
      `UPDATE cases SET deleted_at = NULL, is_recycle = false, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [caseId]
    );

    // Update recycle bin record to mark as restored
    await query(
      `UPDATE cases_recycle_bin SET can_restore = false WHERE case_id = $1`,
      [caseId]
    );

    res.json({
      message: 'Case restored from recycle bin',
      case: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/cases/:id/permanent-delete (Permanent Delete) ────
// Permanently delete a case (only from recycle bin)
router.delete('/:id/permanent-delete', requireMinRole('admin'), auditLog('permanent_delete_case', 'case'), async (req, res) => {
  try {
    const caseId = req.params.id;

    const caseRes = await query(
      `SELECT id FROM cases WHERE id = $1 AND deleted_at IS NOT NULL`,
      [caseId]
    );

    if (!caseRes.rows.length) {
      return res.status(404).json({ error: 'Case not found in recycle bin' });
    }

    // Use transaction for cascading delete
    const { transaction } = require('../config/database');
    await transaction(async client => {
      // Delete related records first
      await client.query('DELETE FROM case_workflow_logs WHERE case_id = $1', [caseId]);
      await client.query('DELETE FROM case_engineer_sessions WHERE case_id = $1', [caseId]);
      await client.query('DELETE FROM case_files WHERE case_id = $1', [caseId]);
      await client.query('DELETE FROM case_images WHERE case_id = $1', [caseId]);
      await client.query('DELETE FROM case_solutions WHERE case_id = $1', [caseId]);
      await client.query('DELETE FROM case_solution_media WHERE case_id = $1', [caseId]);
      await client.query('DELETE FROM case_solution_notes WHERE case_id = $1', [caseId]);
      await client.query('DELETE FROM case_custom_field_values WHERE case_id = $1', [caseId]);
      await client.query('DELETE FROM quotations WHERE case_id = $1', [caseId]);
      await client.query('DELETE FROM payments WHERE case_id = $1', [caseId]);
      await client.query('DELETE FROM transferred_items WHERE case_id = $1', [caseId]);
      await client.query('DELETE FROM inventory_transactions WHERE case_id = $1', [caseId]);
      await client.query('DELETE FROM cases_recycle_bin WHERE case_id = $1', [caseId]);

      // Finally delete the case itself
      await client.query('DELETE FROM cases WHERE id = $1', [caseId]);
    });

    res.json({ message: 'Case permanently deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── UPDATE /api/cases (GET route) ───────────────────────────────
// Update the main GET /api/cases route to filter out soft-deleted cases:
// Add to WHERE conditions: 'c.deleted_at IS NULL'
// Also include pending_amount in SELECT

// ─── UPDATE /api/cases/:id (GET route) ────────────────────────────
// Update the GET /api/cases/:id route to include:
// - pending_amount in SELECT
// - Quotation info to show balance

// ─── UPDATE Accounting Summary ───────────────────────────────────
// Update /api/accounting/summary to include pending amounts from cases

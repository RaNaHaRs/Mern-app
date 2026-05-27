const express = require('express');
const { query } = require('../config/database');
const { authenticate, requireMinRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const { isSuperAdmin, verifyCaseAccess, verifyInventoryAccess, tenantAdminId } = require('../utils/tenantAccess');

const router = express.Router();
router.use(authenticate);

// GET /api/transferred-items
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 40, search, case_id } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const conditions = [];
    const params = [];
    let pi = 1;

    if (case_id) {
      conditions.push(`ti.case_id = $${pi++}`);
      params.push(case_id);
    }
    if (!isSuperAdmin(req.user)) {
      conditions.push(`ti.tenant_id = $${pi++}`);
      params.push(tenantAdminId(req.user));
    }
    if (search) {
      conditions.push(`(
        ti.stock_number ILIKE $${pi} OR ti.serial_number ILIKE $${pi}
        OR ti.model ILIKE $${pi} OR ti.company ILIKE $${pi}
        OR c.case_number ILIKE $${pi}
      )`);
      params.push(`%${search}%`);
      pi++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const count = await query(
      `SELECT COUNT(*) FROM transferred_items ti
       LEFT JOIN cases c ON c.id = ti.case_id
       ${where}`,
      params
    );

    const result = await query(
      `SELECT ti.*,
              c.case_number,
              c.device_brand AS case_device_brand,
              c.device_model AS case_device_model,
              cl.first_name || ' ' || cl.last_name AS client_name,
              u.full_name AS transferred_by_name,
              ii.sku, ii.quantity AS inventory_quantity
       FROM transferred_items ti
       LEFT JOIN cases c ON c.id = ti.case_id
       LEFT JOIN clients cl ON cl.id = c.client_id
       LEFT JOIN users u ON u.id = ti.transferred_by
       LEFT JOIN inventory_items ii ON ii.id = ti.inventory_item_id
       ${where}
       ORDER BY ti.created_at DESC
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, parseInt(limit, 10), offset]
    );

    res.json({
      items: result.rows,
      pagination: {
        total: parseInt(count.rows[0].count, 10),
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        pages: Math.ceil(parseInt(count.rows[0].count, 10) / parseInt(limit, 10)),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/transferred-items/:id
router.get('/:id', async (req, res) => {
  try {
    let sql = `SELECT ti.*,
              c.case_number, c.device_brand, c.device_model, c.serial_number AS case_serial,
              cl.first_name || ' ' || cl.last_name AS client_name,
              u.full_name AS transferred_by_name
       FROM transferred_items ti
       LEFT JOIN cases c ON c.id = ti.case_id
       LEFT JOIN clients cl ON cl.id = c.client_id
       LEFT JOIN users u ON u.id = ti.transferred_by
       WHERE ti.id = $1`;
    const params = [req.params.id];
    if (!isSuperAdmin(req.user)) {
      sql += ` AND ti.tenant_id = $2`;
      params.push(tenantAdminId(req.user));
    }
    const result = await query(sql, params);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ item: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/transferred-items (manual log)
router.post('/', requireMinRole('junior_engineer'), auditLog('create_transferred_item', 'transferred_items'), async (req, res) => {
  try {
    const {
      case_id, inventory_item_id, stock_number, ui_category,
      company, brand, model, serial_number, field_snapshot, custom_field_snapshot, notes,
    } = req.body;

    if (!isSuperAdmin(req.user) && case_id && !(await verifyCaseAccess(case_id, req.user))) {
      return res.status(404).json({ error: 'Case not found' });
    }
    if (!isSuperAdmin(req.user) && inventory_item_id && !(await verifyInventoryAccess(inventory_item_id, req.user))) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    const result = await query(
      `INSERT INTO transferred_items (
        case_id, inventory_item_id, stock_number, ui_category,
        company, brand, model, serial_number,
        field_snapshot, custom_field_snapshot, transferred_by, notes, tenant_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *`,
      [
        case_id || null, inventory_item_id || null, stock_number || null, ui_category || null,
        company || null, brand || null, model || null, serial_number || null,
        JSON.stringify(field_snapshot || {}), JSON.stringify(custom_field_snapshot || {}),
        req.user.id, notes || null, tenantAdminId(req.user),
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/transferred-items/:id/revoke
router.post('/:id/revoke', requireMinRole('junior_engineer'), auditLog('revoke_transferred_item', 'transferred_items'), async (req, res) => {
  try {
    const transferResult = await query(
      `SELECT ti.*, c.client_id FROM transferred_items ti
       LEFT JOIN cases c ON c.id = ti.case_id
       WHERE ti.id=$1${!isSuperAdmin(req.user) ? ' AND ti.tenant_id = $2' : ''}`,
      !isSuperAdmin(req.user) ? [req.params.id, tenantAdminId(req.user)] : [req.params.id]
    );
    if (!transferResult.rows.length) return res.status(404).json({ error: 'Not found' });

    const transfer = transferResult.rows[0];
    if (transfer.inventory_item_id && !isSuperAdmin(req.user) && !(await verifyInventoryAccess(transfer.inventory_item_id, req.user))) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (transfer.inventory_item_id) {
      await query(
        `UPDATE inventory_items SET status='available', is_available=true, updated_at=NOW()
         WHERE id=$1 AND deleted_at IS NULL${!isSuperAdmin(req.user) ? ' AND tenant_id = $2' : ''}`,
        !isSuperAdmin(req.user) ? [transfer.inventory_item_id, tenantAdminId(req.user)] : [transfer.inventory_item_id]
      );
    }

    await query(
      `DELETE FROM transferred_items WHERE id=$1${!isSuperAdmin(req.user) ? ' AND tenant_id = $2' : ''}`,
      !isSuperAdmin(req.user) ? [req.params.id, tenantAdminId(req.user)] : [req.params.id]
    );

    if (transfer.inventory_item_id) {
      const itemResult = await query('SELECT * FROM inventory_items WHERE id=$1 AND deleted_at IS NULL', [transfer.inventory_item_id]);
      if (itemResult.rows.length) {
        res.json({ message: 'Revoked', item: itemResult.rows[0], inventory_item_id: transfer.inventory_item_id });
        return;
      }
    }

    res.json({ message: 'Revoked' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/transferred-items/:id
router.delete('/:id', requireMinRole('admin'), auditLog('delete_transferred_item', 'transferred_items'), async (req, res) => {
  try {
    const result = await query(
      `DELETE FROM transferred_items WHERE id=$1${!isSuperAdmin(req.user) ? ' AND tenant_id = $2' : ''} RETURNING id`,
      !isSuperAdmin(req.user) ? [req.params.id, tenantAdminId(req.user)] : [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

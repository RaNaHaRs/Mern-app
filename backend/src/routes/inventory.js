const express = require('express');
const { query, transaction } = require('../config/database');
const { authenticate, requireMinRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const {
  toDbCategory, formatItemRow, isInventoryHddCategory, normalizeUiCategory, validatePcbPayload,
} = require('../utils/hddCategoryMap');

const router = express.Router();
router.use(authenticate);

async function saveInventoryCustomFields(itemId, customFieldValues = {}) {
  if (!customFieldValues || typeof customFieldValues !== 'object') return;
  for (const [fieldId, value] of Object.entries(customFieldValues)) {
    if (!fieldId || value === undefined || value === null) continue;
    await query(
      `INSERT INTO inventory_custom_field_values (inventory_item_id, custom_field_id, field_value)
       VALUES ($1, $2, $3)
       ON CONFLICT (inventory_item_id, custom_field_id)
       DO UPDATE SET field_value = $3, updated_at = NOW()`,
      [itemId, fieldId, String(value)]
    );
  }
}

async function ensureInventoryNotesSchema() {
  await query(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS health VARCHAR(100)`);
  await query(`
    CREATE TABLE IF NOT EXISTS inventory_item_notes (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
      note_text TEXT NOT NULL,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_inventory_item_notes_item ON inventory_item_notes(inventory_item_id)`);
}

async function loadItemNotes(itemId) {
  await ensureInventoryNotesSchema();
  const legacy = await query('SELECT notes, updated_at, created_at FROM inventory_items WHERE id=$1', [itemId]);
  const legacyNote = legacy.rows[0]?.notes?.trim();
  if (legacyNote) {
    const existing = await query(
      'SELECT id FROM inventory_item_notes WHERE inventory_item_id=$1 LIMIT 1',
      [itemId]
    );
    if (!existing.rows.length) {
      await query(
        `INSERT INTO inventory_item_notes (inventory_item_id, note_text, created_at)
         VALUES ($1, $2, COALESCE($3, NOW()))`,
        [itemId, legacyNote, legacy.rows[0].updated_at || legacy.rows[0].created_at]
      );
    }
  }
  const result = await query(
    `SELECT n.id, n.note_text, n.created_at, n.created_by,
            u.full_name AS created_by_name, u.username AS created_by_username
     FROM inventory_item_notes n
     LEFT JOIN users u ON u.id = n.created_by
     WHERE n.inventory_item_id = $1
     ORDER BY n.created_at DESC`,
    [itemId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    text: row.note_text,
    created_at: row.created_at,
    created_by: row.created_by,
    created_by_name: row.created_by_name || row.created_by_username || null,
  }));
}

async function loadCustomFieldValues(itemId) {
  const r = await query(
    `SELECT icfv.custom_field_id, icfv.field_value, cf.field_label, cf.field_key
     FROM inventory_custom_field_values icfv
     JOIN custom_fields cf ON cf.id = icfv.custom_field_id
     WHERE icfv.inventory_item_id = $1`,
    [itemId]
  );
  const values = {};
  const labeled = [];
  r.rows.forEach(row => {
    values[row.custom_field_id] = row.field_value;
    labeled.push({ id: row.custom_field_id, key: row.field_key, label: row.field_label, value: row.field_value });
  });
  return { values, labeled };
}

async function recordTransfer(req, item, body) {
  if (!body.source_case_id) return;
  try {
    await query(
      `INSERT INTO transferred_items (
        case_id, inventory_item_id, stock_number, ui_category,
        company, brand, model, serial_number,
        field_snapshot, custom_field_snapshot, transferred_by, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        body.source_case_id, item.id, item.stock_number || item.sku,
        item.ui_category || body.category,
        item.company, item.brand, item.model, item.serial_number,
        JSON.stringify(item.dynamic_fields || body.dynamicFields || {}),
        JSON.stringify(body.customFieldValues || {}),
        req.user.id,
        body.notes || `Transferred from case`,
      ]
    );
  } catch (e) {
    console.log('Transfer log failed (non-blocking):', e.message);
  }
}

function isOtherCatPayload(body) {
  const ui = normalizeUiCategory(body.category || body.ui_category);
  return ui === 'other' || ui === 'others' || ui === 'stock_item';
}

function buildItemPayload(body, categoriesList = []) {
  const uiCategory = normalizeUiCategory(body.category || body.ui_category);
  
  // Find category dynamically in the categoriesList loaded from the database
  const dbCat = Array.isArray(categoriesList)
    ? categoriesList.find(c => c.category_key === uiCategory || c.key === uiCategory)
    : null;
  const isHdd = dbCat ? dbCat.is_hdd : isInventoryHddCategory(uiCategory);
  const mappedCategory = isHdd ? 'donor_drive' : toDbCategory(uiCategory);

  const dynamicFields = { ...(body.dynamicFields || {}) };
  const hddKeys = [
    'serial_number', 'pcb_number', 'head_map', 'capacity', 'interface', 'form_factor',
    'firmware', 'site_code', 'date_code', 'family', 'model', 'manufacture_country',
    'manufacture_date', 'pn_number', 'dcm', 'dcx', 'company_name', 'mlc', 'hdd_code', 'four_code',
  ];
  hddKeys.forEach(k => {
    if (body[k] !== undefined && body[k] !== null && body[k] !== '') {
      dynamicFields[k] = body[k];
    }
  });

  const name = body.name || body.model || body.stock_number || 'Inventory Item';
  const firmware = body.firmware || body.firmware_version || dynamicFields.firmware || null;

  return {
    uiCategory,
    mappedCategory,
    isHdd,
    dynamicFields,
    name,
    firmware,
    serial_number: body.serial_number || dynamicFields.serial_number || null,
    pcb_number: body.pcb_number || dynamicFields.pcb_number || null,
    head_map: body.head_map || dynamicFields.head_map || null,
  };
}

// GET /api/inventory/recycle-bin — soft-deleted items only
router.get('/recycle-bin', async (req, res) => {
  try {
    const { page = 1, limit = 40, search } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const conditions = ['ii.deleted_at IS NOT NULL'];
    const params = [];
    let pi = 1;

    if (search) {
      conditions.push(`(
        ii.name ILIKE $${pi} OR ii.sku ILIKE $${pi} OR ii.stock_number ILIKE $${pi}
        OR ii.serial_number ILIKE $${pi} OR ii.pcb_number ILIKE $${pi}
        OR ii.model ILIKE $${pi} OR ii.company ILIKE $${pi} OR ii.brand ILIKE $${pi}
      )`);
      params.push(`%${search}%`);
      pi++;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const count = await query(`SELECT COUNT(*) FROM inventory_items ii ${where}`, params);
    const result = await query(
      `SELECT ii.* FROM inventory_items ii ${where}
       ORDER BY ii.deleted_at DESC LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, parseInt(limit, 10), offset]
    );

    const items = await Promise.all(result.rows.map(async row => {
      const { labeled } = await loadCustomFieldValues(row.id);
      return formatItemRow({ ...row, custom_fields_display: labeled });
    }));

    res.json({
      items,
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

// GET /api/inventory
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 40, category, search, is_available, storage_model_id } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const conditions = ['ii.deleted_at IS NULL'];
    const params = [];
    let pi = 1;

    if (category) {
      const norm = normalizeUiCategory(category);
      if (norm === 'hdd') {
        conditions.push(`(
          ii.ui_category IN ('hdd', 'harddisk', 'wd_35', 'wd_25', 'seagate_35', 'seagate_25', 'others_35', 'others_25')
          OR (ii.ui_category IS NULL AND ii.category::text IN ('donor_drive', 'hdd', 'harddisk'))
        )`);
      } else {
        conditions.push(`(ii.ui_category = $${pi} OR (ii.ui_category IS NULL AND ii.category::text = $${pi}))`);
        params.push(norm);
        pi++;
      }
    }
    if (is_available !== undefined) {
      conditions.push(`COALESCE(ii.status, CASE WHEN ii.is_available THEN 'available' ELSE 'used' END) = $${pi}`);
      params.push(is_available === 'true' ? 'available' : 'used');
      pi++;
    }
    if (storage_model_id) {
      conditions.push(`ii.storage_model_id = $${pi++}`);
      params.push(storage_model_id);
    }
    if (search) {
      conditions.push(`(
        ii.name ILIKE $${pi} OR ii.sku ILIKE $${pi} OR ii.stock_number ILIKE $${pi}
        OR ii.serial_number ILIKE $${pi} OR ii.pcb_number ILIKE $${pi}
        OR ii.model ILIKE $${pi} OR ii.company ILIKE $${pi} OR ii.brand ILIKE $${pi}
        OR ii.description ILIKE $${pi}
      )`);
      params.push(`%${search}%`);
      pi++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const count = await query(`SELECT COUNT(*) FROM inventory_items ii ${where}`, params);
    const result = await query(
      `SELECT ii.* FROM inventory_items ii ${where}
       ORDER BY ii.created_at DESC LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, parseInt(limit, 10), offset]
    );

    const items = await Promise.all(result.rows.map(async row => {
      const { labeled } = await loadCustomFieldValues(row.id);
      return formatItemRow({ ...row, custom_fields_display: labeled });
    }));

    const lowStock = items.filter(i => i.quantity <= (i.min_quantity || 1));

    res.json({
      items,
      lowStockAlerts: lowStock.length,
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

// POST /api/inventory
router.post('/', requireMinRole('junior_engineer'), auditLog('create_inventory', 'inventory'), async (req, res) => {
  try {
    const body = req.body;
    const pcbErr = validatePcbPayload(body);
    if (pcbErr) return res.status(400).json({ error: pcbErr });

    const catsRes = await query('SELECT category_key, is_hdd FROM inventory_categories');
    const built = buildItemPayload(body, catsRes.rows);

    const stockId = String(body.stock_number || body.stock_id || '').trim();
    if (!stockId) {
      return res.status(400).json({ error: 'Stock ID is required' });
    }
    const dup = await query(
      'SELECT id FROM inventory_items WHERE stock_number=$1 OR sku=$1 LIMIT 1',
      [stockId]
    );
    if (dup.rows.length) {
      return res.status(409).json({ error: 'Stock ID already exists' });
    }
    const sku = stockId;
    const stockNumber = stockId;

    const result = await query(
      `INSERT INTO inventory_items (
        sku, stock_number, name, category, ui_category,
        serial_number, pcb_number, head_map, storage_model_id,
        description, quantity, min_quantity, unit_cost, location,
        condition, notes, reserved_for_case, health,
        firmware_version, firmware,
        company, brand, model, site_code, date_code, family,
        capacity, interface, form_factor, status, source_case_id,
        dynamic_fields, custom_field_values, added_by
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
        $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34
      ) RETURNING *`,
      [
        sku, stockNumber, built.name, built.mappedCategory, built.uiCategory,
        built.serial_number, built.pcb_number, built.head_map, body.storage_model_id || null,
        body.description || null,
        parseInt(body.quantity, 10) || 0, parseInt(body.min_quantity, 10) || 1,
        body.unit_cost || null, body.location || null,
        body.condition || 'used', body.notes || null, body.reserved_for_case || null,
        body.health || null,
        built.firmware, built.firmware,
        body.company || null, body.brand || null, body.model || built.name,
        body.site_code || built.dynamicFields.site_code || null,
        body.date_code || built.dynamicFields.date_code || null,
        body.family || built.dynamicFields.family || null,
        body.capacity || built.dynamicFields.capacity || null,
        body.interface || built.dynamicFields.interface || null,
        body.form_factor || built.dynamicFields.form_factor || null,
        body.status || 'available', body.source_case_id || null,
        JSON.stringify(built.dynamicFields),
        JSON.stringify(body.customFieldValues || {}),
        req.user.id,
      ]
    );

    const item = result.rows[0];
    await saveInventoryCustomFields(item.id, body.customFieldValues);

    const initialNote = String(body.initial_note || body.notes || '').trim();
    if (initialNote) {
      await ensureInventoryNotesSchema();
      await query(
        `INSERT INTO inventory_item_notes (inventory_item_id, note_text, created_by)
         VALUES ($1, $2, $3)`,
        [item.id, initialNote, req.user.id]
      );
    }

    if ((parseInt(body.quantity, 10) || 0) > 0) {
      try {
        await query(
          `INSERT INTO inventory_transactions (item_id, type, quantity, notes, performed_by)
           VALUES ($1,'in',$2,'Initial stock',$3)`,
          [item.id, parseInt(body.quantity, 10) || 0, req.user.id]
        );
      } catch (err) {
        console.log('Transaction insert failed (non-blocking):', err.message);
      }
    }

    await recordTransfer(req, item, body);
    const { labeled } = await loadCustomFieldValues(item.id);
    res.status(201).json(formatItemRow({ ...item, custom_fields_display: labeled }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/inventory/:id
router.put('/:id', requireMinRole('junior_engineer'), auditLog('update_inventory', 'inventory'), async (req, res) => {
  try {
    const body = req.body;
    const pcbErr = validatePcbPayload(body);
    if (pcbErr) return res.status(400).json({ error: pcbErr });

    const catsRes = await query('SELECT category_key, is_hdd FROM inventory_categories');
    const built = buildItemPayload(body, catsRes.rows);

    const result = await query(
      `UPDATE inventory_items SET
        name=COALESCE($1,name),
        category=COALESCE($2,category),
        ui_category=COALESCE($3,ui_category),
        stock_number=COALESCE($4,stock_number),
        serial_number=$5, pcb_number=$6, head_map=$7,
        quantity=COALESCE($8,quantity), min_quantity=COALESCE($9,min_quantity),
        unit_cost=$10, location=$11, condition=COALESCE($12,condition),
        notes=$13, storage_model_id=$14, reserved_for_case=$15, health=$16,
        firmware_version=$17, firmware=$18,
        company=$19, brand=$20, model=$21,
        site_code=$22, date_code=$23, family=$24,
        capacity=$25, interface=$26, form_factor=$27,
        status=COALESCE($28,status),
        dynamic_fields=COALESCE($29,dynamic_fields),
        custom_field_values=COALESCE($30,custom_field_values),
        updated_at=NOW()
       WHERE id=$31 RETURNING *`,
      [
        built.name || null, built.mappedCategory || null, built.uiCategory || null,
        body.stock_number || null,
        built.serial_number, built.pcb_number, built.head_map,
        body.quantity != null ? parseInt(body.quantity, 10) : null,
        body.min_quantity != null ? parseInt(body.min_quantity, 10) : null,
        body.unit_cost || null, body.location || null,
        body.condition || null,
        isOtherCatPayload(body) ? (body.notes || null) : null,
        body.storage_model_id || null,
        body.reserved_for_case || null, body.health || null,
        built.firmware, built.firmware,
        body.company || null, body.brand || null, body.model || null,
        body.site_code || null, body.date_code || null, body.family || null,
        body.capacity || null, body.interface || null, body.form_factor || null,
        body.status || null,
        body.dynamicFields ? JSON.stringify(built.dynamicFields) : null,
        body.customFieldValues ? JSON.stringify(body.customFieldValues) : null,
        req.params.id,
      ]
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Item not found' });
    await saveInventoryCustomFields(req.params.id, body.customFieldValues);
    const { labeled } = await loadCustomFieldValues(req.params.id);
    res.json(formatItemRow({ ...result.rows[0], custom_fields_display: labeled }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/inventory/:id/quantity
router.patch('/:id/quantity', requireMinRole('junior_engineer'), auditLog('adjust_inventory', 'inventory'), async (req, res) => {
  try {
    const { type, quantity, case_id, notes } = req.body;
    const item = await query('SELECT * FROM inventory_items WHERE id=$1', [req.params.id]);
    if (!item.rows.length) return res.status(404).json({ error: 'Item not found' });

    let newQty = item.rows[0].quantity;
    if (type === 'in') newQty += parseInt(quantity, 10);
    else if (['out', 'reserved', 'disposed'].includes(type)) newQty -= parseInt(quantity, 10);
    if (newQty < 0) return res.status(400).json({ error: 'Insufficient stock' });

    await query(
      `UPDATE inventory_items SET quantity=$1, is_available=$2,
       status=CASE WHEN $1 > 0 THEN COALESCE(status,'available') ELSE 'used' END,
       updated_at=NOW() WHERE id=$3`,
      [newQty, newQty > 0, req.params.id]
    );

    try {
      await query(
        `INSERT INTO inventory_transactions (item_id, case_id, type, quantity, notes, performed_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [req.params.id, case_id || null, type, parseInt(quantity, 10), notes || null, req.user.id]
      );
    } catch (err) {
      console.log('Transaction insert failed (non-blocking):', err.message);
    }

    res.json({ id: req.params.id, newQuantity: newQty });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/inventory/:id/transfer-to-client
router.patch('/:id/transfer-to-client', requireMinRole('junior_engineer'), auditLog('transfer_inventory_to_client', 'inventory'), async (req, res) => {
  try {
    await query(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS is_transferred_to_client BOOLEAN DEFAULT false`);

    let { is_transferred_to_client } = req.body;
    if (typeof is_transferred_to_client === 'undefined') {
      const current = await query('SELECT is_transferred_to_client FROM inventory_items WHERE id=$1', [req.params.id]);
      if (!current.rows.length) return res.status(404).json({ error: 'Item not found' });
      is_transferred_to_client = !current.rows[0].is_transferred_to_client;
    }

    const result = await query(
      `UPDATE inventory_items SET is_transferred_to_client = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [!!is_transferred_to_client, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Item not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory/import
router.post('/import', requireMinRole('admin'), async (req, res) => {
  try {
    const { data = [], mode = 'append' } = req.body;
    if (!Array.isArray(data) || !data.length) return res.status(400).json({ error: 'No data provided' });

    let imported = 0, skipped = 0;
    const catsRes = await query('SELECT category_key, is_hdd FROM inventory_categories');
    const categoriesList = catsRes.rows;

    for (const row of data) {
      if (!row.serial_number && !row.name && !row.stock_number) { skipped++; continue; }

      const built = buildItemPayload(row, categoriesList);
      const skuResult = await query('SELECT COUNT(*) FROM inventory_items', []);
      const sku = row.sku || `INV-${String(parseInt(skuResult.rows[0].count, 10) + imported + 1).padStart(5, '0')}`;
      const stockNumber = row.stock_number || sku;
      const itemName = row.name || row.model || stockNumber;

      const lookupKey = row.stock_number || row.sku;
      if (mode === 'overwrite' && lookupKey) {
        const existing = await query(
          'SELECT id FROM inventory_items WHERE stock_number=$1 OR sku=$1',
          [lookupKey]
        );
        if (existing.rows.length) {
          try {
            await query(
              `UPDATE inventory_items SET name=$1, category=$2, ui_category=$3,
               serial_number=$4, pcb_number=$5, firmware=$6, firmware_version=$6,
               condition=$7, quantity=$8, unit_cost=$9, location=$10, notes=$11,
               company=$12, brand=$13, model=$14, capacity=$15, dynamic_fields=$16, updated_at=NOW()
               WHERE id=$17`,
              [
                itemName, built.mappedCategory, built.uiCategory,
                built.serial_number, built.pcb_number, built.firmware,
                row.condition || 'used', parseInt(row.quantity, 10) || 0,
                row.unit_cost || null, row.location || null, row.notes || null,
                row.company || null, row.brand || null, row.model || null,
                row.capacity || null, JSON.stringify(built.dynamicFields),
                existing.rows[0].id,
              ]
            );
            imported++;
            continue;
          } catch (err) {
            console.log('Update failed, will try insert:', err.message);
          }
        }
      }

      try {
        await query(
          `INSERT INTO inventory_items (
            sku, stock_number, name, category, ui_category,
            serial_number, pcb_number, firmware, firmware_version,
            condition, quantity, min_quantity, unit_cost, location, notes,
            company, brand, model, capacity, dynamic_fields, added_by
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
          [
            sku, stockNumber, itemName, built.mappedCategory, built.uiCategory,
            built.serial_number, built.pcb_number, built.firmware,
            row.condition || 'used', parseInt(row.quantity, 10) || 0,
            parseInt(row.min_quantity, 10) || 1, row.unit_cost || null,
            row.location || null, row.notes || null,
            row.company || null, row.brand || null, row.model || null,
            row.capacity || null, JSON.stringify(built.dynamicFields), req.user.id,
          ]
        );
        imported++;
      } catch (err) {
        console.log('Insert failed:', err.message);
        skipped++;
      }
    }

    res.json({ imported, skipped, total: data.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory/bulk-delete — soft delete (move to recycle bin)
router.post('/bulk-delete', requireMinRole('junior_engineer'), auditLog('bulk_delete_inventory', 'inventory'), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No items specified' });
    }

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    await query(
      `UPDATE inventory_items SET deleted_at=NOW(), status='deleted', updated_at=NOW()
       WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
      ids
    );

    res.json({ message: `${ids.length} item(s) moved to recycle bin`, deleted_count: ids.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory/bulk-recycle — alias for bulk-delete (backward compatible)
router.post('/bulk-recycle', requireMinRole('junior_engineer'), auditLog('bulk_recycle_inventory', 'inventory'), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No items specified' });
    }

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    await query(
      `UPDATE inventory_items SET deleted_at=NOW(), status='deleted', updated_at=NOW()
       WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
      ids
    );

    res.json({ message: `${ids.length} item(s) moved to recycle bin`, recycled_count: ids.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory/bulk-permanent-delete — permanently remove soft-deleted items
router.post('/bulk-permanent-delete', requireMinRole('admin'), auditLog('bulk_permanent_delete_inventory', 'inventory'), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No items specified' });
    }

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const deletedCount = await transaction(async client => {
      await client.query(`DELETE FROM inventory_transactions WHERE item_id IN (${placeholders})`, ids);
      await client.query(`DELETE FROM inventory_images WHERE item_id IN (${placeholders})`, ids);
      const result = await client.query(
        `DELETE FROM inventory_items WHERE id IN (${placeholders}) AND deleted_at IS NOT NULL RETURNING id`,
        ids
      );
      return result.rows.length;
    });

    res.json({ 
      message: `${deletedCount} item(s) and associated media permanently deleted`, 
      deleted_count: deletedCount 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory/recycle-bin/:id/restore
router.post('/recycle-bin/:id/restore', requireMinRole('junior_engineer'), auditLog('restore_inventory', 'inventory'), async (req, res) => {
  try {
    const result = await query(
      `UPDATE inventory_items SET deleted_at=NULL, status='available', updated_at=NOW()
       WHERE id=$1 AND deleted_at IS NOT NULL RETURNING *`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Item not found in recycle bin' });
    const { labeled } = await loadCustomFieldValues(req.params.id);
    res.json({ message: 'Item restored', item: formatItemRow({ ...result.rows[0], custom_fields_display: labeled }) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/inventory/recycle-bin/:id/permanent-delete
router.delete('/recycle-bin/:id/permanent-delete', requireMinRole('admin'), auditLog('permanent_delete_inventory', 'inventory'), async (req, res) => {
  try {
    const result = await transaction(async client => {
      const itemCheck = await client.query(
        'SELECT id FROM inventory_items WHERE id=$1 AND deleted_at IS NOT NULL',
        [req.params.id]
      );
      if (!itemCheck.rows.length) return null;

      await client.query('DELETE FROM inventory_transactions WHERE item_id=$1', [req.params.id]);
      await client.query('DELETE FROM inventory_images WHERE item_id=$1', [req.params.id]);
      const deleted = await client.query('DELETE FROM inventory_items WHERE id=$1 RETURNING id', [req.params.id]);
      return deleted.rows[0];
    });

    if (!result) return res.status(404).json({ error: 'Item not found in recycle bin' });
    res.json({ message: 'Item and all associated media permanently deleted', deleted_id: result.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventory/donors
router.get('/donors', async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM inventory_items
       WHERE deleted_at IS NULL
         AND COALESCE(status,'available')='available' AND quantity > 0
       ORDER BY created_at DESC`
    );
    res.json(result.rows.map(formatItemRow));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventory/:id/notes — timeline (latest first)
router.get('/:id/notes', async (req, res) => {
  try {
    const item = await query('SELECT id FROM inventory_items WHERE id=$1 AND deleted_at IS NULL', [req.params.id]);
    if (!item.rows.length) return res.status(404).json({ error: 'Item not found' });
    const notes = await loadItemNotes(req.params.id);
    res.json({ notes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory/:id/notes — append note (does not overwrite history)
router.post('/:id/notes', requireMinRole('junior_engineer'), async (req, res) => {
  try {
    const text = String(req.body.text || req.body.note || '').trim();
    if (!text) return res.status(400).json({ error: 'Note text is required' });

    const item = await query('SELECT id FROM inventory_items WHERE id=$1 AND deleted_at IS NULL', [req.params.id]);
    if (!item.rows.length) return res.status(404).json({ error: 'Item not found' });

    await ensureInventoryNotesSchema();
    const inserted = await query(
      `INSERT INTO inventory_item_notes (inventory_item_id, note_text, created_by)
       VALUES ($1, $2, $3)
       RETURNING id, note_text, created_at, created_by`,
      [req.params.id, text, req.user.id]
    );
    const row = inserted.rows[0];
    res.status(201).json({
      note: {
        id: row.id,
        text: row.note_text,
        created_at: row.created_at,
        created_by: row.created_by,
        created_by_name: req.user.full_name || req.user.username || null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventory/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM inventory_items WHERE id=$1 AND deleted_at IS NULL', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Item not found' });
    const { values, labeled } = await loadCustomFieldValues(req.params.id);
    const notesTimeline = await loadItemNotes(req.params.id);
    const row = result.rows[0];
    res.json({
      item: formatItemRow({
        ...row,
        custom_field_values: values,
        custom_fields_display: labeled,
        notes_timeline: notesTimeline,
      }),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventory/:id/images
router.get('/:id/images', async (req, res) => {
  try {
    const result = await query(
      'SELECT id, name, mime_type, data, size, created_at FROM inventory_images WHERE item_id=$1 ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json({ images: result.rows.map(r => ({ id: r.id, name: r.name, mimeType: r.mime_type, data: r.data, size: r.size })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory/:id/images
router.post('/:id/images', requireMinRole('junior_engineer'), async (req, res) => {
  try {
    const { name, data, size, mimeType } = req.body;
    if (!data) return res.status(400).json({ error: 'No image data' });
    const r = await query(
      `INSERT INTO inventory_images (item_id, name, mime_type, data, size, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, mime_type, data, size`,
      [req.params.id, name || 'photo', mimeType || 'image/jpeg', data, size || 0, req.user.id]
    );
    res.status(201).json({ id: r.rows[0].id, name: r.rows[0].name, mimeType: r.rows[0].mime_type, data: r.rows[0].data, size: r.rows[0].size });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/inventory/:id/images/:imgId
router.delete('/:id/images/:imgId', requireMinRole('junior_engineer'), async (req, res) => {
  try {
    const result = await query('DELETE FROM inventory_images WHERE id=$1 AND item_id=$2 RETURNING id', [req.params.imgId, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Image not found' });
    res.json({ message: 'Image deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const transferItemSnapshot = (item) => ({
  stock_number: item.stock_number || item.sku || null,
  ui_category: item.ui_category || item.category || null,
  company: item.company || null,
  brand: item.brand || null,
  model: item.model || null,
  serial_number: item.serial_number || null,
  field_snapshot: JSON.stringify(item.dynamic_fields || {}),
  custom_field_snapshot: JSON.stringify(item.custom_field_values || {}),
});

function getTransferredNotes(notes) {
  return notes ? String(notes).trim() : 'Transferred from inventory stock';
}

// POST /api/inventory/:id/transfer — Transfer item to transferred_items
router.post('/:id/transfer', requireMinRole('junior_engineer'), auditLog('transfer_inventory', 'inventory'), async (req, res) => {
  try {
    const itemId = req.params.id;
    const { notes } = req.body;

    const itemResult = await query('SELECT * FROM inventory_items WHERE id=$1 AND deleted_at IS NULL', [itemId]);
    if (!itemResult.rows.length) return res.status(404).json({ error: 'Item not found' });

    const item = itemResult.rows[0];
    const existingTransfer = await query(
      'SELECT id FROM transferred_items WHERE inventory_item_id = $1 ORDER BY created_at DESC LIMIT 1',
      [itemId]
    );

    const snapshot = transferItemSnapshot(item);

    if (existingTransfer.rows.length) {
      await query(
        `UPDATE transferred_items SET
          stock_number=$1,
          ui_category=$2,
          company=$3,
          brand=$4,
          model=$5,
          serial_number=$6,
          field_snapshot=$7,
          custom_field_snapshot=$8,
          transferred_by=$9,
          notes=$10
         WHERE id=$11`,
        [
          snapshot.stock_number,
          snapshot.ui_category,
          snapshot.company,
          snapshot.brand,
          snapshot.model,
          snapshot.serial_number,
          snapshot.field_snapshot,
          snapshot.custom_field_snapshot,
          req.user.id,
          getTransferredNotes(notes),
          existingTransfer.rows[0].id,
        ]
      );
    } else {
      await query(
        `INSERT INTO transferred_items (
          inventory_item_id, stock_number, ui_category,
          company, brand, model, serial_number,
          field_snapshot, custom_field_snapshot, transferred_by, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          itemId,
          snapshot.stock_number,
          snapshot.ui_category,
          snapshot.company,
          snapshot.brand,
          snapshot.model,
          snapshot.serial_number,
          snapshot.field_snapshot,
          snapshot.custom_field_snapshot,
          req.user.id,
          getTransferredNotes(notes),
        ]
      );
    }

    await query(
      `UPDATE inventory_items SET status='transferred', is_available=false, updated_at=NOW()
       WHERE id=$1 AND deleted_at IS NULL`,
      [itemId]
    );

    const { labeled } = await loadCustomFieldValues(itemId);
    const refreshed = await query('SELECT * FROM inventory_items WHERE id=$1', [itemId]);
    res.json({
      message: 'Item transferred successfully',
      item: formatItemRow({ ...refreshed.rows[0], custom_fields_display: labeled }),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory/:id/revoke-transfer — Restore transferred item back to stock
router.post('/:id/revoke-transfer', requireMinRole('junior_engineer'), auditLog('revoke_transfer_inventory', 'inventory'), async (req, res) => {
  try {
    const itemId = req.params.id;
    const itemResult = await query('SELECT * FROM inventory_items WHERE id=$1 AND deleted_at IS NULL', [itemId]);
    if (!itemResult.rows.length) return res.status(404).json({ error: 'Item not found' });

    const transferResult = await query(
      'SELECT id FROM transferred_items WHERE inventory_item_id = $1 ORDER BY created_at DESC LIMIT 1',
      [itemId]
    );
    if (!transferResult.rows.length) return res.status(404).json({ error: 'Transferred record not found' });

    await query('DELETE FROM transferred_items WHERE id=$1', [transferResult.rows[0].id]);
    await query(
      `UPDATE inventory_items SET status='available', is_available=true, updated_at=NOW()
       WHERE id=$1 AND deleted_at IS NULL`,
      [itemId]
    );

    const item = await query('SELECT * FROM inventory_items WHERE id=$1', [itemId]);
    const { labeled } = await loadCustomFieldValues(itemId);
    res.json({
      message: 'Transfer revoked successfully',
      item: formatItemRow({ ...item.rows[0], custom_fields_display: labeled }),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

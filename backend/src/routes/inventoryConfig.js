const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticate, requireMinRole } = require('../middleware/auth');
const { slugifyBrand } = require('../utils/brandConfigKey');
const { isSuperAdmin, tenantAdminId } = require('../utils/tenantAccess');

const router = express.Router();
router.use(authenticate);

const DEFAULT_BRAND_NAMES = [
  'Western Digital', 'Seagate', 'Toshiba', 'Samsung', 'Hitachi (HGST)',
  'Fujitsu', 'IBM / HGST', 'Maxtor', 'Quantum', 'LaCie', 'Buffalo',
  'Transcend', 'SanDisk', 'Kingston', 'Crucial', 'Lexar', 'Corsair',
  'ADATA', 'SK Hynix', 'Micron', 'Intel', 'Other',
];

const DEFAULT_CATEGORIES = [
  { key: 'wd_35', label: 'WD 3.5"', icon: 'ðŸ’¿', color: '#3b82f6', brand: 'Western Digital', form_factor: '3.5', isHdd: true, sort_order: 1 },
  { key: 'wd_25', label: 'WD 2.5"', icon: 'ðŸ’½', color: '#22d3ee', brand: 'Western Digital', form_factor: '2.5', isHdd: true, sort_order: 2 },
  { key: 'seagate_35', label: 'Seagate 3.5"', icon: 'ðŸ’¿', color: '#f59e0b', brand: 'Seagate', form_factor: '3.5', isHdd: true, sort_order: 3 },
  { key: 'seagate_25', label: 'Seagate 2.5"', icon: 'ðŸ’½', color: '#fbbf24', brand: 'Seagate', form_factor: '2.5', isHdd: true, sort_order: 4 },
  { key: 'others_35', label: 'Others 3.5"', icon: 'ðŸ’¿', color: '#8b5cf6', brand: '', form_factor: '3.5', isHdd: true, sort_order: 5 },
  { key: 'others_25', label: 'Others 2.5"', icon: 'ðŸ’½', color: '#a78bfa', brand: '', form_factor: '2.5', isHdd: true, sort_order: 6 },
  { key: 'pcb', label: 'PCB', icon: 'ðŸ”Œ', color: '#10b981', brand: '', form_factor: '', isHdd: false, sort_order: 7 },
  { key: 'ssd', label: 'SSD', icon: 'âš¡', color: '#06b6d4', brand: '', form_factor: '', isHdd: false, sort_order: 8 },
  { key: 'phone', label: 'Phone', icon: 'ðŸ“±', color: '#ec4899', brand: '', form_factor: '', isHdd: false, sort_order: 9 },
  { key: 'stock_item', label: 'Stock Item', icon: 'ðŸ“¦', color: '#f59e0b', brand: '', form_factor: '', isHdd: false, sort_order: 10 },
  { key: 'other', label: 'Other', icon: 'ðŸ“¦', color: '#8b5cf6', brand: '', form_factor: '', isHdd: false, sort_order: 11 },
];

function scopeParams(req, paramIndex = 1, alias = '') {
  if (isSuperAdmin(req.user)) return { clause: '', params: [] };
  const prefix = alias ? `${alias}.` : '';
  return {
    clause: `${prefix}tenant_id = $${paramIndex}`,
    params: [tenantAdminId(req.user)],
  };
}

async function ensureDefaultBrands(req) {
  const tenantId = isSuperAdmin(req.user) ? null : tenantAdminId(req.user);
  for (let i = 0; i < DEFAULT_BRAND_NAMES.length; i++) {
    const name = DEFAULT_BRAND_NAMES[i];
    const configKey = slugifyBrand(name);
    const isSystem = ['Western Digital', 'Seagate', 'Other'].includes(name);
    await query(
      `INSERT INTO inventory_brands (tenant_id, name, config_key, is_system, sort_order)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (tenant_id, config_key) DO NOTHING`,
      [tenantId, name, configKey, isSystem, i + 1]
    );
  }
}

async function ensureDefaultCategories(req) {
  const tenantId = isSuperAdmin(req.user) ? null : tenantAdminId(req.user);
  for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
    const c = DEFAULT_CATEGORIES[i];
    await query(
      `INSERT INTO inventory_categories (tenant_id, category_key, label, icon, color, brand_name, form_factor, is_hdd, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (tenant_id, category_key) DO NOTHING`,
      [tenantId, c.key, c.label, c.icon, c.color, c.brand || null, c.form_factor || null, c.isHdd, c.sort_order]
    );
  }
}

router.get('/', async (req, res) => {
  try {
    await ensureDefaultBrands(req);
    await ensureDefaultCategories(req);
    const scope = scopeParams(req);

    const brands = await query(
      `SELECT id, name, config_key, is_system, active, sort_order
       FROM inventory_brands
       ${scope.clause ? `WHERE ${scope.clause}` : ''}
       ORDER BY sort_order, name`,
      scope.params
    );
    const categories = await query(
      `SELECT id, category_key AS key, label, icon, color, brand_name AS brand,
              form_factor, is_hdd AS "isHdd", active, sort_order
       FROM inventory_categories
       ${scope.clause ? `WHERE ${scope.clause}` : ''}
       ORDER BY sort_order, label`,
      scope.params
    );
    const fields = await query(
      `SELECT field_key, field_label, field_type, field_order
       FROM hdd_field_mappings
       WHERE is_standard = true
         ${scope.clause ? 'AND (tenant_id IS NULL OR tenant_id = $1)' : ''}
       ORDER BY field_order, field_label`,
      scope.params
    );

    res.json({
      brands: brands.rows,
      categories: categories.rows,
      stockFields: fields.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post(
  '/brands',
  requireMinRole('admin'),
  [body('name').notEmpty().trim()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
    try {
      const name = req.body.name.trim();
      const configKey = slugifyBrand(name);
      const scope = scopeParams(req);
      const order = await query(
        `SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM inventory_brands${scope.clause ? ` WHERE ${scope.clause}` : ''}`,
        scope.params
      );
      const result = await query(
        `INSERT INTO inventory_brands (tenant_id, name, config_key, sort_order)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [scope.params[0] || null, name, configKey, order.rows[0].n]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Brand already exists' });
      res.status(500).json({ error: err.message });
    }
  }
);

router.delete('/brands/:id', requireMinRole('admin'), async (req, res) => {
  try {
    const scope = scopeParams(req, 2);
    const existing = await query(
      `SELECT * FROM inventory_brands WHERE id=$1${scope.clause ? ` AND ${scope.clause}` : ''}`,
      scope.clause ? [req.params.id, ...scope.params] : [req.params.id]
    );
    if (!existing.rows.length) return res.status(404).json({ error: 'Brand not found' });
    if (existing.rows[0].is_system) {
      return res.status(400).json({ error: 'System brands cannot be deleted. Deactivate instead.' });
    }
    await query(
      `DELETE FROM inventory_brands WHERE id=$1${scope.clause ? ` AND ${scope.clause}` : ''}`,
      scope.clause ? [req.params.id, ...scope.params] : [req.params.id]
    );
    res.json({ message: 'Brand deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/brands/:id', requireMinRole('admin'), async (req, res) => {
  try {
    const { active, name } = req.body;
    const scope = scopeParams(req, 4);
    const result = await query(
      `UPDATE inventory_brands SET
        active=COALESCE($1,active),
        name=COALESCE($2,name),
        updated_at=NOW()
       WHERE id=$3${scope.clause ? ` AND ${scope.clause}` : ''} RETURNING *`,
      scope.clause
        ? [active, name || null, req.params.id, ...scope.params]
        : [active, name || null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post(
  '/categories',
  requireMinRole('admin'),
  [body('label').notEmpty(), body('key').optional()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
    try {
      const { label, key, icon, color, brand, isHdd, form_factor } = req.body;
      const categoryKey = key || label.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const scope = scopeParams(req);
      const order = await query(
        `SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM inventory_categories${scope.clause ? ` WHERE ${scope.clause}` : ''}`,
        scope.params
      );
      const result = await query(
        `INSERT INTO inventory_categories (tenant_id, category_key, label, icon, color, brand_name, form_factor, is_hdd, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING
         id, category_key AS key, label, icon, color, brand_name AS brand, form_factor, is_hdd AS "isHdd", active, sort_order`,
        [
          scope.params[0] || null,
          categoryKey,
          label,
          icon || 'ðŸ’¿',
          color || '#3b82f6',
          brand || null,
          form_factor || null,
          isHdd !== false,
          order.rows[0].n,
        ]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Category key already exists' });
      res.status(500).json({ error: err.message });
    }
  }
);

router.delete('/categories/:id', requireMinRole('admin'), async (req, res) => {
  try {
    const scope = scopeParams(req, 2);
    const result = await query(
      `DELETE FROM inventory_categories WHERE id=$1${scope.clause ? ` AND ${scope.clause}` : ''} RETURNING category_key`,
      scope.clause ? [req.params.id, ...scope.params] : [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Category deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/categories/:id', requireMinRole('admin'), async (req, res) => {
  try {
    const { active, label, brand, icon, color } = req.body;
    const scope = scopeParams(req, 7);
    const result = await query(
      `UPDATE inventory_categories SET
        active=COALESCE($1,active), label=COALESCE($2,label),
        brand_name=COALESCE($3,brand_name), icon=COALESCE($4,icon),
        color=COALESCE($5,color), updated_at=NOW()
       WHERE id=$6${scope.clause ? ` AND ${scope.clause}` : ''} RETURNING
       id, category_key AS key, label, icon, color, brand_name AS brand, is_hdd AS "isHdd", active`,
      scope.clause
        ? [active, label || null, brand || null, icon || null, color || null, req.params.id, ...scope.params]
        : [active, label || null, brand || null, icon || null, color || null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

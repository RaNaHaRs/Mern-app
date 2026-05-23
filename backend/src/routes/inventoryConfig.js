const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticate, requireMinRole } = require('../middleware/auth');
const { slugifyBrand } = require('../utils/brandConfigKey');

const router = express.Router();
router.use(authenticate);

const DEFAULT_BRAND_NAMES = [
  'Western Digital', 'Seagate', 'Toshiba', 'Samsung', 'Hitachi (HGST)',
  'Fujitsu', 'IBM / HGST', 'Maxtor', 'Quantum', 'LaCie', 'Buffalo',
  'Transcend', 'SanDisk', 'Kingston', 'Crucial', 'Lexar', 'Corsair',
  'ADATA', 'SK Hynix', 'Micron', 'Intel', 'Other',
];

async function ensureDefaultBrands() {
  for (let i = 0; i < DEFAULT_BRAND_NAMES.length; i++) {
    const name = DEFAULT_BRAND_NAMES[i];
    const configKey = slugifyBrand(name);
    const isSystem = ['Western Digital', 'Seagate', 'Other'].includes(name);
    await query(
      `INSERT INTO inventory_brands (name, config_key, is_system, sort_order)
       VALUES ($1,$2,$3,$4) ON CONFLICT (config_key) DO NOTHING`,
      [name, configKey, isSystem, i + 1]
    );
  }
}

// GET /api/inventory-config
router.get('/', async (req, res) => {
  try {
    await ensureDefaultBrands();
    const brands = await query(
      `SELECT id, name, config_key, is_system, active, sort_order
       FROM inventory_brands ORDER BY sort_order, name`
    );
    const categories = await query(
      `SELECT id, category_key AS key, label, icon, color, brand_name AS brand,
              form_factor, is_hdd AS "isHdd", active, sort_order
       FROM inventory_categories ORDER BY sort_order, label`
    );
    const fields = await query(
      `SELECT field_key, field_label, field_type, field_order
       FROM hdd_field_mappings WHERE is_standard = true
       ORDER BY field_order, field_label`
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

// POST /api/inventory-config/brands
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
      const order = await query('SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM inventory_brands');
      const result = await query(
        `INSERT INTO inventory_brands (name, config_key, sort_order)
         VALUES ($1,$2,$3) RETURNING *`,
        [name, configKey, order.rows[0].n]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Brand already exists' });
      res.status(500).json({ error: err.message });
    }
  }
);

// DELETE /api/inventory-config/brands/:id
router.delete('/brands/:id', requireMinRole('admin'), async (req, res) => {
  try {
    const existing = await query('SELECT * FROM inventory_brands WHERE id=$1', [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Brand not found' });
    if (existing.rows[0].is_system) {
      return res.status(400).json({ error: 'System brands cannot be deleted. Deactivate instead.' });
    }
    await query('DELETE FROM inventory_brands WHERE id=$1', [req.params.id]);
    res.json({ message: 'Brand deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/inventory-config/brands/:id
router.patch('/brands/:id', requireMinRole('admin'), async (req, res) => {
  try {
    const { active, name } = req.body;
    const result = await query(
      `UPDATE inventory_brands SET
        active=COALESCE($1,active),
        name=COALESCE($2,name),
        updated_at=NOW()
       WHERE id=$3 RETURNING *`,
      [active, name || null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory-config/categories
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
      const order = await query('SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM inventory_categories');
      const result = await query(
        `INSERT INTO inventory_categories (category_key, label, icon, color, brand_name, form_factor, is_hdd, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING
         id, category_key AS key, label, icon, color, brand_name AS brand, form_factor, is_hdd AS "isHdd", active, sort_order`,
        [
          categoryKey, label, icon || '💿', color || '#3b82f6',
          brand || null, form_factor || null, isHdd !== false,
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

// DELETE /api/inventory-config/categories/:id
router.delete('/categories/:id', requireMinRole('admin'), async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM inventory_categories WHERE id=$1 RETURNING category_key',
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Category deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/inventory-config/categories/:id
router.patch('/categories/:id', requireMinRole('admin'), async (req, res) => {
  try {
    const { active, label, brand, icon, color } = req.body;
    const result = await query(
      `UPDATE inventory_categories SET
        active=COALESCE($1,active), label=COALESCE($2,label),
        brand_name=COALESCE($3,brand_name), icon=COALESCE($4,icon),
        color=COALESCE($5,color), updated_at=NOW()
       WHERE id=$6 RETURNING
       id, category_key AS key, label, icon, color, brand_name AS brand, is_hdd AS "isHdd", active`,
      [active, label || null, brand || null, icon || null, color || null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

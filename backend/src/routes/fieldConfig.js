const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticate, requireMinRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const { resolveConfigKey } = require('../utils/brandConfigKey');

const router = express.Router();
router.use(authenticate);

// ─── GET /api/field-config ───────────────────────────────────────────
// Get all field configurations (for new case form)
router.get('/', async (req, res) => {
  try {
    // Get standard fields status
    const fieldsResult = await query(
      `SELECT hdd_type, field_key, field_status, field_order FROM field_configs ORDER BY hdd_type, field_order`
    );

    // Get custom fields
    const customResult = await query(
      `SELECT id, hdd_type, field_key, field_label, field_type, field_order, is_mandatory, is_active 
       FROM custom_fields WHERE is_active = true ORDER BY hdd_type, field_order`
    );

    // Get section configs
    const sectionsResult = await query(
      `SELECT section_key, section_label, is_enabled FROM section_configs`
    );

    // Format response
    const hddFields = {};
    fieldsResult.rows.forEach(row => {
      if (!hddFields[row.hdd_type]) hddFields[row.hdd_type] = {};
      hddFields[row.hdd_type][row.field_key] = row.field_status;
    });

    const customFields = {};
    customResult.rows.forEach(row => {
      if (!customFields[row.hdd_type]) customFields[row.hdd_type] = [];
      customFields[row.hdd_type].push({
        key: row.field_key,
        label: row.field_label,
        type: row.field_type,
        isMandatory: row.is_mandatory,
      });
    });

    const sections = {};
    sectionsResult.rows.forEach(row => {
      sections[row.section_key] = row.is_enabled;
    });

    const mappings = await query(
      `SELECT field_key, field_label, field_type, field_order FROM hdd_field_mappings
       WHERE is_standard = true ORDER BY field_order, field_label`
    );

    res.json({
      hddFields,
      hdd_fields: hddFields,
      customFields,
      custom_fields: customFields,
      sections,
      fieldDefinitions: mappings.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/field-config/hdd-fields — all HDD field definitions
router.get('/hdd-fields', async (req, res) => {
  try {
    const result = await query(
      `SELECT field_key, field_label, field_type, field_order, is_standard, created_at
       FROM hdd_field_mappings ORDER BY field_order, field_label`
    );
    res.json({ fields: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/field-config/hdd-fields
router.post(
  '/hdd-fields',
  requireMinRole('admin'),
  [body('fieldLabel').notEmpty(), body('fieldType').optional().isIn(['text', 'textarea', 'date', 'number'])],
  auditLog('create_hdd_field', 'field_config'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
    try {
      const { fieldLabel, fieldType = 'text' } = req.body;
      const fieldKey = 'fld_' + fieldLabel.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
      const orderResult = await query('SELECT COALESCE(MAX(field_order),0)+1 AS n FROM hdd_field_mappings');
      const result = await query(
        `INSERT INTO hdd_field_mappings (field_key, field_label, field_type, field_order, is_standard)
         VALUES ($1,$2,$3,$4,true) RETURNING *`,
        [fieldKey, fieldLabel, fieldType, orderResult.rows[0].n]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// PUT /api/field-config/hdd-fields/:fieldKey
router.put(
  '/hdd-fields/:fieldKey',
  requireMinRole('admin'),
  auditLog('update_hdd_field', 'field_config'),
  async (req, res) => {
    try {
      const { fieldLabel, fieldType, fieldOrder } = req.body;
      const result = await query(
        `UPDATE hdd_field_mappings SET
          field_label=COALESCE($1,field_label),
          field_type=COALESCE($2,field_type),
          field_order=COALESCE($3,field_order)
         WHERE field_key=$4 RETURNING *`,
        [fieldLabel || null, fieldType || null, fieldOrder ?? null, req.params.fieldKey]
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Field not found' });
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// DELETE /api/field-config/hdd-fields/:fieldKey
router.delete(
  '/hdd-fields/:fieldKey',
  requireMinRole('admin'),
  auditLog('delete_hdd_field', 'field_config'),
  async (req, res) => {
    try {
      await query('DELETE FROM field_configs WHERE field_key=$1', [req.params.fieldKey]);
      const result = await query(
        'DELETE FROM hdd_field_mappings WHERE field_key=$1 RETURNING field_key',
        [req.params.fieldKey]
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Field not found' });
      res.json({ message: 'Deleted', fieldKey: req.params.fieldKey });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ─── PUT /api/field-config/field ──────────────────────────────────────
// Update a standard field status
router.put(
  '/field',
  requireMinRole('admin'),
  [
    body('hddType').notEmpty(),
    body('fieldKey').notEmpty(),
    body('status').isIn(['mandatory', 'optional', 'hidden']),
  ],
  auditLog('update_field_config', 'field_config'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    try {
      const { hddType, fieldKey, status } = req.body;

      const result = await query(
        `INSERT INTO field_configs (hdd_type, field_key, field_status)
         VALUES ($1, $2, $3)
         ON CONFLICT (hdd_type, field_key) 
         DO UPDATE SET field_status = $3, updated_at = NOW()
         RETURNING *`,
        [hddType, fieldKey, status]
      );

      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ─── POST /api/field-config/custom ───────────────────────────────────
// Add a new custom field
router.post(
  '/custom',
  requireMinRole('admin'),
  [
    body('hddType').notEmpty(),
    body('fieldLabel').notEmpty(),
    body('fieldType').isIn(['text', 'textarea', 'select', 'checkbox', 'date', 'number']),
  ],
  auditLog('create_custom_field', 'field_config'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    try {
      const { hddType, fieldLabel, fieldType, isMandatory } = req.body;

      // Generate unique field key
      const fieldKey = 'cf_' + fieldLabel.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();

      const result = await query(
        `INSERT INTO custom_fields (hdd_type, field_key, field_label, field_type, is_mandatory)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [hddType, fieldKey, fieldLabel, fieldType, isMandatory || false]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ─── DELETE /api/field-config/custom/:id ─────────────────────────────
// Delete a custom field
router.delete(
  '/custom/:id',
  requireMinRole('admin'),
  auditLog('delete_custom_field', 'field_config'),
  async (req, res) => {
    try {
      // Soft delete - disable instead of remove
      const result = await query(
        `UPDATE custom_fields SET is_active = false, updated_at = NOW() 
         WHERE id = $1 
         RETURNING *`,
        [req.params.id]
      );

      if (!result.rows.length) return res.status(404).json({ error: 'Custom field not found' });

      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ─── PUT /api/field-config/section/:sectionKey ──────────────────────
// Toggle section visibility
router.put(
  '/section/:sectionKey',
  requireMinRole('admin'),
  [body('isEnabled').isBoolean()],
  auditLog('toggle_section', 'field_config'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    try {
      const { sectionKey } = req.params;
      const { isEnabled } = req.body;

      const result = await query(
        `UPDATE section_configs SET is_enabled = $1, updated_at = NOW() 
         WHERE section_key = $2 
         RETURNING *`,
        [isEnabled, sectionKey]
      );

      if (!result.rows.length) return res.status(404).json({ error: 'Section not found' });

      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ─── GET /api/field-config/schema ───────────────────────────────────
// Get field metadata (labels, types, descriptions)
router.get('/schema/:hddType', async (req, res) => {
  try {
    const rawType = decodeURIComponent(req.params.hddType);
    const customBrand = req.query.customBrand || '';
    const hddType = resolveConfigKey(rawType, customBrand) || rawType;

    const standardFields = await query(
      `SELECT fm.field_key, fm.field_label, fm.field_type,
              COALESCE(fc.field_status, 'optional') AS status,
              COALESCE(fc.field_order, fm.field_order, 0) AS field_order
       FROM hdd_field_mappings fm
       LEFT JOIN field_configs fc ON fc.field_key = fm.field_key AND fc.hdd_type = $1
       WHERE fm.is_standard = true
         AND COALESCE(fc.field_status, 'optional') != 'hidden'
       ORDER BY COALESCE(fc.field_order, fm.field_order, 0), fm.field_label`,
      [hddType]
    );

    const customFields = await query(
      `SELECT id, field_key, field_label, field_type, is_mandatory, field_order
       FROM custom_fields
       WHERE hdd_type = $1 AND is_active = true
       ORDER BY field_order`,
      [hddType]
    );

    res.json({
      hddType,
      standardFields: standardFields.rows,
      customFields: customFields.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/field-config/field/:hddType/:fieldKey ──────────────
// Delete a field from a specific category (soft delete - set to hidden)
router.delete(
  '/field/:hddType/:fieldKey',
  requireMinRole('admin'),
  auditLog('delete_field_from_category', 'field_config'),
  async (req, res) => {
    try {
      const hddType = decodeURIComponent(req.params.hddType);
      const fieldKey = decodeURIComponent(req.params.fieldKey);

      // First, try to update existing config to 'hidden'
      let result = await query(
        `UPDATE field_configs 
         SET field_status = 'hidden', updated_at = NOW()
         WHERE hdd_type = $1 AND field_key = $2 
         RETURNING *`,
        [hddType, fieldKey]
      );

      // If no existing config, create a new one with 'hidden' status
      if (!result.rows.length) {
        result = await query(
          `INSERT INTO field_configs (hdd_type, field_key, field_status)
           VALUES ($1, $2, 'hidden')
           ON CONFLICT (hdd_type, field_key) 
           DO UPDATE SET field_status = 'hidden', updated_at = NOW()
           RETURNING *`,
          [hddType, fieldKey]
        );
      }

      res.json({ message: 'Field removed from category', hddType, fieldKey, status: 'hidden' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;

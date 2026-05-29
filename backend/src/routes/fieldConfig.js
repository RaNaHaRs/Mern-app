const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticate, requireMinRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const { resolveConfigKey } = require('../utils/brandConfigKey');
const { isSuperAdmin, tenantAdminId } = require('../utils/tenantAccess');

const router = express.Router();
router.use(authenticate);

function normalizeLegacyHddType(hddType) {
  const legacyMap = {
    wd_3_5: 'wd_35',
    wd_2_5: 'wd_25',
    seagate_3_5: 'seagate_35',
    seagate_2_5: 'seagate_25',
    others_3_5: 'others_35',
    others_2_5: 'others_25',
    wd_35: 'wd_3_5',
    wd_25: 'wd_2_5',
    seagate_35: 'seagate_3_5',
    seagate_25: 'seagate_2_5',
    others_35: 'others_3_5',
    others_25: 'others_2_5',
  };
  return legacyMap[hddType] || null;
}

function currentTenantId(req) {
  return tenantAdminId(req.user);
}

async function ensureTenantSectionDefaults(req) {
  if (isSuperAdmin(req.user)) return;
  const tenantId = currentTenantId(req);
  const defaults = [
    ['image_upload', 'Image Upload Section'],
    ['diagnosis', 'Diagnosis Field'],
    ['quotation', 'Commercial / Quotation Section'],
  ];

  for (const [sectionKey, sectionLabel] of defaults) {
    await query(
      `INSERT INTO section_configs (tenant_id, section_key, section_label, is_enabled)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (tenant_id, section_key) DO NOTHING`,
      [tenantId, sectionKey, sectionLabel]
    );
  }
}

// ─── GET /api/field-config ───────────────────────────────────────────
// Get all field configurations (for new case form)
router.get('/', async (req, res) => {
  try {
    await ensureTenantSectionDefaults(req);
    const tenantId = currentTenantId(req);
    // Get standard fields status
    const fieldsResult = await query(
      `SELECT hdd_type, field_key, field_status, field_order
       FROM field_configs
       ${!isSuperAdmin(req.user) ? 'WHERE tenant_id = $1' : ''}
       ORDER BY hdd_type, field_order`,
      !isSuperAdmin(req.user) ? [tenantId] : []
    );

    // Get custom fields
    const customResult = await query(
      `SELECT id, hdd_type, field_key, field_label, field_type, field_order, is_mandatory, is_active 
       FROM custom_fields
       WHERE is_active = true
         ${!isSuperAdmin(req.user) ? 'AND tenant_id = $1' : ''}
       ORDER BY hdd_type, field_order`,
      !isSuperAdmin(req.user) ? [tenantId] : []
    );

    // Get section configs
    const sectionsResult = await query(
      `SELECT section_key, section_label, is_enabled
       FROM section_configs
       ${!isSuperAdmin(req.user) ? 'WHERE tenant_id = $1' : ''}`,
      !isSuperAdmin(req.user) ? [tenantId] : []
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
        id: row.id,
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
      `SELECT field_key, field_label, field_type, field_order
       FROM hdd_field_mappings
       WHERE is_standard = true
         ${!isSuperAdmin(req.user) ? 'AND (tenant_id IS NULL OR tenant_id = $1)' : ''}
       ORDER BY field_order, field_label`,
      !isSuperAdmin(req.user) ? [tenantId] : []
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

const CASE_SETTINGS_KEY = 'case_settings';
const DEFAULT_CASE_SETTINGS = {
  stages: [
    'received','inspection','diagnosis','quotation','approved','rejected','recovery_in_progress',
    'imaging','data_extraction','verification','completed','delivered','failed',
  ],
  symptoms: [
    'not_detected','clicking','slow','dead','beeping','grinding','pcb_burnt','corrupted',
    'bad_sectors','head_crash','water_damage','not_spinning','read_errors',
  ],
  failure_types: [
    'logical','firmware','electrical','mechanical','head_crash','pcb_damage',
    'motor_failure','bad_sectors','water_damage','fire_damage','unknown',
  ],
  brands: [
    'Western Digital','Seagate','Toshiba','Samsung','Hitachi (HGST)','Fujitsu','IBM','Maxtor','Apple','Sony','OnePlus','Xiaomi','Other',
  ],
  manufacture_countries: ['Thailand','China','Malaysia','Philippines'],
  interfaces: ['SATA','NVMe','SAS','IDE','USB','PCIe','M.2','eSATA'],
  capacities: [
    '160GB','250GB','320GB','500GB','750GB','1TB','1.5TB','2TB','3TB','4TB','6TB','8TB','10TB','12TB','14TB','16TB','18TB','20TB',
  ],
  payment_methods: ['Cash','UPI','Card (Debit/Credit)','Bank Transfer','NEFT','RTGS','IMPS','Cheque','Online (Razorpay)','PayPal'],
  hdd_types: [],
};

function mergeCaseSettings(stored, tenantId) {
  const global = stored?.global || {};
  const tenants = stored?.tenants || {};
  const tenantSettings = tenantId ? tenants[tenantId] || {} : {};
  return {
    ...DEFAULT_CASE_SETTINGS,
    ...global,
    ...tenantSettings,
  };
}

router.get('/settings', async (req, res) => {
  try {
    const tenantId = currentTenantId(req);
    const result = await query('SELECT value FROM platform_settings WHERE key = $1', [CASE_SETTINGS_KEY]);
    const stored = result.rows.length ? result.rows[0].value : {};
    const settings = mergeCaseSettings(stored, tenantId);
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put(
  '/settings',
  requireMinRole('admin'),
  [
    body('stages').optional().isArray(),
    body('stages.*').optional().isString(),
    body('symptoms').optional().isArray(),
    body('symptoms.*').optional().isString(),
    body('failure_types').optional().isArray(),
    body('failure_types.*').optional().isString(),
    body('brands').optional().isArray(),
    body('brands.*').optional().isString(),
    body('capacities').optional().isArray(),
    body('capacities.*').optional().isString(),
    body('hdd_types').optional().isArray(),
    body('hdd_types.*').optional().isString(),
    body('manufacture_countries').optional().isArray(),
    body('manufacture_countries.*').optional().isString(),
    body('interfaces').optional().isArray(),
    body('interfaces.*').optional().isString(),
    body('payment_methods').optional().isArray(),
    body('payment_methods.*').optional().isString(),
  ],
  auditLog('update_case_settings', 'field_config'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    try {
      const tenantId = currentTenantId(req);
      const result = await query('SELECT value FROM platform_settings WHERE key = $1', [CASE_SETTINGS_KEY]);
      const current = result.rows.length ? result.rows[0].value : {};
      const updated = {
        global: current.global || {},
        tenants: current.tenants || {},
      };
      const payload = {
        ...(req.body.stages ? { stages: req.body.stages } : {}),
        ...(req.body.symptoms ? { symptoms: req.body.symptoms } : {}),
        ...(req.body.failure_types ? { failure_types: req.body.failure_types } : {}),
        ...(req.body.brands ? { brands: req.body.brands } : {}),
        ...(req.body.manufacture_countries ? { manufacture_countries: req.body.manufacture_countries } : {}),
        ...(req.body.interfaces ? { interfaces: req.body.interfaces } : {}),
        ...(req.body.capacities ? { capacities: req.body.capacities } : {}),
        ...(req.body.payment_methods ? { payment_methods: req.body.payment_methods } : {}),
        ...(req.body.hdd_types ? { hdd_types: req.body.hdd_types } : {}),
      };

      if (tenantId) {
        updated.tenants[tenantId] = {
          ...mergeCaseSettings(current, tenantId),
          ...payload,
        };
      } else {
        updated.global = {
          ...mergeCaseSettings(current, tenantId),
          ...payload,
        };
      }

      await query(
        `INSERT INTO platform_settings (key, value, updated_by, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
        [CASE_SETTINGS_KEY, JSON.stringify(updated), req.user.id],
      );

      res.json({ settings: tenantId ? updated.tenants[tenantId] : updated.global });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/field-config/hdd-fields — all HDD field definitions
router.get('/hdd-fields', async (req, res) => {
  try {
    const tenantId = currentTenantId(req);
    const result = await query(
      `SELECT field_key, field_label, field_type, field_order, is_standard, created_at
       FROM hdd_field_mappings
       ${!isSuperAdmin(req.user) ? 'WHERE tenant_id IS NULL OR tenant_id = $1' : ''}
       ORDER BY field_order, field_label`,
      !isSuperAdmin(req.user) ? [tenantId] : []
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
  [body('fieldLabel').notEmpty(), body('fieldType').optional().isIn(['text', 'textarea', 'date', 'number', 'select', 'checkbox'])],
  auditLog('create_hdd_field', 'field_config'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
    try {
      const { fieldLabel, fieldType = 'text' } = req.body;
      const fieldKey = 'fld_' + fieldLabel.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
      const orderResult = await query(
        `SELECT COALESCE(MAX(field_order),0)+1 AS n
         FROM hdd_field_mappings
         ${!isSuperAdmin(req.user) ? 'WHERE tenant_id = $1' : ''}`,
        !isSuperAdmin(req.user) ? [currentTenantId(req)] : []
      );
      const result = await query(
        `INSERT INTO hdd_field_mappings (tenant_id, field_key, field_label, field_type, field_order, is_standard)
         VALUES ($1,$2,$3,$4,$5,true) RETURNING *`,
        [isSuperAdmin(req.user) ? null : currentTenantId(req), fieldKey, fieldLabel, fieldType, orderResult.rows[0].n]
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
         WHERE field_key=$4${!isSuperAdmin(req.user) ? ' AND tenant_id = $5' : ''} RETURNING *`,
        !isSuperAdmin(req.user)
          ? [fieldLabel || null, fieldType || null, fieldOrder ?? null, req.params.fieldKey, currentTenantId(req)]
          : [fieldLabel || null, fieldType || null, fieldOrder ?? null, req.params.fieldKey]
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
      await query(
        `DELETE FROM field_configs WHERE field_key=$1${!isSuperAdmin(req.user) ? ' AND tenant_id = $2' : ''}`,
        !isSuperAdmin(req.user) ? [req.params.fieldKey, currentTenantId(req)] : [req.params.fieldKey]
      );
      const result = await query(
        `DELETE FROM hdd_field_mappings WHERE field_key=$1${!isSuperAdmin(req.user) ? ' AND tenant_id = $2' : ''} RETURNING field_key`,
        !isSuperAdmin(req.user) ? [req.params.fieldKey, currentTenantId(req)] : [req.params.fieldKey]
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
      const {   hddType, fieldKey, status } = req.body;

      const result = await query(
        `INSERT INTO field_configs (tenant_id, hdd_type, field_key, field_status)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (tenant_id, hdd_type, field_key) 
         DO UPDATE SET field_status = $4, updated_at = NOW()
         RETURNING *`,
        [isSuperAdmin(req.user) ? null : currentTenantId(req), hddType, fieldKey, status]
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
        `INSERT INTO custom_fields (tenant_id, hdd_type, field_key, field_label, field_type, is_mandatory)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [isSuperAdmin(req.user) ? null : currentTenantId(req), hddType, fieldKey, fieldLabel, fieldType, isMandatory || false]
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
         WHERE id = $1 ${!isSuperAdmin(req.user) ? 'AND tenant_id = $2' : ''}
         RETURNING *`,
        !isSuperAdmin(req.user) ? [req.params.id, currentTenantId(req)] : [req.params.id]
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
      await ensureTenantSectionDefaults(req);
      const { sectionKey } = req.params;
      const { isEnabled } = req.body;

      const result = await query(
        `UPDATE section_configs SET is_enabled = $1, updated_at = NOW() 
         WHERE section_key = $2 ${!isSuperAdmin(req.user) ? 'AND tenant_id = $3' : ''}
         RETURNING *`,
        !isSuperAdmin(req.user) ? [isEnabled, sectionKey, currentTenantId(req)] : [isEnabled, sectionKey]
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
    const aliasType = normalizeLegacyHddType(hddType);
    const tenantId = currentTenantId(req);
    const hddTypes = aliasType ? [hddType, aliasType] : [hddType];

    const standardFields = await query(
      `SELECT fm.field_key, fm.field_label, fm.field_type,
              COALESCE(fc.field_status, 'optional') AS status,
              COALESCE(fc.field_order, fm.field_order, 0) AS field_order
       FROM hdd_field_mappings fm
       LEFT JOIN field_configs fc
         ON fc.field_key = fm.field_key
          AND fc.hdd_type = ANY($1)
        ${!isSuperAdmin(req.user) ? 'AND fc.tenant_id = $2' : ''}
       WHERE fm.is_standard = true
           ${!isSuperAdmin(req.user) ? 'AND (fm.tenant_id IS NULL OR fm.tenant_id = $2)' : ''}
           AND COALESCE(fc.field_status, 'optional') != 'hidden'
       ORDER BY COALESCE(fc.field_order, fm.field_order, 0), fm.field_label`,
        !isSuperAdmin(req.user) ? [hddTypes, tenantId] : [hddTypes]
    );

    const customFields = await query(
      `SELECT id, field_key, field_label, field_type, is_mandatory, field_order
       FROM custom_fields
         WHERE hdd_type = ANY($1) AND is_active = true
       ${!isSuperAdmin(req.user) ? 'AND tenant_id = $2' : ''}
       ORDER BY field_order`,
        !isSuperAdmin(req.user) ? [hddTypes, tenantId] : [hddTypes]
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
         WHERE hdd_type = $1 AND field_key = $2 ${!isSuperAdmin(req.user) ? 'AND tenant_id = $3' : ''}
         RETURNING *`,
        !isSuperAdmin(req.user) ? [hddType, fieldKey, currentTenantId(req)] : [hddType, fieldKey]
      );

      // If no existing config, create a new one with 'hidden' status
      if (!result.rows.length) {
        result = await query(
          `INSERT INTO field_configs (tenant_id, hdd_type, field_key, field_status)
           VALUES ($1, $2, $3, 'hidden')
           ON CONFLICT (tenant_id, hdd_type, field_key) 
           DO UPDATE SET field_status = 'hidden', updated_at = NOW()
           RETURNING *`,
          [isSuperAdmin(req.user) ? null : currentTenantId(req), hddType, fieldKey]
        );
      }

      res.json({ message: 'Field removed from category', hddType, fieldKey, status: 'hidden' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;

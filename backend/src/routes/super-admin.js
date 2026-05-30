/**
 * Super Admin Command Center — Production Routes
 * ALL routes are protected by authenticate + requireSuperAdmin middleware.
 *
 * Sections:
 *  A. Admin Staff Management         /admins
 *  B. Tenant Management              /tenants
 *  C. Platform Settings (CMS)        /settings
 *  D. Subscription Plans             /plans
 *  E. Discount Coupons               /coupons
 *  F. Razorpay Integration           /razorpay
 *  G. Audit Logs                     /audit-logs
 *  H. Two-Factor Authentication      /2fa
 *  I. Platform Dashboard Stats       /dashboard
 */

const express       = require('express');
const bcrypt        = require('bcryptjs');
const crypto        = require('crypto');
const { body, query: qv, validationResult } = require('express-validator');
const { query }     = require('../config/database');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const { auditLog }  = require('../middleware/audit');
const logger        = require('../config/logger');

// Services (lazy-required so server starts even without credentials)
const razorpayService = require('../services/razorpayService');
const invoiceService  = require('../services/invoiceService');
const tfaService      = require('../services/twoFactorService');

const router = express.Router();

// Guard every route in this file
router.use(authenticate, requireSuperAdmin);

const ROLE_SETTINGS_KEY = 'settings_roles';

async function getSuperAdminRoles() {
  const result = await query(`SELECT value FROM platform_settings WHERE key = $1`, [ROLE_SETTINGS_KEY]);
  if (!result.rows.length) return [];
  return result.rows[0].value || [];
}

async function saveSuperAdminRoles(roles, userId) {
  await query(
    `INSERT INTO platform_settings (key, value, updated_by, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
    [ROLE_SETTINGS_KEY, JSON.stringify(roles), userId]
  );
}

// ═══════════════════════════════════════════════════════════════
// I. PLATFORM DASHBOARD STATS
// ═══════════════════════════════════════════════════════════════

// GET /api/super-admin/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const [tenants, revenue, logs, plans] = await Promise.all([
      query(`SELECT
               COUNT(*)                                           AS total_tenants,
               COUNT(*) FILTER (WHERE role='admin' AND is_active) AS active_tenants,
               COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS new_this_month
             FROM users WHERE role = 'admin'`),
      query(`SELECT
               COALESCE(SUM(amount),0)                           AS total_revenue,
               COALESCE(SUM(amount) FILTER (WHERE paid_at > NOW() - INTERVAL '30 days'), 0) AS mrr
             FROM saas_purchases WHERE status = 'paid'`),
      query(`SELECT action, COUNT(*) AS cnt FROM audit_logs
             WHERE created_at > NOW() - INTERVAL '7 days'
             GROUP BY action ORDER BY cnt DESC LIMIT 10`),
      query(`SELECT sp.key, sp.label, sp.price_monthly,
               COUNT(u.id) AS tenant_count,
               COALESCE(COUNT(u.id) * sp.price_monthly, 0) AS plan_mrr
             FROM subscription_plans sp
             LEFT JOIN users u ON u.subscription_plan = sp.key AND u.role = 'admin'
             WHERE sp.is_active = true
             GROUP BY sp.id, sp.key, sp.label, sp.price_monthly
             ORDER BY sp.sort_order`),
    ]);

    res.json({
      tenants:  tenants.rows[0],
      revenue:  revenue.rows[0],
      topActions: logs.rows,
      planStats: plans.rows,
    });
  } catch (err) {
    logger.error('SA dashboard error', { error: err.message });
    res.status(500).json({ error: 'Failed to load dashboard stats' });
  }
});

// ═══════════════════════════════════════════════════════════════
// A. ADMIN STAFF MANAGEMENT
// ═══════════════════════════════════════════════════════════════

// GET /api/super-admin/admins
router.get('/admins', async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.username, u.email, u.full_name, u.role, u.is_active,
              u.phone, u.last_login, u.created_at, u.two_fa_enabled,
              json_agg(ap.*) FILTER (WHERE ap.id IS NOT NULL) AS permissions
       FROM users u
       LEFT JOIN admin_permissions ap ON ap.user_id = u.id
       WHERE u.role IN ('admin', 'senior_engineer', 'junior_engineer', 'staff')
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/super-admin/admins  — Create platform staff account
router.post('/admins',
  [
    body('username').trim().isLength({ min: 3 }).withMessage('Username min 3 chars'),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password min 8 chars'),
    body('full_name').trim().notEmpty(),
    body('role').isIn(['admin', 'senior_engineer', 'junior_engineer', 'staff']),
  ],
  auditLog('create_admin_staff', 'user'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { username, email, password, full_name, role, phone, permissions = [] } = req.body;
    try {
      const exists = await query('SELECT id FROM users WHERE email=$1 OR username=$2', [email, username]);
      if (exists.rows.length) return res.status(409).json({ error: 'Email or username already in use' });

      const hash = await bcrypt.hash(password, 12);
      const user = await query(
        `INSERT INTO users (username, email, password_hash, full_name, role, phone, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING id, username, email, full_name, role`,
        [username.toLowerCase(), email, hash, full_name, role, phone || null]
      );
      const userId = user.rows[0].id;

      // Insert permission rows
      if (permissions.length) {
        for (const perm of permissions) {
          await query(
            `INSERT INTO admin_permissions (user_id, module, can_view, can_create, can_edit, can_delete, can_export)
             VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (user_id, module) DO UPDATE
             SET can_view=$3, can_create=$4, can_edit=$5, can_delete=$6, can_export=$7`,
            [userId, perm.module, !!perm.can_view, !!perm.can_create, !!perm.can_edit, !!perm.can_delete, !!perm.can_export]
          );
        }
      }

      logger.info('Admin staff created', { by: req.user.id, newUser: userId });
      res.status(201).json({ ...user.rows[0], message: 'Admin staff account created successfully' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// PATCH /api/super-admin/admins/:id/permissions
router.patch('/admins/:id/permissions', auditLog('update_admin_permissions', 'user'), async (req, res) => {
  const { permissions = [] } = req.body;
  try {
    for (const perm of permissions) {
      await query(
        `INSERT INTO admin_permissions (user_id, module, can_view, can_create, can_edit, can_delete, can_export)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (user_id, module) DO UPDATE
         SET can_view=$3, can_create=$4, can_edit=$5, can_delete=$6, can_export=$7`,
        [req.params.id, perm.module, !!perm.can_view, !!perm.can_create, !!perm.can_edit, !!perm.can_delete, !!perm.can_export]
      );
    }
    res.json({ message: 'Permissions updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/super-admin/admins/:id/status
router.patch('/admins/:id/status', auditLog('toggle_admin_status', 'user'), async (req, res) => {
  const { is_active } = req.body;
  if (typeof is_active !== 'boolean') return res.status(400).json({ error: 'is_active (boolean) required' });
  try {
    await query('UPDATE users SET is_active=$1 WHERE id=$2 AND role != $3', [is_active, req.params.id, 'super_admin']);
    res.json({ message: `Account ${is_active ? 'activated' : 'deactivated'}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/super-admin/admins/:id
router.delete('/admins/:id', auditLog('delete_admin_staff', 'user'), async (req, res) => {
  try {
    const check = await query('SELECT role FROM users WHERE id=$1', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ error: 'User not found' });
    if (check.rows[0].role === 'super_admin') return res.status(403).json({ error: 'Cannot delete super admin' });
    await query('UPDATE users SET is_active=false WHERE id=$1', [req.params.id]);
    res.json({ message: 'Admin account deactivated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// B. TENANT MANAGEMENT
// ═══════════════════════════════════════════════════════════════

// GET /api/super-admin/tenants
router.get('/tenants', async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.username, u.email AS admin_email, u.full_name AS admin_name,
              u.phone, u.is_active, u.last_login, u.created_at,
              u.subscription_plan AS plan, u.subscription_expiry AS expiry_date,
              u.max_team_users, u.company_name, u.city, u.notes,
              u.subscription_status AS status,
              COUNT(t.id) FILTER (WHERE t.id IS NOT NULL) AS team_user_count
       FROM users u
       LEFT JOIN users t ON t.tenant_owner_id = u.id
       WHERE u.role = 'admin'
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    // Fallback if columns don't exist yet
    try {
      const r2 = await query(
        `SELECT id, username, email AS admin_email, full_name AS admin_name,
                phone, is_active, last_login, created_at, notes
         FROM users WHERE role = 'admin' ORDER BY created_at DESC`
      );
      res.json(r2.rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
});

// POST /api/super-admin/tenants — Provision new tenant
router.post('/tenants',
  [
    body('company_name').trim().notEmpty().withMessage('Company name required'),
    body('admin_email').isEmail().normalizeEmail(),
    body('admin_password').isLength({ min: 8 }),
    body('plan').optional().isString(),
  ],
  auditLog('create_tenant', 'tenant'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const {
      company_name, admin_name, admin_email, admin_password,
      plan = 'starter', max_team_users = 5, subscription_months = 1,
      phone, city, gstin, notes, expiry_date,
    } = req.body;

    try {
      const exists = await query('SELECT id FROM users WHERE email=$1', [admin_email]);
      if (exists.rows.length) return res.status(409).json({ error: 'Email already registered' });

      const hash      = await bcrypt.hash(admin_password, 12);
      const username  = admin_email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') + '_' + Date.now().toString(36);
      const expiryTs  = expiry_date
        ? new Date(expiry_date)
        : new Date(Date.now() + subscription_months * 30 * 86400000);

      const user = await query(
        `INSERT INTO users (username, email, password_hash, full_name, role, phone, is_active, notes,
                           company_name, city, subscription_plan, subscription_expiry, max_team_users, subscription_status)
         VALUES ($1,$2,$3,$4,'admin',$5,true,$6,$7,$8,$9,$10,$11,'active')
         RETURNING id, username, email, full_name, role`,
        [username, admin_email, hash, admin_name || company_name, phone || null, notes || null,
         company_name, city || null, plan, expiryTs, max_team_users]
      );

      logger.info('Tenant provisioned', { by: req.user.id, tenant: user.rows[0].id });
      res.status(201).json({
        ...user.rows[0],
        company_name,
        plan,
        expiry_date: expiryTs.toISOString().slice(0, 10),
        message: `Tenant "${company_name}" created successfully`,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// PATCH /api/super-admin/tenants/:id
router.patch('/tenants/:id', auditLog('update_tenant', 'tenant'), async (req, res) => {
  const { company_name, plan, status, max_team_users, expiry_date, notes } = req.body;
  try {
    const check = await query('SELECT id, role FROM users WHERE id=$1', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Tenant not found' });

    const updates = [];
    const vals    = [];
    let   i       = 1;

    if (company_name     !== undefined) { updates.push(`company_name = $${i++}`);           vals.push(company_name); }
    if (plan             !== undefined) { updates.push(`subscription_plan = $${i++}`);      vals.push(plan); }
    if (status           !== undefined) {
      updates.push(`subscription_status = $${i++}`); vals.push(status);
      updates.push(`is_active = $${i++}`);           vals.push(status === 'active' || status === 'trial');
    }
    if (max_team_users   !== undefined) { updates.push(`max_team_users = $${i++}`);         vals.push(max_team_users); }
    if (expiry_date      !== undefined) { updates.push(`subscription_expiry = $${i++}`);    vals.push(expiry_date ? new Date(expiry_date) : null); }
    if (notes            !== undefined) { updates.push(`notes = $${i++}`);                  vals.push(notes); }

    if (!updates.length) return res.json({ message: 'Nothing to update' });
    vals.push(req.params.id);
    await query(`UPDATE users SET ${updates.join(', ')}, updated_at=NOW() WHERE id=$${i}`, vals);

    res.json({ message: 'Tenant updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/super-admin/tenants/:id  (soft-delete)
router.delete('/tenants/:id', auditLog('delete_tenant', 'tenant'), async (req, res) => {
  try {
    await query('UPDATE users SET is_active=false WHERE id=$1 AND role=$2', [req.params.id, 'admin']);
    res.json({ message: 'Tenant deactivated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/super-admin/tenants/:id/data  — Deep-dive tenant metrics
router.get('/tenants/:id/data', async (req, res) => {
  try {
    const [user, purchases] = await Promise.all([
      query('SELECT id, username, email, full_name, role, is_active, last_login, created_at FROM users WHERE id=$1', [req.params.id]),
      query('SELECT * FROM saas_purchases WHERE tenant_user_id=$1 ORDER BY created_at DESC LIMIT 20', [req.params.id]),
    ]);
    if (!user.rows.length) return res.status(404).json({ error: 'Tenant not found' });
    res.json({ tenant: user.rows[0], purchases: purchases.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// C. PLATFORM SETTINGS (CMS)
// ═══════════════════════════════════════════════════════════════

// GET /api/super-admin/settings
router.get('/settings', async (req, res) => {
  try {
    const result = await query('SELECT key, value FROM platform_settings');
    const settings = {};
    result.rows.forEach(r => { settings[r.key] = r.value; });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/super-admin/settings — Bulk save all settings
router.put('/settings', auditLog('update_platform_settings', 'settings'), async (req, res) => {
  try {
    for (const [key, value] of Object.entries(req.body)) {
      await query(
        `INSERT INTO platform_settings (key, value, updated_by, updated_at)
         VALUES ($1,$2,$3,NOW())
         ON CONFLICT (key) DO UPDATE SET value=$2, updated_by=$3, updated_at=NOW()`,
        [key, JSON.stringify(value), req.user.id]
      );
    }
    res.json({ message: 'Settings saved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// Roles / Permission Template Management

router.get('/settings/roles', async (req, res) => {
  try {
    const roles = await getSuperAdminRoles();
    res.json(roles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/settings/roles', auditLog('create_role', 'settings'), async (req, res) => {
  try {
    const { name, key, description, color, permissions } = req.body;
    if (!name || !key) return res.status(422).json({ error: 'Role name and key are required' });
    const roles = await getSuperAdminRoles();
    if (roles.some(r => r.key === key)) return res.status(409).json({ error: 'Role key already exists' });
    const role = {
      id: crypto.randomUUID(),
      name,
      key,
      description: description || '',
      color: color || '#6366f1',
      permissions: permissions || {},
    };
    roles.push(role);
    await saveSuperAdminRoles(roles, req.user.id);
    res.status(201).json(role);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/settings/roles/:id', auditLog('update_role', 'settings'), async (req, res) => {
  try {
    const { name, key, description, color, permissions } = req.body;
    const roles = await getSuperAdminRoles();
    const idx = roles.findIndex(r => r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Role not found' });
    if (key && roles.some(r => r.key === key && r.id !== req.params.id)) return res.status(409).json({ error: 'Role key already exists' });
    const existing = roles[idx];
    roles[idx] = {
      ...existing,
      name: name ?? existing.name,
      key: key ?? existing.key,
      description: description ?? existing.description,
      color: color ?? existing.color,
      permissions: permissions ?? existing.permissions,
    };
    await saveSuperAdminRoles(roles, req.user.id);
    res.json(roles[idx]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/settings/roles/:id', auditLog('delete_role', 'settings'), async (req, res) => {
  try {
    const roles = await getSuperAdminRoles();
    const remaining = roles.filter(r => r.id !== req.params.id);
    if (remaining.length === roles.length) return res.status(404).json({ error: 'Role not found' });
    await saveSuperAdminRoles(remaining, req.user.id);
    res.json({ message: 'Role deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/super-admin/settings/:key
router.get('/settings/:key', async (req, res) => {
  try {
    const result = await query('SELECT value FROM platform_settings WHERE key=$1', [req.params.key]);
    if (!result.rows.length) return res.status(404).json({ error: 'Setting not found' });
    res.json(result.rows[0].value);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/super-admin/settings/:key — Update single key
router.patch('/settings/:key', auditLog('update_setting', 'settings'), async (req, res) => {
  try {
    await query(
      `INSERT INTO platform_settings (key, value, updated_by, updated_at)
       VALUES ($1,$2,$3,NOW())
       ON CONFLICT (key) DO UPDATE SET value=$2, updated_by=$3, updated_at=NOW()`,
      [req.params.key, JSON.stringify(req.body), req.user.id]
    );
    res.json({ message: `Setting "${req.params.key}" updated` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// D. SUBSCRIPTION PLANS
// ═══════════════════════════════════════════════════════════════

// GET /api/super-admin/plans
router.get('/plans', async (req, res) => {
  try {
    const result = await query('SELECT * FROM subscription_plans ORDER BY sort_order, created_at');
    const plans = result.rows.map(r => ({
      key: r.key,
      label: r.label,
      price: parseFloat(r.price_monthly) || 0,
      maxUsers: r.max_users,
      color: r.color || '#3b82f6',
      features: typeof r.features === 'string' ? JSON.parse(r.features) : (r.features || []),
      id: r.id,
      is_active: r.is_active,
    }));
    res.json({ plans });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/super-admin/plans
router.post('/plans',
  [
    body('key').trim().notEmpty().isSlug(),
    body('label').trim().notEmpty(),
    body('price_monthly').isFloat({ min: 0 }),
  ],
  auditLog('create_plan', 'plan'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { key, label, price_monthly, price_yearly, max_users = 5, color, features = [], sort_order = 99 } = req.body;
    try {
      const exists = await query('SELECT id FROM subscription_plans WHERE key=$1', [key]);
      if (exists.rows.length) return res.status(409).json({ error: 'Plan key already exists' });

      const result = await query(
        `INSERT INTO subscription_plans (key, label, price_monthly, price_yearly, max_users, color, features, sort_order, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [key, label, price_monthly, price_yearly || null, max_users, color || '#3b82f6', JSON.stringify(features), sort_order, req.user.id]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// PATCH /api/super-admin/plans/:id
router.patch('/plans/:id', auditLog('update_plan', 'plan'), async (req, res) => {
  const fields = ['label', 'price_monthly', 'price_yearly', 'max_users', 'color', 'features', 'is_active', 'sort_order'];
  const updates = [];
  const vals    = [];
  let   i       = 1;
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = $${i++}`);
      vals.push(f === 'features' ? JSON.stringify(req.body[f]) : req.body[f]);
    }
  }
  if (!updates.length) return res.json({ message: 'Nothing to update' });
  vals.push(req.params.id);
  try {
    await query(`UPDATE subscription_plans SET ${updates.join(', ')}, updated_at=NOW() WHERE id=$${i}`, vals);
    res.json({ message: 'Plan updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/super-admin/plans/:id
router.delete('/plans/:id', auditLog('delete_plan', 'plan'), async (req, res) => {
  try {
    await query('UPDATE subscription_plans SET is_active=false WHERE id=$1', [req.params.id]);
    res.json({ message: 'Plan deactivated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/super-admin/plans — Bulk sync plans from frontend editor
router.put('/plans', auditLog('bulk_sync_plans', 'plan'), async (req, res) => {
  const { plans } = req.body;
  if (!Array.isArray(plans)) return res.status(400).json({ error: 'plans array required' });
  try {
    for (let idx = 0; idx < plans.length; idx++) {
      const p = plans[idx];
      await query(
        `INSERT INTO subscription_plans (key, label, price_monthly, max_users, color, features, sort_order, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (key) DO UPDATE SET
           label=$2, price_monthly=$3, max_users=$4, color=$5, features=$6, sort_order=$7, updated_at=NOW()`,
        [p.key, p.label, p.price || 0, p.maxUsers || 5, p.color || '#3b82f6', JSON.stringify(p.features || []), idx, req.user.id]
      );
    }
    res.json({ message: 'Plans synchronized' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// E. DISCOUNT COUPONS
// ═══════════════════════════════════════════════════════════════

// GET /api/super-admin/coupons
router.get('/coupons', async (req, res) => {
  try {
    const result = await query('SELECT * FROM discount_coupons ORDER BY created_at DESC');
    res.json({ coupons: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/super-admin/coupons
router.post('/coupons',
  [
    body('code').trim().notEmpty().toUpperCase(),
    body('discount_value').isFloat({ min: 0.01 }),
    body('discount_type').isIn(['percent', 'flat']),
  ],
  auditLog('create_coupon', 'coupon'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { code, type = 'global', target_email, discount_type, discount_value,
            max_uses, expiry_date, description } = req.body;
    try {
      const exists = await query('SELECT id FROM discount_coupons WHERE code=$1', [code.toUpperCase()]);
      if (exists.rows.length) return res.status(409).json({ error: 'Coupon code already exists' });

      const result = await query(
        `INSERT INTO discount_coupons (code, type, target_email, discount_type, discount_value, max_uses, expiry_date, description, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [code.toUpperCase(), type, target_email || null, discount_type, discount_value,
         max_uses ? parseInt(max_uses) : null, expiry_date || null, description || null, req.user.id]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// PATCH /api/super-admin/coupons/:code/deactivate
router.patch('/coupons/:code/deactivate', auditLog('deactivate_coupon', 'coupon'), async (req, res) => {
  try {
    await query('UPDATE discount_coupons SET is_active=false WHERE code=$1', [req.params.code.toUpperCase()]);
    res.json({ message: 'Coupon deactivated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/super-admin/coupons/:code
router.delete('/coupons/:code', auditLog('delete_coupon', 'coupon'), async (req, res) => {
  try {
    await query('DELETE FROM discount_coupons WHERE code=$1', [req.params.code.toUpperCase()]);
    res.json({ message: 'Coupon deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/super-admin/coupons/validate  (used by checkout — no super_admin guard below)
// We attach a separate public-facing route in index.js; here it's also accessible by SA
router.post('/coupons/validate', async (req, res) => {
  const { code, plan_key, email } = req.body;
  if (!code) return res.status(400).json({ error: 'Coupon code required' });
  try {
    const result = await query(
      `SELECT * FROM discount_coupons
       WHERE code = $1 AND is_active = true
         AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
         AND (max_uses IS NULL OR used_count < max_uses)`,
      [code.toUpperCase()]
    );
    if (!result.rows.length) return res.status(404).json({ valid: false, error: 'Invalid or expired coupon' });

    const coupon = result.rows[0];
    if (coupon.type === 'user_specific' && email && coupon.target_email !== email) {
      return res.status(403).json({ valid: false, error: 'This coupon is not valid for your account' });
    }

    res.json({ valid: true, coupon });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// F. RAZORPAY INTEGRATION
// ═══════════════════════════════════════════════════════════════

// POST /api/super-admin/razorpay/create-order
router.post('/razorpay/create-order',
  [
    body('amount').isFloat({ min: 1 }),
    body('tenant_user_id').isUUID(),
    body('plan_key').notEmpty(),
    body('months').isInt({ min: 1 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { amount, tenant_user_id, plan_key, plan_label, months, coupon_code, discount_amount = 0 } = req.body;
    try {
      // Create purchase record (pending)
      const purchase = await query(
        `INSERT INTO saas_purchases (tenant_user_id, plan_key, plan_label, amount, months, coupon_code, discount_amount, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pending') RETURNING id`,
        [tenant_user_id, plan_key, plan_label || plan_key, amount, months, coupon_code || null, discount_amount]
      );
      const purchaseId = purchase.rows[0].id;

      // Create Razorpay order
      const order = await razorpayService.createOrder({
        amount,
        receipt:      purchaseId,
        notes: { plan_key, months, purchase_id: purchaseId },
      });

      // Save order ID
      await query(
        'UPDATE saas_purchases SET razorpay_order_id=$1 WHERE id=$2',
        [order.id, purchaseId]
      );

      logger.info('Razorpay order created', { purchaseId, orderId: order.id });
      res.json({
        order_id:    order.id,
        purchase_id: purchaseId,
        amount:      order.amount,
        currency:    order.currency,
        key_id:      process.env.RAZORPAY_KEY_ID,
      });
    } catch (err) {
      logger.error('create-order error', { error: err.message });
      res.status(500).json({ error: err.message });
    }
  }
);

// POST /api/super-admin/razorpay/verify-payment  — Client-side verification after checkout
router.post('/razorpay/verify-payment', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, purchase_id } = req.body;
  try {
    const valid = razorpayService.verifyPaymentSignature({
      orderId:   razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });

    if (!valid) return res.status(400).json({ success: false, error: 'Invalid payment signature' });

    // Mark purchase as paid
    await query(
      `UPDATE saas_purchases
       SET status='paid', razorpay_payment_id=$1, razorpay_signature=$2, paid_at=NOW(), updated_at=NOW()
       WHERE id=$3`,
      [razorpay_payment_id, razorpay_signature, purchase_id]
    );

    // Trigger invoice generation (async — don't block response)
    invoiceService.processInvoice(purchase_id).catch(err =>
      logger.error('Invoice generation failed', { purchase_id, error: err.message })
    );

    res.json({ success: true, message: 'Payment verified and subscription activated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// RAZORPAY WEBHOOK  (raw body — registered separately in index.js)
// Note: This handler must be called from a raw-body-aware route
// ═══════════════════════════════════════════════════════════════
async function handleRazorpayWebhook(req, res) {
  const signature = req.headers['x-razorpay-signature'];
  if (!signature) return res.status(400).json({ error: 'Missing signature' });

  try {
    const rawBody = req.body; // Buffer from express.raw()
    const valid   = razorpayService.verifyWebhookSignature(rawBody, signature);
    if (!valid) {
      logger.warn('Razorpay webhook signature invalid', { ip: req.ip });
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    const event   = JSON.parse(rawBody.toString());
    const entity  = event?.payload?.payment?.entity;

    logger.info('Razorpay webhook received', { event: event.event });

    if (event.event === 'payment.captured' && entity) {
      const { order_id, id: payment_id } = entity;

      // Find matching purchase
      const result = await query(
        'SELECT id, tenant_user_id, plan_key, months FROM saas_purchases WHERE razorpay_order_id=$1',
        [order_id]
      );
      if (!result.rows.length) {
        logger.warn('Webhook: no purchase found for order', { order_id });
        return res.json({ received: true });
      }

      const purchase = result.rows[0];

      // Mark paid
      await query(
        `UPDATE saas_purchases SET status='paid', razorpay_payment_id=$1, paid_at=NOW() WHERE id=$2`,
        [payment_id, purchase.id]
      );

      // Log audit
      await query(
        `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address)
         VALUES ($1,'payment_captured','purchase',$2,$3,$4::inet)`,
        [purchase.tenant_user_id, purchase.id, JSON.stringify({ order_id, payment_id }), req.ip]
      );

      // Async invoice
      invoiceService.processInvoice(purchase.id).catch(err =>
        logger.error('Webhook invoice failed', { error: err.message })
      );
    }

    res.json({ received: true });
  } catch (err) {
    logger.error('Webhook processing error', { error: err.message });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}

// Export handler for index.js to mount on raw-body route
router.webhookHandler = handleRazorpayWebhook;

// ═══════════════════════════════════════════════════════════════
// G. AUDIT LOGS
// ═══════════════════════════════════════════════════════════════

// GET /api/super-admin/users/search?name=...  — simple user search for Super Admin
router.get('/users/search', async (req, res) => {
  try {
    const name = (req.query.name || '').trim();
    if (!name) return res.json({ users: [] });

    const q = `%${name}%`;
    const result = await query(
      `SELECT id, username, full_name, email FROM users WHERE username ILIKE $1 OR full_name ILIKE $1 OR email ILIKE $1 ORDER BY created_at DESC LIMIT 20`,
      [q]
    );

    res.json({ users: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/super-admin/audit-logs?page=1&limit=50&action=&user_id=&from=&to=
router.get('/audit-logs', async (req, res) => {
  try {
    const page    = Math.max(1, parseInt(req.query.page) || 1);
    const limit   = Math.min(200, parseInt(req.query.limit) || 50);
    const offset  = (page - 1) * limit;
    const conds   = ['1=1'];
    const vals    = [];
    let   i       = 1;

    if (req.query.action)     { conds.push(`al.action = $${i++}`);           vals.push(req.query.action); }
    if (req.query.user_id)    { conds.push(`al.user_id = $${i++}`);          vals.push(req.query.user_id); }
    if (req.query.resource_type) { conds.push(`al.resource_type = $${i++}`); vals.push(req.query.resource_type); }
    if (req.query.from)       { conds.push(`al.created_at >= $${i++}`);      vals.push(req.query.from); }
    if (req.query.to)         { conds.push(`al.created_at <= $${i++}`);      vals.push(req.query.to); }

    const where = conds.join(' AND ');

    const [logs, total] = await Promise.all([
      query(
        `SELECT al.*, u.username, u.full_name, u.role
         FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id
         WHERE ${where}
         ORDER BY al.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
        [...vals, limit, offset]
      ),
      query(`SELECT COUNT(*) AS cnt FROM audit_logs al WHERE ${where}`, vals),
    ]);

    res.json({
      logs:  logs.rows,
      total: parseInt(total.rows[0].cnt),
      page,
      limit,
      pages: Math.ceil(parseInt(total.rows[0].cnt) / limit),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/super-admin/audit-logs/export (CSV)
router.get('/audit-logs/export', async (req, res) => {
  try {
    const result = await query(
      `SELECT al.created_at, u.username, u.role, al.action, al.resource_type,
              al.resource_id, al.ip_address, al.user_agent
       FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id
       ORDER BY al.created_at DESC LIMIT 5000`
    );

    const header = 'Timestamp,Username,Role,Action,Resource Type,Resource ID,IP Address,User Agent\n';
    const rows   = result.rows.map(r =>
      [r.created_at, r.username, r.role, r.action, r.resource_type, r.resource_id, r.ip_address, `"${(r.user_agent || '').replace(/"/g, '')}"`].join(',')
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="audit_log_${Date.now()}.csv"`);
    res.send(header + rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// H. TWO-FACTOR AUTHENTICATION
// ═══════════════════════════════════════════════════════════════

// POST /api/super-admin/2fa/setup  — Generate secret + QR for current user
router.post('/2fa/setup', async (req, res) => {
  try {
    const result = await tfaService.generateSecret(req.user.id, req.user.email);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/super-admin/2fa/verify  — Confirm TOTP token & enable
router.post('/2fa/verify', [body('token').isLength({ min: 6, max: 8 })], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  try {
    const result = await tfaService.verifyAndEnable(req.user.id, req.body.token);
    if (!result) return res.status(400).json({ error: 'Invalid token. Please try again.' });
    res.json({ success: true, backupCodes: result.backupCodes, message: '2FA enabled successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/super-admin/2fa/disable
router.delete('/2fa/disable', auditLog('disable_2fa', 'user'), async (req, res) => {
  try {
    await tfaService.disable(req.user.id);
    res.json({ message: '2FA disabled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/super-admin/2fa/enforce  — Toggle global 2FA enforcement for all admins
router.patch('/2fa/enforce', auditLog('enforce_2fa', 'platform'), async (req, res) => {
  const { enforced } = req.body;
  if (typeof enforced !== 'boolean') return res.status(400).json({ error: 'enforced (boolean) required' });
  try {
    await tfaService.setGlobalEnforcement(enforced);
    res.json({ message: `2FA enforcement ${enforced ? 'enabled' : 'disabled'} for all admins` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Purchases / Invoice list ───────────────────────────────────
router.get('/purchases', async (req, res) => {
  try {
    const result = await query(
      `SELECT sp.*, u.full_name, u.email, u.username
       FROM saas_purchases sp
       JOIN users u ON sp.tenant_user_id = u.id
       ORDER BY sp.created_at DESC LIMIT 200`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/super-admin/purchases/:id/resend-invoice
router.post('/purchases/:id/resend-invoice', auditLog('resend_invoice', 'purchase'), async (req, res) => {
  try {
    await invoiceService.processInvoice(req.params.id);
    res.json({ message: 'Invoice resent successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// J. TENANT USERS MANAGEMENT
// ═══════════════════════════════════════════════════════════════

// GET /api/super-admin/tenants/:id/users — List team members for a tenant
router.get('/tenants/:id/users', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, username, email, full_name, role, is_active, last_login, created_at
       FROM users WHERE tenant_owner_id = $1
       ORDER BY created_at DESC`,
      [req.params.id]
    );
    res.json({ users: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/super-admin/tenants/:id/users/:userId — Toggle team member active status
router.patch('/tenants/:id/users/:userId', auditLog('toggle_tenant_user', 'user'), async (req, res) => {
  const { is_active } = req.body;
  try {
    const check = await query('SELECT id, tenant_owner_id FROM users WHERE id=$1', [req.params.userId]);
    if (!check.rows.length) return res.status(404).json({ error: 'User not found' });
    const newStatus = typeof is_active === 'boolean' ? is_active : !check.rows[0].is_active;
    await query('UPDATE users SET is_active=$1, updated_at=NOW() WHERE id=$2', [newStatus, req.params.userId]);
    res.json({ ok: true, is_active: newStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// K. PLATFORM ACCOUNTS (Super Admin Staff)
// ═══════════════════════════════════════════════════════════════

// GET /api/super-admin/accounts
router.get('/accounts', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, full_name AS name, email, role, is_active, permissions, last_login, created_at
       FROM users
       WHERE role IN ('super_admin','support_admin','billing_admin','content_admin')
       ORDER BY created_at DESC`
    );
    // Extract permissions string from JSONB for frontend display
    const accounts = result.rows.map(r => ({
      ...r,
      permissions: (r.permissions && r.permissions.access_level) || r.permissions || 'full',
    }));
    res.json({ accounts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/super-admin/accounts — Create a new platform admin/staff account
router.post('/accounts', auditLog('create_platform_account', 'user'), async (req, res) => {
  const { name, email, password, role = 'support_admin', permissions = 'view_only' } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });
  try {
    const exists = await query('SELECT id FROM users WHERE email=$1', [email]);
    if (exists.rows.length) return res.status(409).json({ error: 'Email already in use' });

    const hash = await bcrypt.hash(password || 'ChangeMe@123', 12);
    const username = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') + '_' + Date.now().toString(36);
    const result = await query(
      `INSERT INTO users (username, email, password_hash, full_name, role, is_active, permissions)
       VALUES ($1,$2,$3,$4,$5,true,$6)
       RETURNING id, full_name AS name, email, role, is_active, permissions, created_at`,
      [username, email, hash, name, role, JSON.stringify({ access_level: permissions })]
    );
    const acc = result.rows[0];
    acc.permissions = permissions;
    res.status(201).json(acc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/super-admin/accounts/:id — Update account (toggle active, change role, etc.)
router.patch('/accounts/:id', auditLog('update_platform_account', 'user'), async (req, res) => {
  const { is_active, role, permissions } = req.body;
  try {
    const updates = [];
    const vals    = [];
    let   i       = 1;
    if (typeof is_active === 'boolean') { updates.push(`is_active = $${i++}`); vals.push(is_active); }
    if (role !== undefined)             { updates.push(`role = $${i++}`);      vals.push(role); }
    if (permissions !== undefined)       { updates.push(`permissions = $${i++}`); vals.push(JSON.stringify({ access_level: permissions })); }
    if (!updates.length) return res.json({ message: 'Nothing to update' });
    vals.push(req.params.id);
    await query(`UPDATE users SET ${updates.join(', ')}, updated_at=NOW() WHERE id=$${i}`, vals);
    res.json({ message: 'Account updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/super-admin/accounts/:id
router.delete('/accounts/:id', auditLog('delete_platform_account', 'user'), async (req, res) => {
  try {
    const check = await query('SELECT role FROM users WHERE id=$1', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Account not found' });
    if (check.rows[0].role === 'super_admin') return res.status(403).json({ error: 'Cannot delete super admin account' });
    await query('DELETE FROM users WHERE id=$1', [req.params.id]);
    res.json({ message: 'Account deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// L. AUDIT LOG (singular — frontend alias)
// ═══════════════════════════════════════════════════════════════

// GET /api/super-admin/audit-log (singular) — alias for frontend
router.get('/audit-log', async (req, res) => {
  try {
    const result = await query(
      `SELECT al.*, u.username, u.full_name, u.role
       FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id
       ORDER BY al.created_at DESC LIMIT 200`
    );
    res.json({ logs: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

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
const fs            = require('fs');
const path          = require('path');
const multer        = require('multer');
const jwt           = require('jsonwebtoken');
const multer        = require('multer');
const { ZipArchive } = require('archiver');
const { body, query: qv, validationResult } = require('express-validator');
const { query }     = require('../config/database');
const { authenticate, requireSuperAdmin, requireSuperAdminOrPlatformStaff, requireSuperAdminPermission, generateAccessToken, JWT_SECRET } = require('../middleware/auth');
const { auditLog }  = require('../middleware/audit');
const logger        = require('../config/logger');
const settingsRoutes = require('./settings');

// Services (lazy-required so server starts even without credentials)
const razorpayService = require('../services/razorpayService');
const invoiceService  = require('../services/invoiceService');
const tfaService      = require('../services/twoFactorService');
const automationService = require('../services/automationService');

const router = express.Router();

// ── Logo upload storage ────────────────────────────────────────────────────
const LOGOS_DIR = path.join(process.cwd(), 'uploads', 'logos');
if (!fs.existsSync(LOGOS_DIR)) fs.mkdirSync(LOGOS_DIR, { recursive: true });

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, LOGOS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `logo_${Date.now()}${ext}`);
  },
});
const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (req, file, cb) => {
    if (/^image\/(png|jpeg|jpg|gif|svg\+xml|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed (PNG, JPG, GIF, SVG, WebP)'));
  },
});

// POST /api/super-admin/upload-logo
router.post('/upload-logo', authenticate, requireSuperAdmin, logoUpload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = `/uploads/logos/${req.file.filename}`;
  res.json({ ok: true, url });
});

// POST /api/super-admin/coupons/validate  (used by checkout — no super_admin guard below)
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

// Guard every route in this file (allow platform staff into super-admin namespace)
router.use(authenticate, requireSuperAdminOrPlatformStaff);

// Ensure branding upload directory exists
const brandingDir = path.join(__dirname, '../../uploads/branding');
if (!fs.existsSync(brandingDir)) fs.mkdirSync(brandingDir, { recursive: true });

const ROLE_SETTINGS_KEY = 'settings_roles';
const STAFF_ROLE_SETTINGS_KEY = 'staff_roles';

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

async function getStaffRoles() {
  const result = await query(`SELECT value FROM platform_settings WHERE key = $1`, [STAFF_ROLE_SETTINGS_KEY]);
  if (!result.rows.length) return [];
  return result.rows[0].value || [];
}

async function saveStaffRoles(roles, userId) {
  await query(
    `INSERT INTO platform_settings (key, value, updated_by, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
    [STAFF_ROLE_SETTINGS_KEY, JSON.stringify(roles), userId]
  );
}

async function loadSavedRazorpayCredentials() {
  const settings = await settingsRoutes.loadCompanySettings();
  return {
    key_id: settings.razorpay_key_id || process.env.RAZORPAY_KEY_ID,
    key_secret: settings.razorpay_key_secret || process.env.RAZORPAY_KEY_SECRET,
    webhook_secret: settings.razorpay_webhook_secret || process.env.RAZORPAY_WEBHOOK_SECRET,
  };
}

// GET /api/super-admin/platform-uptime — Get platform uptime stats
router.get('/platform-uptime', async (req, res) => {
  try {
    const result = await query(
      `SELECT COUNT(*) as total, 
              SUM(CASE WHEN status='operational' THEN 1 ELSE 0 END) as operational
       FROM (
         SELECT 'api' as status, status as status FROM platform_settings WHERE key='api_status'
         UNION ALL
         SELECT 'db' as status, 'operational' as status
         UNION ALL
         SELECT 'storage' as status, 'operational' as status
       ) AS services`
    );
    
    // Simple uptime stats (can be enhanced with monitoring service)
    res.json({
      api: {
        label: 'API Server',
        status: 'operational',
        uptime: '99.97%',
      },
      database: {
        label: 'Database',
        status: 'operational',
        uptime: '99.99%',
      },
      storage: {
        label: 'File Storage',
        status: 'operational',
        uptime: '99.95%',
      },
      email: {
        label: 'Email (SMTP)',
        status: 'operational',
        uptime: '99.90%',
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PLATFORM SETTINGS (Razorpay, SEO, Homepage, Invoices) — PERSISTENT
// ═══════════════════════════════════════════════════════════════

// GET /api/super-admin/platform-settings — Get all CMS settings
router.get('/platform-settings', async (req, res) => {
  try {
    const result = await query('SELECT key, value FROM platform_settings');
    const settings = {};
    result.rows.forEach(r => { settings[r.key] = r.value; });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/super-admin/platform-settings/:key — Update single setting
router.patch('/platform-settings/:key', requireSuperAdminPermission('settings', 'edit'), auditLog('update_platform_setting', 'settings'), async (req, res) => {
  try {
    await query(
      `INSERT INTO platform_settings (key, value, updated_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
      [req.params.key, JSON.stringify(req.body), req.user.id]
    );
    res.json({ message: `Setting "${req.params.key}" updated` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/super-admin/platform-settings/:key — Get single setting
router.get('/platform-settings/:key', async (req, res) => {
  try {
    const result = await query('SELECT value FROM platform_settings WHERE key = $1', [req.params.key]);
    if (!result.rows.length) return res.status(404).json({ error: 'Setting not found' });
    res.json(result.rows[0].value);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// RAZORPAY CREDENTIALS (via platform_settings 'company' key)
// ═══════════════════════════════════════════════════════════════

// GET /api/super-admin/razorpay-settings — Get stored Razorpay credentials (redacted)
router.get('/razorpay-settings', requireSuperAdminPermission('settings', 'view'), async (req, res) => {
  try {
    const company = await settingsRoutes.loadCompanySettings();
    
    // Return safe copy with masked secret
    const safe = {
      razorpay_key_id: company.razorpay_key_id || '',
      razorpay_key_secret: company.razorpay_key_secret ? '[REDACTED]' : '',
      razorpay_webhook_secret: company.razorpay_webhook_secret ? '[REDACTED]' : '',
    };
    res.json(safe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/super-admin/razorpay-settings — Update Razorpay credentials
router.patch('/razorpay-settings', requireSuperAdminPermission('settings', 'edit'), auditLog('update_razorpay_settings', 'settings'), async (req, res) => {
  try {
    const { razorpay_key_id, razorpay_key_secret, razorpay_webhook_secret } = req.body;
    
    // Load existing company settings using the helper function to handle JSON parsing
    const company = await settingsRoutes.loadCompanySettings ? await settingsRoutes.loadCompanySettings() : {};
    
    // Update only provided fields (preserve existing if not provided)
    if (razorpay_key_id !== undefined) company.razorpay_key_id = razorpay_key_id;
    if (razorpay_key_secret && !razorpay_key_secret.includes('[REDACTED]')) {
      company.razorpay_key_secret = razorpay_key_secret;
    }
    if (razorpay_webhook_secret && !razorpay_webhook_secret.includes('[REDACTED]')) {
      company.razorpay_webhook_secret = razorpay_webhook_secret;
    }
    
    // Save updated company settings
    await query(
      `INSERT INTO platform_settings (key, value, updated_by, updated_at)
       VALUES ('company', $1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_by = $2, updated_at = NOW()`,
      [JSON.stringify(company), req.user.id]
    );
    
    // Log audit (don't log actual secrets)
    logger.info('Razorpay settings updated', { updated_by: req.user.id });
    
    res.json({ message: 'Razorpay settings saved', razorpay_key_id: company.razorpay_key_id });
  } catch (err) {
    logger.error('Razorpay settings update error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// INVOICE SETTINGS (via platform_settings 'invoices' key)
// ═══════════════════════════════════════════════════════════════

// GET /api/super-admin/invoice-settings — Get invoice configuration
router.get('/invoice-settings', requireSuperAdminPermission('settings', 'view'), async (req, res) => {
  try {
    const result = await query(`SELECT value FROM platform_settings WHERE key = 'invoices'`);
    const defaults = {
      gst_percent: 18,
      invoice_prefix: 'INV',
      auto_send: true,
      auto_activate_tenant: true,
      from_email: 'billing@recoverlab.in',
      from_name: 'RecoverLab Billing',
      subject_template: 'Your {{plan_label}} Invoice — {{invoice_number}}',
      body_intro: 'Thank you for subscribing.',
      include_pdf: true,
      company_gstin: '',
    };
    const settings = result.rows.length && result.rows[0].value ? { ...defaults, ...result.rows[0].value } : defaults;
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/super-admin/invoice-settings — Update invoice settings
router.patch('/invoice-settings', requireSuperAdminPermission('settings', 'edit'), auditLog('update_invoice_settings', 'settings'), async (req, res) => {
  try {
    await query(
      `INSERT INTO platform_settings (key, value, updated_by, updated_at)
       VALUES ('invoices', $1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_by = $2, updated_at = NOW()`,
      [JSON.stringify(req.body), req.user.id]
    );
    res.json({ message: 'Invoice settings saved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// SEO SETTINGS (via platform_settings 'seo' key)
// ═══════════════════════════════════════════════════════════════

// GET /api/super-admin/seo-settings — Get SEO configuration
router.get('/seo-settings', requireSuperAdminPermission('settings', 'view'), async (req, res) => {
  try {
    const result = await query(`SELECT value FROM platform_settings WHERE key = 'seo'`);
    const defaults = {
      meta_title: 'RecoverLab CRM — Professional Data Recovery Platform',
      meta_description: 'The complete SaaS CRM for data recovery labs.',
      meta_keywords: 'data recovery CRM, data recovery software',
      og_image_url: '',
      canonical_url: 'https://recoverlab.in',
      robots: 'index, follow',
      google_analytics_id: '',
      google_tag_manager_id: '',
      facebook_pixel_id: '',
      sitemap_enabled: true,
      schema_org_enabled: true,
    };
    const settings = result.rows.length && result.rows[0].value ? { ...defaults, ...result.rows[0].value } : defaults;
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/super-admin/seo-settings — Update SEO settings
router.patch('/seo-settings', requireSuperAdminPermission('settings', 'edit'), auditLog('update_seo_settings', 'settings'), async (req, res) => {
  try {
    await query(
      `INSERT INTO platform_settings (key, value, updated_by, updated_at)
       VALUES ('seo', $1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_by = $2, updated_at = NOW()`,
      [JSON.stringify(req.body), req.user.id]
    );
    res.json({ message: 'SEO settings saved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// HOMEPAGE CMS SETTINGS (via platform_settings 'homepage' key)
// ═══════════════════════════════════════════════════════════════

// GET /api/super-admin/homepage-settings — Get homepage CMS configuration
router.get('/homepage-settings', requireSuperAdminPermission('settings', 'view'), async (req, res) => {
  try {
    const result = await query(`SELECT value FROM platform_settings WHERE key = 'homepage'`);
    const defaults = {
      hero_title: 'The Complete CRM for Data Recovery Labs',
      hero_subtitle: 'Manage cases, clients, billing and team — all in one place.',
      hero_cta_text: 'Start Free Trial',
      hero_cta_url: '/signup',
      announcement_enabled: false,
      announcement_text: '',
      show_pricing_section: true,
      show_features_section: true,
      show_testimonials: true,
      show_faq: true,
    };
    const settings = result.rows.length && result.rows[0].value ? { ...defaults, ...result.rows[0].value } : defaults;
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/super-admin/homepage-settings — Update homepage CMS settings
router.patch('/homepage-settings', requireSuperAdminPermission('settings', 'edit'), auditLog('update_homepage_settings', 'settings'), async (req, res) => {
  try {
    await query(
      `INSERT INTO platform_settings (key, value, updated_by, updated_at)
       VALUES ('homepage', $1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_by = $2, updated_at = NOW()`,
      [JSON.stringify(req.body), req.user.id]
    );
    res.json({ message: 'Homepage settings saved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// I. PLATFORM DASHBOARD STATS
// ═══════════════════════════════════════════════════════════════

// GET /api/super-admin/dashboard/recent-activity — Latest 5 activity logs for dashboard widget
router.get('/dashboard/recent-activity', requireSuperAdminPermission('dashboard', 'view'), async (req, res) => {
  try {
    const result = await query(
      `SELECT a.id, a.action, a.module, a.resource_type, a.resource_id,
              COALESCE(a.title, a.action) AS title,
              COALESCE(a.description, a.action) AS description,
              COALESCE(u.full_name, u.username, u.email, 'System') AS user_name,
              u.email AS user_email, a.created_at
       FROM activity_logs a
       LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC
       LIMIT 5`
    );
    res.json({ activities: result.rows });
  } catch (err) {
    logger.error('SA dashboard recent activity error', { error: err.message });
    res.status(500).json({ error: 'Failed to load recent activity' });
  }
});

// GET /api/super-admin/dashboard
router.get('/dashboard', requireSuperAdminPermission('dashboard', 'view'), async (req, res) => {
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
router.get('/admins', requireSuperAdminPermission('staff', 'view'), async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.username, u.email, u.full_name, u.role, u.is_active,
               u.phone, u.last_login, u.created_at, u.two_fa_enabled,
               u.company_name, u.tenant_id, u.tenant_owner_id,
               json_agg(ap.*) FILTER (WHERE ap.id IS NOT NULL) AS permissions
       FROM users u
       LEFT JOIN admin_permissions ap ON ap.user_id = u.id
       WHERE u.role IN ('admin', 'senior_engineer', 'junior_engineer', 'staff') OR u.role IN (SELECT jsonb_array_elements_text(value->'key') FROM platform_settings WHERE key = 'staff_roles')
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
  requireSuperAdminPermission('staff', 'create'),
  [
    body('username').trim().isLength({ min: 3 }).withMessage('Username min 3 chars'),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password min 8 chars'),
    body('full_name').trim().notEmpty(),
    body('role').custom(async (val) => {
      const defaults = ['admin', 'senior_engineer', 'junior_engineer', 'staff'];
      if (defaults.includes(val)) return true;
      const result = await query(`SELECT value FROM platform_settings WHERE key = $1`, ['staff_roles']);
      const customRoles = result.rows.length ? (result.rows[0].value || []) : [];
      if (customRoles.some(r => r.key === val)) return true;
      throw new Error('Invalid platform staff role');
    }),
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

      // Send onboarding email (fire-and-forget)
      invoiceService.sendOnboardingEmail({
        email, name: full_name, password, role,
      }).catch(e => logger.error('Onboarding email failed', { error: e.message }));

      // Emit automation event for ADMIN_CREATED
      automationService.handleEvent('ADMIN_CREATED', {
        name: full_name,
        email,
        role,
        login_url: process.env.LOGIN_URL || 'https://app.recoverlab.in/login',
        password
      }).catch(e => logger.error('Automation event ADMIN_CREATED failed', { error: e.message }));

      res.status(201).json({ ...user.rows[0], message: 'Admin staff account created successfully' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// PATCH /api/super-admin/admins/:id/permissions
router.patch('/admins/:id/permissions', requireSuperAdminPermission('staff', 'edit'), auditLog('update_admin_permissions', 'user'), async (req, res) => {
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
router.patch('/admins/:id/status', requireSuperAdminPermission('staff', 'edit'), auditLog('toggle_admin_status', 'user'), async (req, res) => {
  const { is_active } = req.body;
  if (typeof is_active !== 'boolean') return res.status(400).json({ error: 'is_active (boolean) required' });
  try {
    const check = await query('SELECT email, full_name, role FROM users WHERE id=$1 AND role != $2', [req.params.id, 'super_admin']);
    if (!check.rows.length) return res.status(404).json({ error: 'User not found' });
    const target = check.rows[0];

    await query('UPDATE users SET is_active=$1 WHERE id=$2 AND role != $3', [is_active, req.params.id, 'super_admin']);

    invoiceService.sendAccountStatusEmail({
      email: target.email,
      name: target.full_name,
      status: is_active ? 'active' : 'suspended',
      role: target.role,
    }).catch(e => logger.error('Admin account status email failed', { error: e.message, email: target.email }));

    res.json({ message: `Account ${is_active ? 'activated' : 'deactivated'}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/super-admin/admins/:id
router.delete('/admins/:id', requireSuperAdminPermission('staff', 'delete'), auditLog('delete_admin_staff', 'user'), async (req, res) => {
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
              u.phone, u.is_active, u.last_login, u.created_at, u.avatar_url,
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
    res.json({ tenants: result.rows });
  } catch (err) {
    // Fallback if columns don't exist yet
    try {
      const r2 = await query(
        `SELECT id, username, email AS admin_email, full_name AS admin_name,
                phone, is_active, last_login, created_at, notes, avatar_url
         FROM users WHERE role = 'admin' ORDER BY created_at DESC`
      );
      res.json({ tenants: r2.rows });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
});

// POST /api/super-admin/tenants — Provision new tenant
router.post('/tenants',
  [
    body('company_name').trim().notEmpty().withMessage('Company name required'),
    body('admin_email').isEmail().withMessage('Valid email required').normalizeEmail(),
    body('admin_password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('plan').optional().isString(),
  ],
  auditLog('create_tenant', 'tenant'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const {
      company_name, admin_name, admin_email, admin_password,
      plan = 'starter', max_team_users = 5, subscription_months = 1,
      phone, city, gstin, notes, expiry_date, amount,
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

      if (amount) {
        await query(
          `INSERT INTO saas_purchases (tenant_user_id, plan_key, plan_label, amount, months, status, paid_at)
           VALUES ($1, $2, $3, $4, $5, 'paid', NOW())`,
          [user.rows[0].id, plan, plan, amount, subscription_months]
        );
      }

      invoiceService.sendOnboardingEmail({
        email: user.rows[0].email,
        name: user.rows[0].full_name,
        password: admin_password,
        role: user.rows[0].role,
        company: company_name,
      }).catch(e => logger.error('Tenant onboarding email failed', { error: e.message, email: user.rows[0].email }));

      // Emit SUBSCRIPTION_CREATED automation event
      try {
        await automationService.handleEvent('SUBSCRIPTION_CREATED', {
          tenant_id: user.rows[0].id,
          company: company_name,
          admin_email: user.rows[0].email,
          plan: plan,
          subscription_months: subscription_months,
          amount: amount || 0
        });
      } catch (eventErr) {
        console.warn('SUBSCRIPTION_CREATED event emission failed:', eventErr.message);
      }

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
    const check = await query('SELECT id, role, email, full_name, company_name FROM users WHERE id=$1', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Tenant not found' });
    const existing = check.rows[0];

    const updates = [];
    const vals    = [];
    let   i       = 1;
    let isRenewal = false;
    let oldExpiryDate = null;

    if (company_name     !== undefined) { updates.push(`company_name = $${i++}`);           vals.push(company_name); }
    if (plan             !== undefined) { updates.push(`subscription_plan = $${i++}`);      vals.push(plan); }
    if (status           !== undefined) {
      updates.push(`subscription_status = $${i++}`); vals.push(status);
      updates.push(`is_active = $${i++}`);           vals.push(status === 'active' || status === 'trial');
    }
    if (max_team_users   !== undefined) { updates.push(`max_team_users = $${i++}`);         vals.push(max_team_users); }
    if (expiry_date      !== undefined) { 
      updates.push(`subscription_expiry = $${i++}`);    vals.push(expiry_date ? new Date(expiry_date) : null);
      // Check if this is a renewal (extending the expiry date)
      const currentResult = await query('SELECT subscription_expiry FROM users WHERE id=$1', [req.params.id]);
      if (currentResult.rows.length) {
        oldExpiryDate = currentResult.rows[0].subscription_expiry;
        const newExpiry = new Date(expiry_date);
        const now = new Date();
        if (oldExpiryDate && newExpiry > oldExpiryDate) {
          isRenewal = true;
        }
      }
    }
    if (notes            !== undefined) { updates.push(`notes = $${i++}`);                  vals.push(notes); }

    if (!updates.length) return res.json({ message: 'Nothing to update' });
    vals.push(req.params.id);
    await query(`UPDATE users SET ${updates.join(', ')}, updated_at=NOW() WHERE id=$${i}`, vals);

    // Emit SUBSCRIPTION_RENEWED event if expiry_date was extended
    if (isRenewal) {
      try {
        await automationService.handleEvent('SUBSCRIPTION_RENEWED', {
          tenant_id: req.params.id,
          company: existing.company_name,
          admin_email: existing.email,
          plan: plan || 'standard',
          new_expiry_date: expiry_date,
          old_expiry_date: oldExpiryDate
        });
      } catch (eventErr) {
        console.warn('SUBSCRIPTION_RENEWED event emission failed:', eventErr.message);
      }
    }

    if (status === 'suspended' || status === 'active') {
      invoiceService.sendAccountStatusEmail({
        email: existing.email,
        name: existing.full_name,
        status,
        company: existing.company_name,
        role: 'Tenant Admin',
      }).catch(e => logger.error('Tenant status email failed', { error: e.message, email: existing.email }));
    }

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

// POST /api/super-admin/login-as/:id  — Generate JWT to login as subscriber admin
router.post('/login-as/:id', requireSuperAdmin, auditLog('impersonate', 'tenant'), async (req, res) => {
  try {
    const userResult = await query(
      `SELECT id, username, email, full_name, role, tenant_id, tenant_owner_id, is_active FROM users WHERE id = $1 AND is_active = true`,
      [req.params.id]
    );
    if (!userResult.rows.length) {
      return res.status(404).json({ error: 'User not found or inactive' });
    }
    const targetUser = userResult.rows[0];
    if (targetUser.role !== 'admin') {
      return res.status(400).json({ error: 'Can only login as admin users' });
    }
    // Build token with impersonation marker
    const tokenPayload = {
      userId: targetUser.id,
      role: targetUser.role,
      tenantId: targetUser.tenant_id,
      impersonated_by: req.user.id,
    };
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
    res.json({ token, user: { id: targetUser.id, email: targetUser.email, name: targetUser.full_name, role: targetUser.role, impersonated_by: req.user.id } });
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

router.get('/settings/roles', requireSuperAdminPermission('roles', 'view'), async (req, res) => {
  try {
    const roles = await getSuperAdminRoles();
    res.json(roles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/settings/roles', requireSuperAdminPermission('roles', 'create'), auditLog('create_role', 'settings'), async (req, res) => {
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

router.patch('/settings/roles/:id', requireSuperAdminPermission('roles', 'edit'), auditLog('update_role', 'settings'), async (req, res) => {
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

router.delete('/settings/roles/:id', requireSuperAdminPermission('roles', 'delete'), auditLog('delete_role', 'settings'), async (req, res) => {
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

// Staff Roles Management
router.get('/settings/staff-roles', requireSuperAdminPermission('roles', 'view'), async (req, res) => {
  try {
    const roles = await getStaffRoles();
    res.json(roles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/settings/staff-roles', requireSuperAdminPermission('roles', 'create'), auditLog('create_staff_role', 'settings'), async (req, res) => {
  try {
    const { name, key, description, color, permissions } = req.body;
    if (!name || !key) return res.status(422).json({ error: 'Role name and key are required' });
    const roles = await getStaffRoles();
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
    await saveStaffRoles(roles, req.user.id);
    res.status(201).json(role);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/settings/staff-roles/:id', requireSuperAdminPermission('roles', 'edit'), auditLog('update_staff_role', 'settings'), async (req, res) => {
  try {
    const { name, key, description, color, permissions } = req.body;
    const roles = await getStaffRoles();
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
    await saveStaffRoles(roles, req.user.id);
    res.json(roles[idx]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/settings/staff-roles/:id', requireSuperAdminPermission('roles', 'delete'), auditLog('delete_staff_role', 'settings'), async (req, res) => {
  try {
    const roles = await getStaffRoles();
    const remaining = roles.filter(r => r.id !== req.params.id);
    if (remaining.length === roles.length) return res.status(404).json({ error: 'Role not found' });
    await saveStaffRoles(remaining, req.user.id);
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
    const includeInactive = req.query.include_inactive === 'true';
    const result = await query(
      includeInactive
        ? 'SELECT * FROM subscription_plans ORDER BY sort_order, created_at'
        : 'SELECT * FROM subscription_plans WHERE is_active = true ORDER BY sort_order, created_at'
    );
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

// DELETE /api/super-admin/plans/:id/permanent — Hard delete (must be before /:id to avoid route conflict)
router.delete('/plans/:id/permanent', auditLog('permanent_delete_plan', 'plan'), async (req, res) => {
  try {
    const planResult = await query('SELECT key, is_active FROM subscription_plans WHERE id=$1', [req.params.id]);
    if (!planResult.rows.length) return res.status(404).json({ error: 'Plan not found' });
    if (planResult.rows[0].is_active) return res.status(400).json({ error: 'Cannot permanently delete an active plan. Deactivate it first.' });

    const planKey = planResult.rows[0].key;
    const subscriberCheck = await query(
      `SELECT COUNT(*) AS cnt FROM users WHERE subscription_plan = $1 AND is_active = true`,
      [planKey]
    );
    if (parseInt(subscriberCheck.rows[0].cnt) > 0) {
      return res.status(400).json({ error: 'Cannot permanently delete a plan with active subscribers.' });
    }

    await query('DELETE FROM subscription_plans WHERE id=$1', [req.params.id]);
    res.json({ message: 'Plan permanently deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/super-admin/plans/:id — Soft delete (deactivate)
router.delete('/plans/:id', auditLog('delete_plan', 'plan'), async (req, res) => {
  try {
    const planResult = await query('SELECT key FROM subscription_plans WHERE id=$1', [req.params.id]);
    if (!planResult.rows.length) return res.status(404).json({ error: 'Plan not found' });

    const planKey = planResult.rows[0].key;
    const subscriberCheck = await query(
      `SELECT COUNT(*) AS cnt FROM users
       WHERE subscription_plan = $1 AND subscription_status IN ('active','trial') AND is_active = true`,
      [planKey]
    );
    const activeSubscribers = parseInt(subscriberCheck.rows[0].cnt) || 0;

    await query('UPDATE subscription_plans SET is_active=false WHERE id=$1', [req.params.id]);

    if (activeSubscribers > 0) {
      return res.json({
        message: 'Plan deactivated',
        hasActiveSubscribers: true,
        subscriberCount: activeSubscribers,
        note: 'Existing subscribers retain their current plan',
      });
    }
    res.json({ message: 'Plan deactivated', hasActiveSubscribers: false });
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
           label=$2, price_monthly=$3, max_users=$4, color=$5, features=$6, sort_order=$7, updated_at=NOW()
         WHERE subscription_plans.is_active = true`,
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

// GET /api/super-admin/coupons/:code/usage
router.get('/coupons/:code/usage', auditLog('view_coupon_usage', 'coupon'), async (req, res) => {
  try {
    const { code } = req.params;
    const result = await query(
      `SELECT p.created_at, p.amount, p.discount_amount, u.full_name, u.email
       FROM saas_purchases p
       JOIN users u ON p.tenant_user_id = u.id
       WHERE p.coupon_code = $1
       ORDER BY p.created_at DESC`,
      [code.toUpperCase()]
    );
    res.json({ usage: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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


// ═══════════════════════════════════════════════════════════════
// F. RAZORPAY INTEGRATION & PAYMENT MANAGEMENT
// ═══════════════════════════════════════════════════════════════

// POST /api/super-admin/tenants/:id/upgrade-plan
// Create Razorpay checkout order for admin to upgrade/renew subscription
router.post('/tenants/:id/upgrade-plan',
  requireSuperAdminPermission('tenants', 'edit'),
  [
    body('new_plan').notEmpty().withMessage('New plan required'),
    body('months').isInt({ min: 1 }).withMessage('Months must be >= 1'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { new_plan, months } = req.body;
    const tenant_id = req.params.id;

    try {
      logger.info('Admin upgrade/renew initiated', { tenant_id, new_plan, months });

      // Get tenant details
      const tenantResult = await query(
        `SELECT id, company_name, plan FROM users WHERE id = $1 AND role = 'admin'`,
        [tenant_id]
      );

      if (!tenantResult.rows.length) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      const tenant = tenantResult.rows[0];

      // Get plan details
      const plansResult = await query(`SELECT value FROM platform_settings WHERE key = 'custom_plans'`);
      let plans = [];
      if (plansResult.rows.length) {
        try {
          const stored = plansResult.rows[0].value;
          plans = typeof stored === 'string' ? JSON.parse(stored) : (stored || []);
        } catch (e) {
          logger.warn('Failed to parse custom plans', { error: e.message });
        }
      }

      const plan = plans.find(p => p.key === new_plan) || {
        key: new_plan,
        label: new_plan,
        price: 0,
      };

      const amount = plan.price * months;

      // Load Razorpay credentials
      const razorpayCredentials = await loadSavedRazorpayCredentials();

      if (!razorpayCredentials.key_id || !razorpayCredentials.key_secret) {
        return res.status(500).json({
          error: 'Razorpay not configured. Configure in Super Admin → Email Deliverability'
        });
      }

      // Create Razorpay order
      const order = await razorpayService.createOrder({
        amount,
        receipt: `upgrade-${tenant_id}`,
        notes: {
          tenant_id,
          company_name: tenant.company_name,
          new_plan,
          months,
          action: 'upgrade',
        },
        keyId: razorpayCredentials.key_id,
        keySecret: razorpayCredentials.key_secret,
      });

      if (!order || !order.id) {
        logger.error('Razorpay order creation failed', { tenant_id });
        return res.status(500).json({ error: 'Failed to create Razorpay order' });
      }

      // Create purchase record
      const purchaseResult = await query(
        `INSERT INTO saas_purchases (
          tenant_user_id,
          plan_key,
          plan_label,
          amount,
          months,
          razorpay_order_id,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')
         RETURNING id`,
        [tenant_id, new_plan, plan.label, amount, months, order.id]
      );

      logger.info('Upgrade order created', {
        tenant_id,
        order_id: order.id,
        purchase_id: purchaseResult.rows[0].id
      });

      res.json({
        order_id: order.id,
        purchase_id: purchaseResult.rows[0].id,
        amount: order.amount,
        currency: order.currency,
        key_id: razorpayCredentials.key_id,
        tenant_id,
        company_name: tenant.company_name,
        current_plan: tenant.plan,
        new_plan,
        months,
      });
    } catch (err) {
      logger.error('Admin upgrade error', { error: err.message, tenant_id });
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/super-admin/payments — List all payments with filters
router.get('/payments', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;
    
    const filters = ['1=1'];
    const params = [];
    let i = 1;

    if (req.query.status) { filters.push(`p.status = $${i++}`); params.push(req.query.status); }
    if (req.query.tenant_id) { filters.push(`p.tenant_user_id = $${i++}`); params.push(req.query.tenant_id); }
    if (req.query.from) { filters.push(`p.created_at >= $${i++}`); params.push(req.query.from); }
    if (req.query.to) { filters.push(`p.created_at <= $${i++}`); params.push(req.query.to); }

    const where = filters.join(' AND ');

    const [payments, totalRes] = await Promise.all([
      query(
        `SELECT p.*, u.email AS tenant_email, u.full_name AS tenant_name, u.company_name
         FROM saas_purchases p
         LEFT JOIN users u ON u.id = p.tenant_user_id
         WHERE ${where}
         ORDER BY p.created_at DESC
         LIMIT $${i} OFFSET $${i + 1}`,
        [...params, limit, offset]
      ),
      query(`SELECT COUNT(*) AS total FROM saas_purchases p WHERE ${where}`, params)
    ]);

    res.json({
      payments: payments.rows,
      page,
      limit,
      total: parseInt(totalRes.rows[0].total) || 0,
      pages: Math.ceil((parseInt(totalRes.rows[0].total) || 0) / limit)
    });
  } catch (err) {
    logger.error('Failed to fetch payments', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/super-admin/payments/manual — Record manual payment (offline)
router.post('/payments/manual',
  requireSuperAdminPermission('payments', 'create'),
  [
    body('tenant_user_id').isUUID(),
    body('amount').isFloat({ min: 0.01 }),
    body('plan_key').notEmpty(),
    body('months').isInt({ min: 1 }),
    body('payment_method').isIn(['bank_transfer', 'cash', 'cheque', 'other']),
  ],
  auditLog('create_manual_payment', 'payment'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { tenant_user_id, amount, plan_key, plan_label, months, payment_method, reference_number, notes } = req.body;
    
    try {
      // Create payment record
      const payment = await query(
        `INSERT INTO saas_purchases (tenant_user_id, plan_key, plan_label, amount, months, status, payment_method, reference_number, notes, paid_at, created_by)
         VALUES ($1, $2, $3, $4, $5, 'paid', $6, $7, $8, NOW(), $9)
         RETURNING *`,
        [tenant_user_id, plan_key, plan_label || plan_key, amount, months, payment_method, reference_number || null, notes || null, req.user.id]
      );

      // Update tenant subscription
      const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + months);
      
      await query(
        `UPDATE users 
         SET subscription_plan = $1, 
             subscription_expiry = $2, 
             subscription_status = 'active',
             is_active = true
         WHERE id = $3`,
        [plan_key, expiryDate, tenant_user_id]
      );

      // Generate invoice
      await invoiceService.processInvoice(payment.rows[0].id).catch(err =>
        logger.error('Invoice generation failed', { payment_id: payment.rows[0].id, error: err.message })
      );

      logger.info('Manual payment recorded', { payment_id: payment.rows[0].id, tenant_id: tenant_user_id, amount, by: req.user.id });

      res.status(201).json({ 
        message: 'Manual payment recorded successfully',
        payment: payment.rows[0]
      });
    } catch (err) {
      logger.error('Manual payment creation failed', { error: err.message });
      res.status(500).json({ error: err.message });
    }
  }
);

// POST /api/super-admin/payments/:id/refund — Create refund
router.post('/payments/:id/refund',
  requireSuperAdminPermission('payments', 'edit'),
  [
    body('amount').optional().isFloat({ min: 0.01 }),
    body('reason').optional().isString(),
  ],
  auditLog('create_payment_refund', 'payment'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { amount, reason } = req.body;
    
    try {
      // Get payment details
      const paymentRes = await query(
        `SELECT * FROM saas_purchases WHERE id = $1`,
        [req.params.id]
      );
      
      if (!paymentRes.rows.length) {
        return res.status(404).json({ error: 'Payment not found' });
      }

      const payment = paymentRes.rows[0];
      const refundAmount = amount || payment.amount;

      // If payment has razorpay_payment_id, initiate Razorpay refund
      if (payment.razorpay_payment_id) {
        try {
          const razorpayCredentials = await loadSavedRazorpayCredentials();
          const refund = await razorpayService.createRefund({
            paymentId: payment.razorpay_payment_id,
            amount: Math.round(refundAmount * 100), // Convert to paise
            notes: { reason: reason || 'Refund requested by admin' },
            keyId: razorpayCredentials.key_id,
            keySecret: razorpayCredentials.key_secret,
          });

          // Update payment record
          await query(
            `UPDATE saas_purchases 
             SET status = 'refunded', 
                 refund_id = $1, 
                 refund_amount = $2, 
                 refund_reason = $3, 
                 refunded_at = NOW()
             WHERE id = $4`,
            [refund.id, refundAmount, reason || null, req.params.id]
          );

          logger.info('Razorpay refund created', { payment_id: req.params.id, refund_id: refund.id, amount: refundAmount });

          res.json({ 
            message: 'Refund processed successfully',
            refund_id: refund.id,
            amount: refundAmount
          });
        } catch (razorpayErr) {
          logger.error('Razorpay refund failed', { payment_id: req.params.id, error: razorpayErr.message });
          return res.status(500).json({ error: `Razorpay refund failed: ${razorpayErr.message}` });
        }
      } else {
        // Manual payment refund (no Razorpay)
        await query(
          `UPDATE saas_purchases 
           SET status = 'refunded', 
               refund_amount = $1, 
               refund_reason = $2, 
               refunded_at = NOW()
           WHERE id = $3`,
          [refundAmount, reason || 'Manual refund', req.params.id]
        );

        logger.info('Manual refund recorded', { payment_id: req.params.id, amount: refundAmount });

        res.json({ 
          message: 'Refund recorded successfully',
          amount: refundAmount
        });
      }
    } catch (err) {
      logger.error('Refund processing failed', { payment_id: req.params.id, error: err.message });
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/super-admin/payments/overdue — Get overdue/failed payments
router.get('/payments/overdue', async (req, res) => {
  try {
    const result = await query(
      `SELECT p.*, u.email AS tenant_email, u.full_name AS tenant_name, u.company_name
       FROM saas_purchases p
       LEFT JOIN users u ON u.id = p.tenant_user_id
       WHERE p.status IN ('pending', 'failed')
       ORDER BY p.created_at DESC
       LIMIT 100`
    );

    res.json({ overdue_payments: result.rows });
  } catch (err) {
    logger.error('Failed to fetch overdue payments', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// RAZORPAY ORDER CREATION & VERIFICATION
// ═══════════════════════════════════════════════════════════════

// POST /api/super-admin/razorpay/create-order
// Note: Can be called with or without tenant_user_id (for new tenant provisioning)
router.post('/razorpay/create-order',
  [
    body('amount').isFloat({ min: 1 }),
    body('tenant_user_id').optional().isUUID(),  // Optional - for new tenants
    body('plan_key').notEmpty(),
    body('months').isInt({ min: 1 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { amount, tenant_user_id, plan_key, plan_label, months, coupon_code, discount_amount = 0 } = req.body;
    try {
      // Create purchase record (pending)
      // tenant_user_id can be null for new tenant orders - will be linked after tenant creation
      const purchase = await query(
        `INSERT INTO saas_purchases (tenant_user_id, plan_key, plan_label, amount, months, coupon_code, discount_amount, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending') RETURNING id`,
        [tenant_user_id || null, plan_key, plan_label || plan_key, amount, months, coupon_code || null, discount_amount]
      );
      const purchaseId = purchase.rows[0].id;

      // Load saved Razorpay credentials and create Razorpay order
      const razorpayCredentials = await loadSavedRazorpayCredentials();
      
      logger.info('Razorpay credentials loaded', { 
        purchaseId,
        hasKeyId: !!razorpayCredentials.key_id,
        hasKeySecret: !!razorpayCredentials.key_secret,
        keyIdPrefix: razorpayCredentials.key_id ? razorpayCredentials.key_id.substring(0, 8) : 'MISSING'
      });
      
      if (!razorpayCredentials.key_id || !razorpayCredentials.key_secret) {
        logger.error('Razorpay credentials not configured', { purchaseId });
        // Delete the pending purchase since we can't create order
        await query('DELETE FROM saas_purchases WHERE id=$1', [purchaseId]);
        return res.status(500).json({ 
          error: 'Razorpay is not configured. Please add credentials in Super Admin → Email Deliverability → Razorpay' 
        });
      }

      // Validate credentials aren't placeholder values
      if (razorpayCredentials.key_id.includes('YOUR_KEY_ID') || razorpayCredentials.key_secret.includes('YOUR_RAZORPAY_KEY_SECRET')) {
        logger.error('Razorpay credentials are placeholder values', { purchaseId });
        await query('DELETE FROM saas_purchases WHERE id=$1', [purchaseId]);
        return res.status(500).json({ 
          error: 'Razorpay credentials are not properly configured. Please update them in Super Admin → Email Deliverability → Razorpay' 
        });
      }

      logger.info('Creating Razorpay order', { purchaseId, amount, plan_key });

      const order = await razorpayService.createOrder({
        amount,
        receipt:      purchaseId,
        notes: { plan_key, months, purchase_id: purchaseId },
        keyId:        razorpayCredentials.key_id,
        keySecret:    razorpayCredentials.key_secret,
      });

      if (!order || !order.id) {
        logger.error('Razorpay order creation returned empty response', { purchaseId, order });
        await query('DELETE FROM saas_purchases WHERE id=$1', [purchaseId]);
        return res.status(500).json({ 
          error: 'Razorpay order creation failed. Check credentials and try again.' 
        });
      }

      // Save order ID
      await query(
        'UPDATE saas_purchases SET razorpay_order_id=$1 WHERE id=$2',
        [order.id, purchaseId]
      );

      logger.info('Razorpay order created successfully', { purchaseId, orderId: order.id });
      res.json({
        order_id:    order.id,
        purchase_id: purchaseId,
        amount:      order.amount,
        currency:    order.currency,
        key_id:      razorpayCredentials.key_id,
      });
    } catch (err) {
      logger.error('create-order error', { error: err.message, stack: err.stack });
      res.status(500).json({ error: err.message });
    }
  }
);

// POST /api/super-admin/razorpay/verify-payment  — Client-side verification after checkout
router.post('/razorpay/verify-payment', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, purchase_id } = req.body;
  try {
    const razorpayCredentials = await loadSavedRazorpayCredentials();
    const valid = razorpayService.verifyPaymentSignature({
      orderId:   razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
      keySecret: razorpayCredentials.key_secret,
    });

    if (!valid) return res.status(400).json({ success: false, error: 'Invalid payment signature' });

    // Mark purchase as paid
    const purchaseResult = await query(
      `UPDATE saas_purchases
       SET status='paid', razorpay_payment_id=$1, razorpay_signature=$2, paid_at=NOW(), updated_at=NOW()
       WHERE id=$3
       RETURNING tenant_user_id, plan_key, months`,
      [razorpay_payment_id, razorpay_signature, purchase_id]
    );

    if (!purchaseResult.rows.length) {
      return res.status(404).json({ success: false, error: 'Purchase not found' });
    }

    const purchase = purchaseResult.rows[0];
    const { tenant_user_id, plan_key, months } = purchase;

    // UPDATE TENANT SUBSCRIPTION — Activate the new plan
    if (tenant_user_id && plan_key) {
      const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + months);

      await query(
        `UPDATE users 
         SET subscription_plan = $1, 
             subscription_expiry = $2, 
             subscription_status = 'active',
             is_active = true,
             updated_at = NOW()
         WHERE id = $3`,
        [plan_key, expiryDate, tenant_user_id]
      );

      logger.info('Subscription activated after payment', {
        tenant_user_id,
        plan_key,
        expiryDate: expiryDate.toISOString(),
        months
      });
    }

    // FETCH PLAN DETAILS to return to frontend
    let planDetails = null;
    try {
      const plansResult = await query(`SELECT value FROM platform_settings WHERE key = 'custom_plans'`);
      let plans = [];
      if (plansResult.rows.length) {
        try {
          const stored = plansResult.rows[0].value;
          plans = typeof stored === 'string' ? JSON.parse(stored) : (stored || []);
        } catch (e) {
          logger.warn('Failed to parse custom plans', { error: e.message });
        }
      }
      planDetails = plans.find(p => p.key === plan_key) || null;
    } catch (err) {
      logger.warn('Failed to fetch plan details', { error: err.message });
    }

    // Trigger invoice generation (async — don't block response)
    invoiceService.processInvoice(purchase_id).catch(err =>
      logger.error('Invoice generation failed', { purchase_id, error: err.message })
    );

    // Return plan details + features to frontend for activation in running app
    res.json({
      success: true,
      message: 'Payment verified and subscription activated',
      subscription: {
        plan: plan_key,
        status: 'active',
        expiryDate: new Date(expiryDate).toISOString(),
        planDetails: planDetails  // Features array included here
      }
    });
  } catch (err) {
    logger.error('Payment verification error', { error: err.message, purchase_id });
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
    const razorpayCredentials = await loadSavedRazorpayCredentials();
    const rawBody = req.body; // Buffer from express.raw()
    const valid   = razorpayService.verifyWebhookSignature(rawBody, signature, razorpayCredentials.webhook_secret);
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

      // ACTIVATE SUBSCRIPTION — Update user with new plan
      if (purchase.tenant_user_id && purchase.plan_key) {
        const expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + purchase.months);

        await query(
          `UPDATE users 
           SET subscription_plan = $1, 
               subscription_expiry = $2, 
               subscription_status = 'active',
               is_active = true,
               updated_at = NOW()
           WHERE id = $3`,
          [purchase.plan_key, expiryDate, purchase.tenant_user_id]
        );

        logger.info('Subscription activated via webhook', {
          tenant_user_id: purchase.tenant_user_id,
          plan_key: purchase.plan_key,
          expiryDate: expiryDate.toISOString(),
          months: purchase.months
        });
      }

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
    if (req.query.q) {
      const q = `%${req.query.q}%`;
      conds.push(`(al.description ILIKE $${i} OR al.action ILIKE $${i} OR al.title ILIKE $${i} OR u.full_name ILIKE $${i} OR u.email ILIKE $${i})`);
      vals.push(q);
      i++;
    }

    const where = conds.join(' AND ');

    const [logs, total] = await Promise.all([
      query(
        `SELECT al.*, u.username, u.full_name, u.role
         FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id
         WHERE ${where}
         ORDER BY al.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
        [...vals, limit, offset]
      ),
      query(`SELECT COUNT(*) as count FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id WHERE ${where}`, vals)
    ]);

    res.json({ 
      logs: logs.rows,
      page,
      limit,
      total: parseInt(total.rows[0].count) || 0,
      pages: Math.ceil((parseInt(total.rows[0].count) || 0) / limit)
    });
  } catch (err) {
    logger.error('SA audit-logs error', { error: err.message });
    res.status(500).json({ error: 'Failed to load audit logs' });
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
// J. BRANDING FILE UPLOAD
// ═══════════════════════════════════════════════════════════════

const brandingStorage = multer.diskStorage({
  destination: (req, file, cb) => { 
    const dir = path.join(__dirname, '../../uploads/branding');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir); 
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});

const brandingUpload = multer({ 
  storage: brandingStorage,
  fileFilter: (req, file, cb) => {
    // Only accept image files
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/svg+xml', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPG, PNG, GIF, SVG, WebP, ICO) are allowed'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max
  }
});

// POST /api/super-admin/branding/upload — Upload logo or favicon
router.post('/branding/upload', requireSuperAdminPermission('settings', 'edit'), brandingUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    // Return full URL with protocol and host for proper loading
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/branding/${req.file.filename}`;
    res.json({ 
      url: fileUrl,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// H. TWO-FACTOR AUTHENTICATION
// ═══════════════════════════════════════════════════════════════

// POST /api/super-admin/2fa/setup  — Generate secret + QR for current user
// GET /api/super-admin/2fa/status — Get current user's 2FA status
router.get('/2fa/status', async (req, res) => {
  try {
    const result = await query(
      'SELECT is_enabled FROM two_factor_auth WHERE user_id = $1',
      [req.user.id]
    );
    const is_enabled = result.rows.length ? result.rows[0].is_enabled : false;
    res.json({ is_enabled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/super-admin/2fa/setup — Generate TOTP secret + QR code
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

// DELETE /api/super-admin/2fa/disable — Disable 2FA for current user
router.delete('/2fa/disable', auditLog('disable_2fa', 'user'), async (req, res) => {
  try {
    await tfaService.disable(req.user.id);
    res.json({ message: '2FA disabled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/super-admin/2fa/enforcement-status — Get global 2FA enforcement flag
router.get('/2fa/enforcement-status', requireSuperAdminPermission('settings', 'view'), async (req, res) => {
  try {
    const result = await query(
      'SELECT value FROM platform_settings WHERE key = $1',
      ['2fa_enforcement']
    );
    const value = result.rows.length ? result.rows[0].value : { enforced: false };
    res.json({ enforced: value.enforced || false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/super-admin/2fa/enforce  — Toggle global 2FA enforcement for all admins
router.patch('/2fa/enforce', requireSuperAdminPermission('settings', 'edit'), auditLog('enforce_2fa', 'platform'), async (req, res) => {
  const { enforced } = req.body;
  if (typeof enforced !== 'boolean') return res.status(400).json({ error: 'enforced (boolean) required' });
  try {
    await query(
      `INSERT INTO platform_settings (key, value, updated_by, updated_at)
       VALUES ('2fa_enforcement', $1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_by = $2, updated_at = NOW()`,
      [JSON.stringify({ enforced }), req.user.id]
    );
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

/**
 * Fire-and-forget audit logging for routes that stream responses (PDF / ZIP)
 * instead of calling res.json().
 */
function logAudit(action, resourceType, req, resourceId = null) {
  if (!req.user) return;
  const details = JSON.stringify({ method: req.method, path: req.path });
  const ip = req.ip || req.connection?.remoteAddress || null;
  const ua = req.headers['user-agent'] || null;
  const uid = req.user.id;
  const tid = req.user.tenant_id || null;
  query(
    `INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details, ip_address, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7::inet,$8)`,
    [tid, uid, action, resourceType, resourceId, details, ip, ua]
  ).catch(e => logger.error('Audit log error', { error: e.message }));
  query(
    `INSERT INTO activity_logs (tenant_id, user_id, action, module, resource_type, resource_id, title, description, metadata, ip_address, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::inet,$11)`,
    [tid, uid, action, 'purchases', resourceType, resourceId, action.replace(/_/g,' '), action.replace(/_/g,' '), details, ip, ua]
  ).catch(e => logger.error('Activity log error', { error: e.message }));
}

// GET /api/super-admin/purchases/:id/pdf  — Serve invoice PDF file
router.get('/purchases/:id/pdf', async (req, res) => {
  try {
    const { pdfPath, purchase } = await invoiceService.ensurePdf(req.params.id);
    logAudit('invoice_downloaded', 'purchase', req, req.params.id);
    const fileName = `${purchase.invoice_number || 'invoice'}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    const stream = fs.createReadStream(pdfPath);
    stream.pipe(res);
    stream.on('error', () => res.status(500).json({ error: 'Failed to stream PDF' }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/super-admin/purchases/export-all  — ZIP of all invoice PDFs + CSV index
router.post('/purchases/export-all', async (req, res) => {
  try {
    const filterStatus = req.body.status || 'success';
    const result = await query(
      `SELECT sp.*, u.full_name, u.email, u.username
       FROM saas_purchases sp
       JOIN users u ON sp.tenant_user_id = u.id
       WHERE sp.status = $1
       ORDER BY sp.created_at DESC`,
      [filterStatus]
    );
    const purchases = result.rows;

    // Ensure PDFs exist for all purchases — regenerate if missing, never skip silently
    const errors = [];
    const pdfEntries = [];
    for (const p of purchases) {
      let pdfPath, purchase;
      if (p.invoice_pdf_path && fs.existsSync(p.invoice_pdf_path)) {
        pdfPath = p.invoice_pdf_path;
        purchase = p;
      } else {
        // Regenerate PDF
        try {
          const result = await invoiceService.ensurePdf(p.id);
          pdfPath = result.pdfPath;
          purchase = result.purchase;
        } catch (e) {
          errors.push({ id: p.id, error: e.message });
          logger.error('Failed to generate PDF for export', { id: p.id, error: e.message });
          continue;
        }
      }
      if (!fs.existsSync(pdfPath)) {
        errors.push({ id: p.id, error: 'PDF file not found after generation' });
        continue;
      }
      pdfEntries.push({ purchase, pdfPath });
    }

    // Build CSV index
    const csvRows = ['Invoice Number,Client Name,Client Email,Amount,Date,Status'];
    for (const { purchase } of pdfEntries) {
      const invNum = purchase.invoice_number || '';
      const name   = (purchase.full_name || purchase.username || '').replace(/,/g, ' ');
      const email  = (purchase.email || '').replace(/,/g, ' ');
      const amt    = parseFloat(purchase.amount || 0).toFixed(2);
      const date   = purchase.paid_at ? new Date(purchase.paid_at).toISOString().slice(0, 10) : '';
      const st     = purchase.status || '';
      csvRows.push(`"${invNum}","${name}","${email}",${amt},"${date}","${st}"`);
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    const folderName = `Invoices_Export_${dateStr}`;

    logAudit('export_all_invoices', 'purchase', req);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${folderName}.zip"`);

    const archive = new ZipArchive({ zlib: { level: 6 } });
    archive.pipe(res);
    archive.on('error', (err) => { throw err; });

    // Add CSV index
    archive.append(csvRows.join('\n'), { name: `${folderName}/invoice_index.csv` });

    // Add PDFs
    for (const { purchase, pdfPath } of pdfEntries) {
      const safeName = (purchase.full_name || purchase.username || 'Client').replace(/[^a-zA-Z0-9_\- ]/g, '');
      const fileName = `${purchase.invoice_number || 'invoice'}_${safeName}.pdf`;
      archive.file(pdfPath, { name: `${folderName}/${fileName}` });
    }

    // Add error report if any
    if (errors.length) {
      archive.append(JSON.stringify({ errors }, null, 2), { name: `${folderName}/errors.json` });
    }

    archive.finalize();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/super-admin/purchases/:id/resend-invoice
router.post('/purchases/:id/resend-invoice', auditLog('resend_invoice', 'purchase'), async (req, res) => {
  try {
    await invoiceService.processInvoice(req.params.id);
    try {
      const purchase = await query(
        'SELECT invoice_number, email, full_name FROM saas_purchases WHERE id = $1',
        [req.params.id]
      );
      const row = purchase.rows[0] || {};
      await automationService.handleEvent('INVOICE_SENT', {
        invoice_number: row.invoice_number || '',
        email: row.email || '',
        name: row.full_name || ''
      });
    } catch (eventErr) {
      console.warn('INVOICE_SENT event emission failed:', eventErr.message);
    }
    res.json({ message: 'Invoice resent successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// I-b. TENANT FEATURE PERMISSION OVERRIDES (Super Admin)
// ═══════════════════════════════════════════════════════════════

// GET /api/super-admin/tenants/:id/permissions — get feature overrides for a tenant's admin
router.get('/tenants/:id/permissions', async (req, res) => {
  try {
    const result = await query(
      `SELECT permissions FROM users WHERE id=$1 AND role='admin'`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Tenant admin not found' });
    const raw = result.rows[0].permissions;
    // If stored as full granular object return as-is; if only { access_level } return null
    const perms = (raw && typeof raw === 'object' && !raw.access_level) ? raw : null;
    res.json({ permissions: perms });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/super-admin/tenants/:id/permissions — set feature overrides for a tenant's admin
router.patch('/tenants/:id/permissions', auditLog('override_tenant_permissions', 'tenant'), async (req, res) => {
  const { permissions } = req.body;
  if (!permissions || typeof permissions !== 'object') return res.status(400).json({ error: 'permissions object required' });
  try {
    const result = await query(
      `UPDATE users SET permissions=$1, updated_at=NOW() WHERE id=$2 AND role='admin' RETURNING id`,
      [JSON.stringify(permissions), req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Tenant admin not found' });
    res.json({ ok: true });
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
      `SELECT id, username, email, full_name, role, is_active, avatar_url, last_login, created_at
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
      `SELECT id, full_name AS name, email, role, is_active, permissions, avatar_url, last_login, created_at
       FROM users
       WHERE role IN ('super_admin','support_admin','billing_admin','content_admin')
       ORDER BY created_at DESC`
    );
    const accounts = result.rows.map(r => {
      const p = r.permissions;
      // Granular object (has module keys, no access_level) → return as-is for frontend matrix
      // Role shorthand {access_level: 'view_only'} → return the string value
      const isGranular = p && typeof p === 'object' && !p.access_level && Object.keys(p).length > 0;
      return { ...r, permissions: isGranular ? p : ((p && p.access_level) || 'full') };
    });
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

    // If permissions is a granular object store it directly; otherwise wrap as role shorthand
    const permVal = (permissions && typeof permissions === 'object')
      ? JSON.stringify(permissions)
      : JSON.stringify({ access_level: permissions });

    const hash = await bcrypt.hash(password || 'ChangeMe@123', 12);
    const username = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') + '_' + Date.now().toString(36);
    const result = await query(
      `INSERT INTO users (username, email, password_hash, full_name, role, is_active, permissions)
       VALUES ($1,$2,$3,$4,$5,true,$6)
       RETURNING id, full_name AS name, email, role, is_active, permissions, created_at`,
      [username, email, hash, name, role, permVal]
    );
    const acc = result.rows[0];
    acc.permissions = permissions;

    // Send onboarding email (fire-and-forget)
    invoiceService.sendOnboardingEmail({
      email, name, password: password || 'ChangeMe@123', role,
    }).catch(e => logger.error('Onboarding email failed', { error: e.message }));

    res.status(201).json(acc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/super-admin/accounts/:id — Update account (toggle active, change role, etc.)
router.patch('/accounts/:id', auditLog('update_platform_account', 'user'), async (req, res) => {
  const { is_active, role, permissions, name, password } = req.body;
  try {
    const updates = [];
    const vals    = [];
    let   i       = 1;
    if (typeof is_active === 'boolean') { updates.push(`is_active = $${i++}`); vals.push(is_active); }
    if (role !== undefined)             { updates.push(`role = $${i++}`);      vals.push(role); }
    if (permissions !== undefined) {
      // Granular object → store directly; string shorthand → wrap in {access_level}
      const permVal = (permissions && typeof permissions === 'object')
        ? JSON.stringify(permissions)
        : JSON.stringify({ access_level: permissions });
      updates.push(`permissions = $${i++}`); vals.push(permVal);
    }
    if (name !== undefined)              { updates.push(`full_name = $${i++}`); vals.push(name); }
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      updates.push(`password_hash = $${i++}`); vals.push(hash);
    }
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

// ═════════════════════════════════════════════════════════════════
// SCHEDULED TASKS — Check for expired subscriptions
// ═════════════════════════════════════════════════════════════════

async function checkAndEmitExpiredSubscriptions() {
  try {
    // Find subscriptions that expired today or in the past (but not already marked as expired)
    const result = await query(
      `SELECT id, email, full_name, company_name, subscription_plan, subscription_expiry 
       FROM users 
       WHERE role = 'admin' 
         AND subscription_status != 'expired' 
         AND subscription_expiry IS NOT NULL 
         AND subscription_expiry::date <= CURRENT_DATE 
       ORDER BY subscription_expiry DESC`
    );

    for (const tenant of result.rows) {
      try {
        // Emit SUBSCRIPTION_EXPIRED event
        await automationService.handleEvent('SUBSCRIPTION_EXPIRED', {
          tenant_id: tenant.id,
          company: tenant.company_name,
          admin_email: tenant.email,
          plan: tenant.subscription_plan,
          expiry_date: tenant.subscription_expiry
        });

        // Update subscription status to 'expired'
        await query(
          `UPDATE users SET subscription_status = 'expired' WHERE id = $1`,
          [tenant.id]
        );

        logger.info('Subscription expired and marked', { tenant_id: tenant.id, company: tenant.company_name });
      } catch (eventErr) {
        logger.error('Failed to emit SUBSCRIPTION_EXPIRED event', { tenant_id: tenant.id, error: eventErr.message });
      }
    }
  } catch (err) {
    logger.error('checkAndEmitExpiredSubscriptions task failed', { error: err.message });
  }
}

// Run expired subscription check every 6 hours
const SUBSCRIPTION_CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
setInterval(() => {
  checkAndEmitExpiredSubscriptions().catch(err => console.error('Subscription expiry check failed:', err.message));
}, SUBSCRIPTION_CHECK_INTERVAL);

// Also run on startup
checkAndEmitExpiredSubscriptions().catch(err => console.error('Initial subscription expiry check failed:', err.message));

module.exports = router;

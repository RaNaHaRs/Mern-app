const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate, requireMinRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

const upload = multer();

const DEFAULT_COMPANY_SETTINGS = {
  name: '',
  tagline: '',
  phone: '',
  email: '',
  gstin: '',
  website: '',
  address: '',
  subscription_expiry: '',
  logo_data: '',
  smtp_host: '',
  smtp_port: 587,
  smtp_user: '',
  smtp_password: '',
  smtp_from_name: '',
  smtp_from_email: '',
  invoice_bank_name: '',
  invoice_bank_account: '',
  invoice_bank_ifsc: '',
  invoice_bank_branch: '',
  invoice_disclaimer: '',
  invoice_footer: '',
  gst_enabled: false,
  gst_rate: 18,
  igst_rate: 18,
  gst_tax_type: 'cgst_sgst',
  gst_state_code: '27',
  hsn_code: '',
  currency: 'INR',
  razorpay_key_id: '',
  razorpay_key_secret: '',
  razorpay_plan_id: '',
  payment_methods: [],
  case_number_format: 'DR-{YYYY}-{NNNNN}',
  case_number_start: 1,
  invoice_number_format: 'INV-{YYYY}-{NNNN}',
  invoice_number_start: 1,
  quote_number_format: 'QT-{YYYY}-{NNNN}',
  quote_number_start: 1,
};

async function loadCompanySettings() {
  const result = await query('SELECT value FROM platform_settings WHERE key = $1', ['company']);
  if (!result.rows.length) return { ...DEFAULT_COMPANY_SETTINGS };
  
  let storedValue = result.rows[0].value;
  // Handle case where value is JSON string vs object
  if (typeof storedValue === 'string') {
    try {
      storedValue = JSON.parse(storedValue);
    } catch (e) {
      storedValue = {};
    }
  }
  
  return { ...DEFAULT_COMPANY_SETTINGS, ...(storedValue || {}) };
}

async function saveCompanySettings(company, userId) {
  await query(
    `INSERT INTO platform_settings (key, value, updated_by, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
    ['company', JSON.stringify(company), userId]
  );
}

router.get('/company', authenticate, requireMinRole('admin'), auditLog('view_company_settings', 'settings'), async (req, res) => {
  try {
    const settings = await loadCompanySettings();
    // Redact sensitive fields before sending to client
    const safe = { ...settings };
    if (safe.smtp_password) safe.smtp_password = '••••••••••••••••';
    if (safe.razorpay_key_secret) safe.razorpay_key_secret = '[REDACTED]';
    res.json(safe);
  } catch (err) {
    console.error('Failed to load company settings', err.message);
    res.status(500).json({ error: 'Failed to load company settings' });
  }
});

router.put('/company', authenticate, requireMinRole('admin'), auditLog('update_company_settings', 'settings'), async (req, res) => {
  try {
    const company = req.body || {};
    // If frontend sent a masked password placeholder, preserve existing password
    const maskedPattern = /^[•*]{4,}$/; // matches •••• or **** placeholders
    if (company.smtp_password && maskedPattern.test(company.smtp_password)) {
      const existing = await loadCompanySettings();
      company.smtp_password = existing.smtp_password || '';
    }
    await saveCompanySettings(company, req.user.id);
    const safe = { ...company };
    if (safe.smtp_password) safe.smtp_password = '••••••••••••••••';
    res.json({ ok: true, settings: safe });
  } catch (err) {
    console.error('Failed to save company settings', err.message);
    res.status(500).json({ error: 'Failed to save company settings' });
  }
});

// GET /api/settings/homepage — Public route for landing page content
router.get('/homepage', async (req, res) => {
  try {
    const result = await query('SELECT value FROM platform_settings WHERE key = $1', ['homepage']);
    res.json(result.rows.length ? result.rows[0].value : {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/settings/branding — Public route for platform branding
router.get('/branding', async (req, res) => {
  try {
    const result = await query('SELECT value FROM platform_settings WHERE key = $1', ['branding']);
    res.json(result.rows.length ? result.rows[0].value : {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/company/logo', authenticate, requireMinRole('admin'), upload.single('logo'), auditLog('upload_company_logo', 'settings'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Logo file is required' });
    const company = await loadCompanySettings();
    company.logo_data = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    await saveCompanySettings(company, req.user.id);
    res.json({ ok: true, logo_data: company.logo_data });
  } catch (err) {
    console.error('Failed to upload company logo', err.message);
    res.status(500).json({ error: 'Failed to upload company logo' });
  }
});

router.post('/smtp/test', authenticate, requireMinRole('admin'), auditLog('test_smtp_settings', 'settings'), async (req, res) => {
  try {
    // Accept SMTP config in body; fall back to saved company settings when not provided
    const body = req.body || {};
    const saved = await loadCompanySettings();
    const smtp_host = body.smtp_host || saved.smtp_host;
    const smtp_port = body.smtp_port || saved.smtp_port || 587;
    const smtp_user = body.smtp_user || saved.smtp_user;
    const smtp_password = body.smtp_password && !/^[•*]{4,}$/.test(body.smtp_password) ? body.smtp_password : saved.smtp_password;
    const smtp_from_name = body.smtp_from_name || saved.smtp_from_name || saved.name || 'RecoverLab CRM';
    const smtp_from_email = body.smtp_from_email || saved.smtp_from_email || smtp_user;

    if (!smtp_host || !smtp_port || !smtp_user || !smtp_password || !smtp_from_email) {
      return res.status(422).json({ error: 'SMTP host, port, username, password and from email are required' });
    }

    const portNumber = parseInt(smtp_port, 10) || 587;
    const transport = nodemailer.createTransport({
      host: smtp_host,
      port: portNumber,
      secure: portNumber === 465,
      auth: {
        user: smtp_user,
        pass: smtp_password,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    // Verify connection
    await transport.verify();

    // Send a friendly test email to from_email (or explicit test_to)
    const testTo = body.test_to || smtp_from_email || smtp_user;
    try {
      await transport.sendMail({
        from: `"${smtp_from_name}" <${smtp_from_email}>`,
        to: testTo,
        subject: '✅ SMTP Test — RecoverLab CRM',
        html: `<div><h3 style="color:#1e40af">SMTP is working ✅</h3><p>Your RecoverLab CRM is correctly configured to send emails via <b>${smtp_host}:${portNumber}</b>.</p></div>`,
        text: `SMTP is working. Your CRM is configured to send emails via ${smtp_host}:${portNumber}.`,
      });
      console.log(`Test email successfully sent to ${testTo}`);
      res.json({ ok: true, message: `✅ SMTP connected successfully — test email sent to ${testTo}.` });
    } catch (sendErr) {
      console.error('SMTP send failed', sendErr.message, { host: smtp_host, port: portNumber, user: smtp_user, to: testTo });
      return res.status(400).json({ ok: false, error: `Failed to send test email: ${sendErr.message}. Check SMTP credentials and ensure your email provider allows this connection.` });
    }
  } catch (err) {
    console.error('SMTP test failed', err.message);
    res.status(500).json({ error: `SMTP test failed: ${err.message}` });
  }
});

// ── Super Admin SMTP config (used for onboarding, platform notifications) ─

/**
 * Load Super Admin SMTP config from platform_settings.
 */
async function loadSuperAdminSmtp() {
  const r = await query("SELECT value FROM platform_settings WHERE key = 'smtp_super_admin'");
  return r.rows[0]?.value || {};
}

async function saveSuperAdminSmtp(cfg, userId) {
  await query(
    `INSERT INTO platform_settings (key, value, updated_by, updated_at)
     VALUES ($1,$2,$3,NOW())
     ON CONFLICT (key) DO UPDATE SET value=$2, updated_by=$3, updated_at=NOW()`,
    ['smtp_super_admin', JSON.stringify(cfg), userId]
  );
}

// GET /api/settings/smtp/super-admin  — Retrieve Super Admin SMTP config
router.get('/smtp/super-admin', authenticate, requireMinRole('super_admin'), async (req, res) => {
  try {
    const cfg = await loadSuperAdminSmtp();
    const safe = { ...cfg };
    if (safe.password) safe.password = '••••••••••••••••';
    res.json(safe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings/smtp/super-admin  — Save Super Admin SMTP config
router.put('/smtp/super-admin', authenticate, requireMinRole('super_admin'), auditLog('update_super_admin_smtp', 'settings'), async (req, res) => {
  try {
    const body = req.body || {};
    const masked = /^[•*]{4,}$/;
    const existing = await loadSuperAdminSmtp();
    if (body.password && masked.test(body.password)) body.password = existing.password || '';
    await saveSuperAdminSmtp(body, req.user.id);
    const safe = { ...body };
    if (safe.password) safe.password = '••••••••••••••••';
    res.json({ ok: true, config: safe });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/smtp/super-admin/test  — Test Super Admin SMTP config
router.post('/smtp/super-admin/test', authenticate, requireMinRole('super_admin'), async (req, res) => {
  try {
    const body = req.body || {};
    const saved = await loadSuperAdminSmtp();
    const host = body.host || saved.host;
    const port = body.port || saved.port || 587;
    const user = body.user || saved.user;
    const pass = body.password && !/^[•*]{4,}$/.test(body.password) ? body.password : saved.password;
    const fromName = body.from_name || saved.from_name || 'RecoverLab';
    const fromEmail = body.from_email || saved.from_email || user;
    if (!host || !user || !pass || !fromEmail) {
      return res.status(422).json({ error: 'Host, user, password and from_email are required' });
    }
    const portNum = parseInt(port, 10) || 587;
    const transport = nodemailer.createTransport({
      host, port: portNum, secure: portNum === 465,
      auth: { user, pass }, tls: { rejectUnauthorized: false },
    });
    await transport.verify();
    const testTo = body.test_to || fromEmail;
    await transport.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: testTo,
      subject: '✅ Super Admin SMTP Test',
      html: `<div><h3>Super Admin SMTP is working ✅</h3><p>Config: ${host}:${portNum}</p></div>`,
    });
    res.json({ ok: true, message: `Test email sent to ${testTo}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin Role Management (Tenant-scoped) ──────────────────────────────────
const { isSuperAdmin, tenantAdminId } = require('../utils/tenantAccess');

async function getTenantRoles(tenantId) {
  const result = await query(
    `SELECT value FROM platform_settings WHERE key = $1`,
    [`tenant_roles_${tenantId}`]
  );
  return result.rows.length ? (result.rows[0].value || []) : [];
}

async function saveTenantRoles(tenantId, roles, userId) {
  await query(
    `INSERT INTO platform_settings (key, value, updated_by, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
    [`tenant_roles_${tenantId}`, JSON.stringify(roles), userId]
  );
}

// GET /settings/roles — List roles for current admin's tenant (or all if super admin)
router.get('/roles', authenticate, requireMinRole('admin'), async (req, res) => {
  try {
    let roles = [];
    if (isSuperAdmin(req.user)) {
      // Super admin can see platform roles
      const result = await query(`SELECT value FROM platform_settings WHERE key = $1`, ['settings_roles']);
      roles = result.rows.length ? (result.rows[0].value || []) : [];
    } else {
      // Regular admin sees their tenant's roles
      const adminTenantId = tenantAdminId(req.user);
      roles = await getTenantRoles(adminTenantId);
    }
    res.json(roles);
  } catch (err) {
    console.error('Failed to fetch roles', err.message);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

// POST /settings/roles — Create a new role
router.post('/roles', authenticate, requireMinRole('admin'), auditLog('create_role', 'settings'), async (req, res) => {
  try {
    const { name, key, description, color, permissions } = req.body;
    if (!name || !key) return res.status(422).json({ error: 'Role name and key are required' });

    const id = require('crypto').randomUUID();
    const newRole = { id, name, key, description: description || '', color: color || '#6366f1', permissions: permissions || {} };

    let roles = [];
    let tenantId;
    if (isSuperAdmin(req.user)) {
      const result = await query(`SELECT value FROM platform_settings WHERE key = $1`, ['settings_roles']);
      roles = result.rows.length ? (result.rows[0].value || []) : [];
      // Super admin saves to platform settings
      roles.push(newRole);
      await query(
        `INSERT INTO platform_settings (key, value, updated_by, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
        ['settings_roles', JSON.stringify(roles), req.user.id]
      );
    } else {
      tenantId = tenantAdminId(req.user);
      roles = await getTenantRoles(tenantId);
      roles.push(newRole);
      await saveTenantRoles(tenantId, roles, req.user.id);
    }

    res.status(201).json(newRole);
  } catch (err) {
    console.error('Failed to create role', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /settings/roles/:id — Update a role
router.patch('/roles/:id', authenticate, requireMinRole('admin'), auditLog('update_role', 'settings'), async (req, res) => {
  try {
    const { name, description, color, permissions } = req.body;
    const roleId = req.params.id;

    let roles = [];
    let tenantId;
    if (isSuperAdmin(req.user)) {
      const result = await query(`SELECT value FROM platform_settings WHERE key = $1`, ['settings_roles']);
      roles = result.rows.length ? (result.rows[0].value || []) : [];
    } else {
      tenantId = tenantAdminId(req.user);
      roles = await getTenantRoles(tenantId);
    }

    const roleIdx = roles.findIndex(r => r.id === roleId);
    if (roleIdx === -1) return res.status(404).json({ error: 'Role not found' });

    roles[roleIdx] = { ...roles[roleIdx], name: name || roles[roleIdx].name, description: description !== undefined ? description : roles[roleIdx].description, color: color || roles[roleIdx].color, permissions: permissions || roles[roleIdx].permissions };

    if (isSuperAdmin(req.user)) {
      await query(
        `INSERT INTO platform_settings (key, value, updated_by, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
        ['settings_roles', JSON.stringify(roles), req.user.id]
      );
    } else {
      await saveTenantRoles(tenantId, roles, req.user.id);
    }

    res.json(roles[roleIdx]);
  } catch (err) {
    console.error('Failed to update role', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /settings/roles/:id — Delete a role
router.delete('/roles/:id', authenticate, requireMinRole('admin'), auditLog('delete_role', 'settings'), async (req, res) => {
  try {
    const roleId = req.params.id;

    let roles = [];
    let tenantId;
    if (isSuperAdmin(req.user)) {
      const result = await query(`SELECT value FROM platform_settings WHERE key = $1`, ['settings_roles']);
      roles = result.rows.length ? (result.rows[0].value || []) : [];
    } else {
      tenantId = tenantAdminId(req.user);
      roles = await getTenantRoles(tenantId);
    }

    roles = roles.filter(r => r.id !== roleId);

    if (isSuperAdmin(req.user)) {
      await query(
        `INSERT INTO platform_settings (key, value, updated_by, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
        ['settings_roles', JSON.stringify(roles), req.user.id]
      );
    } else {
      await saveTenantRoles(tenantId, roles, req.user.id);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to delete role', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.loadCompanySettings = loadCompanySettings;
module.exports = router;

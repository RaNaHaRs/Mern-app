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
  invoice_number_format: 'INV-{YYYY}-{NNNN}',
  quote_number_format: 'QT-{YYYY}-{NNNN}',
};

async function loadCompanySettings() {
  const result = await query('SELECT value FROM platform_settings WHERE key = $1', ['company']);
  if (!result.rows.length) return { ...DEFAULT_COMPANY_SETTINGS };
  return { ...DEFAULT_COMPANY_SETTINGS, ...(result.rows[0].value || {}) };
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
    } catch (sendErr) {
      console.warn('SMTP verify succeeded but send failed', sendErr.message);
      return res.status(200).json({ ok: true, message: `SMTP connected successfully but sending test email failed: ${sendErr.message}` });
    }

    res.json({ ok: true, message: `SMTP connected successfully — test email sent to ${testTo}.` });
  } catch (err) {
    console.error('SMTP test failed', err.message);
    res.status(500).json({ error: `SMTP test failed: ${err.message}` });
  }
});

module.exports = router;

/**
 * Invoice Service
 * Generates PDF invoices via pdfkit and sends them via Nodemailer.
 */

const path      = require('path');
const fs        = require('fs');
const PDFDoc    = require('pdfkit');
const nodemailer = require('nodemailer');
const { query } = require('../config/database');
const logger    = require('../config/logger');

// ─── Ensure invoices directory exists ──────────────────────────
const INVOICES_DIR = path.join(process.cwd(), 'uploads', 'invoices');
if (!fs.existsSync(INVOICES_DIR)) fs.mkdirSync(INVOICES_DIR, { recursive: true });

// ─── Nodemailer transport ───────────────────────────────────────

/**
 * Load Admin (tenant-level) SMTP config from company settings,
 * falling back to process.env.
 */
/**
 * Load Admin (tenant-level) SMTP config from company settings,
 * falling back to process.env. DB query failures are absorbed so
 * env fallback always works.
 */
async function loadAdminSmtpConfig() {
  let c = {};
  try {
    const result = await query("SELECT value FROM platform_settings WHERE key = 'company'");
    c = result.rows[0]?.value || {};
  } catch { /* DB may not exist; fall through to env */ }
  return {
    host:       c.smtp_host       || process.env.SMTP_HOST       || 'smtp.gmail.com',
    port:       c.smtp_port       || parseInt(process.env.SMTP_PORT || '587'),
    secure:     c.smtp_port === 465 || process.env.SMTP_SECURE === 'true',
    user:       c.smtp_user       || process.env.SMTP_USER       || '',
    pass:       c.smtp_password   || process.env.SMTP_PASS       || process.env.SMTP_PASSWORD || '',
    from_name:  c.smtp_from_name  || process.env.SMTP_FROM_NAME  || 'RecoverLab Billing',
    from_email: c.smtp_from_email || process.env.SMTP_FROM_EMAIL || c.smtp_user || process.env.SMTP_USER || '',
  };
}

/**
 * Load Super Admin SMTP config from dedicated platform_settings key,
 * falling back to Admin SMTP config, then to process.env.
 */
async function loadSuperAdminSmtpConfig() {
  let s = {};
  try {
    const r = await query("SELECT value FROM platform_settings WHERE key = 'smtp_super_admin'");
    s = r.rows[0]?.value || {};
  } catch { /* DB may not exist */ }
  const a = await loadAdminSmtpConfig();
  return {
    host:       s.host       || a.host,
    port:       s.port       || a.port,
    secure:     s.secure     ?? a.secure,
    user:       s.user       || a.user,
    pass:       s.password   || a.pass,
    from_name:  s.from_name  || a.from_name,
    from_email: s.from_email || a.from_email,
  };
}

function createTransport(cfg) {
  return nodemailer.createTransport({
    host:   cfg.host,
    port:   cfg.port,
    secure: cfg.secure,
    auth:   { user: cfg.user, pass: cfg.pass },
    tls:    { rejectUnauthorized: false },
  });
}

/**
 * Load invoice settings from platform_settings 'invoices' key,
 * with defaults fallback
 */
async function loadInvoiceSettings() {
  let settings = {};
  try {
    const result = await query("SELECT value FROM platform_settings WHERE key = 'invoices'");
    settings = result.rows[0]?.value || {};
  } catch { /* DB query failed; use defaults */ }
  
  return {
    gst_percent: settings.gst_percent ?? 18,
    invoice_prefix: settings.invoice_prefix || 'INV',
    auto_send: settings.auto_send ?? true,
    from_email: settings.from_email || 'billing@recoverlab.in',
    from_name: settings.from_name || 'RecoverLab Billing',
    subject_template: settings.subject_template || 'Your {{plan_label}} Invoice — {{invoice_number}}',
    body_intro: settings.body_intro || 'Thank you for subscribing.',
    include_pdf: settings.include_pdf ?? true,
    company_gstin: settings.company_gstin || '',
  };
}

/**
 * Generate a sequential invoice number string using invoice settings.
 */
async function generateInvoiceNumber(offset = 0) {
  const settings = await loadInvoiceSettings();
  const prefix = settings.invoice_prefix;
  const result = await query(
    `SELECT COUNT(*) AS cnt FROM saas_purchases WHERE invoice_number IS NOT NULL`
  );
  const seq    = parseInt(result.rows[0].cnt) + 1 + offset;
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}

/**
 * Generate a unique invoice number for a purchase, retrying on duplicate-key conflict.
 * @param {string} purchaseId
 * @param {number} [maxAttempts=5]
 */
async function assignInvoiceNumber(purchaseId, maxAttempts = 5) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const num = await generateInvoiceNumber(attempt);
    try {
      await query(
        'UPDATE saas_purchases SET invoice_number = $1 WHERE id = $2',
        [num, purchaseId]
      );
      return num;
    } catch (err) {
      if (err.code === '23505' && attempt < maxAttempts - 1) continue;
      throw err;
    }
  }
}

/**
 * Build PDF invoice into a file and return its path.
 * @param {object} purchase  - Row from saas_purchases joined with user data
 * @returns {Promise<string>} - Absolute file path of the generated PDF
 */
async function generatePDF(purchase) {
  const settings       = await loadInvoiceSettings();
  const invoiceNumber  = purchase.invoice_number;
  const fileName       = `${invoiceNumber}.pdf`;
  const filePath       = path.join(INVOICES_DIR, fileName);

  return new Promise((resolve, reject) => {
    const doc = new PDFDoc({ margin: 50, size: 'A4' });
    const ws  = fs.createWriteStream(filePath);

    doc.pipe(ws);
    ws.on('finish', () => resolve(filePath));
    ws.on('error',  reject);

    // ── Header ──────────────────────────────────────────────────
    doc
      .fontSize(22).font('Helvetica-Bold')
      .text('RecoverLab CRM', 50, 50)
      .fontSize(10).font('Helvetica')
      .fillColor('#666')
      .text('Professional Data Recovery Platform', 50, 78)
      .fillColor('#000');

    doc.moveTo(50, 100).lineTo(545, 100).strokeColor('#dddddd').stroke();

    // ── Invoice Label ───────────────────────────────────────────
    doc
      .fontSize(28).font('Helvetica-Bold').fillColor('#1a1a2e')
      .text('INVOICE', 350, 50)
      .fontSize(11).font('Helvetica').fillColor('#444')
      .text(`Invoice No: ${invoiceNumber}`, 350, 90)
      .text(`Date: ${new Date(purchase.paid_at || purchase.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`, 350, 106);

    // ── Bill To ─────────────────────────────────────────────────
    doc
      .fontSize(11).font('Helvetica-Bold').fillColor('#000')
      .text('Billed To:', 50, 130)
      .font('Helvetica').fillColor('#333')
      .text(purchase.full_name  || purchase.username || 'Customer', 50, 147)
      .text(purchase.email,                                          50, 163)
      .text(purchase.city       || '',                               50, 179);

    // ── Summary Box ─────────────────────────────────────────────
    doc.roundedRect(50, 220, 495, 90, 6).fillColor('#f8faff').fill();
    doc.fillColor('#000');

    const baseAmount   = parseFloat(purchase.amount || 0);
    const discount     = parseFloat(purchase.discount_amount || 0);
    const gstPct       = settings.gst_percent;
    const taxable      = baseAmount - discount;
    const gstAmount    = Math.round(taxable * gstPct / 100);
    const totalAmount  = taxable + gstAmount;

    const col1 = 60;
    const col2 = 350;
    let   y    = 232;

    const row = (label, value, bold = false) => {
      doc.fontSize(10)
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .text(label, col1, y)
        .text(value, col2, y, { width: 180, align: 'right' });
      y += 18;
    };

    row('Plan', `${purchase.plan_label || purchase.plan_key} × ${purchase.months || 1} month(s)`);
    row('Subtotal', `₹${Math.round(baseAmount).toLocaleString('en-IN')}`);
    if (discount > 0) row('Discount', `- ₹${Math.round(discount).toLocaleString('en-IN')}`);
    row(`GST (${gstPct}%)`, `₹${Math.round(gstAmount).toLocaleString('en-IN')}`);
    doc.moveTo(50, y + 2).lineTo(545, y + 2).strokeColor('#cccccc').stroke();
    y += 8;
    row('Total Paid', `₹${Math.round(totalAmount).toLocaleString('en-IN')}`, true);

    // ── Payment Info ────────────────────────────────────────────
    y += 20;
    doc
      .fontSize(9).fillColor('#888')
      .text(`Razorpay Payment ID: ${purchase.razorpay_payment_id || 'N/A'}`, 50, y)
      .text(`Order ID: ${purchase.razorpay_order_id || 'N/A'}`, 50, y + 14)
      .text(`Status: PAID`, 50, y + 28);

    // ── Footer ──────────────────────────────────────────────────
    doc
      .fontSize(8).fillColor('#aaa')
      .text('This is a system-generated invoice.', 50, 760, { align: 'center', width: 495 })
      .text('support@recoverlab.in  |  recoverlab.in', 50, 773, { align: 'center', width: 495 });

    doc.end();
  });
}

/**
 * Ensure a PDF exists for a given purchase — generate if missing, skip email.
 * Used by PDF download and Export All endpoints.
 * @param {string} purchaseId
 * @returns {Promise<{pdfPath: string, purchase: object}>}
 */
async function ensurePdf(purchaseId) {
  const result = await query(
    `SELECT sp.*, u.full_name, u.email, u.username, u.phone
     FROM saas_purchases sp
     JOIN users u ON sp.tenant_user_id = u.id
     WHERE sp.id = $1`,
    [purchaseId]
  );
  if (!result.rows.length) throw new Error(`Purchase ${purchaseId} not found`);
  const purchase = result.rows[0];

  // If PDF already on disk, return it
  if (purchase.invoice_pdf_path && fs.existsSync(purchase.invoice_pdf_path)) {
    return { pdfPath: purchase.invoice_pdf_path, purchase };
  }

  // Generate invoice number if missing (with conflict retry)
  if (!purchase.invoice_number) {
    purchase.invoice_number = await assignInvoiceNumber(purchaseId);
  }

  // Generate PDF
  const pdfPath = await generatePDF(purchase);
  await query('UPDATE saas_purchases SET invoice_pdf_path = $1 WHERE id = $2',
    [pdfPath, purchaseId]);
  return { pdfPath, purchase };
}

/**
 * Full pipeline: generate invoice number → PDF → send email → update DB.
 * @param {string} purchaseId - UUID from saas_purchases
 */
async function processInvoice(purchaseId) {
  try {
    // Fetch purchase + user details
    const result = await query(
      `SELECT sp.*, u.full_name, u.email, u.username, u.phone
       FROM saas_purchases sp
       JOIN users u ON sp.tenant_user_id = u.id
       WHERE sp.id = $1`,
      [purchaseId]
    );
    if (!result.rows.length) throw new Error(`Purchase ${purchaseId} not found`);
    const purchase = result.rows[0];

    // Reuse existing invoice number if present; otherwise generate with retry
    if (!purchase.invoice_number) {
      purchase.invoice_number = await assignInvoiceNumber(purchaseId);
    }
    const invoiceNumber = purchase.invoice_number;

    // Generate PDF
    const pdfPath = await generatePDF(purchase);
    await query(
      'UPDATE saas_purchases SET invoice_pdf_path = $1 WHERE id = $2',
      [pdfPath, purchaseId]
    );

    // Send email
    await sendEmail(purchase, pdfPath, invoiceNumber);

    await query(
      'UPDATE saas_purchases SET invoice_sent_at = NOW() WHERE id = $1',
      [purchaseId]
    );

    logger.info('Invoice processed', { purchaseId, invoiceNumber });
    return { invoiceNumber, pdfPath };
  } catch (err) {
    logger.error('Invoice processing failed', { purchaseId, error: err.message });
    throw err;
  }
}

/**
 * Send invoice email with PDF attachment using Admin SMTP config.
 */
async function sendEmail(purchase, pdfPath, invoiceNumber) {
  const smtp = await loadAdminSmtpConfig();
  if (!smtp.user) {
    logger.warn('Admin SMTP not configured — skipping invoice email');
    return;
  }

  const transport = createTransport(smtp);
  const fromName  = smtp.from_name;
  const fromEmail = smtp.from_email;

  const html = `
    <!DOCTYPE html>
    <html>
    <body style="font-family: 'Segoe UI', Arial, sans-serif; background: #f5f5f5; padding: 30px;">
      <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 40px; box-shadow: 0 2px 12px rgba(0,0,0,0.08);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #1a1a2e; margin: 0; font-size: 24px;">💾 RecoverLab</h1>
          <p style="color: #666; margin-top: 6px; font-size: 14px;">Your subscription is now active!</p>
        </div>

        <p style="color: #333; font-size: 15px;">Hi <strong>${purchase.full_name || 'there'}</strong>,</p>
        <p style="color: #555; font-size: 14px; line-height: 1.6;">
          Thank you for subscribing to the <strong>${purchase.plan_label || purchase.plan_key}</strong> plan.
          Your account has been activated and your invoice is attached to this email.
        </p>

        <div style="background: #f0f4ff; border-radius: 8px; padding: 18px 22px; margin: 24px 0;">
          <table style="width: 100%; font-size: 13px; color: #444;">
            <tr><td>Invoice Number</td><td style="text-align:right; font-weight:700; color:#1a1a2e;">${invoiceNumber}</td></tr>
            <tr><td>Plan</td><td style="text-align:right;">${purchase.plan_label || purchase.plan_key}</td></tr>
            <tr><td>Amount Paid</td><td style="text-align:right; font-weight:700;">₹${Math.round(parseFloat(purchase.amount)).toLocaleString('en-IN')}</td></tr>
            <tr><td>Payment ID</td><td style="text-align:right; font-family:monospace; font-size:12px;">${purchase.razorpay_payment_id || 'N/A'}</td></tr>
          </table>
        </div>

        <p style="color: #888; font-size: 12px; text-align: center; margin-top: 30px;">
          Need help? Email us at <a href="mailto:support@recoverlab.in" style="color:#3b82f6;">support@recoverlab.in</a>
        </p>
      </div>
    </body>
    </html>
  `;

  await transport.sendMail({
    from:        `"${fromName}" <${fromEmail}>`,
    to:          purchase.email,
    subject:     `Your ${purchase.plan_label || purchase.plan_key} Invoice — ${invoiceNumber}`,
    html,
    attachments: [{
      filename:    `${invoiceNumber}.pdf`,
      path:        pdfPath,
      contentType: 'application/pdf',
    }],
  });

  logger.info('Invoice email sent', { to: purchase.email, invoiceNumber });
}

/**
 * Send admin onboarding email using Super Admin SMTP config.
 * Called when Super Admin creates a new admin/tenant account.
 */
async function sendOnboardingEmail({ email, name, password, role, company }) {
  const smtp = await loadSuperAdminSmtpConfig();
  if (!smtp.user) {
    logger.warn('Super Admin SMTP not configured — skipping onboarding email');
    return;
  }

  const transport = createTransport(smtp);
  const loginUrl  = process.env.LOGIN_URL || 'https://app.recoverlab.in/login';
  const roleLabel = role || 'Admin';

  const html = `
    <!DOCTYPE html>
    <html>
    <body style="font-family: 'Segoe UI', Arial, sans-serif; background: #f5f5f5; padding: 30px;">
      <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 40px; box-shadow: 0 2px 12px rgba(0,0,0,0.08);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #1a1a2e; margin: 0; font-size: 24px;">Welcome to RecoverLab CRM</h1>
          <p style="color: #666; margin-top: 6px; font-size: 14px;">Your account has been created</p>
        </div>

        <p style="color: #333; font-size: 15px;">Hello <strong>${name || 'there'}</strong>,</p>
        <p style="color: #555; font-size: 14px; line-height: 1.6;">
          Your CRM account has been created${company ? ` for <strong>${company}</strong>` : ''}.
          Below are your login credentials.
        </p>

        <div style="background: #f0f4ff; border-radius: 8px; padding: 18px 22px; margin: 24px 0;">
          <table style="width: 100%; font-size: 13px; color: #444;">
            <tr><td>Role</td><td style="text-align:right; font-weight:700; color:#1a1a2e;">${roleLabel}</td></tr>
            <tr><td>Login Email</td><td style="text-align:right; font-family:monospace;">${email}</td></tr>
            <tr><td>Password</td><td style="text-align:right; font-family:monospace; font-weight:700;">${password}</td></tr>
            <tr><td>Login URL</td><td style="text-align:right; font-family:monospace; font-size:12px;"><a href="${loginUrl}" style="color:#3b82f6;">${loginUrl}</a></td></tr>
          </table>
        </div>

        <p style="color: #888; font-size: 12px; text-align: center; margin-top: 30px;">
          Please change your password after first login.<br>
          Need help? Email us at <a href="mailto:support@recoverlab.in" style="color:#3b82f6;">support@recoverlab.in</a>
        </p>
      </div>
    </body>
    </html>
  `;

  await transport.verify();
  await transport.sendMail({
    from:    `"${smtp.from_name}" <${smtp.from_email}>`,
    to:      email,
    subject: `Your CRM Account Has Been Created`,
    html,
  });

  logger.info('Onboarding email sent', { to: email, role: roleLabel });
}

async function sendAccountStatusEmail({ email, name, status, company, role }) {
  const smtp = await loadSuperAdminSmtpConfig();
  if (!smtp.user) {
    logger.warn('Super Admin SMTP not configured — skipping account status email');
    return;
  }

  const transport   = createTransport(smtp);
  const loginUrl    = process.env.LOGIN_URL || 'https://app.recoverlab.in/login';
  const statusLabel = status === 'suspended' ? 'Suspended' : status === 'active' ? 'Activated' : 'Updated';
  const subject     = status === 'suspended'
    ? 'Your CRM account has been suspended'
    : 'Your CRM account has been reactivated';

  const html = `
    <!DOCTYPE html>
    <html>
    <body style="font-family: 'Segoe UI', Arial, sans-serif; background: #f5f5f5; padding: 30px;">
      <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 40px; box-shadow: 0 2px 12px rgba(0,0,0,0.08);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #1a1a2e; margin: 0; font-size: 24px;">RecoverLab CRM Account ${statusLabel}</h1>
          <p style="color: #666; margin-top: 6px; font-size: 14px;">This is a notification about your account status.</p>
        </div>

        <p style="color: #333; font-size: 15px;">Hello <strong>${name || 'there'}</strong>,</p>
        <p style="color: #555; font-size: 14px; line-height: 1.6;">
          Your ${company ? `account for <strong>${company}</strong>` : 'account'} has been <strong>${status === 'suspended' ? 'suspended' : 'reactivated'}</strong>.
        </p>

        <div style="background: #f0f4ff; border-radius: 8px; padding: 18px 22px; margin: 24px 0;">
          <table style="width: 100%; font-size: 13px; color: #444;">
            <tr><td>Account</td><td style="text-align:right; font-weight:700; color:#1a1a2e;">${role || 'Admin'}</td></tr>
            <tr><td>Status</td><td style="text-align:right; font-family:monospace;">${statusLabel}</td></tr>
            <tr><td>Login Email</td><td style="text-align:right; font-family:monospace;">${email}</td></tr>
            <tr><td>Login URL</td><td style="text-align:right; font-family:monospace; font-size:12px;"><a href="${loginUrl}" style="color:#3b82f6;">${loginUrl}</a></td></tr>
          </table>
        </div>

        <p style="color: #888; font-size: 12px; text-align: center; margin-top: 30px;">
          If you believe this is in error, please contact support at <a href="mailto:support@recoverlab.in" style="color:#3b82f6;">support@recoverlab.in</a>.
        </p>
      </div>
    </body>
    </html>
  `;

  await transport.verify();
  await transport.sendMail({
    from:    `"${smtp.from_name}" <${smtp.from_email}>`,
    to:      email,
    subject,
    html,
  });

  logger.info('Account status email sent', { to: email, status: statusLabel });
}

module.exports = { processInvoice, generatePDF, generateInvoiceNumber, ensurePdf, assignInvoiceNumber, sendOnboardingEmail, sendAccountStatusEmail, loadAdminSmtpConfig, loadSuperAdminSmtpConfig, createTransport };

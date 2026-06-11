/**
 * Email Service
 * Handles all email communications: invoices, payment links, onboarding, etc.
 */

const nodemailer = require('nodemailer');
const logger = require('../config/logger');
const { query } = require('../config/database');

// ─── Load SMTP Configurations ──────────────────────────────────

async function loadAdminSmtpConfig() {
  let c = {};
  try {
    const result = await query("SELECT value FROM platform_settings WHERE key = 'company'");
    c = result.rows[0]?.value || {};
  } catch { /* DB may not exist; fall through to env */ }
  return {
    host: c.smtp_host || process.env.SMTP_HOST || 'smtp.gmail.com',
    port: c.smtp_port || parseInt(process.env.SMTP_PORT || '587'),
    secure: c.smtp_port === 465 || process.env.SMTP_SECURE === 'true',
    user: c.smtp_user || process.env.SMTP_USER || '',
    pass: c.smtp_password || process.env.SMTP_PASS || process.env.SMTP_PASSWORD || '',
    from_name: c.smtp_from_name || process.env.SMTP_FROM_NAME || 'RecoverLab Billing',
    from_email: c.smtp_from_email || process.env.SMTP_FROM_EMAIL || c.smtp_user || process.env.SMTP_USER || '',
  };
}

async function loadSuperAdminSmtpConfig() {
  let s = {};
  try {
    const r = await query("SELECT value FROM platform_settings WHERE key = 'smtp_super_admin'");
    s = r.rows[0]?.value || {};
  } catch { /* DB may not exist */ }
  const a = await loadAdminSmtpConfig();
  return {
    host: s.host || a.host,
    port: s.port || a.port,
    secure: s.secure ?? a.secure,
    user: s.user || a.user,
    pass: s.password || a.pass,
    from_name: s.from_name || a.from_name,
    from_email: s.from_email || a.from_email,
  };
}

function createTransport(cfg) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    tls: { rejectUnauthorized: false },
  });
}

// ─── Payment Link Email ────────────────────────────────────────

/**
 * Send payment link email to client
 * @param {object} opts
 * @param {string} opts.to - Recipient email
 * @param {string} opts.customerName - Customer name
 * @param {string} opts.paymentLink - Full payment URL
 * @param {number} opts.amount - Amount in rupees
 * @param {string} opts.planLabel - Plan name
 * @param {string} opts.description - Optional description
 * @param {string} opts.caseNumber - Optional case number
 * @param {string} opts.discount - Optional discount info
 * @param {string} opts.finalAmount - Optional final amount after discount
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendPaymentLink({
  to,
  customerName = 'Valued Customer',
  paymentLink,
  amount,
  planLabel = 'Plan',
  description = '',
  caseNumber = null,
  discount = null,
  finalAmount = null,
}) {
  try {
    if (!to) throw new Error('Recipient email (to) is required');
    if (!paymentLink) throw new Error('Payment link is required');

    const smtp = await loadAdminSmtpConfig();
    if (!smtp.user) {
      logger.warn('Admin SMTP not configured — cannot send payment link email');
      return { success: false, error: 'SMTP not configured' };
    }

    const transport = createTransport(smtp);
    const fromName = smtp.from_name;
    const fromEmail = smtp.from_email;

    // Format amounts
    const displayAmount = typeof amount === 'number' ? amount : parseFloat(amount);
    const displayFinal = finalAmount ? (typeof finalAmount === 'number' ? finalAmount : parseFloat(finalAmount)) : displayAmount;

    const html = `
      <!DOCTYPE html>
      <html>
      <body style="font-family: 'Segoe UI', Arial, sans-serif; background: #f5f5f5; padding: 30px;">
        <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 40px; box-shadow: 0 2px 12px rgba(0,0,0,0.08);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1a1a2e; margin: 0; font-size: 24px;">💾 RecoverLab</h1>
            <p style="color: #666; margin-top: 6px; font-size: 14px;">Data Recovery Payment Request</p>
          </div>

          <p style="color: #333; font-size: 15px;">Hi <strong>${customerName}</strong>,</p>
          <p style="color: #555; font-size: 14px; line-height: 1.6;">
            We have prepared your payment request for ${planLabel}. Please review the details below and proceed with payment.
          </p>

          <div style="background: #f0f4ff; border-radius: 8px; padding: 20px; margin: 24px 0; border-left: 4px solid #3b82f6;">
            <table style="width: 100%; font-size: 13px; color: #444;">
              ${caseNumber ? `<tr><td style="padding: 6px 0;"><strong>Case Number</strong></td><td style="text-align:right; font-family:monospace;">${caseNumber}</td></tr>` : ''}
              <tr><td style="padding: 6px 0;"><strong>Service</strong></td><td style="text-align:right;">${planLabel}</td></tr>
              <tr><td style="padding: 6px 0;"><strong>Amount</strong></td><td style="text-align:right;">₹${displayAmount.toLocaleString('en-IN')}</td></tr>
              ${discount ? `<tr><td style="padding: 6px 0;"><strong>Discount Applied</strong></td><td style="text-align:right; color: #10b981;">${discount}</td></tr>` : ''}
              ${displayFinal !== displayAmount ? `<tr style="border-top: 1px solid #e5e7eb;"><td style="padding: 6px 0;"><strong>Final Amount</strong></td><td style="text-align:right; font-weight: 700; color: #1a1a2e; font-size: 14px;">₹${displayFinal.toLocaleString('en-IN')}</td></tr>` : ''}
            </table>
          </div>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${paymentLink}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px;">
              Complete Payment
            </a>
          </div>

          <p style="color: #666; font-size: 13px; text-align: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            <strong>Payment Link:</strong><br>
            <code style="background: #f3f4f6; padding: 8px 12px; border-radius: 4px; font-size: 12px; word-break: break-all;">
              ${paymentLink}
            </code>
          </p>

          ${description ? `<p style="color: #555; font-size: 13px; text-align: center; margin-top: 15px;">${description}</p>` : ''}

          <p style="color: #888; font-size: 12px; text-align: center; margin-top: 30px;">
            Questions? Reply to this email or contact us at <a href="mailto:support@recoverlab.in" style="color:#3b82f6;">support@recoverlab.in</a><br>
            <strong>Company:</strong> RecoverLab Data Recovery<br>
            <strong>Contact:</strong> +91-XXXX-XXXX-XX
          </p>
        </div>
      </body>
      </html>
    `;

    const info = await transport.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject: `Payment Request: ${planLabel} — ₹${displayFinal.toLocaleString('en-IN')}`,
      html,
    });

    logger.info('Payment link email sent', { to, planLabel, messageId: info.messageId });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    logger.error('Failed to send payment link email', { error: err.message, to });
    return { success: false, error: err.message };
  }
}

// ─── Case Payment Received Email ───────────────────────────────

/**
 * Send payment received confirmation email
 * @param {object} opts
 */
async function sendPaymentReceivedEmail({
  to,
  clientName = 'Valued Client',
  caseNumber,
  amount,
  paymentMethod = 'Online',
  discount = null,
  finalAmount = null,
}) {
  try {
    if (!to) throw new Error('Recipient email (to) is required');

    const smtp = await loadAdminSmtpConfig();
    if (!smtp.user) {
      logger.warn('Admin SMTP not configured — cannot send payment received email');
      return { success: false, error: 'SMTP not configured' };
    }

    const transport = createTransport(smtp);
    const fromName = smtp.from_name;
    const fromEmail = smtp.from_email;

    const displayAmount = typeof amount === 'number' ? amount : parseFloat(amount);
    const displayFinal = finalAmount ? (typeof finalAmount === 'number' ? finalAmount : parseFloat(finalAmount)) : displayAmount;

    const html = `
      <!DOCTYPE html>
      <html>
      <body style="font-family: 'Segoe UI', Arial, sans-serif; background: #f5f5f5; padding: 30px;">
        <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 40px; box-shadow: 0 2px 12px rgba(0,0,0,0.08);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #10b981; margin: 0; font-size: 24px;">✓ Payment Received</h1>
            <p style="color: #666; margin-top: 6px; font-size: 14px;">Your payment has been successfully processed</p>
          </div>

          <p style="color: #333; font-size: 15px;">Hi <strong>${clientName}</strong>,</p>
          <p style="color: #555; font-size: 14px; line-height: 1.6;">
            Thank you! We have received your payment for case <strong>${caseNumber}</strong>.
          </p>

          <div style="background: #f0f4ff; border-radius: 8px; padding: 20px; margin: 24px 0; border-left: 4px solid #10b981;">
            <table style="width: 100%; font-size: 13px; color: #444;">
              <tr><td style="padding: 6px 0;"><strong>Case Number</strong></td><td style="text-align:right; font-family:monospace;">${caseNumber}</td></tr>
              <tr><td style="padding: 6px 0;"><strong>Amount Paid</strong></td><td style="text-align:right;">₹${displayAmount.toLocaleString('en-IN')}</td></tr>
              ${discount ? `<tr><td style="padding: 6px 0;"><strong>Discount</strong></td><td style="text-align:right; color: #10b981;">${discount}</td></tr>` : ''}
              <tr><td style="padding: 6px 0;"><strong>Payment Method</strong></td><td style="text-align:right;">${paymentMethod}</td></tr>
              <tr style="border-top: 1px solid #e5e7eb;"><td style="padding: 6px 0;"><strong>Date</strong></td><td style="text-align:right;">${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</td></tr>
            </table>
          </div>

          <p style="color: #666; font-size: 13px; text-align: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            Your case is now active and our team is working on your data recovery.
          </p>

          <p style="color: #888; font-size: 12px; text-align: center; margin-top: 30px;">
            Questions? Contact us at <a href="mailto:support@recoverlab.in" style="color:#3b82f6;">support@recoverlab.in</a><br>
            <strong>RecoverLab Data Recovery Team</strong>
          </p>
        </div>
      </body>
      </html>
    `;

    const info = await transport.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject: `Payment Confirmation — Case ${caseNumber}`,
      html,
    });

    logger.info('Payment received email sent', { to, caseNumber, messageId: info.messageId });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    logger.error('Failed to send payment received email', { error: err.message, to });
    return { success: false, error: err.message };
  }
}

module.exports = {
  sendPaymentLink,
  sendPaymentReceivedEmail,
  loadAdminSmtpConfig,
  loadSuperAdminSmtpConfig,
  createTransport,
};

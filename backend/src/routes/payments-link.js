/**
 * Payment Link Generation Service
 * Separate from Razorpay Checkout flow
 * 
 * Endpoints:
 * POST /api/super-admin/payment-link/generate - Generate shareable payment link
 * GET  /api/super-admin/payment-link/:link_id  - Get link details
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const logger = require('../config/logger');
const { query } = require('../config/database');
const { authenticate, requireSuperAdminPermission } = require('../middleware/auth');

// Load services
const razorpayService = require('../services/razorpayService');
const emailService = require('../services/emailService');
const { logActivity } = require('../utils/activityLogger');

// ═══════════════════════════════════════════════════════════════
// HELPER: Load Razorpay Credentials
// ═══════════════════════════════════════════════════════════════

async function loadSavedRazorpayCredentials() {
  try {
    const result = await query(`SELECT value FROM platform_settings WHERE key = 'razorpay_credentials'`);
    
    if (result.rows.length > 0) {
      const stored = result.rows[0].value;
      const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
      return {
        key_id: parsed?.key_id || process.env.RAZORPAY_KEY_ID,
        key_secret: parsed?.key_secret || process.env.RAZORPAY_KEY_SECRET,
        webhook_secret: parsed?.webhook_secret || process.env.RAZORPAY_WEBHOOK_SECRET,
      };
    }
  } catch (err) {
    logger.warn('Failed to load Razorpay credentials from database', { error: err.message });
  }

  // Fallback to env vars
  return {
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
    webhook_secret: process.env.RAZORPAY_WEBHOOK_SECRET,
  };
}

// ═══════════════════════════════════════════════════════════════
// POST /api/payment-link/generate
// Generate a shareable Razorpay payment link (NOT checkout)
// ═══════════════════════════════════════════════════════════════

router.post('/generate',
  authenticate,
  requireSuperAdminPermission('payments', 'create'),
  [
    body('amount').isFloat({ min: 1 }).withMessage('Amount must be >= 1'),
    body('plan_key').notEmpty().withMessage('Plan key required'),
    body('months').isInt({ min: 1 }).withMessage('Months must be >= 1'),
    body('description').optional().isString(),
    body('customer_email').optional().isEmail(),
    body('customer_name').optional().isString(),
    body('tenant_user_id').optional().isUUID(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { amount, plan_key, plan_label, months, description, customer_email, customer_name, tenant_user_id } = req.body;

    try {
      logger.info('Generating payment link', { 
        amount, 
        plan_key, 
        months,
        tenant_id: tenant_user_id || 'new'
      });

      // Load Razorpay credentials
      const razorpayCredentials = await loadSavedRazorpayCredentials();

      if (!razorpayCredentials.key_id || !razorpayCredentials.key_secret) {
        logger.error('Razorpay credentials not configured');
        return res.status(500).json({
          error: 'Razorpay not configured. Configure in Super Admin → Email Deliverability'
        });
      }

      // Validate credentials
      if (razorpayCredentials.key_id.includes('YOUR_KEY_ID') || 
          razorpayCredentials.key_secret.includes('YOUR_RAZORPAY_KEY_SECRET')) {
        logger.error('Razorpay credentials are placeholder values');
        return res.status(500).json({
          error: 'Razorpay credentials not properly configured'
        });
      }

      // Create Razorpay short URL / payment link
      // Note: Razorpay API doesn't have a direct "create link" endpoint in Node SDK
      // Instead, we create and store the order details, then generate shareable link
      
      // Create payment record to track this link
      const linkResult = await query(
        `INSERT INTO payment_links (
          tenant_user_id,
          plan_key,
          plan_label,
          amount,
          months,
          description,
          customer_email,
          customer_name,
          status,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9)
         RETURNING id, created_at`,
        [
          tenant_user_id || null,
          plan_key,
          plan_label || plan_key,
          amount,
          months,
          description || null,
          customer_email || null,
          customer_name || null,
          req.user?.id || null
        ]
      );

      const linkId = linkResult.rows[0].id;

      // Generate shareable link
      const baseUrl = process.env.FRONTEND_URL || 'https://app.recoverlab.in';
      const paymentLink = `${baseUrl}/payment/${linkId}`;

      logger.info('Payment link generated', { linkId, paymentLink });

      // Auto-send email if customer email provided
      let emailSent = false;
      let emailError = null;
      if (customer_email) {
        try {
          const emailResult = await emailService.sendPaymentLink({
            to: customer_email,
            customerName: customer_name || 'Customer',
            paymentLink,
            amount,
            planLabel: plan_label || plan_key,
            description: description || '',
          });

          if (emailResult.success) {
            emailSent = true;
            
            // Track email delivery
            await query(
              `INSERT INTO payment_link_email_tracking (
                payment_link_id, recipient_email, email_type, status, message_id, sent_at
              ) VALUES ($1, $2, 'payment_link', 'sent', $3, NOW())`,
              [linkId, customer_email, emailResult.messageId || null]
            );

            // Update payment link email status
            await query(
              `UPDATE payment_links SET email_sent_at = NOW(), email_status = 'sent' WHERE id = $1`,
              [linkId]
            );

            // Log activity
            await logActivity({
              user: req.user,
              action: 'PAYMENT_LINK_EMAIL_SENT',
              module: 'payments',
              resourceType: 'payment_link',
              resourceId: linkId,
              title: 'Payment Link Email Sent',
              description: `Payment link email sent to ${customer_email}`,
              metadata: {
                payment_link_id: linkId,
                recipient_email: customer_email,
                customer_name,
                amount,
                plan_key,
                message_id: emailResult.messageId,
              },
            });

            logger.info('Payment link email sent', { email: customer_email, linkId, messageId: emailResult.messageId });
          } else {
            emailError = emailResult.error;
            
            // Track failed email delivery
            await query(
              `INSERT INTO payment_link_email_tracking (
                payment_link_id, recipient_email, email_type, status, error_message
              ) VALUES ($1, $2, 'payment_link', 'failed', $3)`,
              [linkId, customer_email, emailError]
            );

            // Update payment link email status
            await query(
              `UPDATE payment_links SET email_status = 'failed' WHERE id = $1`,
              [linkId]
            );

            // Log activity for failed email
            await logActivity({
              user: req.user,
              action: 'PAYMENT_LINK_EMAIL_FAILED',
              module: 'payments',
              resourceType: 'payment_link',
              resourceId: linkId,
              title: 'Payment Link Email Failed',
              description: `Failed to send payment link email to ${customer_email}: ${emailError}`,
              metadata: {
                payment_link_id: linkId,
                recipient_email: customer_email,
                error: emailError,
              },
            });

            logger.warn('Failed to send payment link email', { 
              email: customer_email, 
              error: emailError 
            });
          }
        } catch (emailErr) {
          emailError = emailErr.message;
          
          // Track unexpected email error
          await query(
            `INSERT INTO payment_link_email_tracking (
              payment_link_id, recipient_email, email_type, status, error_message
            ) VALUES ($1, $2, 'payment_link', 'failed', $3)`,
            [linkId, customer_email, emailError]
          );

          logger.error('Unexpected error sending payment link email', { 
            email: customer_email, 
            error: emailErr.message,
            stack: emailErr.stack
          });
        }
      }

      res.json({
        link_id: linkId,
        payment_link: paymentLink,
        amount,
        plan_key,
        plan_label,
        months,
        status: 'active',
        created_at: linkResult.rows[0].created_at,
        customer_email,
        customer_name,
        email_sent: emailSent,
        email_error: emailError
      });
    } catch (err) {
      logger.error('Payment link generation error', { error: err.message, stack: err.stack });
      res.status(500).json({ error: err.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════
// GET /api/payment-link/:link_id/email-status
// Get email delivery status for a payment link
// ═══════════════════════════════════════════════════════════════

router.get('/:link_id/email-status', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT 
        id,
        payment_link_id,
        recipient_email,
        email_type,
        status,
        message_id,
        error_message,
        sent_at,
        delivered_at,
        created_at
      FROM payment_link_email_tracking 
      WHERE payment_link_id = $1 
      ORDER BY created_at DESC`,
      [req.params.link_id]
    );

    res.json({
      link_id: req.params.link_id,
      email_tracking: result.rows
    });
  } catch (err) {
    logger.error('Failed to fetch email tracking', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════

router.get('/:link_id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM payment_links WHERE id = $1`,
      [req.params.link_id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Payment link not found' });
    }

    const link = result.rows[0];

    // Don't return sensitive data publicly
    res.json({
      id: link.id,
      amount: link.amount,
      plan_key: link.plan_key,
      plan_label: link.plan_label,
      months: link.months,
      status: link.status,
      created_at: link.created_at,
      expires_at: link.expires_at,
      customer_email: link.customer_email,
      customer_name: link.customer_name,
      description: link.description
    });
  } catch (err) {
    logger.error('Failed to fetch payment link', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/payment-link/:link_id/resend-email
// Resend payment link email to customer
// ═══════════════════════════════════════════════════════════════

router.post('/:link_id/resend-email',
  authenticate,
  requireSuperAdminPermission('payments', 'create'),
  [
    body('email').isEmail().withMessage('Valid email required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    try {
      const { email } = req.body;

      // Get payment link
      const linkResult = await query(
        `SELECT * FROM payment_links WHERE id = $1`,
        [req.params.link_id]
      );

      if (!linkResult.rows.length) {
        return res.status(404).json({ error: 'Payment link not found' });
      }

      const link = linkResult.rows[0];
      const baseUrl = process.env.FRONTEND_URL || 'https://app.recoverlab.in';
      const paymentLink = `${baseUrl}/payment/${link.id}`;

      // Send email
      let emailSent = false;
      let emailError = null;

      try {
        const emailResult = await emailService.sendPaymentLink({
          to: email,
          customerName: link.customer_name || 'Customer',
          paymentLink,
          amount: link.amount,
          planLabel: link.plan_label || link.plan_key,
          description: link.description || '',
        });

        if (emailResult.success) {
          emailSent = true;

          // Track email delivery
          await query(
            `INSERT INTO payment_link_email_tracking (
              payment_link_id, recipient_email, email_type, status, message_id, sent_at
            ) VALUES ($1, $2, 'payment_link_resend', 'sent', $3, NOW())`,
            [link.id, email, emailResult.messageId || null]
          );

          // Log activity
          await logActivity({
            user: req.user,
            action: 'PAYMENT_LINK_EMAIL_RESENT',
            module: 'payments',
            resourceType: 'payment_link',
            resourceId: link.id,
            title: 'Payment Link Email Resent',
            description: `Payment link email resent to ${email}`,
            metadata: {
              payment_link_id: link.id,
              recipient_email: email,
              message_id: emailResult.messageId,
            },
          });

          logger.info('Payment link email resent', { email, linkId: link.id });
        } else {
          emailError = emailResult.error;

          // Track failed email delivery
          await query(
            `INSERT INTO payment_link_email_tracking (
              payment_link_id, recipient_email, email_type, status, error_message
            ) VALUES ($1, $2, 'payment_link_resend', 'failed', $3)`,
            [link.id, email, emailError]
          );

          logger.warn('Failed to resend payment link email', { email, error: emailError });
        }
      } catch (emailErr) {
        emailError = emailErr.message;
        await query(
          `INSERT INTO payment_link_email_tracking (
            payment_link_id, recipient_email, email_type, status, error_message
          ) VALUES ($1, $2, 'payment_link_resend', 'failed', $3)`,
          [link.id, email, emailError]
        );
        logger.error('Error resending payment link email', { email, error: emailErr.message });
      }

      res.json({
        link_id: link.id,
        email,
        email_sent: emailSent,
        email_error: emailError,
        message: emailSent 
          ? 'Payment link email sent successfully' 
          : `Failed to send email: ${emailError}`
      });
    } catch (err) {
      logger.error('Resend email error', { error: err.message });
      res.status(500).json({ error: err.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════

router.post('/:link_id/checkout',
  authenticate,
  [
    body('customer_email').optional().isEmail(),
    body('customer_name').optional().isString(),
  ],
  async (req, res) => {
    try {
      // Get payment link
      const linkResult = await query(
        `SELECT * FROM payment_links WHERE id = $1`,
        [req.params.link_id]
      );

      if (!linkResult.rows.length) {
        return res.status(404).json({ error: 'Payment link not found' });
      }

      const link = linkResult.rows[0];

      if (link.status !== 'active') {
        return res.status(400).json({ error: `Payment link is ${link.status}` });
      }

      if (link.expires_at && new Date(link.expires_at) < new Date()) {
        return res.status(400).json({ error: 'Payment link has expired' });
      }

      // Load Razorpay credentials
      const razorpayCredentials = await loadSavedRazorpayCredentials();

      if (!razorpayCredentials.key_id || !razorpayCredentials.key_secret) {
        return res.status(500).json({ error: 'Razorpay not configured' });
      }

      // Create Razorpay order
      const order = await razorpayService.createOrder({
        amount: link.amount,
        receipt: link.id,
        notes: {
          plan_key: link.plan_key,
          months: link.months,
          payment_link_id: link.id,
        },
        keyId: razorpayCredentials.key_id,
        keySecret: razorpayCredentials.key_secret,
      });

      if (!order || !order.id) {
        logger.error('Razorpay order creation failed', { link_id: link.id });
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
        [
          link.tenant_user_id || null,
          link.plan_key,
          link.plan_label,
          link.amount,
          link.months,
          order.id
        ]
      );

      // Update payment link with purchase reference
      await query(
        `UPDATE payment_links 
         SET purchase_id = $1, razorpay_order_id = $2, status = 'checkout_initiated'
         WHERE id = $3`,
        [purchaseResult.rows[0].id, order.id, link.id]
      );

      logger.info('Checkout initiated from payment link', {
        link_id: link.id,
        order_id: order.id,
        purchase_id: purchaseResult.rows[0].id
      });

      res.json({
        order_id: order.id,
        purchase_id: purchaseResult.rows[0].id,
        amount: order.amount,
        currency: order.currency,
        key_id: razorpayCredentials.key_id,
      });
    } catch (err) {
      logger.error('Checkout initiation error', { error: err.message });
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;

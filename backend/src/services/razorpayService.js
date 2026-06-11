/**
 * Razorpay Service - SECURITY HARDENED
 * Handles order creation, payment verification, and webhook signature validation.
 * Security features:
 * - Webhook signature verification
 * - Payment amount validation against order
 * - Duplicate payment prevention
 * - Audit logging for all payment operations
 * - Secret masking in logs
 */

const crypto = require('crypto');
const logger = require('../config/logger');
const { query } = require('../config/database');

let _razorpay = null;
function getRazorpay(keyId, keySecret) {
  const resolvedKeyId = keyId || process.env.RAZORPAY_KEY_ID;
  const resolvedKeySecret = keySecret || process.env.RAZORPAY_KEY_SECRET;

  if (!resolvedKeyId || !resolvedKeySecret) {
    throw new Error('Razorpay credentials not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env or save them in Settings.');
  }

  if (
    !_razorpay ||
    _razorpay.__keyId !== resolvedKeyId ||
    _razorpay.__keySecret !== resolvedKeySecret
  ) {
    const Razorpay = require('razorpay');
    _razorpay = new Razorpay({
      key_id: resolvedKeyId,
      key_secret: resolvedKeySecret,
    });
    _razorpay.__keyId = resolvedKeyId;
    _razorpay.__keySecret = resolvedKeySecret;
  }
  return _razorpay;
}

/**
 * Create a Razorpay order.
 * @param {object} opts
 * @param {number}  opts.amount      - Amount in rupees (will be converted to paise)
 * @param {string}  opts.currency    - e.g. 'INR'
 * @param {string}  opts.receipt     - Internal reference (purchase UUID)
 * @param {object}  opts.notes       - Arbitrary key-value metadata
 * @param {string}  opts.keyId       - Optional API key id
 * @param {string}  opts.keySecret   - Optional API key secret
 * @returns {Promise<object>}         - Razorpay order object
 */
async function createOrder({ amount, currency = 'INR', receipt, notes = {}, keyId, keySecret }) {
  try {
    if (!keyId || !keySecret) {
      throw new Error('Razorpay API credentials (keyId and keySecret) are required');
    }

    if (!amount || amount < 1) {
      throw new Error('Amount must be at least 1 rupee');
    }

    const razorpayInstance = getRazorpay(keyId, keySecret);
    const orderData = {
      amount:   Math.round(amount * 100), // convert ₹ → paise
      currency,
      receipt,
      notes,
    };

    logger.info('Creating Razorpay order', { 
      receipt, 
      amount, 
      amountInPaise: orderData.amount,
      keyIdPrefix: keyId.substring(0, 10) + '...'
    });

    const order = await razorpayInstance.orders.create(orderData);
    
    if (!order || !order.id) {
      throw new Error('Razorpay API did not return a valid order ID');
    }

    logger.info('Razorpay order created successfully', { orderId: order.id, amount, receipt });
    return order;
  } catch (err) {
    logger.error('Razorpay createOrder error', { 
      error: err.message,
      receipt,
      keyIdProvided: !!keyId
    });
    throw err;
  }
}

/**
 * Verify payment signature after client-side Razorpay checkout.
 * Returns true if valid.
 */
function verifyPaymentSignature({ orderId, paymentId, signature, keySecret }) {
  const resolvedSecret = keySecret || process.env.RAZORPAY_KEY_SECRET;
  if (!resolvedSecret) {
    throw new Error('Razorpay key secret not configured. Set RAZORPAY_KEY_SECRET in .env or save it in Settings.');
  }

  const body = `${orderId}|${paymentId}`;
  const expected = crypto
    .createHmac('sha256', resolvedSecret)
    .update(body)
    .digest('hex');

  const valid = crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(signature, 'hex')
  );
  if (!valid) {
    logger.warn('Razorpay signature mismatch detected', { orderId, paymentId });
  }
  return valid;
}

/**
 * Verify incoming webhook signature with timing-safe comparison
 * rawBody must be the raw Buffer from express.raw()
 */
function verifyWebhookSignature(rawBody, signature, webhookSecret) {
  const secret = webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('RAZORPAY_WEBHOOK_SECRET not configured. Save the webhook secret in Settings or set it in .env.');
  }

  try {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const valid = crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signature, 'hex')
    );
    
    if (!valid) {
      logger.warn('Webhook signature validation failed');
    }
    
    return valid;
  } catch (err) {
    logger.error('Webhook signature verification error', { error: err.message });
    return false;
  }
}

/**
 * Validate payment amount matches order amount
 * @param {number} paymentAmount - Amount from payment in paise
 * @param {number} orderAmount - Amount from order in paise
 * @returns {boolean} True if amounts match
 */
function validatePaymentAmount(paymentAmount, orderAmount) {
  const valid = paymentAmount === orderAmount;
  if (!valid) {
    logger.warn('Payment amount mismatch detected', {
      paymentAmount,
      orderAmount,
      difference: paymentAmount - orderAmount
    });
  }
  return valid;
}

/**
 * Check if payment has already been processed (duplicate prevention)
 * @param {string} paymentId - Razorpay payment ID
 * @returns {Promise<boolean>} True if payment already recorded
 */
async function isDuplicatePayment(paymentId) {
  try {
    const result = await query(
      'SELECT id FROM payments WHERE razorpay_payment_id = $1 LIMIT 1',
      [paymentId]
    );
    return result.rows.length > 0;
  } catch (err) {
    logger.error('Error checking duplicate payment', { error: err.message, paymentId });
    // Fail safe: treat as duplicate on error
    return true;
  }
}

/**
 * Audit log for payment operations
 * @param {object} opts - Audit information
 */
async function auditPaymentOperation(opts) {
  const {
    action,
    paymentId,
    orderId,
    amount,
    status,
    error,
    userId,
    tenantId,
    metadata = {}
  } = opts;

  try {
    await query(
      `INSERT INTO payment_audit_logs (
        action, razorpay_payment_id, razorpay_order_id, amount, status, 
        error_message, user_id, tenant_id, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [
        action,
        paymentId,
        orderId,
        amount,
        status,
        error,
        userId,
        tenantId,
        JSON.stringify(metadata)
      ]
    );
  } catch (err) {
    logger.error('Failed to audit payment operation', { error: err.message, action, paymentId });
  }
}

/**
 * Fetch a Razorpay order's details (for reconciliation).
 */
async function fetchOrder(orderId, keyId, keySecret) {
  return getRazorpay(keyId, keySecret).orders.fetch(orderId);
}

/**
 * Fetch payment details.
 */
async function fetchPayment(paymentId, keyId, keySecret) {
  return getRazorpay(keyId, keySecret).payments.fetch(paymentId);
}

/**
 * Create a refund for a payment with audit logging.
 * @param {object} opts
 * @param {string}  opts.paymentId   - Razorpay payment ID
 * @param {number}  opts.amount      - Amount in paise (optional, full refund if not provided)
 * @param {object}  opts.notes       - Arbitrary key-value metadata
 * @param {string}  opts.keyId       - Optional API key id
 * @param {string}  opts.keySecret   - Optional API key secret
 * @returns {Promise<object>}         - Razorpay refund object
 */
async function createRefund({ paymentId, amount, notes = {}, keyId, keySecret, userId, tenantId }) {
  try {
    const refundData = {
      payment_id: paymentId,
      notes,
    };
    
    // If amount is specified, add it (in paise)
    if (amount) {
      refundData.amount = amount;
    }
    
    const refund = await getRazorpay(keyId, keySecret).payments.refund(paymentId, refundData);
    
    // Audit the refund operation
    await auditPaymentOperation({
      action: 'refund_created',
      paymentId,
      amount,
      status: 'success',
      userId,
      tenantId,
      metadata: { refundId: refund.id }
    });
    
    logger.info('Razorpay refund created', { refundId: refund.id, paymentId });
    return refund;
  } catch (err) {
    // Audit the failed refund
    await auditPaymentOperation({
      action: 'refund_failed',
      paymentId,
      amount,
      status: 'failed',
      error: err.message,
      userId,
      tenantId
    });
    
    logger.error('Razorpay createRefund error', { error: err.message, paymentId });
    throw err;
  }
}

module.exports = {
  createOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
  validatePaymentAmount,
  isDuplicatePayment,
  auditPaymentOperation,
  fetchOrder,
  fetchPayment,
  createRefund,
};

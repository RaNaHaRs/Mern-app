/**
 * Razorpay Service
 * Handles order creation, payment verification, and webhook signature validation.
 */

const crypto = require('crypto');
const logger = require('../config/logger');

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
      keyIdProvided: !!keyId,
      keySecretProvided: !!keySecret
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
  if (!valid) logger.warn('Razorpay signature mismatch', { orderId, paymentId });
  return valid;
}

/**
 * Verify incoming webhook signature.
 * rawBody must be the raw Buffer from express.raw()
 */
function verifyWebhookSignature(rawBody, signature, webhookSecret) {
  const secret = webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new Error('RAZORPAY_WEBHOOK_SECRET not configured. Save the webhook secret in Settings or set it in .env.');

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(signature, 'hex')
  );
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
 * Create a refund for a payment.
 * @param {object} opts
 * @param {string}  opts.paymentId   - Razorpay payment ID
 * @param {number}  opts.amount      - Amount in paise (optional, full refund if not provided)
 * @param {object}  opts.notes       - Arbitrary key-value metadata
 * @param {string}  opts.keyId       - Optional API key id
 * @param {string}  opts.keySecret   - Optional API key secret
 * @returns {Promise<object>}         - Razorpay refund object
 */
async function createRefund({ paymentId, amount, notes = {}, keyId, keySecret }) {
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
    logger.info('Razorpay refund created', { refundId: refund.id, paymentId, amount });
    return refund;
  } catch (err) {
    logger.error('Razorpay createRefund error', { error: err.message, paymentId });
    throw err;
  }
}

module.exports = {
  createOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
  fetchOrder,
  fetchPayment,
  createRefund,
};

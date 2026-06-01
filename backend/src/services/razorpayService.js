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
    const order = await getRazorpay(keyId, keySecret).orders.create({
      amount:   Math.round(amount * 100), // convert ₹ → paise
      currency,
      receipt,
      notes,
    });
    logger.info('Razorpay order created', { orderId: order.id, amount });
    return order;
  } catch (err) {
    logger.error('Razorpay createOrder error', { error: err.message });
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

module.exports = {
  createOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
  fetchOrder,
  fetchPayment,
};

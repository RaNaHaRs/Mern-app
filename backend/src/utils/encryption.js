const crypto = require('crypto');
const logger = require('../config/logger');

/**
 * AES-256-GCM Encryption Service
 * - Uses unique IV for each encryption (prevents pattern attacks)
 * - Returns base64-encoded ciphertexts with IV + tag prepended
 * - Requires ENCRYPTION_KEY env var (64 hex characters = 32 bytes)
 */

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

// Validate encryption key on startup
function validateEncryptionKey() {
  if (!ENCRYPTION_KEY) {
    logger.error('ENCRYPTION_KEY environment variable is not set');
    throw new Error('ENCRYPTION_KEY is required for encryption service');
  }

  if (ENCRYPTION_KEY.length !== 64) {
    logger.error(`ENCRYPTION_KEY must be 64 hex characters (32 bytes), got ${ENCRYPTION_KEY.length}`);
    throw new Error('ENCRYPTION_KEY must be exactly 64 hex characters');
  }

  try {
    const keyBuffer = Buffer.from(ENCRYPTION_KEY, 'hex');
    if (keyBuffer.length !== 32) {
      throw new Error(`Key buffer should be 32 bytes, got ${keyBuffer.length}`);
    }
  } catch (err) {
    logger.error(`ENCRYPTION_KEY must be valid hex: ${err.message}`);
    throw new Error('ENCRYPTION_KEY must be valid hexadecimal');
  }
}

/**
 * Encrypt plaintext using AES-256-GCM
 * Format: base64(iv + ciphertext + authTag)
 * @param {string} plaintext - Data to encrypt
 * @returns {string} Base64-encoded encrypted data with IV and auth tag
 */
function encrypt(plaintext) {
  try {
    validateEncryptionKey();
    
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    const iv = crypto.randomBytes(16); // 128-bit IV for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Format: IV (32 hex chars) + authTag (32 hex chars) + ciphertext
    const combined = iv.toString('hex') + authTag.toString('hex') + encrypted;
    return Buffer.from(combined, 'hex').toString('base64');
  } catch (err) {
    logger.error('Encryption failed', { error: err.message });
    throw new Error('Encryption operation failed');
  }
}

/**
 * Decrypt ciphertext using AES-256-GCM
 * @param {string} ciphertext - Base64-encoded encrypted data with IV and auth tag
 * @returns {string} Decrypted plaintext
 */
function decrypt(ciphertext) {
  try {
    validateEncryptionKey();
    
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    
    // Decode from base64
    const combined = Buffer.from(ciphertext, 'base64').toString('hex');
    
    // Extract components
    // IV is 32 hex chars (16 bytes), authTag is 32 hex chars (16 bytes)
    const iv = Buffer.from(combined.slice(0, 32), 'hex');
    const authTag = Buffer.from(combined.slice(32, 64), 'hex');
    const encrypted = combined.slice(64);
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (err) {
    logger.error('Decryption failed', { error: err.message });
    throw new Error('Decryption operation failed or data is corrupted');
  }
}

/**
 * Hash a value using SHA-256 (for token hashing)
 * @param {string} value - Value to hash
 * @returns {string} Hex-encoded SHA-256 hash
 */
function hashToken(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Generate a secure random token
 * @param {number} length - Length in bytes (default: 32)
 * @returns {string} Hex-encoded random token
 */
function generateToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

module.exports = {
  encrypt,
  decrypt,
  hashToken,
  generateToken,
  validateEncryptionKey,
};

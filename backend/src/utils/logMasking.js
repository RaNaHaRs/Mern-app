/**
 * Sensitive Data Masking for Logging
 * Masks passwords, tokens, secrets, and other sensitive values before logging
 */

// Patterns for matching sensitive data
const MASK_PATTERNS = [
  // Passwords: password: "...", password='...', password:...
  {
    name: 'password',
    pattern: /(["\']?password["\']?\s*[:=]\s*["\']?)([^"'\s,}\]]+)(["\']?)/gi,
    replacement: (match, prefix, value, suffix) => `${prefix}[MASKED]${suffix}`
  },
  // API Keys and tokens: apiKey, api_key, token, accessToken, etc.
  {
    name: 'apiKey',
    pattern: /(["\']?(?:api[_-]?)?(?:access|refresh)?[_-]?key["\']?\s*[:=]\s*["\']?)([^"'\s,}\]]+)(["\']?)/gi,
    replacement: (match, prefix, value, suffix) => `${prefix}[MASKED_KEY_${value.substring(0, 4)}...]${suffix}`
  },
  // Secrets: secret, apiSecret, clientSecret, etc.
  {
    name: 'secret',
    pattern: /(["\']?(?:client[_-])?(?:api[_-])?secret["\']?\s*[:=]\s*["\']?)([^"'\s,}\]]+)(["\']?)/gi,
    replacement: (match, prefix, value, suffix) => `${prefix}[MASKED_SECRET_${value.substring(0, 4)}...]${suffix}`
  },
  // Bearer tokens in Authorization headers
  {
    name: 'bearerToken',
    pattern: /(Bearer\s+)([A-Za-z0-9\-._~+/]+=*)/gi,
    replacement: (match, prefix, token) => `${prefix}[MASKED_TOKEN_${token.substring(0, 4)}...]`
  },
  // Credit card numbers (basic pattern)
  {
    name: 'creditCard',
    pattern: /\b(\d{4}[\s-]?){3}\d{4}\b/g,
    replacement: '[MASKED_CC_XXXX_XXXX_XXXX_...]'
  },
  // Email addresses (optional - enable carefully)
  // {
  //   name: 'email',
  //   pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  //   replacement: '[MASKED_EMAIL]'
  // },
  // Database passwords
  {
    name: 'dbPassword',
    pattern: /(?:password|DB_PASSWORD|db_password)\s*[:=]\s*["\']?([^"'\s;,}\]]+)["\']?/gi,
    replacement: (match, password) => match.replace(password, '[MASKED]')
  },
  // JWT tokens (common structure)
  {
    name: 'jwtToken',
    pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    replacement: '[MASKED_JWT_TOKEN...]'
  },
  // Webhook signatures and HMAC
  {
    name: 'signature',
    pattern: /(?:signature|sig|hmac)\s*[:=]\s*["\']?([a-f0-9]{32,})["\']?/gi,
    replacement: (match, sig) => match.replace(sig, `[MASKED_SIG_${sig.substring(0, 4)}...]`)
  }
];

/**
 * Mask sensitive data in a string
 * @param {string} text - Text to mask
 * @returns {string} Text with sensitive data masked
 */
function maskSensitiveData(text) {
  if (!text || typeof text !== 'string') {
    return text;
  }

  let masked = text;
  for (const { pattern, replacement } of MASK_PATTERNS) {
    try {
      masked = masked.replace(pattern, replacement);
    } catch (err) {
      console.warn(`Error applying mask pattern: ${err.message}`);
    }
  }
  return masked;
}

/**
 * Mask sensitive data in an object (deep)
 * @param {object} obj - Object to mask
 * @param {number} depth - Current recursion depth (max 10)
 * @returns {object} Object with sensitive data masked
 */
function maskObject(obj, depth = 0) {
  if (depth > 10) return obj; // Prevent infinite recursion
  if (obj === null || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => maskObject(item, depth + 1));
  }

  const masked = {};
  for (const [key, value] of Object.entries(obj)) {
    // Check if key matches sensitive field names
    const keyLower = key.toLowerCase();
    const isSensitiveKey = 
      keyLower.includes('password') ||
      keyLower.includes('secret') ||
      keyLower.includes('token') ||
      keyLower.includes('key') ||
      keyLower.includes('credential') ||
      keyLower.includes('apikey') ||
      keyLower.includes('auth') ||
      keyLower.includes('signature') ||
      keyLower.includes('hmac') ||
      keyLower.includes('jwt') ||
      keyLower.includes('oauth') ||
      keyLower.includes('bearer');

    if (isSensitiveKey && typeof value === 'string') {
      masked[key] = `[MASKED_${key.toUpperCase()}]`;
    } else if (typeof value === 'object' && value !== null) {
      masked[key] = maskObject(value, depth + 1);
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

/**
 * Wrap winston logger methods to mask sensitive data
 * @param {object} logger - Winston logger instance
 * @returns {object} Logger with masked methods
 */
function wrapLogger(logger) {
  if (!logger) return logger;

  const originalLog = logger.log.bind(logger);
  const originalInfo = logger.info.bind(logger);
  const originalWarn = logger.warn.bind(logger);
  const originalError = logger.error.bind(logger);
  const originalDebug = logger.debug.bind(logger);

  logger.log = function(...args) {
    const maskedArgs = args.map((arg) => {
      if (typeof arg === 'string') return maskSensitiveData(arg);
      if (typeof arg === 'object') return maskObject(arg);
      return arg;
    });
    return originalLog(...maskedArgs);
  };

  logger.info = function(...args) {
    const maskedArgs = args.map((arg) => {
      if (typeof arg === 'string') return maskSensitiveData(arg);
      if (typeof arg === 'object') return maskObject(arg);
      return arg;
    });
    return originalInfo(...maskedArgs);
  };

  logger.warn = function(...args) {
    const maskedArgs = args.map((arg) => {
      if (typeof arg === 'string') return maskSensitiveData(arg);
      if (typeof arg === 'object') return maskObject(arg);
      return arg;
    });
    return originalWarn(...maskedArgs);
  };

  logger.error = function(...args) {
    const maskedArgs = args.map((arg) => {
      if (typeof arg === 'string') return maskSensitiveData(arg);
      if (typeof arg === 'object') return maskObject(arg);
      return arg;
    });
    return originalError(...maskedArgs);
  };

  logger.debug = function(...args) {
    const maskedArgs = args.map((arg) => {
      if (typeof arg === 'string') return maskSensitiveData(arg);
      if (typeof arg === 'object') return maskObject(arg);
      return arg;
    });
    return originalDebug(...maskedArgs);
  };

  return logger;
}

module.exports = {
  maskSensitiveData,
  maskObject,
  wrapLogger,
  MASK_PATTERNS
};

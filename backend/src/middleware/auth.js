const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const logger = require('../config/logger');
const { tenantAdminId } = require('../utils/tenantAccess');

const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_THIS_SECRET_IN_PRODUCTION';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

function normalizeTenantContext(user) {
  if (!user || user.role === 'super_admin') return null;
  return tenantAdminId(user);
}

function buildTokenPayload(user) {
  return {
    userId: user.id,
    role: user.role,
    tenantId: normalizeTenantContext(user),
    permissions: user.permissions || null,
  };
}

// ─── Verify JWT Token ───────────────────────────────────────────
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.substring(7);
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Validate user still exists and is active
    let result;
    try {
      result = await query(
        'SELECT id, username, email, full_name, role, tenant_id, tenant_owner_id, is_active, specializations, permissions FROM users WHERE id = $1',
        [decoded.userId]
      );
    } catch (err) {
      if (err.message.includes('tenant_id')) {
        result = await query(
          'SELECT id, username, email, full_name, role, tenant_owner_id, is_active, specializations, permissions FROM users WHERE id = $1',
          [decoded.userId]
        );
      } else {
        throw err;
      }
    }

    if (!result.rows.length || !result.rows[0].is_active) {
      return res.status(401).json({ error: 'User account is inactive or deleted' });
    }

    req.user = result.rows[0];
    req.user.tenant_id = normalizeTenantContext(req.user);
    next();
  } catch (err) {
    logger.error('Auth middleware error', { error: err.message });
    res.status(500).json({ error: 'Authentication error' });
  }
}

async function verifySocketToken(token) {
  const decoded = jwt.verify(token, JWT_SECRET);
  const result = await query(
    'SELECT id, username, email, full_name, role, tenant_id, tenant_owner_id, is_active, specializations, permissions FROM users WHERE id = $1',
    [decoded.userId]
  );
  if (!result.rows.length || !result.rows[0].is_active) {
    throw new Error('Invalid or inactive user');
  }
  const user = result.rows[0];
  user.tenant_id = normalizeTenantContext(user);
  return user;
}

// ─── Role-Based Access Control ──────────────────────────────────
const ROLE_HIERARCHY = {
  super_admin: 100, // Platform-level owner
  admin: 4,         // Per-tenant account owner
  senior_engineer: 3,
  junior_engineer: 2,
  staff: 1,
};

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (roles.includes(req.user.role)) return next();
    return res.status(403).json({
      error: 'Insufficient permissions',
      required: roles,
      current: req.user.role
    });
  };
}

function requireMinRole(minRole) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    
    let userLevel = ROLE_HIERARCHY[req.user.role];
    
    if (userLevel === undefined) {
      try {
        const result = await query(`SELECT value FROM platform_settings WHERE key = 'settings_roles'`);
        if (result.rows.length > 0) {
          const customRoles = result.rows[0].value || [];
          const matched = customRoles.find(r => r.key === req.user.role);
          if (matched) {
            userLevel = matched.level || 1;
          }
        }
      } catch (err) {
        logger.error('Failed to query settings_roles in requireMinRole', { error: err.message });
      }
    }
    
    if (userLevel === undefined) {
      userLevel = 1; // Default fallback to 1 (staff level) for custom roles
    }
    
    const requiredLevel = ROLE_HIERARCHY[minRole] || 0;
    if (userLevel >= requiredLevel) return next();
    
    return res.status(403).json({
      error: 'Insufficient permissions',
      requiredMinRole: minRole,
      current: req.user.role
    });
  };
}

// ─── Super Admin Only (platform-level) ──────────────────────────────
function requireSuperAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({
      error: 'Super Admin access required',
      hint: 'Only platform super administrators can perform this action.',
    });
  }
  return next();
}

// ─── Owner (per-tenant admin) Only ──────────────────────────────────
function requireOwner(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({
      error: 'Account owner access required',
      hint: 'Only the account owner (Admin) can perform subscription changes.',
    });
  }
  return next();
}

// ─── Token Generation ───────────────────────────────────────────
function generateAccessToken(user) {
  return jwt.sign(buildTokenPayload(user), JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function generateRefreshToken(userId) {
  return jwt.sign({ userId, type: 'refresh' }, JWT_SECRET, { expiresIn: '30d' });
}

module.exports = {
  authenticate,
  verifySocketToken,
  requireRole,
  requireMinRole,
  requireSuperAdmin,
  requireOwner,
  generateAccessToken,
  generateRefreshToken,
  JWT_SECRET,
};

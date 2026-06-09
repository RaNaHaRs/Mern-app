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
    impersonationMiddleware(req, res, next);
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

function isPlatformStaff(user) {
  return user && user.role !== 'super_admin' && user.role !== 'admin' && user.tenant_id == null && user.tenant_owner_id == null;
}

async function findCustomRoleLevel(roleKey) {
  try {
    const result = await query(`SELECT key, value FROM platform_settings WHERE key IN ('settings_roles', 'staff_roles')`);
    for (const row of result.rows) {
      const roles = row.value || [];
      const matched = roles.find(r => r.key === roleKey);
      if (matched) {
        return matched.level || 1;
      }
    }
  } catch (err) {
    logger.error('Failed to query custom role settings in findCustomRoleLevel', { error: err.message, roleKey });
  }
  return undefined;
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    // Prevent platform-scoped staff from accessing tenant routes
    if (isPlatformStaff(req.user)) {
      const path = String(req.originalUrl || req.url || '');
      if (!path.startsWith('/api/super-admin')) {
        return res.status(403).json({ error: 'Platform staff may not access tenant endpoints' });
      }
    }
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
    // Prevent platform-scoped staff from accessing tenant routes
    if (isPlatformStaff(req.user)) {
      const path = String(req.originalUrl || req.url || '');
      if (!path.startsWith('/api/super-admin')) {
        return res.status(403).json({ error: 'Platform staff may not access tenant endpoints' });
      }
    }
    
    let userLevel = ROLE_HIERARCHY[req.user.role];
    
    if (userLevel === undefined) {
      userLevel = await findCustomRoleLevel(req.user.role);
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

// Allow super_admin OR platform-scoped staff for super-admin namespace routes
async function requireSuperAdminOrPlatformStaff(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (req.user.role === 'super_admin') return next();
  
  if (isPlatformStaff(req.user)) {
    // only allow within super-admin namespace
    const path = String(req.originalUrl || req.url || '');
    if (path.startsWith('/api/super-admin')) return next();
  }
  return res.status(403).json({ error: 'Super Admin access required' });
}

// Helper to resolve effective user permissions
async function resolveUserPermissions(userId, role, customPermissions) {
  // super_admin always gets full permissions — never restricted
  if (role === 'super_admin') {
    const modules = ['cases', 'clients', 'inventory', 'accounting', 'reports', 'analytics', 'knowledge_base', 'recycle_bin', 'settings', 'users', 'webhooks'];
    const perms = {};
    modules.forEach(m => { perms[m] = { view: true, create: true, edit: true, delete: true, export: true, advance_stage: true, create_invoice: true, create_quote: true, record_payment: true, create_expense: true, restore: true, permanent_delete: true, edit_company: true, edit_users: true, edit_roles: true, deactivate: true }; });
    return perms;
  }

  // admin: if a super admin has set a granular plan-based override, respect it
  // { access_level } is just an SA staff role marker — not a real module permission set; skip it
  const isRealGranularPerms = customPermissions && typeof customPermissions === 'object'
    && !customPermissions.access_level
    && Object.keys(customPermissions).length > 0;

  if (role === 'admin') {
    if (isRealGranularPerms) return customPermissions; // SA override active
    // Otherwise full access
    const modules = ['cases', 'clients', 'inventory', 'accounting', 'reports', 'analytics', 'knowledge_base', 'recycle_bin', 'settings', 'users', 'webhooks'];
    const perms = {};
    modules.forEach(m => { perms[m] = { view: true, create: true, edit: true, delete: true, export: true, advance_stage: true, create_invoice: true, create_quote: true, record_payment: true, create_expense: true, restore: true, permanent_delete: true, edit_company: true, edit_users: true, edit_roles: true, deactivate: true }; });
    return perms;
  }

  // For non-admin staff: use granular custom permissions if present
  if (isRealGranularPerms) {
    return customPermissions;
  }

  // Expand access_level shorthands for platform staff roles into granular STAFF module permissions
  const STAFF_MODULES = ['dashboard','tenants','purchases','plans','coupons','invoices','branding','seo','homepage','accounts','activity_logs','platform','email_delivery','staff','roles','security','settings'];
  const makeStaffPerms = (modules) => {
    const p = {};
    STAFF_MODULES.forEach(m => { p[m] = { view: false, create: false, edit: false, delete: false, export: false }; });
    modules.forEach(([m, actions]) => { p[m] = { ...p[m], ...actions }; });
    return p;
  };
  const ROLE_DEFAULT_STAFF_PERMS = {
    support_admin: makeStaffPerms([
      ['dashboard', { view: true }], ['tenants', { view: true }], ['purchases', { view: true }],
      ['activity_logs', { view: true }], ['settings', { view: true }],
    ]),
    billing_admin: makeStaffPerms([
      ['dashboard', { view: true }], ['purchases', { view: true, export: true }],
      ['plans', { view: true, edit: true }], ['coupons', { view: true, create: true, edit: true, delete: true }],
      ['invoices', { view: true, export: true }], ['settings', { view: true }],
    ]),
    content_admin: makeStaffPerms([
      ['dashboard', { view: true }], ['branding', { view: true, edit: true }],
      ['seo', { view: true, edit: true }], ['homepage', { view: true, edit: true }], ['settings', { view: true }],
    ]),
  };

  if (customPermissions?.access_level) {
    const byRole = ROLE_DEFAULT_STAFF_PERMS[role];
    if (byRole) return byRole;
  }

  // Next, look in the admin_permissions table for this specific user
  try {
    const adminPermsResult = await query(
      `SELECT module, can_view, can_create, can_edit, can_delete, can_export FROM admin_permissions WHERE user_id = $1`,
      [userId]
    );
    if (adminPermsResult.rows.length > 0) {
      const perms = {};
      adminPermsResult.rows.forEach(row => {
        perms[row.module] = {
          view: !!row.can_view,
          create: !!row.can_create,
          edit: !!row.can_edit,
          delete: !!row.can_delete,
          export: !!row.can_export
        };
      });
      return perms;
    }
  } catch (err) {
    logger.warn('Failed to query admin_permissions table', { error: err.message });
  }

  // Next, check if it's a staff role (stored in staff_roles platform setting key)
  try {
    const rolesResult = await query(`SELECT value FROM platform_settings WHERE key = $1`, ['staff_roles']);
    if (rolesResult.rows.length > 0) {
      const roles = rolesResult.rows[0].value || [];
      const matchedRole = roles.find(r => r.key === role);
      if (matchedRole && matchedRole.permissions) {
        return matchedRole.permissions;
      }
    }
  } catch (err) {
    logger.warn('Failed to query platform_settings staff_roles', { error: err.message });
  }

  // Next, look in platform_settings roles array for the role default permissions (for tenant users)
  try {
    const rolesResult = await query(`SELECT value FROM platform_settings WHERE key = 'settings_roles'`);
    if (rolesResult.rows.length > 0) {
      const roles = rolesResult.rows[0].value || [];
      const matchedRole = roles.find(r => r.key === role);
      if (matchedRole && matchedRole.permissions) {
        return matchedRole.permissions;
      }
    }
  } catch (err) {
    logger.warn('Failed to query platform_settings settings_roles', { error: err.message });
  }

  // Standard fallback presets for built-in roles
  const DEFAULT_ROLE_PERMISSIONS = {
    senior_engineer: {
      cases: { view: true, create: true, edit: true, delete: false, advance_stage: true },
      clients: { view: true, create: false, edit: false, delete: false },
      inventory: { view: true, create: false, edit: false, delete: false },
      accounting: { view: false },
      reports: { view: true, export: false },
      analytics: { view: true },
      knowledge_base: { view: true, create: true, delete: false },
      recycle_bin: { view: false },
      settings: { view: false },
      users: { view: false },
      webhooks: { view: false }
    },
    junior_engineer: {
      cases: { view: true, create: false, edit: false, delete: false, advance_stage: false },
      clients: { view: true, create: false, edit: false, delete: false },
      inventory: { view: true, create: false, edit: false, delete: false },
      reports: { view: false },
      knowledge_base: { view: true, create: false, delete: false }
    },
    staff: {
      cases: { view: true, create: true, edit: true, delete: false },
      clients: { view: true, create: true, edit: true, delete: false },
      inventory: { view: false },
      accounting: { view: false },
      reports: { view: false }
    }
  };

  if (DEFAULT_ROLE_PERMISSIONS[role]) {
    return DEFAULT_ROLE_PERMISSIONS[role];
  }

  if (role === 'admin' || role === 'super_admin') {
    const modules = ['cases', 'clients', 'inventory', 'accounting', 'reports', 'analytics', 'knowledge_base', 'recycle_bin', 'settings', 'users', 'webhooks'];
    const perms = {};
    modules.forEach(m => {
      perms[m] = { view: true, create: true, edit: true, delete: true, export: true, advance_stage: true };
    });
    return perms;
  }

  // Final fallback for known platform staff roles with no stored permissions
  if (ROLE_DEFAULT_STAFF_PERMS[role]) return ROLE_DEFAULT_STAFF_PERMS[role];

  return {};
}

// Granular Super Admin permissions guard middleware
function requireSuperAdminPermission(module, action) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (req.user.role === 'super_admin') return next();
    
    // Check if platform staff
    const isPlatformStaff = req.user.role !== 'super_admin' && req.user.role !== 'admin' && req.user.tenant_id == null && req.user.tenant_owner_id == null;
    
    if (isPlatformStaff) {
      const perms = await resolveUserPermissions(req.user.id, req.user.role, req.user.permissions);
      if (perms && perms[module] && perms[module][action]) {
        return next();
      }
    }
    
    return res.status(403).json({
      error: 'Insufficient platform permissions',
      required: `${module}.${action}`,
    });
  };
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

// ─── Impersonation Middleware ───────────────────────────────────
function impersonationMiddleware(req, res, next) {
  const impersonateTenantId = req.headers['x-impersonate-tenant-id'];
  if (impersonateTenantId && req.user && req.user.role === 'super_admin') {
    req.user._originalRole = 'super_admin';
    req.user._impersonating = true;
    req.user.role = 'admin';
    req.user.tenant_id = impersonateTenantId;
    req.user.tenant_owner_id = impersonateTenantId;
  }
  next();
}

module.exports = {
  authenticate,
  verifySocketToken,
  impersonationMiddleware,
  requireRole,
  requireMinRole,
  requireSuperAdmin,
  requireSuperAdminOrPlatformStaff,
  requireSuperAdminPermission,
  resolveUserPermissions,
  requireOwner,
  generateAccessToken,
  generateRefreshToken,
  JWT_SECRET,
};

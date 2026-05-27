const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { generateAccessToken, generateRefreshToken, authenticate } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const logger = require('../config/logger');

const router = express.Router();

// Helper to resolve effective user permissions
async function resolveUserPermissions(userId, role, customPermissions) {
  // If user has custom permissions directly on their user record, use those
  if (customPermissions && typeof customPermissions === 'object' && Object.keys(customPermissions).length > 0) {
    return customPermissions;
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

  // Next, look in platform_settings roles array for the role default permissions
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

  return {};
}


// ─── POST /api/auth/login ────────────────────────────────────────
router.post('/login',
  [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    try {
      const { username, password } = req.body;

      let result;
      try {
        result = await query(
          `SELECT id, username, email, full_name, role, tenant_id, tenant_owner_id, password_hash, is_active, specializations, avatar_url, permissions, phone, notes FROM users WHERE username = $1 OR email = $1`,
          [username.toLowerCase()]
        );
      } catch (err) {
        result = await query(
          `SELECT id, username, email, full_name, role, tenant_owner_id AS tenant_id, password_hash, is_active, specializations, avatar_url, permissions, phone, notes FROM users WHERE username = $1 OR email = $1`,
          [username.toLowerCase()]
        );
      }

      if (!result.rows.length) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const user = result.rows[0];

      if (!user.is_active) {
        return res.status(401).json({ error: 'Account is deactivated. Contact admin.' });
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        logger.warn('Failed login attempt', { username, ip: req.ip });
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const refreshToken = generateRefreshToken(user.id);

      // Store refresh token
      await query(
        `INSERT INTO refresh_tokens (user_id, token, expires_at) 
         VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
        [user.id, refreshToken]
      );

      // Update last_login
      await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

      logger.info('User logged in', { userId: user.id, username: user.username });

      // Resolve effective permissions: custom > role-based > default presets > empty
      const effectivePermissions = await resolveUserPermissions(user.id, user.role, user.permissions);
      const normalizedTenantId = user.tenant_id || user.tenant_owner_id || (user.role === 'super_admin' ? null : user.id) || null;
      const accessToken = generateAccessToken({
        id: user.id,
        role: user.role,
        tenant_id: normalizedTenantId,
        permissions: effectivePermissions,
      });

      res.json({
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          tenantId: normalizedTenantId,
          specializations: user.specializations,
          avatarUrl: user.avatar_url,
          permissions: effectivePermissions
        }
      });
    } catch (err) {
      logger.error('Login error', { error: err.message });
      res.status(500).json({ error: 'Login failed' });
    }
  }
);

// ─── POST /api/auth/refresh ───────────────────────────────────────
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

  try {
    const jwt = require('jsonwebtoken');
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_SECRET || 'CHANGE_THIS_SECRET_IN_PRODUCTION');
    } catch {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const result = await query(
      `SELECT rt.*, u.role, u.is_active, u.tenant_id, u.tenant_owner_id, u.permissions
       FROM refresh_tokens rt
       JOIN users u ON rt.user_id = u.id
       WHERE rt.token = $1 AND rt.expires_at > NOW()`,
      [refreshToken]
    );

    if (!result.rows.length) {
      return res.status(401).json({ error: 'Refresh token expired or invalid' });
    }

    if (!result.rows[0].is_active) {
      return res.status(401).json({ error: 'Account deactivated' });
    }

    const effectivePermissions = await resolveUserPermissions(decoded.userId, result.rows[0].role, result.rows[0].permissions);
    const newAccessToken = generateAccessToken({
      id: decoded.userId,
      role: result.rows[0].role,
      tenant_id: result.rows[0].tenant_id || result.rows[0].tenant_owner_id || (result.rows[0].role === 'super_admin' ? null : decoded.userId),
      permissions: effectivePermissions,
    });
    res.json({ accessToken: newAccessToken });
  } catch (err) {
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────────
router.post('/logout', authenticate, async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await query('DELETE FROM refresh_tokens WHERE token = $1 AND user_id = $2', [refreshToken, req.user.id]);
  }
  res.json({ message: 'Logged out successfully' });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  let result;
  try {
    result = await query(
      `SELECT id, username, email, full_name, role, tenant_id, is_active, specializations,
              avatar_url, phone, notes, permissions, last_login, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
  } catch (err) {
    result = await query(
      `SELECT id, username, email, full_name, role, tenant_owner_id AS tenant_id, is_active, specializations,
              avatar_url, phone, notes, permissions, last_login, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
  }
  const u = result.rows[0];
  if (!u) return res.status(404).json({ error: 'User not found' });

  // Resolve effective permissions: custom > role-based > default presets > empty
  const effectivePermissions = await resolveUserPermissions(u.id, u.role, u.permissions);

  // Return normalized camelCase response (matches login response format)
  res.json({
    id: u.id,
    username: u.username,
    email: u.email,
    fullName: u.full_name,
    role: u.role,
    tenantId: u.tenant_id || u.tenant_owner_id || (u.role === 'super_admin' ? null : u.id) || null,
    isActive: u.is_active,
    specializations: u.specializations,
    avatar: u.avatar_url,
    avatarUrl: u.avatar_url,
    phone: u.phone,
    notes: u.notes,
    permissions: effectivePermissions,
    lastLogin: u.last_login,
    createdAt: u.created_at,
  });
});

// ─── PUT /api/auth/change-password ───────────────────────────────
router.put('/change-password',
  authenticate,
  [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  ],
  auditLog('change_password', 'user'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;
    const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);

    if (!valid) return res.status(401).json({ error: 'Current password incorrect' });

    const hash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, req.user.id]);

    // Invalidate all refresh tokens
    await query('DELETE FROM refresh_tokens WHERE user_id = $1', [req.user.id]);

    res.json({ message: 'Password changed successfully. Please log in again.' });
  }
);

module.exports = router;

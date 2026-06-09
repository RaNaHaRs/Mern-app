const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { generateAccessToken, generateRefreshToken, authenticate, resolveUserPermissions, JWT_SECRET } = require('../middleware/auth');
const jwt = require('jsonwebtoken');
const tfaService = require('../services/twoFactorService');
const { auditLog } = require('../middleware/audit');
const logger = require('../config/logger');

const router = express.Router();

// Platform staff (billing_admin, support_admin, content_admin, etc.) have no tenant — only
// real tenant users (admin + their team) get a tenantId derived from their own id.
const PLATFORM_STAFF_ROLES = new Set(['super_admin','support_admin','billing_admin','content_admin']);
function normalizeTenantId(user) {
  if (!user) return null;
  if (user.tenant_id) return user.tenant_id;
  if (user.tenant_owner_id) return user.tenant_owner_id;
  if (PLATFORM_STAFF_ROLES.has(user.role)) return null;
  return user.id || null;
}

async function recordLoginActivity({ tenantId = null, userId = null, action, title, description, req }) {
  try {
    const ipAddress = (req.headers['x-forwarded-for'] || req.ip || req.connection?.remoteAddress || '').split(',')[0].trim() || null;
    await query(
      `INSERT INTO activity_logs (tenant_id, user_id, action, module, resource_type, title, description, metadata, ip_address, user_agent, request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::inet, $10, $11)`,
      [
        tenantId,
        userId,
        action,
        'auth',
        'user',
        title || action,
        description || null,
        JSON.stringify({ path: req.path, method: req.method, username: req.body?.username || null }),
        ipAddress,
        req.headers['user-agent'] || null,
        req.requestId || null,
      ]
    );
  } catch (err) {
    logger.error('Activity log insert failed', { error: err.message, action, userId });
  }
}

// ─── POST /api/auth/signup ────────────────────────────────────────
router.post('/signup',
  [
    body('company_name').trim().notEmpty().withMessage('Company name is required'),
    body('admin_name').trim().notEmpty().withMessage('Your name is required'),
    body('admin_email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('admin_password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('plan').notEmpty().withMessage('Plan selection is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    try {
      const { company_name, admin_name, admin_email, admin_password, phone, city, plan } = req.body;

      // Check if email already exists
      const existing = await query('SELECT id FROM users WHERE email = $1', [admin_email]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'An account with this email already exists' });
      }

      const passwordHash = await bcrypt.hash(admin_password, 12);
      const username = admin_email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '_');
      
      const planResult = await query(
        'SELECT max_users FROM subscription_plans WHERE key = $1 AND is_active = true',
        [plan]
      );
      const maxUsers = planResult.rows.length > 0 ? planResult.rows[0].max_users : 5;

      const result = await query(
        `INSERT INTO users (
          username, email, password_hash, full_name, role, 
          subscription_plan, subscription_status, subscription_expiry, 
          max_team_users, company_name, city, phone, is_active
        ) VALUES ($1, $2, $3, $4, 'admin', $5, 'trial', NOW() + INTERVAL '14 days', $6, $7, $8, $9, true)
         RETURNING id, email, subscription_plan`,
        [username, admin_email, passwordHash, admin_name, plan, maxUsers, company_name, city, phone]
      );

      const newUser = result.rows[0];

      res.status(201).json({ 
        message: 'Account created! You can now log in.', 
        email: newUser.email, 
        plan: newUser.subscription_plan, 
        trial_days: 14 
      });
    } catch (err) {
      logger.error('Signup error', { error: err.message });
      res.status(500).json({ error: 'Signup failed' });
    }
  }
);

// ─── GET /api/auth/plans ──────────────────────────────────────────
router.get('/plans', async (req, res) => {
  try {
    const result = await query(
      'SELECT key, label, price_monthly::int AS price, max_users AS "maxUsers", color, features, true AS trial FROM subscription_plans WHERE is_active = true ORDER BY sort_order, created_at'
    );
    res.json({ plans: result.rows });
  } catch (err) {
    logger.error('Failed to fetch public plans', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});




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
          `SELECT id, username, email, full_name, role, tenant_id, tenant_owner_id, password_hash, is_active, specializations, avatar_url, permissions, phone, notes, two_fa_enabled FROM users WHERE username = $1 OR email = $1`,
          [username.toLowerCase()]
        );
      } catch (err) {
        result = await query(
          `SELECT id, username, email, full_name, role, tenant_owner_id AS tenant_id, password_hash, is_active, specializations, avatar_url, permissions, phone, notes, two_fa_enabled FROM users WHERE username = $1 OR email = $1`,
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
        await recordLoginActivity({
          action: 'login_failed',
          title: 'Failed login',
          description: `Failed login attempt for ${username}`,
          req,
        });
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // If user has 2FA enabled, require second-step verification
      if (user.two_fa_enabled) {
        const tempToken = jwt.sign({ userId: user.id, type: 'temp_2fa' }, JWT_SECRET, { expiresIn: '5m' });
        return res.json({ twoFactorRequired: true, tempToken, message: 'Two-factor authentication required' });
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

      // Log login activity
      await query(
        `INSERT INTO activity_logs (user_id, tenant_id, action, module, resource_type, title, description, ip_address, user_agent)
         VALUES ($1, $2, 'user_login', 'auth', 'session', 'User Login', $3, $4, $5)`,
        [user.id, user.tenant_id || user.tenant_owner_id || null, `${user.full_name || user.username} logged in`, req.ip, req.get('user-agent')]
      );

      logger.info('User logged in', { userId: user.id, username: user.username });

      // Resolve effective permissions: custom > role-based > default presets > empty
      const effectivePermissions = await resolveUserPermissions(user.id, user.role, user.permissions);
      const normalizedTenantId = normalizeTenantId(user);
      const accessToken = generateAccessToken({
        id: user.id,
        role: user.role,
        tenant_id: normalizedTenantId,
        permissions: effectivePermissions,
      });

      await recordLoginActivity({
        tenantId: normalizedTenantId,
        userId: user.id,
        action: 'login_success',
        title: 'Login successful',
        description: `User ${user.username || user.email} logged in successfully`,
        req,
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
          avatar: user.avatar_url,
          avatarUrl: user.avatar_url,
          phone: user.phone,
          permissions: effectivePermissions
        }
      });
    } catch (err) {
      logger.error('Login error', { error: err.message });
      res.status(500).json({ error: 'Login failed' });
    }
  }
);


// POST /api/auth/2fa/verify  — exchange temp token + totp for real tokens
router.post('/2fa/verify', [body('temp_token').notEmpty(), body('totp_code').notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  const { temp_token, totp_code } = req.body;
  try {
    let decoded;
    try { decoded = jwt.verify(temp_token, JWT_SECRET); } catch (e) { return res.status(401).json({ error: 'Invalid or expired temp token' }); }
    if (!decoded || decoded.type !== 'temp_2fa') return res.status(401).json({ error: 'Invalid temp token' });

    const userId = decoded.userId;
    // Validate TOTP
    const ok = await tfaService.validateToken(userId, String(totp_code));
    if (!ok) return res.status(401).json({ error: 'Invalid TOTP code' });

    // Load user record
    let result;
    try {
      result = await query('SELECT id, username, email, full_name, role, tenant_id, tenant_owner_id, is_active, specializations, avatar_url, permissions FROM users WHERE id = $1', [userId]);
    } catch (e) {
      result = await query('SELECT id, username, email, full_name, role, tenant_owner_id AS tenant_id, is_active, specializations, avatar_url, permissions FROM users WHERE id = $1', [userId]);
    }
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    const user = result.rows[0];
    if (!user.is_active) return res.status(401).json({ error: 'Account is deactivated' });

    // Issue tokens
    const refreshToken = generateRefreshToken(user.id);
    await query(`INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')`, [user.id, refreshToken]);
    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    const effectivePermissions = await resolveUserPermissions(user.id, user.role, user.permissions);
    const normalizedTenantId = normalizeTenantId(user);
    const accessToken = generateAccessToken({ id: user.id, role: user.role, tenant_id: normalizedTenantId, permissions: effectivePermissions });

    await recordLoginActivity({
      tenantId: normalizedTenantId,
      userId: user.id,
      action: 'login_success',
      title: '2FA login successful',
      description: `User ${user.username || user.email} passed 2FA and logged in`,
      req,
    });

    res.json({ accessToken, refreshToken, user: { id: user.id, username: user.username, email: user.email, fullName: user.full_name, role: user.role, tenantId: normalizedTenantId, specializations: user.specializations, avatar: user.avatar_url, avatarUrl: user.avatar_url, permissions: effectivePermissions } });
  } catch (err) {
    logger.error('2FA verify error', { error: err.message });
    res.status(500).json({ error: '2FA verification failed' });
  }
});

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
      tenant_id: normalizeTenantId(result.rows[0]),
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

  // Log logout activity
  await query(
    `INSERT INTO activity_logs (user_id, tenant_id, action, module, resource_type, title, description, ip_address, user_agent)
     VALUES ($1, $2, 'user_logout', 'auth', 'session', 'User Logout', $3, $4, $5)`,
    [req.user.id, req.user.tenant_id || req.user.tenant_owner_id || null, `${req.user.full_name || req.user.username} logged out`, req.ip, req.get('user-agent')]
  ).catch(err => logger.error('Failed to log logout activity', { error: err.message }));

  await recordLoginActivity({
    tenantId: req.user.tenant_id || req.user.tenant_owner_id || null,
    userId: req.user.id,
    action: 'logout_success',
    title: 'Logout successful',
    description: `User ${req.user.username || req.user.email} logged out successfully`,
    req,
  });

  res.json({ message: 'Logged out successfully' });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  let result;
  try {
    result = await query(
      `SELECT id, username, email, full_name, role, tenant_id, is_active, specializations,
              avatar_url, phone, bio, notes, permissions, last_login, created_at,
              subscription_plan, subscription_status, subscription_expiry, company_name
       FROM users WHERE id = $1`,
      [req.user.id]
    );
  } catch (err) {
    result = await query(
      `SELECT id, username, email, full_name, role, tenant_owner_id AS tenant_id, is_active, specializations,
              avatar_url, phone, bio, notes, permissions, last_login, created_at,
              subscription_plan, subscription_status, subscription_expiry, company_name
       FROM users WHERE id = $1`,
      [req.user.id]
    );
  }
  const u = result.rows[0];
  if (!u) return res.status(404).json({ error: 'User not found' });

  // Resolve effective permissions: custom > role-based > default presets > empty
  const effectivePermissions = await resolveUserPermissions(u.id, u.role, u.permissions);

  // Fetch plan details if user has active subscription
  let planDetails = null;
  if (u.subscription_plan) {
    try {
      const plansResult = await query(`SELECT value FROM platform_settings WHERE key = 'custom_plans'`);
      let plans = [];
      if (plansResult.rows.length) {
        try {
          const stored = plansResult.rows[0].value;
          plans = typeof stored === 'string' ? JSON.parse(stored) : (stored || []);
        } catch (e) {
          logger.warn('Failed to parse custom plans', { error: e.message });
        }
      }
      planDetails = plans.find(p => p.key === u.subscription_plan) || null;
    } catch (err) {
      logger.warn('Failed to fetch plan details', { error: err.message });
    }
  }

  // Return normalized camelCase response (matches login response format)
  res.json({
    id: u.id,
    username: u.username,
    email: u.email,
    fullName: u.full_name,
    role: u.role,
    tenantId: normalizeTenantId(u),
    isActive: u.is_active,
    specializations: u.specializations,
    avatar: u.avatar_url,
    avatarUrl: u.avatar_url,
    phone: u.phone,
    bio: u.bio,
    notes: u.notes,
    permissions: effectivePermissions,
    lastLogin: u.last_login,
    createdAt: u.created_at,
    // SUBSCRIPTION DATA — now returned to frontend for feature activation
    subscriptionPlan: u.subscription_plan,
    subscriptionStatus: u.subscription_status,
    subscriptionExpiry: u.subscription_expiry,
    planDetails: planDetails,
    companyName: u.company_name,
  });
});

// ─── PUT /api/auth/profile ───────────────────────────────────────
router.put('/profile',
  authenticate,
  auditLog('update_profile', 'user'),
  async (req, res) => {
    try {
      const { full_name, phone, specializations, notes } = req.body;
      const result = await query(
        `UPDATE users SET
          full_name = COALESCE($1, full_name),
          phone = COALESCE($2, phone),
          specializations = COALESCE($3, specializations),
          notes = COALESCE($4, notes),
          updated_at = NOW()
         WHERE id = $5
         RETURNING id, username, email, full_name, phone, specializations, notes, role, is_active, avatar_url, last_login, created_at`,
        [full_name, phone, specializations ? JSON.stringify(specializations) : null, notes, req.user.id]
      );
      const u = result.rows[0];
      res.json({
        id: u.id, username: u.username, email: u.email, fullName: u.full_name,
        phone: u.phone, specializations: u.specializations || [],
        notes: u.notes, role: u.role, isActive: u.is_active,
        avatar: u.avatar_url, avatarUrl: u.avatar_url,
        lastLogin: u.last_login, createdAt: u.created_at,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

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

// ─── Reset Password Utilities ─────────────────────────────────────
async function recordResetActivity({ tenantId = null, userId = null, action, title, description, req }) {
  try {
    const ipAddress = (req.headers['x-forwarded-for'] || req.ip || req.connection?.remoteAddress || '').split(',')[0].trim() || null;
    const userAgent = req.headers['user-agent'] || null;
    const details = JSON.stringify({
      method: req.method,
      path: req.path,
      statusCode: 200,
      requestId: req.requestId
    });

    await query(
      `INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7::inet, $8)`,
      [tenantId, userId, action, 'user', userId, details, ipAddress, userAgent]
    );

    await query(
      `INSERT INTO activity_logs (tenant_id, user_id, action, module, resource_type, resource_id, title, description, metadata, ip_address, user_agent, request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::inet, $11, $12)`,
      [
        tenantId,
        userId,
        action,
        'auth',
        'user',
        userId,
        title || action,
        description || null,
        details,
        ipAddress,
        userAgent,
        req.requestId || null,
      ]
    );
  } catch (err) {
    logger.error('Reset activity logging failed', { error: err.message, action, userId });
  }
}

// ─── POST /api/auth/forgot-password ────────────────────────────────
// Rate limit: max 5 reset requests per user account per calendar day.
router.post('/forgot-password',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    try {
      const { email } = req.body;
      const normalizedEmail = email.toLowerCase().trim();

      const result = await query(
        `SELECT id, username, email, full_name, role, tenant_id, tenant_owner_id FROM users WHERE LOWER(email) = $1`,
        [normalizedEmail]
      );

      // Security-neutral response — do not reveal whether email exists
      if (!result.rows.length) {
        // Still return success to prevent email enumeration
        return res.json({ message: 'If this email is registered, a reset link has been sent.' });
      }

      const user = result.rows[0];

      // ── Rate limiting: max 5 attempts per user per calendar day ──────
      const MAX_DAILY_ATTEMPTS = 5;
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

      const attemptResult = await query(
        `SELECT attempt_count FROM password_reset_attempts
         WHERE user_id = $1 AND attempt_date = $2`,
        [user.id, today]
      );

      if (attemptResult.rows.length > 0) {
        const count = attemptResult.rows[0].attempt_count;
        if (count >= MAX_DAILY_ATTEMPTS) {
          await recordResetActivity({
            tenantId: normalizeTenantId(user),
            userId: user.id,
            action: 'password_reset_limit_reached',
            title: 'Reset limit reached',
            description: `Daily reset limit (${MAX_DAILY_ATTEMPTS}) reached for ${user.email}`,
            req,
          });
          return res.status(429).json({
            error: 'You have reached the maximum password reset attempts for today. Please try again tomorrow.'
          });
        }
        // Increment count
        await query(
          `UPDATE password_reset_attempts
           SET attempt_count = attempt_count + 1, last_attempt = NOW()
           WHERE user_id = $1 AND attempt_date = $2`,
          [user.id, today]
        );
      } else {
        // First attempt today
        await query(
          `INSERT INTO password_reset_attempts (user_id, email, attempt_date, attempt_count, last_attempt)
           VALUES ($1, $2, $3, 1, NOW())`,
          [user.id, normalizedEmail, today]
        );
      }

      // ── Generate secure single-use token ──────────────────────────
      const crypto = require('crypto');
      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 60 minutes

      // Invalidate any previous unused token
      await query(
        `UPDATE users
         SET reset_password_token = $1, reset_password_expires = $2, reset_token_used_at = NULL, updated_at = NOW()
         WHERE id = $3`,
        [token, expires, user.id]
      );

      // ── Load SMTP config ───────────────────────────────────────────
      const invoiceService = require('../services/invoiceService');
      let smtp;
      if (user.role === 'super_admin') {
        smtp = await invoiceService.loadSuperAdminSmtpConfig();
      } else {
        smtp = await invoiceService.loadAdminSmtpConfig();
      }

      if (!smtp.user) {
        logger.warn('SMTP not configured — cannot send reset email', { userId: user.id });
        return res.status(500).json({ error: 'Password recovery email could not be sent because SMTP is not configured.' });
      }

      const nodemailer = require('nodemailer');
      const transport = nodemailer.createTransport({
        host: smtp.host,
        port: parseInt(smtp.port, 10) || 587,
        secure: smtp.secure,
        auth: { user: smtp.user, pass: smtp.pass },
        tls: { rejectUnauthorized: false }
      });

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174';
      const resetLink = `${frontendUrl}/reset-password?token=${token}`;

      const { emailTemplate } = require('../services/emailTemplate');
      const html = emailTemplate({
        title: 'Password Recovery Request',
        preheader: 'Reset your RecoverLab CRM password — link expires in 60 minutes',
        body: `
          <p>Hi <strong>${user.full_name || user.username}</strong>,</p>
          <p>We received a request to reset your password. Click the button below to set a new password.
          This link expires in <strong>60 minutes</strong> and can only be used once.</p>
          <div class="btn-wrap">
            <a href="${resetLink}" class="btn">Reset My Password</a>
          </div>
          <p style="font-size:13px;color:#6b7280;text-align:center;">
            If you did not request a password reset, you can safely ignore this email.<br>
            Your password will not change unless you click the link above.
          </p>
          <hr class="divider">
          <p style="font-size:12px;color:#9ca3af;text-align:center;word-break:break-all;">
            If the button doesn't work, copy this link:<br>
            <a href="${resetLink}" style="color:#3b82f6;">${resetLink}</a>
          </p>
        `,
      });

      const text = `Hi ${user.full_name || user.username},\n\nClick the link below to reset your password:\n\n${resetLink}\n\nThis link expires in 60 minutes and can only be used once.\n\nIf you did not request a password reset, ignore this email.`;

      await transport.verify();
      await transport.sendMail({
        from: `"${smtp.from_name || 'RecoverLab'}" <${smtp.from_email || smtp.user}>`,
        to: user.email,
        subject: 'Reset Your RecoverLab Password',
        html,
        text
      });

      // Log activity
      const userTenantId = normalizeTenantId(user);
      await recordResetActivity({
        tenantId: userTenantId,
        userId: user.id,
        action: 'password_reset_requested',
        title: 'Password reset requested',
        description: `Reset password token generated and emailed to ${user.email}`,
        req
      });

      res.json({ message: 'If this email is registered, a reset link has been sent.' });
    } catch (err) {
      logger.error('Forgot password error', { error: err.message });
      res.status(500).json({ error: 'Failed to process forgot password request.' });
    }
  }
);

// ─── POST /api/auth/verify-reset-token ─────────────────────────────
router.post('/verify-reset-token',
  [
    body('token').trim().notEmpty().withMessage('Token is required')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    try {
      const { token } = req.body;
      const result = await query(
        `SELECT id, username, email, full_name, reset_password_expires, reset_token_used_at FROM users WHERE reset_password_token = $1`,
        [token]
      );

      if (result.rows.length === 0) {
        await recordResetActivity({
          action: 'invalid_reset_token_attempt',
          title: 'Invalid reset token attempt',
          description: 'Attempt to verify a non-existent or already-used reset token',
          req,
        });
        return res.status(400).json({ error: 'Reset link is invalid or expired.' });
      }

      const user = result.rows[0];

      // Check if token was already used (replay protection)
      if (user.reset_token_used_at) {
        return res.status(400).json({ error: 'Reset link is invalid or expired.' });
      }

      // Check expiry
      if (new Date(user.reset_password_expires) < new Date()) {
        return res.status(400).json({ error: 'Reset link is invalid or expired.' });
      }

      res.json({
        valid: true,
        email: user.email,
        fullName: user.full_name,
        username: user.username,
      });
    } catch (err) {
      logger.error('Verify token error', { error: err.message });
      res.status(500).json({ error: 'Failed to verify reset token.' });
    }
  }
);

// ─── POST /api/auth/reset-password ─────────────────────────────────
router.post('/reset-password',
  [
    body('token').trim().notEmpty().withMessage('Token is required'),
    body('newPassword')
      .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain uppercase, lowercase and a digit'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    try {
      const { token, newPassword } = req.body;
      const result = await query(
        `SELECT id, username, email, full_name, role, tenant_id, tenant_owner_id,
                reset_password_expires, reset_token_used_at
         FROM users WHERE reset_password_token = $1`,
        [token]
      );

      if (result.rows.length === 0) {
        await recordResetActivity({
          action: 'invalid_reset_token_attempt',
          title: 'Invalid reset token attempt',
          description: 'Attempt to use a non-existent or already-used reset token',
          req,
        });
        return res.status(400).json({ error: 'Reset link is invalid or expired.' });
      }

      const user = result.rows[0];

      // Replay protection: token already used
      if (user.reset_token_used_at) {
        return res.status(400).json({ error: 'Reset link is invalid or expired.' });
      }

      // Expiry check
      if (new Date(user.reset_password_expires) < new Date()) {
        return res.status(400).json({ error: 'Reset link is invalid or expired.' });
      }

      // Hash and save new password
      const hash = await bcrypt.hash(newPassword, 12);

      // Mark token as used, clear expiry, save new password — atomic-ish
      await query(
        `UPDATE users
         SET password_hash = $1,
             reset_password_token = NULL,
             reset_password_expires = NULL,
             reset_token_used_at = NOW(),
             updated_at = NOW()
         WHERE id = $2`,
        [hash, user.id]
      );

      // Invalidate all existing refresh tokens (forces re-login everywhere)
      await query('DELETE FROM refresh_tokens WHERE user_id = $1', [user.id]);

      // Log activity
      const userTenantId = normalizeTenantId(user);
      await recordResetActivity({
        tenantId: userTenantId,
        userId: user.id,
        action: 'password_reset_completed',
        title: 'Password reset completed',
        description: `Password reset completed successfully for ${user.username || user.email}`,
        req
      });

      res.json({ message: 'Password changed successfully. Please login with your new password.' });
    } catch (err) {
      logger.error('Reset password error', { error: err.message });
      res.status(500).json({ error: 'Failed to reset password.' });
    }
  }
);

module.exports = router;

const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const tfaService = require('../services/twoFactorService');
const router = express.Router();

// GET /api/2fa/status
router.get('/status', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT u.two_fa_enabled, t.backup_codes
       FROM users u
       LEFT JOIN two_factor_auth t ON t.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });

    const row = result.rows[0];
    const enabled = !!row.two_fa_enabled;
    const backupCodes = Array.isArray(row.backup_codes) ? row.backup_codes : [];
    res.json({ enabled, backup_codes_remaining: enabled ? backupCodes.length : 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/2fa/setup
router.post('/setup', authenticate, async (req, res) => {
  try {
    const user = req.user;
    const result = await tfaService.generateSecret(user.id, user.email);
    res.json({
      secret: result.manualEntryCode,
      qr_url: result.qrCodeDataUrl,
      message: 'Scan this QR code with your authenticator app and verify it to enable 2FA',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/2fa/verify-setup
router.post('/verify-setup', authenticate,
  [ body('token').trim().isLength({ min: 6, max: 8 }).withMessage('TOTP code required') ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    try {
      const valid = await tfaService.verifyAndEnable(req.user.id, req.body.token);
      if (!valid || !valid.valid) {
        return res.status(401).json({ error: 'Invalid TOTP code' });
      }
      res.json({ ok: true, message: 'Two-factor authentication enabled', backup_codes: valid.backupCodes || [] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// POST /api/2fa/disable
router.post('/disable', authenticate,
  [ body('password').notEmpty().withMessage('Password required') ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    try {
      const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
      if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
      const valid = await bcrypt.compare(req.body.password, result.rows[0].password_hash);
      if (!valid) return res.status(401).json({ error: 'Invalid password' });

      await tfaService.disable(req.user.id);
      res.json({ ok: true, message: 'Two-factor authentication disabled' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;

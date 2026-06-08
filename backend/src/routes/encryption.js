const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query } = require('../config/database');
const { authenticate, requireMinRole } = require('../middleware/auth');

const ENCRYPTION_MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY || crypto.randomBytes(32).toString('hex');
const USER_ENC_KEYS = new Map();

function generateUserKey(userId) {
  const keyId = `key_${userId.slice(0, 8)}_${Date.now()}`;
  const keyHash = crypto.createHmac('sha256', ENCRYPTION_MASTER_KEY)
    .update(`${userId}:${Date.now()}`)
    .digest('hex')
    .slice(0, 16);
  const entry = {
    key_id: keyId,
    key_hash: keyHash,
    algorithm: 'AES-256-GCM',
    created_at: new Date().toISOString(),
    rotated_at: null,
  };
  USER_ENC_KEYS.set(userId, entry);
  return entry;
}

const router = express.Router();

router.get('/key', authenticate, async (req, res) => {
  try {
    let entry = USER_ENC_KEYS.get(req.user.id);
    if (!entry) entry = generateUserKey(req.user.id);
    res.json({ key_info: entry, message: 'Each user has a unique encryption key derived from a master key.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/rotate', authenticate, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password is required to rotate the encryption key' });

    const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(password, result.rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Incorrect password. Cannot rotate encryption key.' });

    const entry = generateUserKey(req.user.id);
    entry.rotated_at = new Date().toISOString();
    USER_ENC_KEYS.set(req.user.id, entry);

    res.json({ ok: true, key_info: entry, message: 'Encryption key rotated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/all-keys', authenticate, requireMinRole('admin'), async (req, res) => {
  try {
    const keys = [];
    USER_ENC_KEYS.forEach((value, userId) => keys.push({ user_id: userId, ...value }));
    res.json({ keys, total: keys.length, algorithm: 'AES-256-GCM', master_key_configured: !!process.env.ENCRYPTION_MASTER_KEY });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

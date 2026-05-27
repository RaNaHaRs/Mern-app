const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { query } = require('../config/database');
const { authenticate, requireMinRole } = require('../middleware/auth');
const { upload, UPLOAD_DIR } = require('../middleware/upload');
const { auditLog } = require('../middleware/audit');
const { isSuperAdmin, tenantAdminId, verifyCaseAccess } = require('../utils/tenantAccess');

const router = express.Router();
router.use(authenticate);

// ─── POST /api/files/upload ───────────────────────────────────────
router.post('/upload',
  requireMinRole('junior_engineer'),
  upload.array('files', 10),
  auditLog('upload_file', 'file'),
  async (req, res) => {
    try {
      if (!req.files || !req.files.length) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const { case_id, file_type, description } = req.body;
      if (!case_id) return res.status(400).json({ error: 'case_id is required' });

      // Verify case exists and belongs to the user's tenant
      if (!isSuperAdmin(req.user) && !(await verifyCaseAccess(case_id, req.user))) {
        return res.status(404).json({ error: 'Case not found' });
      }

      const savedFiles = [];

      for (const file of req.files) {
        // Compute checksum
        const fileBuffer = fs.readFileSync(file.path);
        const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

        const result = await query(
          `INSERT INTO case_files (case_id, file_name, original_name, file_path, file_size, mime_type, file_type, checksum, description, uploaded_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, file_name, original_name, file_size, mime_type, file_type, created_at`,
          [case_id, file.filename, file.originalname, file.path, file.size, file.mimetype, file_type||'other', checksum, description||null, req.user.id]
        );

        savedFiles.push(result.rows[0]);
      }

      res.status(201).json({ uploaded: savedFiles.length, files: savedFiles });
    } catch (err) {
      // Cleanup uploaded files on error
      if (req.files) req.files.forEach(f => { try { fs.unlinkSync(f.path); } catch {} });
      res.status(500).json({ error: err.message });
    }
  }
);

// ─── GET /api/files/:id/download ─────────────────────────────────
router.get('/:id/download', auditLog('download_file', 'file'), async (req, res) => {
  try {
    const result = await query(
      `SELECT cf.*, c.created_by as case_owner
       FROM case_files cf
       JOIN cases c ON cf.case_id = c.id
       WHERE cf.id = $1${!isSuperAdmin(req.user) ? ' AND cf.tenant_id = $2' : ''}`,
      !isSuperAdmin(req.user) ? [req.params.id, tenantAdminId(req.user)] : [req.params.id]
    );

    if (!result.rows.length) return res.status(404).json({ error: 'File not found' });

    const file = result.rows[0];

    // Check file exists on disk
    if (!fs.existsSync(file.file_path)) {
      return res.status(404).json({ error: 'File not available on disk' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.original_name)}"`);
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader('Content-Length', file.file_size);
    res.setHeader('X-Checksum-SHA256', file.checksum || '');

    fs.createReadStream(file.file_path).pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/files/:id ────────────────────────────────────────
router.delete('/:id', requireMinRole('senior_engineer'), auditLog('delete_file', 'file'), async (req, res) => {
  try {
    const result = await query(
      `SELECT cf.* FROM case_files cf
       JOIN cases c ON cf.case_id = c.id
       WHERE cf.id = $1${!isSuperAdmin(req.user) ? ' AND cf.tenant_id = $2' : ''}`,
      !isSuperAdmin(req.user) ? [req.params.id, tenantAdminId(req.user)] : [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'File not found' });

    const file = result.rows[0];

    // Move to trash instead of hard delete
    const trashDir = path.join(UPLOAD_DIR, '_trash');
    if (!fs.existsSync(trashDir)) fs.mkdirSync(trashDir, { recursive: true });
    const trashPath = path.join(trashDir, path.basename(file.file_path));
    
    try { fs.renameSync(file.file_path, trashPath); } catch {}

    await query(
      `DELETE FROM case_files WHERE id = $1${!isSuperAdmin(req.user) ? ' AND tenant_id = $2' : ''}`,
      !isSuperAdmin(req.user) ? [req.params.id, tenantAdminId(req.user)] : [req.params.id]
    );
    res.json({ message: 'File deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

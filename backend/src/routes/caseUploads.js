const express = require('express');
const fs = require('fs');
const { query } = require('../config/database');
const { authenticate, requireMinRole } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const automationService = require('../services/automationService');
const casePdfService = require('../services/casePdfService');

const router = express.Router();
router.use(authenticate);

// Upload inward PDF for a case and trigger CASE_CREATED automation with summary PDF
router.post('/:id/inward-pdf', requireMinRole('staff'), upload.single('inward_pdf'), async (req, res) => {
  try {
    const caseId = req.params.id;
    if (!req.file || !req.file.path) return res.status(400).json({ error: 'No file uploaded' });

    // Save uploaded path on case for record
    await query('UPDATE cases SET inward_pdf_path = $1 WHERE id = $2', [req.file.path, caseId]);

    // Fetch full case data with client info
    const r = await query(
      `SELECT c.*, cl.first_name, cl.last_name, cl.email AS client_email, cl.phone, cl.company
       FROM cases c LEFT JOIN clients cl ON c.client_id = cl.id WHERE c.id = $1`,
      [caseId]
    );
    const caseRow = r.rows[0];

    // Fetch quotation if any
    const qr = await query('SELECT total_amount FROM quotations WHERE case_id = $1 ORDER BY created_at DESC LIMIT 1', [caseId]);

    let recipientEmail = req.body.email || req.body.client_email || caseRow?.client_email || '';
    let recipientName = req.body.name || req.body.first_name || caseRow?.first_name || 'Client';

    // Generate clean summary PDF for email attachment
    const summaryPdf = await casePdfService.generateEmailSummaryPdf({
      ...caseRow,
      first_name: recipientName,
      email: recipientEmail,
      quotation_amount: qr.rows[0]?.total_amount || req.body.quotation_amount || 0,
      advance_amount: req.body.advance_amount || 0,
      problem_description: req.body.problem_description || '',
    });

    const attachments = summaryPdf && summaryPdf.filePath && fs.existsSync(summaryPdf.filePath)
      ? [{ filename: summaryPdf.fileName, path: summaryPdf.filePath, contentType: summaryPdf.mimeType }]
      : [];

    // Trigger automation event with the summary PDF as attachment
    await automationService.handleEvent('CASE_CREATED', {
      case_id: caseId,
      case_number: caseRow?.case_number || '',
      email: recipientEmail,
      attachments
    });

    res.json({ success: true, path: req.file.path });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

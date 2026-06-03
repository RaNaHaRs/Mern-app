const express = require('express');
const { query } = require('../config/database');

const router = express.Router();
// No authentication — these are public endpoints

// GET /api/client-portal/case?case_number=...&phone=...
router.get('/case', async (req, res) => {
  const { case_number, phone } = req.query;
  if (!case_number?.trim()) {
    return res.status(400).json({ error: 'Case number is required' });
  }

  try {
    const result = await query(
      `SELECT c.id, c.case_number, c.stage, c.priority, c.failure_type,
              c.device_brand, c.device_model, c.created_at, c.recovery_progress_pct,
              c.client_id,
              cl.phone AS client_phone
       FROM cases c
       LEFT JOIN clients cl ON c.client_id = cl.id
       WHERE UPPER(c.case_number) = $1
         AND c.deleted_at IS NULL`,
      [case_number.trim().toUpperCase()]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Case not found. Please check the case number and try again.' });
    }

    const row = result.rows[0];

    // Optional phone verification — last 4 digits must match if both are present
    if (phone?.trim()) {
      const last4Input = phone.trim().replace(/\D/g, '').slice(-4);
      const last4Stored = (row.client_phone || '').replace(/\D/g, '').slice(-4);
      if (last4Input && last4Stored && last4Input !== last4Stored) {
        return res.status(403).json({ error: 'Phone number does not match our records. Please verify and try again.' });
      }
    }

    // Return only safe public fields
    res.json({
      id: row.id,
      case_number: row.case_number,
      stage: row.stage,
      priority: row.priority,
      failure_type: row.failure_type,
      device_brand: row.device_brand,
      device_model: row.device_model,
      created_at: row.created_at,
      recovery_progress_pct: row.recovery_progress_pct,
      client_id: row.client_id,
    });
  } catch (err) {
    console.error('Client portal case lookup error:', err.message);
    res.status(500).json({ error: 'An error occurred. Please try again later.' });
  }
});

// POST /api/client-portal/message
router.post('/message', async (req, res) => {
  const { case_id, case_number, message, phone } = req.body;

  if (!case_id || !message?.trim()) {
    return res.status(400).json({ error: 'Case ID and message are required' });
  }
  if (message.trim().length > 2000) {
    return res.status(400).json({ error: 'Message too long (max 2000 characters)' });
  }

  try {
    const caseRes = await query(
      `SELECT c.id, c.case_number, c.client_id FROM cases c WHERE c.id = $1 AND c.deleted_at IS NULL`,
      [case_id]
    );
    if (!caseRes.rows.length) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const caseRow = caseRes.rows[0];
    const noteText = `[Client Portal] ${message.trim()}`;

    // Store as client communication (primary — engineers see this in client timeline)
    if (caseRow.client_id) {
      try {
        await query(
          `INSERT INTO client_communications (client_id, user_id, type, direction, summary)
           VALUES ($1, NULL, 'portal_message', 'inbound', $2)`,
          [caseRow.client_id, `[Case ${caseRow.case_number}] ${message.trim()}`]
        );
      } catch (commErr) {
        console.warn('Portal message to client_communications failed (non-fatal):', commErr.message);
      }
    }

    // Also append to case workflow timeline so engineers see it inline with the case
    try {
      await query(
        `INSERT INTO case_workflow_logs (case_id, from_stage, to_stage, engineer_id, notes)
         VALUES ($1, NULL, NULL, NULL, $2)`,
        [case_id, noteText]
      );
    } catch (logErr) {
      console.warn('Portal message to case_workflow_logs failed (non-fatal):', logErr.message);
    }

    res.json({ ok: true, message: 'Your message has been sent. Our team will respond soon.' });
  } catch (err) {
    console.error('Client portal message error:', err.message);
    res.status(500).json({ error: 'Failed to send message. Please try again.' });
  }
});

module.exports = router;

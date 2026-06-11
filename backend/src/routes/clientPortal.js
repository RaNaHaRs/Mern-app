const express = require('express');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
// Public endpoints (no auth) + some authenticated endpoints

// GET /api/client-portal/case?case_number=...&phone_or_email=... OR case_id=...
router.get('/case', async (req, res) => {
  const { case_number, phone, phone_or_email, case_id } = req.query;
  // Support legacy `phone` param and new unified `phone_or_email` param
  const credential = (phone_or_email || phone || '').trim();

  let queryStr, params;

  if (case_id?.trim()) {
    // Direct lookup by case_id (from email portal link)
    queryStr = `SELECT c.id, c.case_number, c.stage, c.priority, c.failure_type,
                      c.device_brand, c.device_model, c.created_at, c.recovery_progress_pct,
                      c.client_id,
                      u.full_name as engineer_name, u.email as engineer_email
               FROM cases c
               LEFT JOIN users u ON c.assigned_engineer = u.id
               WHERE c.id = $1
                 AND c.deleted_at IS NULL`;
    params = [case_id.trim()];
  } else if (case_number?.trim()) {
    // Traditional lookup by case_number (from manual search)
    queryStr = `SELECT c.id, c.case_number, c.stage, c.priority, c.failure_type,
                      c.device_brand, c.device_model, c.created_at, c.recovery_progress_pct,
                      c.client_id,
                      cl.phone AS client_phone,
                      cl.email AS client_email,
                      u.full_name as engineer_name, u.email as engineer_email
               FROM cases c
               LEFT JOIN clients cl ON c.client_id = cl.id
               LEFT JOIN users u ON c.assigned_engineer = u.id
               WHERE UPPER(c.case_number) = $1
                 AND c.deleted_at IS NULL`;
    params = [case_number.trim().toUpperCase()];
  } else {
    return res.status(400).json({ error: 'Case number or case ID is required' });
  }

  try {
    const result = await query(queryStr, params);

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Case not found. Please check the case number and try again.' });
    }

    const row = result.rows[0];

    // Verify credential (full phone number OR email) if provided for case_number lookup
    if (case_number && credential) {
      const isEmail = credential.includes('@');
      if (isEmail) {
        // Email verification — must match exactly (case-insensitive)
        const storedEmail = (row.client_email || '').trim().toLowerCase();
        if (storedEmail && credential.toLowerCase() !== storedEmail) {
          return res.status(403).json({ error: 'Email address does not match our records. Please verify and try again.' });
        }
      } else {
        // Full phone number verification — normalize digits and compare full number
        const inputDigits = credential.replace(/\D/g, '');
        const storedDigits = (row.client_phone || '').replace(/\D/g, '');
        if (inputDigits && storedDigits && inputDigits !== storedDigits) {
          return res.status(403).json({ error: 'Phone number does not match our records. Please enter your full registered phone number.' });
        }
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
      engineer_name: row.engineer_name || null,
      engineer_email: row.engineer_email || null,
    });
  } catch (err) {
    console.error('Client portal case lookup error:', err.message);
    res.status(500).json({ error: 'An error occurred. Please try again later.' });
  }
});

// GET /api/client-portal/messages/:case_id — public endpoint to get portal messages for a case
router.get('/messages/:case_id', async (req, res) => {
  const { case_id } = req.params;

  try {
    // Verify case exists (public access, no auth required)
    const caseRes = await query(
      `SELECT c.id, c.client_id FROM cases c WHERE c.id = $1 AND c.deleted_at IS NULL`,
      [case_id]
    );
    if (!caseRes.rows.length) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const { client_id } = caseRes.rows[0];

    // Get portal messages and replies for this client
    const result = await query(
      `SELECT 
        cc.*,
        cc_reply_to.summary as reply_to_summary,
        cc_reply_to.created_at as reply_to_created_at
       FROM client_communications cc
       LEFT JOIN client_communications cc_reply_to ON cc.reply_to_id = cc_reply_to.id
       WHERE cc.client_id = $1 
         AND (cc.type = 'portal_message' OR cc.type = 'portal_reply')
       ORDER BY cc.created_at ASC`,
      [client_id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching portal messages:', err.message);
    res.status(500).json({ error: err.message });
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
    let commId = null;
    if (caseRow.client_id) {
      try {
        const commRes = await query(
          `INSERT INTO client_communications (client_id, user_id, type, direction, summary, created_at)
           VALUES ($1, NULL, 'portal_message', 'inbound', $2, NOW())
           RETURNING id`,
          [caseRow.client_id, `[Case ${caseRow.case_number}] ${message.trim()}`]
        );
        commId = commRes.rows[0]?.id;
        console.log(`✅ Message stored in client_communications: ${commId}`);
      } catch (commErr) {
        console.warn('Portal message to client_communications failed (non-fatal):', commErr.message);
      }
    }

    // Also append to case workflow timeline so engineers see it inline with the case
    try {
      const logRes = await query(
        `INSERT INTO case_workflow_logs (case_id, from_stage, to_stage, engineer_id, notes, created_at)
         VALUES ($1, NULL, NULL, NULL, $2, NOW())
         RETURNING id`,
        [case_id, noteText]
      );
      console.log(`✅ Message stored in case_workflow_logs: ${logRes.rows[0]?.id}`);
    } catch (logErr) {
      console.warn('Portal message to case_workflow_logs failed (non-fatal):', logErr.message);
    }

    res.json({ 
      ok: true, 
      message: 'Your message has been sent. Our team will respond soon.',
      comm_id: commId
    });
  } catch (err) {
    console.error('Client portal message error:', err.message);
    res.status(500).json({ error: 'Failed to send message. Please try again.' });
  }
});

// POST /api/client-portal/reply — staff replies to client portal message
router.post('/reply', authenticate, async (req, res) => {
  const { case_id, client_id, message, reply_to_id } = req.body;

  if (!case_id || !client_id || !message?.trim()) {
    return res.status(400).json({ error: 'Case ID, client ID, and message are required' });
  }
  if (message.trim().length > 2000) {
    return res.status(400).json({ error: 'Message too long (max 2000 characters)' });
  }

  try {
    // Verify case exists and belongs to client
    const caseRes = await query(
      `SELECT c.id, c.case_number, c.client_id FROM cases c WHERE c.id = $1 AND c.deleted_at IS NULL`,
      [case_id]
    );
    if (!caseRes.rows.length) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const caseRow = caseRes.rows[0];
    if (caseRow.client_id !== client_id) {
      return res.status(403).json({ error: 'Case does not belong to this client' });
    }

    // Store reply as client communication (marked as staff reply)
    const replyText = `[Staff Reply] ${message.trim()}`;
    
    // Insert into client_communications (visible in client profile)
    const commRes = await query(
      `INSERT INTO client_communications (client_id, user_id, type, direction, summary, reply_to_id, created_at)
       VALUES ($1, $2, 'portal_reply', 'outbound', $3, $4, NOW())
       RETURNING id`,
      [client_id, req.user.id, replyText, reply_to_id || null]
    );
    const commId = commRes.rows[0]?.id;

    // Get current case stage to maintain it in the log
    const caseStageRes = await query(
      `SELECT stage FROM cases WHERE id = $1`,
      [case_id]
    );
    const currentStage = caseStageRes.rows[0]?.stage || 'received';

    // Also append to case workflow logs (keeping stage as-is since no transition)
    const logRes = await query(
      `INSERT INTO case_workflow_logs (case_id, from_stage, to_stage, engineer_id, notes, created_at)
       VALUES ($1, $2, $2, $3, $4, NOW())
       RETURNING id`,
      [case_id, currentStage, req.user.id, replyText]
    );

    console.log(`✅ Staff reply stored: comm_id=${commId}, log_id=${logRes.rows[0]?.id}`);

    res.json({ 
      ok: true,
      message: 'Your reply has been sent to the client. It will appear on their Track Your Case page.',
      comm_id: commId
    });
  } catch (err) {
    console.error('Client portal reply error:', err.message);
    res.status(500).json({ error: 'Failed to send reply. Please try again.' });
  }
});

module.exports = router;

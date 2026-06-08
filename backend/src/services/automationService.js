const { query, transaction } = require('../config/database');
const logger = require('../config/logger');
const invoiceService = require('./invoiceService');

/**
 * Automation Service
 * - CRUD for triggers and templates
 * - Execution engine to run triggers on events
 */

async function listTriggers() {
  const r = await query(`SELECT * FROM automation_triggers ORDER BY created_at DESC`);
  return r.rows;
}

async function getTrigger(id) {
  const r = await query(`SELECT * FROM automation_triggers WHERE id = $1`, [id]);
  return r.rows[0];
}

async function createTrigger({ name, event, recipient_type, email_template_id, is_active, created_by }) {
  const r = await query(
    `INSERT INTO automation_triggers (name, event, recipient_type, email_template_id, is_active, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [name, event, recipient_type, email_template_id, !!is_active, created_by]
  );
  return r.rows[0];
}

async function updateTrigger(id, patch) {
  const fields = [];
  const values = [];
  let idx = 1;
  for (const k of ['name','event','recipient_type','email_template_id','is_active']) {
    if (patch[k] !== undefined) {
      fields.push(`${k} = $${idx++}`);
      values.push(patch[k]);
    }
  }
  if (!fields.length) return getTrigger(id);
  values.push(id);
  const r = await query(`UPDATE automation_triggers SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`, values);
  return r.rows[0];
}

async function deleteTrigger(id) {
  await query(`DELETE FROM automation_triggers WHERE id = $1`, [id]);
  return true;
}

// Templates
async function listTemplates() {
  const r = await query(`SELECT * FROM email_templates ORDER BY created_at DESC`);
  return r.rows;
}

async function getTemplate(id) {
  const r = await query(`SELECT * FROM email_templates WHERE id = $1`, [id]);
  return r.rows[0];
}

async function createTemplate({ name, subject, body, is_active, created_by }) {
  const r = await query(
    `INSERT INTO email_templates (name, subject, body, is_active, created_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [name, subject, body, !!is_active, created_by]
  );
  return r.rows[0];
}

async function updateTemplate(id, patch) {
  const fields = [];
  const values = [];
  let idx = 1;
  for (const k of ['name','subject','body','is_active']) {
    if (patch[k] !== undefined) {
      fields.push(`${k} = $${idx++}`);
      values.push(patch[k]);
    }
  }
  if (!fields.length) return getTemplate(id);
  values.push(id);
  const r = await query(`UPDATE email_templates SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`, values);
  return r.rows[0];
}

async function deleteTemplate(id) {
  await query(`DELETE FROM email_templates WHERE id = $1`, [id]);
  return true;
}

// Trigger logs
async function logTrigger({ trigger_id, trigger_name, event, recipient, recipient_email, status, error_message }) {
  await query(
    `INSERT INTO trigger_logs (trigger_id, trigger_name, event, recipient, recipient_email, status, error_message)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [trigger_id, trigger_name, event, recipient, recipient_email, status, error_message || null]
  );
}

// Very small templating engine for supported variables
function applyTemplate(body, vars = {}) {
  return body.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (m, key) => {
    return (vars[key] !== undefined && vars[key] !== null) ? String(vars[key]) : '';
  });
}

/**
 * Handle an emitted event from the system
 * - finds active triggers for event
 * - loads template
 * - replaces variables
 * - sends email via Super Admin SMTP if configured
 */
async function handleEvent(event, context = {}) {
  try {
    const triggersRes = await query(`SELECT * FROM automation_triggers WHERE event = $1 AND is_active = true`, [event]);
    const triggers = triggersRes.rows;
    if (!triggers.length) return;

    for (const t of triggers) {
      try {
        const tpl = await getTemplate(t.email_template_id);
        if (!tpl || !tpl.is_active) {
          await logTrigger({ trigger_id: t.id, trigger_name: t.name, event, recipient: t.recipient_type, recipient_email: context.email || null, status: 'skipped', error_message: 'Template missing or inactive' });
          continue;
        }

        const vars = Object.assign({}, context);
        const subject = applyTemplate(tpl.subject || '', vars);
        const html = applyTemplate(tpl.body || '', vars);

        // Use Super Admin SMTP for Automation Center triggers
        const smtp = await invoiceService.loadSuperAdminSmtpConfig();
        if (!smtp.user) {
          await logTrigger({ trigger_id: t.id, trigger_name: t.name, event, recipient: t.recipient_type, recipient_email: context.email || null, status: 'failed', error_message: 'Super Admin SMTP not configured' });
          continue;
        }
        const transport = invoiceService.createTransport ? invoiceService.createTransport(smtp) : null;
        const nodemailer = require('nodemailer');
        const tx = transport || nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.secure, auth: { user: smtp.user, pass: smtp.pass }, tls: { rejectUnauthorized: false } });

        let to = null;
        if (t.recipient_type === 'Custom Email') {
          to = t.custom_email || context.email || context.recipient_email;
        } else if (t.recipient_type === 'Client') {
          to = context.email || context.recipient_email || context.client_email;
        } else if (t.recipient_type === 'Team Member' || t.recipient_type === 'Admin' || t.recipient_type === 'Super Admin') {
          to = context.email || context.recipient_email || t.custom_email || t.default_recipient_email;
        } else {
          to = context.email || context.recipient_email || t.custom_email || t.default_recipient_email;
        }

        if (!to) {
          await logTrigger({ trigger_id: t.id, trigger_name: t.name, event, recipient: t.recipient_type, recipient_email: null, status: 'failed', error_message: 'No recipient resolved' });
          continue;
        }

        const attachments = Array.isArray(context.attachments) ? context.attachments : [];
        await tx.verify();
        await tx.sendMail({ from: `"${smtp.from_name}" <${smtp.from_email}>`, to, subject, html, attachments });
        await logTrigger({ trigger_id: t.id, trigger_name: t.name, event, recipient: t.recipient_type, recipient_email: to, status: 'sent' });
      } catch (err) {
        logger.error('Automation trigger execution failed', { trigger: t.id, error: err.message });
        await logTrigger({ trigger_id: t.id, trigger_name: t.name, event, recipient: t.recipient_type, recipient_email: context.email || null, status: 'failed', error_message: err.message });
      }
    }
  } catch (err) {
    logger.error('Automation handleEvent error', { event, error: err.message });
  }
}

module.exports = {
  listTriggers, getTrigger, createTrigger, updateTrigger, deleteTrigger,
  listTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate,
  logTrigger, handleEvent
};

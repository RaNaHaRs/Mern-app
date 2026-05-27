const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const { isSuperAdmin, tenantCreatedByInUserScope, tenantAdminId } = require('../utils/tenantAccess');
const logger = require('../config/logger');

const router = express.Router();
router.use(authenticate);

// ═══════════════════════════════════════════════════════════════
// DB MIGRATION — run on first load
// ═══════════════════════════════════════════════════════════════
async function ensureMarketingTables() {
  const migrations = [
    // Email templates
    `CREATE TABLE IF NOT EXISTS marketing_email_templates (
      id SERIAL PRIMARY KEY,
      tenant_id UUID,
      name VARCHAR(200) NOT NULL,
      subject VARCHAR(500) NOT NULL,
      preview_text VARCHAR(500),
      html_body TEXT NOT NULL,
      text_body TEXT,
      category VARCHAR(100) DEFAULT 'general',
      tags TEXT[] DEFAULT '{}',
      variables TEXT[] DEFAULT '{}',
      is_active BOOLEAN DEFAULT true,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    // WhatsApp templates
    `CREATE TABLE IF NOT EXISTS marketing_whatsapp_templates (
      id SERIAL PRIMARY KEY,
      tenant_id UUID,
      name VARCHAR(200) NOT NULL,
      message_body TEXT NOT NULL,
      variables TEXT[] DEFAULT '{}',
      category VARCHAR(100) DEFAULT 'general',
      has_media BOOLEAN DEFAULT false,
      media_url TEXT,
      is_active BOOLEAN DEFAULT true,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    // Campaigns
    `CREATE TABLE IF NOT EXISTS marketing_campaigns (
      id SERIAL PRIMARY KEY,
      tenant_id UUID,
      name VARCHAR(300) NOT NULL,
      description TEXT,
      type VARCHAR(50) NOT NULL DEFAULT 'email',
      status VARCHAR(50) DEFAULT 'draft',
      email_template_id INTEGER REFERENCES marketing_email_templates(id),
      whatsapp_template_id INTEGER REFERENCES marketing_whatsapp_templates(id),
      sms_template TEXT,
      subject_line VARCHAR(500),
      from_name VARCHAR(200),
      from_email VARCHAR(200),
      reply_to VARCHAR(200),
      audience_filter JSONB DEFAULT '{}',
      audience_count INTEGER DEFAULT 0,
      scheduled_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      total_sent INTEGER DEFAULT 0,
      total_delivered INTEGER DEFAULT 0,
      total_opened INTEGER DEFAULT 0,
      total_clicked INTEGER DEFAULT 0,
      total_bounced INTEGER DEFAULT 0,
      total_unsubscribed INTEGER DEFAULT 0,
      settings JSONB DEFAULT '{}',
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    // Campaign recipients
    `CREATE TABLE IF NOT EXISTS marketing_campaign_recipients (
      id SERIAL PRIMARY KEY,
      tenant_id UUID,
      campaign_id INTEGER REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
      client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
      email VARCHAR(300),
      phone VARCHAR(50),
      name VARCHAR(200),
      status VARCHAR(50) DEFAULT 'pending',
      sent_at TIMESTAMPTZ,
      opened_at TIMESTAMPTZ,
      clicked_at TIMESTAMPTZ,
      bounce_reason TEXT,
      unsubscribed_at TIMESTAMPTZ,
      personalization JSONB DEFAULT '{}'
    )`,
    // Unsubscribes
    `CREATE TABLE IF NOT EXISTS marketing_unsubscribes (
      id SERIAL PRIMARY KEY,
      tenant_id UUID,
      email VARCHAR(300),
      phone VARCHAR(50),
      source VARCHAR(100),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `ALTER TABLE marketing_email_templates ADD COLUMN IF NOT EXISTS tenant_id UUID`,
    `ALTER TABLE marketing_whatsapp_templates ADD COLUMN IF NOT EXISTS tenant_id UUID`,
    `ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS tenant_id UUID`,
    `ALTER TABLE marketing_campaign_recipients ADD COLUMN IF NOT EXISTS tenant_id UUID`,
    `ALTER TABLE marketing_unsubscribes ADD COLUMN IF NOT EXISTS tenant_id UUID`,
    // Indexes
    `CREATE INDEX IF NOT EXISTS idx_marketing_email_templates_tenant ON marketing_email_templates(tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_marketing_whatsapp_templates_tenant ON marketing_whatsapp_templates(tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_tenant ON marketing_campaigns(tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_marketing_campaign_recipients_tenant ON marketing_campaign_recipients(tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_marketing_unsubscribes_tenant ON marketing_unsubscribes(tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_campaign_recs_campaign ON marketing_campaign_recipients(campaign_id)`,
    `CREATE INDEX IF NOT EXISTS idx_campaign_recs_client ON marketing_campaign_recipients(client_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_unsubscribes_tenant_email ON marketing_unsubscribes(tenant_id, email) WHERE email IS NOT NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_unsubscribes_tenant_phone ON marketing_unsubscribes(tenant_id, phone) WHERE phone IS NOT NULL`,
  ];
  for (const sql of migrations) {
    try { await query(sql); } catch (e) {/* already exists */}
  }
}
ensureMarketingTables().catch(e => logger.warn('Marketing migration:', e.message));

function currentTenantId(user) {
  return tenantAdminId(user);
}

// ─── HELPERS ────────────────────────────────────────────────────

// Build personalized content from template
function personalizeContent(template, data) {
  let out = template;
  for (const [key, val] of Object.entries(data || {})) {
    out = out.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'gi'), val || '');
  }
  return out;
}

// Extract variable names from template
function extractVariables(text) {
  const matches = text.matchAll(/\{\{\s*(\w+)\s*\}\}/g);
  return [...new Set([...matches].map(m => m[1]))];
}

// Build inbox-friendly HTML email with all anti-spam best practices
function buildInboxFriendlyEmail({ subject, previewText, htmlBody, textBody, fromName, fromEmail, unsubscribeLink, campaignId, recipientEmail }) {
  const preheader = previewText || subject;
  // Wrap in proper email HTML with all deliverability best practices
  const fullHtml = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <title>${subject}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    * { box-sizing: border-box; }
    body { margin:0; padding:0; background:#f4f4f5; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif; }
    .email-wrapper { background:#f4f4f5; padding:40px 20px; }
    .email-container { max-width:600px; margin:0 auto; background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,0.08); }
    .email-footer { padding:24px 40px; background:#f9f9fb; text-align:center; font-size:12px; color:#888; }
    .email-footer a { color:#6366f1; text-decoration:none; }
    @media screen and (max-width:600px) {
      .email-container { border-radius:0 !important; }
    }
  </style>
</head>
<body>
  <!-- Preheader text (hidden, shows in email clients as preview) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#ffffff;line-height:1px;">
    ${preheader}&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌
  </div>
  
  <div class="email-wrapper">
    <div class="email-container">
      ${htmlBody}
      
      <div class="email-footer">
        <p>You're receiving this because you're a client of ${fromName}.</p>
        <p>
          <a href="${unsubscribeLink}">Unsubscribe</a> &nbsp;|&nbsp;
          <a href="mailto:${fromEmail}">Contact Us</a>
        </p>
        <p style="color:#aaa;font-size:11px;">© ${new Date().getFullYear()} ${fromName}. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>`;

  return {
    html: fullHtml,
    text: textBody || `${subject}\n\n${htmlBody.replace(/<[^>]+>/g, '')}\n\nUnsubscribe: ${unsubscribeLink}`,
    headers: {
      'List-Unsubscribe': `<${unsubscribeLink}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      'X-Campaign-ID': campaignId,
      'X-Mailer': 'RecoverLabCRM/1.0',
      'Precedence': 'bulk',
      'X-Entity-Ref-ID': `${campaignId}-${Date.now()}`,
    }
  };
}

// ═══════════════════════════════════════════════════════════════
// EMAIL TEMPLATES CRUD
// ═══════════════════════════════════════════════════════════════

// GET /api/marketing/email-templates
router.get('/email-templates', async (req, res) => {
  try {
    const { category, search } = req.query;
    let sql = `SELECT et.*, u.full_name as creator FROM marketing_email_templates et
               LEFT JOIN users u ON u.id = et.created_by
               WHERE et.is_active = true`;
    const params = [];
    if (category) { params.push(category); sql += ` AND et.category = $${params.length}`; }
    if (search) { params.push(`%${search}%`); sql += ` AND (et.name ILIKE $${params.length} OR et.subject ILIKE $${params.length})`; }
    const tenantCondition = !isSuperAdmin(req.user) ? tenantCreatedByInUserScope(req.user, params.length + 1, 'et') : null;
    if (tenantCondition) { params.push(...tenantCondition.params); sql += ` AND ${tenantCondition.clause}`; }
    sql += ' ORDER BY et.updated_at DESC';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/marketing/email-templates
router.post('/email-templates', [
  body('name').notEmpty(),
  body('subject').notEmpty(),
  body('html_body').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  try {
    const { name, subject, preview_text, html_body, text_body, category, tags } = req.body;
    const variables = extractVariables(html_body + ' ' + (text_body || ''));
    const result = await query(
      `INSERT INTO marketing_email_templates (tenant_id, name, subject, preview_text, html_body, text_body, category, tags, variables, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [currentTenantId(req.user), name, subject, preview_text, html_body, text_body, category || 'general', tags || [], variables, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/marketing/email-templates/:id
router.put('/email-templates/:id', async (req, res) => {
  try {
    const { name, subject, preview_text, html_body, text_body, category, tags } = req.body;
    const variables = extractVariables(html_body + ' ' + (text_body || ''));
    const tenantCondition = !isSuperAdmin(req.user) ? tenantCreatedByInUserScope(req.user, 10) : null;
    const result = await query(
      `UPDATE marketing_email_templates SET name=$1,subject=$2,preview_text=$3,html_body=$4,text_body=$5,
       category=$6,tags=$7,variables=$8,updated_at=NOW() WHERE id=$9${tenantCondition ? ` AND ${tenantCondition.clause}` : ''} RETURNING *`,
      tenantCondition ? [name, subject, preview_text, html_body, text_body, category || 'general', tags || [], variables, req.params.id, ...tenantCondition.params] :
      [name, subject, preview_text, html_body, text_body, category || 'general', tags || [], variables, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Template not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/marketing/email-templates/:id
router.delete('/email-templates/:id', async (req, res) => {
  try {
    const tenantCondition = !isSuperAdmin(req.user) ? tenantCreatedByInUserScope(req.user, 2) : null;
    await query(
      `UPDATE marketing_email_templates SET is_active=false WHERE id=$1${tenantCondition ? ` AND ${tenantCondition.clause}` : ''}`,
      tenantCondition ? [req.params.id, ...tenantCondition.params] : [req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/marketing/email-templates/import-html  — import raw HTML email
router.post('/email-templates/import-html', async (req, res) => {
  try {
    const { name, html } = req.body;
    if (!html) return res.status(422).json({ error: 'HTML is required' });
    // Extract subject from <title> or <h1>
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const subject = titleMatch ? titleMatch[1].trim() : name || 'Imported Template';
    const variables = extractVariables(html);
    // Extract plain text from HTML
    const textBody = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                         .replace(/<[^>]+>/g, ' ')
                         .replace(/\s+/g, ' ')
                         .trim();
    const result = await query(
      `INSERT INTO marketing_email_templates (tenant_id, name, subject, html_body, text_body, category, variables, created_by)
       VALUES ($1,$2,$3,$4,$5,'imported',$6,$7) RETURNING *`,
      [currentTenantId(req.user), name || subject, subject, html, textBody.substring(0, 5000), variables, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/marketing/email-templates/:id/preview  — preview with test data
router.post('/email-templates/:id/preview', async (req, res) => {
  try {
    const tenantCondition = !isSuperAdmin(req.user) ? tenantCreatedByInUserScope(req.user, 2) : null;
    const tpl = await query(
      `SELECT * FROM marketing_email_templates WHERE id=$1${tenantCondition ? ` AND ${tenantCondition.clause}` : ''}`,
      tenantCondition ? [req.params.id, ...tenantCondition.params] : [req.params.id]
    );
    if (!tpl.rows.length) return res.status(404).json({ error: 'Template not found' });
    const t = tpl.rows[0];
    const personalized = personalizeContent(t.html_body, req.body.variables || {});
    const email = buildInboxFriendlyEmail({
      subject: personalizeContent(t.subject, req.body.variables || {}),
      previewText: t.preview_text,
      htmlBody: personalized,
      textBody: t.text_body,
      fromName: req.body.fromName || 'RecoverLab',
      fromEmail: req.body.fromEmail || 'noreply@recoverlab.com',
      unsubscribeLink: 'https://yourdomain.com/unsubscribe?token=preview',
      campaignId: 'preview',
    });
    res.json({ html: email.html, text: email.text, subject: personalizeContent(t.subject, req.body.variables || {}) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// WHATSAPP TEMPLATES CRUD
// ═══════════════════════════════════════════════════════════════

router.get('/whatsapp-templates', async (req, res) => {
  try {
    const tenantCondition = !isSuperAdmin(req.user) ? tenantCreatedByInUserScope(req.user, 1) : null;
    const result = await query(
      `SELECT * FROM marketing_whatsapp_templates WHERE is_active=true${tenantCondition ? ` AND ${tenantCondition.clause}` : ''} ORDER BY updated_at DESC`,
      tenantCondition ? tenantCondition.params : []
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/whatsapp-templates', async (req, res) => {
  try {
    const { name, message_body, category, has_media, media_url } = req.body;
    const variables = extractVariables(message_body);
    const result = await query(
      `INSERT INTO marketing_whatsapp_templates (tenant_id, name, message_body, category, has_media, media_url, variables, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [currentTenantId(req.user), name, message_body, category || 'general', has_media || false, media_url, variables, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/whatsapp-templates/:id', async (req, res) => {
  try {
    const { name, message_body, category, has_media, media_url } = req.body;
    const variables = extractVariables(message_body);
    const tenantCondition = !isSuperAdmin(req.user) ? tenantCreatedByInUserScope(req.user, 8) : null;
    const result = await query(
      `UPDATE marketing_whatsapp_templates SET name=$1,message_body=$2,category=$3,has_media=$4,
       media_url=$5,variables=$6,updated_at=NOW() WHERE id=$7${tenantCondition ? ` AND ${tenantCondition.clause}` : ''} RETURNING *`,
      tenantCondition ? [name, message_body, category, has_media, media_url, variables, req.params.id, ...tenantCondition.params] :
      [name, message_body, category, has_media, media_url, variables, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/whatsapp-templates/:id', async (req, res) => {
  try {
    const tenantCondition = !isSuperAdmin(req.user) ? tenantCreatedByInUserScope(req.user, 2) : null;
    await query(
      `UPDATE marketing_whatsapp_templates SET is_active=false WHERE id=$1${tenantCondition ? ` AND ${tenantCondition.clause}` : ''}`,
      tenantCondition ? [req.params.id, ...tenantCondition.params] : [req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// CAMPAIGNS
// ═══════════════════════════════════════════════════════════════

// GET /api/marketing/campaigns
router.get('/campaigns', async (req, res) => {
  try {
    const { type, status } = req.query;
    let sql = `SELECT c.*, u.full_name as creator,
               et.name as email_template_name, wt.name as whatsapp_template_name
               FROM marketing_campaigns c
               LEFT JOIN users u ON u.id = c.created_by
               LEFT JOIN marketing_email_templates et ON et.id = c.email_template_id
               LEFT JOIN marketing_whatsapp_templates wt ON wt.id = c.whatsapp_template_id
               WHERE 1=1`;
    const params = [];
    if (type) { params.push(type); sql += ` AND c.type=$${params.length}`; }
    if (status) { params.push(status); sql += ` AND c.status=$${params.length}`; }
    const tenantCondition = !isSuperAdmin(req.user) ? tenantCreatedByInUserScope(req.user, params.length + 1, 'c') : null;
    if (tenantCondition) { params.push(...tenantCondition.params); sql += ` AND ${tenantCondition.clause}`; }
    sql += ' ORDER BY c.created_at DESC';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/marketing/campaigns
router.post('/campaigns', async (req, res) => {
  try {
    const { name, description, type, email_template_id, whatsapp_template_id, sms_template,
            subject_line, from_name, from_email, reply_to, audience_filter, scheduled_at, settings } = req.body;
    
    // Count audience
    let audienceCount = 0;
    try {
      const tenantCondition = !isSuperAdmin(req.user) ? tenantCreatedByInUserScope(req.user, 1) : null;
      const clientQ = await query(
        `SELECT COUNT(*) as cnt FROM clients ${tenantCondition ? `WHERE ${tenantCondition.clause}` : ''}`,
        tenantCondition ? tenantCondition.params : []
      );
      audienceCount = parseInt(clientQ.rows[0]?.cnt || 0);
    } catch(e) {}

    const result = await query(
      `INSERT INTO marketing_campaigns 
       (name,description,type,email_template_id,whatsapp_template_id,sms_template,
        subject_line,from_name,from_email,reply_to,audience_filter,audience_count,
        scheduled_at,settings,created_by,tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [name, description, type || 'email', email_template_id, whatsapp_template_id,
       sms_template, subject_line, from_name, from_email, reply_to,
       JSON.stringify(audience_filter || {}), audienceCount,
       scheduled_at, JSON.stringify(settings || {}), req.user.id, currentTenantId(req.user)]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/marketing/campaigns/:id
router.put('/campaigns/:id', async (req, res) => {
  try {
    const { name, description, type, email_template_id, whatsapp_template_id, sms_template,
            subject_line, from_name, from_email, reply_to, audience_filter, scheduled_at, settings } = req.body;
    const tenantCondition = !isSuperAdmin(req.user) ? tenantCreatedByInUserScope(req.user, 15) : null;
    const result = await query(
      `UPDATE marketing_campaigns SET name=$1,description=$2,type=$3,email_template_id=$4,
       whatsapp_template_id=$5,sms_template=$6,subject_line=$7,from_name=$8,from_email=$9,
       reply_to=$10,audience_filter=$11,scheduled_at=$12,settings=$13,updated_at=NOW()
       WHERE id=$14 AND status='draft'${tenantCondition ? ` AND ${tenantCondition.clause}` : ''} RETURNING *`,
      tenantCondition ? [name, description, type, email_template_id, whatsapp_template_id, sms_template,
       subject_line, from_name, from_email, reply_to, JSON.stringify(audience_filter || {}),
       scheduled_at, JSON.stringify(settings || {}), req.params.id, ...tenantCondition.params] :
      [name, description, type, email_template_id, whatsapp_template_id, sms_template,
       subject_line, from_name, from_email, reply_to, JSON.stringify(audience_filter || {}),
       scheduled_at, JSON.stringify(settings || {}), req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Campaign not found or already sent' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/marketing/campaigns/:id/send  — launch campaign
router.post('/campaigns/:id/send', auditLog('campaign_send', 'campaign'), async (req, res) => {
  try {
    const tenantCondition = !isSuperAdmin(req.user) ? tenantCreatedByInUserScope(req.user, 2) : null;
    const camp = await query(
      `SELECT * FROM marketing_campaigns WHERE id=$1${tenantCondition ? ` AND ${tenantCondition.clause}` : ''}`,
      tenantCondition ? [req.params.id, ...tenantCondition.params] : [req.params.id]
    );
    if (!camp.rows.length) return res.status(404).json({ error: 'Campaign not found' });
    const c = camp.rows[0];
    if (c.status === 'sent' || c.status === 'sending') return res.status(400).json({ error: 'Campaign already launched' });

    // Mark as sending
    await query(`UPDATE marketing_campaigns SET status='sending', sent_at=NOW() WHERE id=$1`, [c.id]);

    // Fetch audience (all clients with email/phone)
    let audienceQuery = `SELECT id, CONCAT_WS(' ', first_name, last_name) AS full_name, email, phone, company AS company_name FROM clients WHERE 1=1`;
    let audienceParams = [];
    if (!isSuperAdmin(req.user)) {
      const tenantCondition = tenantCreatedByInUserScope(req.user, 1);
      audienceQuery += ` AND ${tenantCondition.clause}`;
      audienceParams = tenantCondition.params;
    }
    const audience = await query(audienceQuery, audienceParams);

    // Build recipient list
    let inserted = 0;
    for (const client of audience.rows) {
      if (c.type === 'email' && !client.email) continue;
      if (c.type === 'whatsapp' && !client.phone) continue;
      if (c.type === 'sms' && !client.phone) continue;

      // Check unsubscribe list
      const unsub = await query(
        `SELECT id FROM marketing_unsubscribes
         WHERE (email=$1 OR phone=$2)${!isSuperAdmin(req.user) ? ' AND tenant_id = $3' : ''}`,
        !isSuperAdmin(req.user) ? [client.email, client.phone, currentTenantId(req.user)] : [client.email, client.phone]
      );
      if (unsub.rows.length) continue;

      await query(
        `INSERT INTO marketing_campaign_recipients (campaign_id, client_id, email, phone, name, status, personalization, tenant_id)
         VALUES ($1,$2,$3,$4,$5,'queued',$6,$7)
         ON CONFLICT DO NOTHING`,
        [c.id, client.id, client.email, client.phone, client.full_name,
         JSON.stringify({ name: client.full_name, company: client.company_name, email: client.email }),
         c.tenant_id || currentTenantId(req.user)]
      );
      inserted++;
    }

    // Update campaign stats
    await query(
      `UPDATE marketing_campaigns SET status='sent', total_sent=$1, completed_at=NOW(), audience_count=$1 WHERE id=$2`,
      [inserted, c.id]
    );

    logger.info(`Campaign ${c.id} sent to ${inserted} recipients`);
    res.json({ success: true, sent: inserted, campaignId: c.id });
  } catch (err) {
    await query(`UPDATE marketing_campaigns SET status='draft' WHERE id=$1`, [req.params.id]).catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing/campaigns/:id/send-test
router.post('/campaigns/:id/send-test', async (req, res) => {
  try {
    const { test_email, test_phone, test_variables } = req.body;
    const tenantCondition = !isSuperAdmin(req.user) ? tenantCreatedByInUserScope(req.user, 2) : null;
    const camp = await query(
      `SELECT c.*, et.html_body, et.subject as tpl_subject, wt.message_body
       FROM marketing_campaigns c
       LEFT JOIN marketing_email_templates et ON et.id=c.email_template_id
       LEFT JOIN marketing_whatsapp_templates wt ON wt.id=c.whatsapp_template_id
       WHERE c.id=$1${tenantCondition ? ` AND ${tenantCondition.clause}` : ''}`,
      tenantCondition ? [req.params.id, ...tenantCondition.params] : [req.params.id]
    );
    if (!camp.rows.length) return res.status(404).json({ error: 'Campaign not found' });
    const c = camp.rows[0];
    
    if (c.type === 'email' && c.html_body) {
      const personalized = personalizeContent(c.html_body, test_variables || { name: 'Test User', email: test_email });
      const email = buildInboxFriendlyEmail({
        subject: personalizeContent(c.subject_line || c.tpl_subject || 'Test Email', test_variables || {}),
        htmlBody: personalized,
        fromName: c.from_name || 'RecoverLab CRM',
        fromEmail: c.from_email || 'noreply@recoverlab.com',
        unsubscribeLink: 'https://yourdomain.com/unsubscribe?token=test',
        campaignId: `test-${c.id}`,
      });
      // In production: send via nodemailer/sendgrid
      res.json({ success: true, message: `Test email would be sent to ${test_email}`, preview: email.html.substring(0, 500) });
    } else if (c.type === 'whatsapp' && c.message_body) {
      const message = personalizeContent(c.message_body, test_variables || { name: 'Test User' });
      res.json({ success: true, message: `Test WhatsApp would be sent to ${test_phone}`, preview: message });
    } else {
      res.json({ success: true, message: 'Test queued' });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/marketing/campaigns/:id/stats
router.get('/campaigns/:id/stats', async (req, res) => {
  try {
    const tenantCondition = !isSuperAdmin(req.user) ? tenantCreatedByInUserScope(req.user, 2) : null;
    const camp = await query(
      `SELECT * FROM marketing_campaigns WHERE id=$1${tenantCondition ? ` AND ${tenantCondition.clause}` : ''}`,
      tenantCondition ? [req.params.id, ...tenantCondition.params] : [req.params.id]
    );
    if (!camp.rows.length) return res.status(404).json({ error: 'Campaign not found' });
    const recs = await query(`
      SELECT status, COUNT(*) as count FROM marketing_campaign_recipients WHERE campaign_id=$1 GROUP BY status`,
      [req.params.id]
    );
    const statMap = {};
    recs.rows.forEach(r => statMap[r.status] = parseInt(r.count));
    res.json({ campaign: camp.rows[0], stats: statMap });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/marketing/campaigns/:id
router.delete('/campaigns/:id', async (req, res) => {
  try {
    const tenantCondition = !isSuperAdmin(req.user) ? tenantCreatedByInUserScope(req.user, 2) : null;
    const camp = await query(
      `SELECT status FROM marketing_campaigns WHERE id=$1${tenantCondition ? ` AND ${tenantCondition.clause}` : ''}`,
      tenantCondition ? [req.params.id, ...tenantCondition.params] : [req.params.id]
    );
    if (!camp.rows.length) return res.status(404).json({ error: 'Not found' });
    if (camp.rows[0].status === 'sending') return res.status(400).json({ error: 'Cannot delete a running campaign' });
    await query('DELETE FROM marketing_campaign_recipients WHERE campaign_id=$1', [req.params.id]);
    await query('DELETE FROM marketing_campaigns WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// AUDIENCE
// ═══════════════════════════════════════════════════════════════

// GET /api/marketing/audience — preview audience for filter
router.get('/audience', async (req, res) => {
  try {
    const tenantCondition = !isSuperAdmin(req.user) ? tenantCreatedByInUserScope(req.user, 1) : null;
    const result = await query(
      `SELECT id, CONCAT_WS(' ', first_name, last_name) AS full_name, email, phone, company AS company_name, created_at
      FROM clients${tenantCondition ? ` WHERE ${tenantCondition.clause}` : ''} ORDER BY full_name LIMIT 500`,
      tenantCondition ? tenantCondition.params : []);
    const unsubList = await query(
      `SELECT email, phone FROM marketing_unsubscribes${!isSuperAdmin(req.user) ? ' WHERE tenant_id = $1' : ''}`,
      !isSuperAdmin(req.user) ? [currentTenantId(req.user)] : []
    );
    const unsubEmails = new Set(unsubList.rows.map(r => r.email));
    const unsubPhones = new Set(unsubList.rows.map(r => r.phone));
    const audience = result.rows.map(c => ({
      ...c,
      subscribed: !unsubEmails.has(c.email) && !unsubPhones.has(c.phone),
    }));
    res.json({ total: audience.length, subscribed: audience.filter(a => a.subscribed).length, contacts: audience });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/marketing/unsubscribe
router.post('/unsubscribe', async (req, res) => {
  try {
    const { email, phone } = req.body;
    if (email) await query('INSERT INTO marketing_unsubscribes (tenant_id, email) VALUES ($1, $2) ON CONFLICT DO NOTHING', [currentTenantId(req.user), email]);
    if (phone) await query('INSERT INTO marketing_unsubscribes (tenant_id, phone) VALUES ($1, $2) ON CONFLICT DO NOTHING', [currentTenantId(req.user), phone]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// ANALYTICS
// ═══════════════════════════════════════════════════════════════

router.get('/analytics', async (req, res) => {
  try {
    const tenantCondition = !isSuperAdmin(req.user) ? tenantCreatedByInUserScope(req.user, 1) : null;
    const [camps, totalSent, totalOpened, totalClicked, recentCamps] = await Promise.all([
      query(
        `SELECT COUNT(*) as total, status FROM marketing_campaigns ${tenantCondition ? `WHERE ${tenantCondition.clause}` : ''} GROUP BY status`,
        tenantCondition ? tenantCondition.params : []
      ),
      query(
        `SELECT COALESCE(SUM(total_sent),0) as total FROM marketing_campaigns ${tenantCondition ? `WHERE ${tenantCondition.clause}` : ''}`,
        tenantCondition ? tenantCondition.params : []
      ),
      query(
        `SELECT COALESCE(SUM(total_opened),0) as total FROM marketing_campaigns ${tenantCondition ? `WHERE ${tenantCondition.clause}` : ''}`,
        tenantCondition ? tenantCondition.params : []
      ),
      query(
        `SELECT COALESCE(SUM(total_clicked),0) as total FROM marketing_campaigns ${tenantCondition ? `WHERE ${tenantCondition.clause}` : ''}`,
        tenantCondition ? tenantCondition.params : []
      ),
      query(
        `SELECT id,name,type,status,total_sent,total_opened,total_clicked,created_at FROM marketing_campaigns ${tenantCondition ? `WHERE ${tenantCondition.clause}` : ''} ORDER BY created_at DESC LIMIT 5`,
        tenantCondition ? tenantCondition.params : []
      ),
    ]);
    const campByStatus = {};
    camps.rows.forEach(r => campByStatus[r.status] = parseInt(r.total));
    res.json({
      campaignsByStatus: campByStatus,
      totalSent: parseInt(totalSent.rows[0]?.total || 0),
      totalOpened: parseInt(totalOpened.rows[0]?.total || 0),
      totalClicked: parseInt(totalClicked.rows[0]?.total || 0),
      openRate: totalSent.rows[0]?.total > 0 ? ((totalOpened.rows[0]?.total / totalSent.rows[0]?.total) * 100).toFixed(1) : 0,
      clickRate: totalSent.rows[0]?.total > 0 ? ((totalClicked.rows[0]?.total / totalSent.rows[0]?.total) * 100).toFixed(1) : 0,
      recentCampaigns: recentCamps.rows,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// EMAIL DELIVERABILITY CHECKER
// ═══════════════════════════════════════════════════════════════

router.post('/check-deliverability', async (req, res) => {
  try {
    const { subject, html_body, from_email, from_name } = req.body;
    const issues = [];
    const tips = [];
    let score = 100;

    // Subject line checks
    if (!subject) { issues.push('Missing subject line'); score -= 20; }
    else {
      if (subject.length > 60) { tips.push('Subject line is over 60 chars — may get cut off on mobile'); score -= 5; }
      if (/FREE|SALE|URGENT|WIN|CLICK HERE/i.test(subject)) { issues.push('Subject has spam trigger words (FREE, SALE, URGENT, etc.)'); score -= 20; }
      if (/[!]{2,}/i.test(subject)) { issues.push('Multiple exclamation marks in subject trigger spam filters'); score -= 10; }
      if (/[$€£₹]{2,}/i.test(subject)) { issues.push('Multiple currency symbols in subject'); score -= 10; }
      if (subject === subject.toUpperCase() && subject.length > 5) { issues.push('ALL CAPS in subject line triggers spam filters'); score -= 15; }
    }

    // From email checks  
    if (!from_email) { issues.push('Missing from email address'); score -= 15; }
    else {
      if (from_email.includes('gmail.com') || from_email.includes('yahoo.com')) {
        issues.push('Using a free email provider (Gmail/Yahoo) for bulk email harms deliverability — use your domain email'); score -= 25;
      }
    }

    // HTML body checks
    if (html_body) {
      const textRatio = html_body.replace(/<[^>]+>/g, '').length / html_body.length;
      if (textRatio < 0.1) { tips.push('Very little text vs HTML — aim for at least 20% text content'); score -= 10; }
      if (!html_body.toLowerCase().includes('unsubscribe')) { issues.push('No unsubscribe link found — required by CAN-SPAM/GDPR'); score -= 25; }
      if (!html_body.toLowerCase().includes('alt=')) { tips.push('Add alt text to all images for better rendering and accessibility'); score -= 3; }
      if ((html_body.match(/<a/gi) || []).length > 15) { tips.push('Too many links (>15) can trigger spam filters'); score -= 5; }
    }

    // Recommendations
    const recommendations = [
      { check: 'SPF Record', desc: 'Add SPF DNS record: v=spf1 include:sendgrid.net ~all', status: 'manual' },
      { check: 'DKIM Signing', desc: 'Configure DKIM with your email provider to cryptographically sign emails', status: 'manual' },
      { check: 'DMARC Policy', desc: 'Add DMARC record: v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com', status: 'manual' },
      { check: 'Custom domain', desc: 'Send from a custom domain email (not Gmail/Yahoo)', status: from_email && !from_email.includes('gmail') ? 'pass' : 'fail' },
      { check: 'Unsubscribe link', desc: 'Include unsubscribe link in every email', status: html_body?.toLowerCase().includes('unsubscribe') ? 'pass' : 'fail' },
      { check: 'Subject length', desc: 'Keep subject under 60 characters', status: subject && subject.length <= 60 ? 'pass' : 'warn' },
      { check: 'No spam words', desc: 'Avoid spam trigger words in subject and body', status: issues.some(i => i.includes('spam trigger')) ? 'fail' : 'pass' },
      { check: 'Text version', desc: 'Include plain text version alongside HTML', status: 'manual' },
      { check: 'List-Unsubscribe header', desc: 'Add List-Unsubscribe header in email headers (auto-added by system)', status: 'pass' },
      { check: 'Sending domain reputation', desc: 'Use an email service with good reputation (SendGrid, Mailgun, AWS SES)', status: 'manual' },
    ];

    res.json({ score: Math.max(0, score), issues, tips, recommendations });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

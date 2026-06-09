/**
 * Campaign Scheduler Service
 * Automatically sends scheduled marketing campaigns when their scheduled_at time arrives
 * Runs every minute to check for campaigns that are ready to send
 */

const { query } = require('../config/database');
const logger = require('../config/logger');
const { loadCompanySettings } = require('../routes/settings');

let schedulerInterval = null;
const SCHEDULER_INTERVAL = 60 * 1000; // Check every 60 seconds

/**
 * Start the scheduler service
 */
function startCampaignScheduler() {
  if (schedulerInterval) {
    logger.warn('Campaign scheduler is already running');
    return;
  }

  logger.info('🚀 Starting campaign scheduler service...');
  
  // Check immediately on startup
  checkAndSendScheduledCampaigns().catch(err => {
    logger.error('Error in initial campaign scheduler check:', err.message);
  });

  // Then check every minute
  schedulerInterval = setInterval(() => {
    checkAndSendScheduledCampaigns().catch(err => {
      logger.error('Error in campaign scheduler check:', err.message);
    });
  }, SCHEDULER_INTERVAL);

  logger.info('✅ Campaign scheduler service started (checking every 60 seconds)');
}

/**
 * Stop the scheduler service
 */
function stopCampaignScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info('⏹️  Campaign scheduler service stopped');
  }
}

/**
 * Check for scheduled campaigns that are ready to send and send them
 */
async function checkAndSendScheduledCampaigns() {
  try {
    // Find campaigns that are scheduled and their scheduled_at time has arrived
    const result = await query(
      `SELECT c.*, et.html_body, et.subject as tpl_subject
       FROM marketing_campaigns c
       LEFT JOIN marketing_email_templates et ON et.id=c.email_template_id
       WHERE c.status = 'draft' 
         AND c.scheduled_at IS NOT NULL
         AND c.scheduled_at <= NOW()
       ORDER BY c.scheduled_at ASC
       LIMIT 10`,
      []
    );

    if (result.rows.length === 0) {
      // No scheduled campaigns ready, this is normal
      return;
    }

    logger.info(`Found ${result.rows.length} scheduled campaign(s) ready to send`);

    // Send each campaign
    for (const campaign of result.rows) {
      try {
        await sendCampaignAsync(campaign);
        logger.info(`✅ Sent scheduled campaign ${campaign.id} (${campaign.name})`);
      } catch (err) {
        logger.error(`❌ Failed to send scheduled campaign ${campaign.id}: ${err.message}`);
        // Mark campaign as failed
        await query(
          `UPDATE marketing_campaigns SET status='failed' WHERE id=$1`,
          [campaign.id]
        );
      }
    }
  } catch (err) {
    logger.error('Error in checkAndSendScheduledCampaigns:', err.message);
  }
}

/**
 * Send a campaign (async version for scheduler)
 * This is similar to the send endpoint but without requiring authentication
 */
async function sendCampaignAsync(campaign) {
  const { loadAdminSmtpConfig } = require('./invoiceService');
  const nodemailer = require('nodemailer');

  // Load SMTP config for email campaigns
  let transporter = null;
  let smtpFrom = {};
  let smsApiKey = null, smsSenderId = 'RCRLAB';
  
  // Load company settings
  const companySettings = await loadCompanySettings();

  // Mark campaign as sending
  await query(`UPDATE marketing_campaigns SET status='sending', sent_at=NOW() WHERE id=$1`, [campaign.id]);

  if (campaign.type === 'email') {
    const smtp = await loadAdminSmtpConfig();
    if (!smtp.host || !smtp.user || !smtp.pass) {
      await query(`UPDATE marketing_campaigns SET status='draft' WHERE id=$1`, [campaign.id]);
      throw new Error('Email not configured');
    }
    smtpFrom = { name: campaign.from_name || smtp.from_name || 'RecoverLab CRM', email: campaign.from_email || smtp.from_email || smtp.user };
    transporter = nodemailer.createTransport({
      host: smtp.host, port: smtp.port, secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
      tls: { rejectUnauthorized: false },
    });
    try {
      await transporter.verify();
    } catch (smtpErr) {
      await query(`UPDATE marketing_campaigns SET status='draft' WHERE id=$1`, [campaign.id]);
      throw new Error(`SMTP connection failed: ${smtpErr.message}`);
    }
  } else if (campaign.type === 'sms') {
    smsApiKey = companySettings.fast2sms_api_key;
    smsSenderId = companySettings.fast2sms_sender_id || 'RCRLAB';
    if (!smsApiKey) {
      await query(`UPDATE marketing_campaigns SET status='draft' WHERE id=$1`, [campaign.id]);
      throw new Error('SMS not configured');
    }
  }

  // Fetch audience
  let audienceFilter = {};
  try { audienceFilter = typeof campaign.audience_filter === 'string' ? JSON.parse(campaign.audience_filter) : (campaign.audience_filter || {}); } catch(e) {}
  const clientIds = audienceFilter?.client_ids;

  let audienceQuery = `SELECT id, CONCAT_WS(' ', first_name, last_name) AS full_name, email, phone, company AS company_name FROM clients WHERE 1=1`;
  let audienceParams = [];
  if (Array.isArray(clientIds) && clientIds.length > 0) {
    audienceQuery += ` AND id = ANY($1::uuid[])`;
    audienceParams.push(clientIds);
  }
  const audience = await query(audienceQuery, audienceParams);

  let sent = 0, failed = 0;
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5174';
  const apiBaseUrl = `http://localhost:${process.env.PORT || 5000}`;

  // Helper function for personalization
  function personalizeContent(template, data) {
    let out = template;
    for (const [key, val] of Object.entries(data || {})) {
      out = out.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'gi'), val || '');
    }
    return out;
  }

  // Helper function to build email HTML
  function buildInboxFriendlyEmail({ subject, previewText, htmlBody, textBody, fromName, fromEmail, unsubscribeLink, campaignId, recipientEmail }) {
    const preheader = previewText || subject;
    const fullHtml = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <title>${subject}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin:0; padding:0; background:#f4f4f5; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif; }
    .email-wrapper { background:#f4f4f5; padding:40px 20px; }
    .email-container { max-width:600px; margin:0 auto; background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,0.08); }
    .email-footer { padding:24px 40px; background:#f9f9fb; text-align:center; font-size:12px; color:#888; }
    .email-footer a { color:#6366f1; text-decoration:none; }
  </style>
</head>
<body>
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

  for (const client of audience.rows) {
    if (campaign.type === 'email' && !client.email) continue;
    if (campaign.type === 'sms' && !client.phone) continue;

    // Check unsubscribe
    const unsub = await query(
      `SELECT id FROM marketing_unsubscribes WHERE (email=$1)`,
      [client.email]
    );
    if (unsub.rows.length) continue;

    const personalization = { name: client.full_name, company: client.company_name, email: client.email };

    // Fetch the latest case for this client
    const caseResult = await query(
      `SELECT c.id, c.case_number, c.device_brand, c.device_model, c.stage, u.full_name as technician_name
       FROM cases c
       LEFT JOIN users u ON u.id = c.assigned_engineer
       WHERE c.client_id=$1 AND c.deleted_at IS NULL
       ORDER BY c.created_at DESC LIMIT 1`,
      [client.id]
    );
    if (caseResult.rows.length > 0) {
      const caseData = caseResult.rows[0];
      personalization.case_id = caseData.case_number || '';
      personalization.device = `${caseData.device_brand || ''} ${caseData.device_model || ''}`.trim() || '';
      personalization.case_status = caseData.stage || '';
      personalization.technician = caseData.technician_name || '';
      personalization.portal_link = `${baseUrl}/client-portal?case_id=${caseData.id}`;
    }
    
    personalization.company_name = companySettings?.name || companySettings?.company_name || 'RecoverLab';
    personalization.support_email = companySettings?.support_email || smtpFrom.email || '';
    personalization.support_phone = companySettings?.phone || '';
    personalization.unsubscribe_link = `${apiBaseUrl}/api/marketing/unsubscribe?email=${encodeURIComponent(client.email)}&campaign_id=${campaign.id}`;

    try {
      if (campaign.type === 'email') {
        const subject = personalizeContent(campaign.subject_line || campaign.tpl_subject || '', personalization);
        const htmlBody = personalizeContent(campaign.html_body || '', personalization);
        const unsubscribeLink = `${apiBaseUrl}/api/marketing/unsubscribe?email=${encodeURIComponent(client.email)}&campaign_id=${campaign.id}`;
        const email = buildInboxFriendlyEmail({
          subject, htmlBody,
          fromName: smtpFrom.name, fromEmail: smtpFrom.email,
          unsubscribeLink, campaignId: `c${campaign.id}`, recipientEmail: client.email,
        });
        await transporter.sendMail({
          from: `"${smtpFrom.name}" <${smtpFrom.email}>`,
          to: client.email, subject,
          html: email.html, text: email.text, headers: email.headers,
        });
        sent++;
      } else if (campaign.type === 'sms') {
        const message = personalizeContent(campaign.sms_template || '', personalization);
        const rawPhone = String(client.phone || '').replace(/\D/g, '');
        const phone = rawPhone.startsWith('91') && rawPhone.length === 12 ? rawPhone.slice(2) : rawPhone.replace(/^0+/, '');
        const https = require('https');
        await new Promise((resolve, reject) => {
          const params = new URLSearchParams({
            authorization: smsApiKey,
            sender_id: smsSenderId,
            message,
            language: 'english',
            route: 'v3',
            numbers: phone,
          });
          const options = {
            hostname: 'www.fast2sms.com',
            path: `/dev/bulkV2?${params.toString()}`,
            method: 'GET',
            headers: { 'cache-control': 'no-cache' },
          };
          const req = https.request(options, res => {
            let data = '';
            res.on('data', d => { data += d; });
            res.on('end', () => {
              try {
                const json = JSON.parse(data);
                if (json.return === true) { sent++; resolve(json); }
                else { failed++; reject(new Error(json.message || JSON.stringify(json))); }
              } catch { failed++; reject(new Error(data)); }
            });
          });
          req.on('error', err => { failed++; reject(err); });
          req.end();
        });
      }
    } catch (err) {
      failed++;
      logger.warn(`Failed to send to ${client.email || client.phone}:`, err.message);
    }
  }

  // Update campaign status to sent
  await query(
    `UPDATE marketing_campaigns 
     SET status='sent', completed_at=NOW(), total_sent=$1, total_bounced=$2
     WHERE id=$3`,
    [sent, failed, campaign.id]
  );

  return { sent, failed };
}

module.exports = {
  startCampaignScheduler,
  stopCampaignScheduler,
};

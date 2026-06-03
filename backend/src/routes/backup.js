const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { query, transaction } = require('../config/database');
const { authenticate, requireMinRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const {
  isSuperAdmin,
  tenantAdminId,
  tenantUserExpression,
  tenantUserCondition,
  tenantClientCondition,
  tenantCaseCondition,
  tenantInventoryCondition,
} = require('../utils/tenantAccess');

const router = express.Router();
router.use(authenticate);

const upload = multer();
const BACKUP_DIR = process.env.BACKUP_DIR || (process.platform === 'win32' ? 'C:\\CRM_Backup' : path.join(process.cwd(), 'backup'));
const BACKUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const BACKUP_EXTENSION = '.crm-backup';
const BACKUP_VERSION = '2.0';

function ensureBackupDir() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  } catch (err) {
    console.error('Unable to initialize backup directory', BACKUP_DIR, err.message);
    throw err;
  }
}

function cleanupJsonData(rows, includeImages) {
  if (!includeImages) {
    return rows.map(row => ({ ...row, data: null }));
  }
  return rows;
}

function getCreatedByTenantClause(alias = 't', createdByColumn = 'created_by') {
  return `COALESCE(${alias}.tenant_id, (SELECT ${tenantUserExpression('tu')} FROM users tu WHERE tu.id = ${alias}.${createdByColumn})) = $1`;
}

async function safeQuery(sql, params = []) {
  try {
    return await query(sql, params);
  } catch (err) {
    if (err.code === '42P01' || err.message.includes('does not exist')) {
      return { rows: [] };
    }
    throw err;
  }
}

async function tableExists(tableName) {
  const result = await query(`SELECT to_regclass($1) AS exists`, [tableName]);
  return !!result.rows[0].exists;
}

async function columnExists(tableName, columnName) {
  const result = await query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 LIMIT 1`,
    [tableName, columnName]
  );
  return result.rows.length > 0;
}

function getTimestampLabel() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function getBackupFileName({ tenantId, createdBy, label }) {
  const tenantLabel = tenantId ? tenantId.slice(0, 8) : 'global';
  const safeLabel = label ? label.replace(/[^a-zA-Z0-9-_ ]/g, '_').trim() : `backup_${tenantLabel}`;
  return `${BACKUP_EXTENSION ? '' : ''}${safeLabel}_${tenantLabel}_${getTimestampLabel()}${BACKUP_EXTENSION}`;
}

async function loadPlatformSettings(req) {
  const tenantId = tenantAdminId(req.user);
  if (isSuperAdmin(req.user)) {
    const result = await safeQuery('SELECT key, value FROM platform_settings ORDER BY key');
    return result.rows;
  }

  const keys = ['company', 'case_settings'];
  const queryText = `SELECT key, value FROM platform_settings WHERE key = ANY($1) OR key LIKE $2 ORDER BY key`;
  const result = await safeQuery(queryText, [keys, `tenant_roles_${tenantId}%`]);
  return result.rows;
}

function formatHistoryRecord(fileName, filePath, content) {
  const stats = fs.statSync(filePath);
  const record = {
    id: `backup_${stats.mtimeMs}_${fileName}`,
    name: fileName,
    type: 'backup',
    created_at: stats.mtime.toISOString(),
    size_kb: Math.round(stats.size / 1024),
    items: content?.data ? {
      cases: Array.isArray(content.data.cases) ? content.data.cases.length : undefined,
      clients: Array.isArray(content.data.clients) ? content.data.clients.length : undefined,
      inventory: Array.isArray(content.data.inventory) ? content.data.inventory.length : undefined,
    } : null,
    created_by: content?.created_by || null,
    tenant_id: content?.tenant_id || null,
    includes_images: content?.includes_images || false,
  };
  return record;
}

async function loadBackupHistory() {
  ensureBackupDir();
  const backups = [];
  try {
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith(BACKUP_EXTENSION));
    for (const fileName of files) {
      const filePath = path.join(BACKUP_DIR, fileName);
      let content = null;
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        content = JSON.parse(raw);
      } catch {
        // ignore corrupted metadata reads
      }
      backups.push(formatHistoryRecord(fileName, filePath, content));
    }
  } catch (err) {
    console.error('Failed to read backup history', err.message);
  }

  let restoreHistory = [];
  const restoreFile = path.join(BACKUP_DIR, 'restore_history.json');
  if (fs.existsSync(restoreFile)) {
    try {
      restoreHistory = JSON.parse(fs.readFileSync(restoreFile, 'utf8')) || [];
    } catch {
      restoreHistory = [];
    }
  }

  return [...restoreHistory, ...backups].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function appendRestoreHistory(entry) {
  ensureBackupDir();
  const restoreFile = path.join(BACKUP_DIR, 'restore_history.json');
  let history = [];
  if (fs.existsSync(restoreFile)) {
    try {
      history = JSON.parse(fs.readFileSync(restoreFile, 'utf8')) || [];
    } catch {
      history = [];
    }
  }
  history.unshift(entry);
  fs.writeFileSync(restoreFile, JSON.stringify(history.slice(0, 100), null, 2), 'utf8');
}

async function buildBackupData(req, includeImages = true, tenantOnly = true) {
  const tenantId = tenantOnly ? tenantAdminId(req.user) : null;
  const isSuper = !tenantOnly || isSuperAdmin(req.user);
  const userScope = isSuper ? null : tenantUserCondition(req.user, 'u', 1);
  const clientScope = isSuper ? null : tenantClientCondition(req.user, 'cl', 1);
  const caseScope = isSuper ? null : tenantCaseCondition(req.user, 'c', 1);
  const inventoryScope = isSuper ? null : tenantInventoryCondition(req.user, 'ii', 1);

  const [users, clients, cases] = await Promise.all([
    safeQuery(`SELECT * FROM users ${isSuper ? '' : `WHERE ${userScope.clause}`}`, userScope?.params || []),
    safeQuery(`SELECT * FROM clients cl ${isSuper ? '' : `WHERE ${clientScope.clause}`}`, clientScope?.params || []),
    safeQuery(`SELECT * FROM cases c ${isSuper ? '' : `WHERE ${caseScope.clause}`}`, caseScope?.params || []),
  ]);

  const caseIds = cases.rows.map(r => r.id);
  const clientIds = clients.rows.map(r => r.id);

  const [caseImages, caseSolutions, caseSolutionMedia, caseSolutionNotes, caseWorkflowLogs, caseEngineerSessions, clientCommunications] = await Promise.all([
    safeQuery(`SELECT ci.* FROM case_images ci JOIN cases c ON ci.case_id = c.id ${isSuper ? '' : `WHERE ${caseScope.clause}`}`, caseScope?.params || []),
    safeQuery(`SELECT cs.* FROM case_solutions cs JOIN cases c ON cs.case_id = c.id ${isSuper ? '' : `WHERE ${caseScope.clause}`}`, caseScope?.params || []),
    safeQuery(`SELECT csm.* FROM case_solution_media csm JOIN cases c ON csm.case_id = c.id ${isSuper ? '' : `WHERE ${caseScope.clause}`}`, caseScope?.params || []),
    safeQuery(`SELECT csn.* FROM case_solution_notes csn JOIN cases c ON csn.case_id = c.id ${isSuper ? '' : `WHERE ${caseScope.clause}`}`, caseScope?.params || []),
    safeQuery(`SELECT cwl.* FROM case_workflow_logs cwl JOIN cases c ON cwl.case_id = c.id ${isSuper ? '' : `WHERE ${caseScope.clause}`}`, caseScope?.params || []),
    safeQuery(`SELECT ces.* FROM case_engineer_sessions ces JOIN cases c ON ces.case_id = c.id ${isSuper ? '' : `WHERE ${caseScope.clause}`}`, caseScope?.params || []),
    safeQuery(`SELECT cc.* FROM client_communications cc JOIN clients cl ON cc.client_id = cl.id ${isSuper ? '' : `WHERE ${clientScope.clause}`}`, clientScope?.params || []),
  ]);

  const [caseFiles, quotations, payments, caseCustomFieldValues] = await Promise.all([
    safeQuery(`SELECT cf.* FROM case_files cf JOIN cases c ON cf.case_id = c.id ${isSuper ? '' : `WHERE ${caseScope.clause}`}`, caseScope?.params || []),
    safeQuery(`SELECT q.* FROM quotations q JOIN cases c ON q.case_id = c.id ${isSuper ? '' : `WHERE ${caseScope.clause}`}`, caseScope?.params || []),
    safeQuery(`SELECT p.* FROM payments p JOIN cases c ON p.case_id = c.id ${isSuper ? '' : `WHERE ${caseScope.clause}`}`, caseScope?.params || []),
    safeQuery(`SELECT cfv.* FROM case_custom_field_values cfv JOIN cases c ON cfv.case_id = c.id ${isSuper ? '' : `WHERE ${caseScope.clause}`}`, caseScope?.params || []),
  ]);

  const [inventoryItems, inventoryTransactions, inventoryImages, transferredItems] = await Promise.all([
    safeQuery(`SELECT * FROM inventory_items ${isSuper ? '' : `WHERE ${inventoryScope.clause}`}`, inventoryScope?.params || []),
    safeQuery(`SELECT it.* FROM inventory_transactions it JOIN inventory_items ii ON it.item_id = ii.id ${isSuper ? '' : `WHERE ${inventoryScope.clause}`}`, inventoryScope?.params || []),
    safeQuery(`SELECT ii.* FROM inventory_images ii JOIN inventory_items i ON ii.item_id = i.id ${isSuper ? '' : `WHERE ${inventoryScope.clause}`}`, inventoryScope?.params || []),
    safeQuery(`SELECT * FROM transferred_items ${isSuper ? '' : `WHERE ${inventoryScope.clause}`}`, inventoryScope?.params || []),
  ]);

  const [accountingQuotes, accountingInvoices, accountingInvoicePayments, accountingExpenses] = await Promise.all([
    safeQuery(`SELECT * FROM accounting_quotes ${isSuper ? '' : `WHERE ${getCreatedByTenantClause('aq')}`}`, isSuper ? [] : [tenantId]),
    safeQuery(`SELECT * FROM accounting_invoices ${isSuper ? '' : `WHERE ${getCreatedByTenantClause('ai')}`}`, isSuper ? [] : [tenantId]),
    safeQuery(`SELECT * FROM accounting_invoice_payments ${isSuper ? '' : `WHERE ${getCreatedByTenantClause('aip')}`}`, isSuper ? [] : [tenantId]),
    safeQuery(`SELECT * FROM accounting_expenses ${isSuper ? '' : `WHERE ${getCreatedByTenantClause('ae')}`}`, isSuper ? [] : [tenantId]),
  ]);

  const [knowledgeBaseEntries, mediaRecycleBinRows, casesRecycleBinRows, auditLogsRows, platformSettings] = await Promise.all([
    safeQuery(`SELECT kbe.* FROM knowledge_base_entries kbe ${isSuper ? '' : `WHERE ${getCreatedByTenantClause('kbe')}`}`, isSuper ? [] : [tenantId]),
    safeQuery(`SELECT * FROM media_recycle_bin ${isSuper ? '' : `WHERE tenant_id = $1`}`, isSuper ? [] : [tenantId]),
    safeQuery(`SELECT * FROM cases_recycle_bin ${isSuper ? '' : `WHERE case_id IN (SELECT id FROM cases c WHERE ${caseScope.clause})`}`, caseScope?.params || []),
    safeQuery(`SELECT al.* FROM audit_logs al JOIN users u ON u.id = al.user_id ${isSuper ? '' : `WHERE ${tenantUserExpression('u')} = $1`}`, isSuper ? [] : [tenantId]),
    loadPlatformSettings(req),
  ]);

  const [storageBrands, storageModels, failureLibrary, donorMatching, fieldConfigs, customFields, inventoryCustomFieldValues, sectionConfigs, marketingEmailTemplates, marketingWhatsappTemplates, marketingCampaigns, marketingCampaignRecipients, marketingUnsubscribes] = await Promise.all([
    safeQuery(`SELECT * FROM storage_brands ${isSuper ? '' : `WHERE ${getCreatedByTenantClause('sb')}`}`, isSuper ? [] : [tenantId]),
    safeQuery(`SELECT * FROM storage_models ${isSuper ? '' : `WHERE ${getCreatedByTenantClause('sm')}`}`, isSuper ? [] : [tenantId]),
    safeQuery(`SELECT * FROM failure_library ${isSuper ? '' : `WHERE ${getCreatedByTenantClause('fl')}`}`, isSuper ? [] : [tenantId]),
    safeQuery(`SELECT * FROM donor_matching ${isSuper ? '' : `WHERE ${getCreatedByTenantClause('dm')}`}`, isSuper ? [] : [tenantId]),
    safeQuery(`SELECT * FROM field_configs ${isSuper ? '' : `WHERE ${getCreatedByTenantClause('fc')}`}`, isSuper ? [] : [tenantId]),
    safeQuery(`SELECT * FROM custom_fields ${isSuper ? '' : `WHERE ${getCreatedByTenantClause('cf')}`}`, isSuper ? [] : [tenantId]),
    safeQuery(`SELECT * FROM inventory_custom_field_values ${isSuper ? '' : `WHERE ${getCreatedByTenantClause('icfv')}`}`, isSuper ? [] : [tenantId]),
    safeQuery(`SELECT * FROM section_configs ${isSuper ? '' : `WHERE ${getCreatedByTenantClause('sc')}`}`, isSuper ? [] : [tenantId]),
    safeQuery(`SELECT * FROM marketing_email_templates ${isSuper ? '' : `WHERE tenant_id = $1 OR ${getCreatedByTenantClause('met')}`}`, isSuper ? [] : [tenantId]),
    safeQuery(`SELECT * FROM marketing_whatsapp_templates ${isSuper ? '' : `WHERE tenant_id = $1 OR ${getCreatedByTenantClause('mwt')}`}`, isSuper ? [] : [tenantId]),
    safeQuery(`SELECT * FROM marketing_campaigns ${isSuper ? '' : `WHERE tenant_id = $1 OR ${getCreatedByTenantClause('mc')}`}`, isSuper ? [] : [tenantId]),
    safeQuery(`SELECT * FROM marketing_campaign_recipients ${isSuper ? '' : `WHERE campaign_id IN (SELECT id FROM marketing_campaigns WHERE tenant_id = $1)`}`, isSuper ? [] : [tenantId]),
    safeQuery(`SELECT * FROM marketing_unsubscribes ${isSuper ? '' : `WHERE tenant_id = $1`}`, isSuper ? [] : [tenantId]),
  ]);

  return {
    version: BACKUP_VERSION,
    created_at: new Date().toISOString(),
    created_by: req.user.id,
    created_by_name: req.user.full_name || req.user.username || null,
    tenant_id: tenantId,
    tenant_scope: tenantOnly ? 'tenant' : 'platform',
    includes_images: includeImages,
    data: {
      users: users.rows,
      clients: clients.rows,
      cases: cases.rows,
      case_images: cleanupJsonData(caseImages.rows, includeImages),
      case_solutions: caseSolutions.rows,
      case_solution_media: cleanupJsonData(caseSolutionMedia.rows, includeImages),
      case_solution_notes: caseSolutionNotes.rows,
      case_workflow_logs: caseWorkflowLogs.rows,
      case_engineer_sessions: caseEngineerSessions.rows,
      client_communications: clientCommunications.rows,
      case_files: caseFiles.rows,
      quotations: quotations.rows,
      payments: payments.rows,
      case_custom_field_values: caseCustomFieldValues.rows,
      inventory_items: inventoryItems.rows,
      inventory_transactions: inventoryTransactions.rows,
      inventory_images: cleanupJsonData(inventoryImages.rows, includeImages),
      transferred_items: transferredItems.rows,
      accounting_quotes: accountingQuotes.rows,
      accounting_invoices: accountingInvoices.rows,
      accounting_invoice_payments: accountingInvoicePayments.rows,
      accounting_expenses: accountingExpenses.rows,
      knowledge_base_entries: knowledgeBaseEntries.rows,
      media_recycle_bin: mediaRecycleBinRows.rows,
      cases_recycle_bin: casesRecycleBinRows.rows,
      audit_logs: auditLogsRows.rows,
      platform_settings: platformSettings,
      storage_brands: storageBrands.rows,
      storage_models: storageModels.rows,
      failure_library: failureLibrary.rows,
      donor_matching: donorMatching.rows,
      field_configs: fieldConfigs.rows,
      custom_fields: customFields.rows,
      inventory_custom_field_values: inventoryCustomFieldValues.rows,
      section_configs: sectionConfigs.rows,
      marketing_email_templates: marketingEmailTemplates.rows,
      marketing_whatsapp_templates: marketingWhatsappTemplates.rows,
      marketing_campaigns: marketingCampaigns.rows,
      marketing_campaign_recipients: marketingCampaignRecipients.rows,
      marketing_unsubscribes: marketingUnsubscribes.rows,
    },
  };
}

async function storeBackupFile(fileName, json) {
  ensureBackupDir();
  const filePath = path.join(BACKUP_DIR, fileName);
  fs.writeFileSync(filePath, JSON.stringify(json, null, 2), 'utf8');
  return filePath;
}

async function savePlatformSetting(key, value) {
  const v = typeof value === 'string' ? value : JSON.stringify(value);
  try {
    await query(
      `INSERT INTO platform_settings(key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, v]
    );
    return true;
  } catch (e) {
    console.error('Failed to save platform setting', key, e.message);
    return false;
  }
}

async function loadPlatformSetting(key) {
  try {
    const r = await query('SELECT value FROM platform_settings WHERE key = $1 LIMIT 1', [key]);
    if (!r.rows.length) return null;
    try { return JSON.parse(r.rows[0].value); } catch (e) { return r.rows[0].value; }
  } catch (e) {
    console.error('Failed to load platform setting', key, e.message);
    return null;
  }
}

async function refreshGoogleAccessTokenIfNeeded(tokens) {
  if (!tokens) return null;
  const now = Date.now();
  if (tokens.expiry_date && tokens.expiry_date > now + 5000) {
    return tokens; // still valid
  }
  if (!tokens.refresh_token) {
    throw new Error('No refresh token available');
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Missing Google client credentials');

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: tokens.refresh_token,
    grant_type: 'refresh_token',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString()
  });
  if (!res.ok) throw new Error('Failed to refresh Google token: ' + (await res.text()));
  const newTokens = await res.json();
  // merge
  const merged = {
    ...tokens,
    access_token: newTokens.access_token,
    token_type: newTokens.token_type || tokens.token_type,
    scope: newTokens.scope || tokens.scope,
    expiry_date: Date.now() + (newTokens.expires_in ? newTokens.expires_in * 1000 : 0),
  };
  await savePlatformSetting('google_oauth_tokens', merged);
  return merged;
}

async function uploadFileToGoogleDrive(filePath, fileName) {
  const tokens = await loadPlatformSetting('google_oauth_tokens');
  if (!tokens) throw new Error('No Google tokens configured');
  const active = await refreshGoogleAccessTokenIfNeeded(tokens);
  const accessToken = active.access_token;
  if (!accessToken) throw new Error('No access token available');

  const metadata = { name: fileName };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', fs.createReadStream(filePath));

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Google Drive upload failed: ' + txt);
  }
  return await res.json();
}

async function runLocalBackup() {
  const internalReq = { user: { role: 'super_admin', id: 'system_scheduler', tenant_id: null, full_name: 'System Backup Scheduler' } };
  const backupData = await buildBackupData(internalReq, true, false);
  const fileName = getBackupFileName({ tenantId: null, createdBy: 'system', label: 'Scheduled_Backup' });
  const filePath = await storeBackupFile(fileName, backupData);
  console.log(`[BackupService] Local scheduled backup created: ${filePath}`);
}

ensureBackupDir();
setInterval(() => {
  runLocalBackup().catch(err => console.error('Local scheduled backup failed', err.message));
}, BACKUP_INTERVAL_MS);

router.post('/create', requireMinRole('admin'), auditLog('create_backup', 'backup'), async (req, res) => {
  const { name, include_images = true } = req.body || {};
  try {
    const backupData = await buildBackupData(req, include_images !== false, true);
    const fileName = getBackupFileName({ tenantId: backupData.tenant_id, createdBy: req.user.id, label: name || 'RecoverLab_Backup' });
    await storeBackupFile(fileName, backupData);
    const json = JSON.stringify(backupData, null, 2);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(Buffer.from(json, 'utf8'));
  } catch (err) {
    console.error('Backup create failed', err.message);
    res.status(500).json({ error: 'Backup creation failed: ' + err.message });
  }
});

router.post('/create-local', requireMinRole('admin'), auditLog('create_local_backup', 'backup'), async (req, res) => {
  try {
    const backupData = await buildBackupData(req, true, true);
    const fileName = getBackupFileName({ tenantId: backupData.tenant_id, createdBy: req.user.id, label: 'Local_Backup' });
    await storeBackupFile(fileName, backupData);
    res.json({ ok: true, message: `Local backup created in ${BACKUP_DIR}`, file: fileName });
  } catch (err) {
    console.error('Local backup failed', err.message);
    res.status(500).json({ error: 'Local backup failed: ' + err.message });
  }
});

router.get('/history', requireMinRole('admin'), auditLog('view_backup_history', 'backup'), async (req, res) => {
  try {
    const history = await loadBackupHistory();
    res.json({ backups: history, total: history.length });
  } catch (err) {
    console.error('Failed to load backup history', err.message);
    res.status(500).json({ error: 'Failed to load backup history' });
  }
});

router.post('/restore', requireMinRole('admin'), upload.single('backup_file'), auditLog('restore_backup', 'backup'), async (req, res) => {
  try {
    if (!req.file && !req.body.backup_data) {
      return res.status(400).json({ error: 'Backup file required' });
    }

    const confirmPassword = req.body.confirm_password;
    if (confirmPassword) {
      const userResult = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
      const currentHash = userResult.rows[0]?.password_hash || '';
      const valid = await bcrypt.compare(confirmPassword, currentHash);
      if (!valid) {
        return res.status(401).json({ error: 'Incorrect password. Restore aborted.' });
      }
    }

    const raw = req.file ? req.file.buffer.toString('utf8') : req.body.backup_data;
    let backupData;
    try {
      backupData = JSON.parse(raw);
    } catch {
      return res.status(400).json({ error: 'Invalid backup file. Could not parse JSON.' });
    }

    if (!backupData || !backupData.data || !backupData.version) {
      return res.status(400).json({ error: 'Not a valid RecoverLab backup file.' });
    }

    const tenantId = tenantAdminId(req.user);
    const isSuper = isSuperAdmin(req.user);
    if (!isSuper && backupData.tenant_id && backupData.tenant_id !== tenantId) {
      return res.status(403).json({ error: 'Cannot restore a backup from a different tenant.' });
    }

    const appendMode = String(req.body.append_mode) === 'true';
    const restoredCounts = {
      users: 0,
      clients: 0,
      cases: 0,
      inventory_items: 0,
    };

    await transaction(async client => {
      if (!appendMode) {
        const deleteTargets = [
          'case_solution_notes',
          'case_solution_media',
          'case_solutions',
          'case_images',
          'case_workflow_logs',
          'case_engineer_sessions',
          'case_files',
          'payments',
          'quotations',
          'case_custom_field_values',
          'cases_recycle_bin',
          'cases',
          'client_communications',
          'clients',
          'inventory_transactions',
          'inventory_images',
          'transferred_items',
          'inventory_items',
          'accounting_invoice_payments',
          'accounting_invoices',
          'accounting_quotes',
          'accounting_expenses',
          'field_configs',
          'custom_fields',
          'inventory_custom_field_values',
          'section_configs',
          'marketing_campaign_recipients',
          'marketing_campaigns',
          'marketing_email_templates',
          'marketing_whatsapp_templates',
          'marketing_unsubscribes',
          'knowledge_base_entries',
          'media_recycle_bin',
          'audit_logs',
        ];

        for (const table of deleteTargets) {
          const exists = await tableExists(table);
          if (!exists) continue;

          if (table === 'audit_logs') {
            await client.query(
              `DELETE FROM audit_logs USING users WHERE audit_logs.user_id = users.id AND ${tenantUserExpression('users')} = $1`,
              [tenantId]
            );
            continue;
          }

          if (table === 'clients') {
            await client.query(
              `DELETE FROM clients WHERE ${tenantClientCondition(req.user, 'clients', 1).clause}`,
              [tenantId]
            );
            continue;
          }

          if (table === 'cases') {
            await client.query(
              `DELETE FROM cases WHERE ${tenantCaseCondition(req.user, 'cases', 1).clause}`,
              [tenantId]
            );
            continue;
          }

          if (table === 'users') {
            await client.query(
              `DELETE FROM users WHERE ${tenantUserCondition(req.user, 'users', 1).clause}`,
              [tenantId]
            );
            continue;
          }

          if (await columnExists(table, 'tenant_id')) {
            await client.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenantId]);
            continue;
          }

          if (await columnExists(table, 'created_by')) {
            await client.query(`DELETE FROM ${table} WHERE ${getCreatedByTenantClause(table)}`, [tenantId]);
            continue;
          }

          if (await columnExists(table, 'user_id')) {
            await client.query(`DELETE FROM ${table} USING users WHERE ${table}.user_id = users.id AND ${tenantUserExpression('users')} = $1`, [tenantId]);
            continue;
          }

          // Fallback: delete any rows associated with the tenant via a generic tenant_id column if present
          try {
            await client.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenantId]);
          } catch (e) {
            // table may not support tenant isolation directly; skip safely
          }
        }
      }

      const insertRows = async (table, rows) => {
        if (!Array.isArray(rows) || !rows.length) return 0;
        const columns = Object.keys(rows[0]);
        const placeholderRow = columns.map((_, idx) => `$${idx + 1}`).join(',');
        const insertSql = `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholderRow}) ON CONFLICT (id) DO NOTHING`;
        let count = 0;
        for (const row of rows) {
          const values = columns.map(col => row[col] === undefined ? null : row[col]);
          await client.query(insertSql, values);
          count += 1;
        }
        return count;
      };

      const data = backupData.data;
      restoredCounts.users = await insertRows('users', data.users || []);
      restoredCounts.clients = await insertRows('clients', data.clients || []);
      restoredCounts.cases = await insertRows('cases', data.cases || []);
      restoredCounts.case_images = await insertRows('case_images', data.case_images || []);
      await insertRows('case_solutions', data.case_solutions || []);
      await insertRows('case_solution_media', data.case_solution_media || []);
      await insertRows('case_solution_notes', data.case_solution_notes || []);
      await insertRows('case_workflow_logs', data.case_workflow_logs || []);
      await insertRows('case_engineer_sessions', data.case_engineer_sessions || []);
      await insertRows('client_communications', data.client_communications || []);
      await insertRows('case_files', data.case_files || []);
      await insertRows('quotations', data.quotations || []);
      await insertRows('payments', data.payments || []);
      await insertRows('case_custom_field_values', data.case_custom_field_values || []);
      restoredCounts.inventory_items = await insertRows('inventory_items', data.inventory_items || []);
      await insertRows('inventory_transactions', data.inventory_transactions || []);
      await insertRows('inventory_images', data.inventory_images || []);
      await insertRows('transferred_items', data.transferred_items || []);
      await insertRows('accounting_quotes', data.accounting_quotes || []);
      await insertRows('accounting_invoices', data.accounting_invoices || []);
      await insertRows('accounting_invoice_payments', data.accounting_invoice_payments || []);
      await insertRows('accounting_expenses', data.accounting_expenses || []);
      await insertRows('knowledge_base_entries', data.knowledge_base_entries || []);
      await insertRows('media_recycle_bin', data.media_recycle_bin || []);
      await insertRows('cases_recycle_bin', data.cases_recycle_bin || []);
      await insertRows('audit_logs', data.audit_logs || []);
      await insertRows('storage_brands', data.storage_brands || []);
      await insertRows('storage_models', data.storage_models || []);
      await insertRows('failure_library', data.failure_library || []);
      await insertRows('donor_matching', data.donor_matching || []);
      await insertRows('field_configs', data.field_configs || []);
      await insertRows('custom_fields', data.custom_fields || []);
      await insertRows('inventory_custom_field_values', data.inventory_custom_field_values || []);
      await insertRows('section_configs', data.section_configs || []);
      await insertRows('marketing_email_templates', data.marketing_email_templates || []);
      await insertRows('marketing_whatsapp_templates', data.marketing_whatsapp_templates || []);
      await insertRows('marketing_campaigns', data.marketing_campaigns || []);
      await insertRows('marketing_campaign_recipients', data.marketing_campaign_recipients || []);
      await insertRows('marketing_unsubscribes', data.marketing_unsubscribes || []);
      await insertRows('platform_settings', data.platform_settings || []);
    });

    const restoreEntry = {
      id: `restore_${Date.now()}`,
      name: backupData.created_by_name ? `Restore from ${backupData.created_by_name}` : 'Restore operation',
      type: 'restore',
      created_by: req.user.full_name || req.user.username || req.user.id,
      created_at: new Date().toISOString(),
      mode: appendMode ? 'append' : 'replace',
      items: restoredCounts,
      status: 'complete',
    };
    await appendRestoreHistory(restoreEntry);

    res.json({ ok: true, restored: restoredCounts, message: `Restore completed. ${restoredCounts.cases} cases, ${restoredCounts.clients} clients, ${restoredCounts.inventory_items} inventory items restored.` });
  } catch (err) {
    console.error('Backup restore failed', err.message);
    res.status(500).json({ error: 'Backup restore failed: ' + err.message });
  }
});

router.get('/google-drive/auth-url', requireMinRole('admin'), async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.json({ ok: false, setup_required: true, message: 'Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to backend .env to enable Google Drive backup.' });
  }
  const appUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:5174';
  const redirectUri = `${appUrl.replace(/\/+$/, '')}/settings`;
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent('https://www.googleapis.com/auth/drive.file')}&access_type=offline&prompt=consent`;
  res.json({ ok: true, auth_url: authUrl, redirect_uri: redirectUri });
});

router.get('/google-drive/list', requireMinRole('admin'), async (req, res) => {
  res.json({ ok: true, files: [], demo: true, message: 'Configure Google OAuth credentials to enable Drive backup listing.' });
});

// Exchange authorization code (from frontend) for tokens and store them
router.post('/google-drive/exchange', requireMinRole('admin'), async (req, res) => {
  try {
    const code = req.body.code;
    const redirectUri = req.body.redirect_uri || `${(process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:5174').replace(/\/+$/, '')}/settings`;
    if (!code) return res.status(400).json({ error: 'Missing code' });
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return res.status(400).json({ error: 'Google OAuth not configured' });

    const body = new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code'
    });
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString() });
    if (!tokenRes.ok) return res.status(500).json({ error: 'Token exchange failed: ' + await tokenRes.text() });
    const tokens = await tokenRes.json();
    // compute expiry_date
    if (tokens.expires_in) tokens.expiry_date = Date.now() + tokens.expires_in * 1000;
    await savePlatformSetting('google_oauth_tokens', tokens);
    res.json({ ok: true, tokens: { has_refresh_token: !!tokens.refresh_token } });
  } catch (err) {
    console.error('Google exchange failed', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/google-drive/status', requireMinRole('admin'), async (req, res) => {
  try {
    const tokens = await loadPlatformSetting('google_oauth_tokens');
    res.json({ ok: true, configured: !!tokens, tokens: tokens ? { expiry_date: tokens.expiry_date, has_refresh_token: !!tokens.refresh_token } : null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create backup and upload to configured Google Drive (requires tokens)
router.post('/create-drive', requireMinRole('admin'), auditLog('create_drive_backup', 'backup'), async (req, res) => {
  try {
    const include_images = req.body.include_images !== false;
    const backupData = await buildBackupData(req, include_images, true);
    const fileName = getBackupFileName({ tenantId: backupData.tenant_id, createdBy: req.user.id, label: req.body.name || 'Drive_Backup' });
    const filePath = await storeBackupFile(fileName, backupData);
    const driveResp = await uploadFileToGoogleDrive(filePath, fileName);
    res.json({ ok: true, message: 'Uploaded to Drive', driveFile: driveResp });
  } catch (err) {
    console.error('Drive upload failed', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

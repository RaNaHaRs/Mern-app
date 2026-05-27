const { query } = require('../config/database');

function isSuperAdmin(user) {
  return user && user.role === 'super_admin';
}

function tenantUserExpression(alias = 'u') {
  return `COALESCE(${alias}.tenant_id, ${alias}.tenant_owner_id, CASE WHEN ${alias}.role = 'super_admin' THEN NULL ELSE ${alias}.id END)`;
}

function createdByTenantExpression(alias = 't', createdByColumn = 'created_by') {
  return `COALESCE(${alias}.tenant_id, (SELECT ${tenantUserExpression('tu')} FROM users tu WHERE tu.id = ${alias}.${createdByColumn}))`;
}

function clientTenantExpression(alias = 'cl') {
  return `COALESCE(${alias}.tenant_id, (SELECT ${tenantUserExpression('tu')} FROM users tu WHERE tu.id = ${alias}.created_by))`;
}

function caseTenantExpression(alias = 'c') {
  return `COALESCE(
    ${alias}.tenant_id,
    (SELECT ${clientTenantExpression('cl')} FROM clients cl WHERE cl.id = ${alias}.client_id),
    (SELECT ${tenantUserExpression('tu')} FROM users tu WHERE tu.id = ${alias}.created_by)
  )`;
}

function inventoryTenantExpression(alias = 'ii') {
  return `COALESCE(${alias}.tenant_id, (SELECT ${tenantUserExpression('tu')} FROM users tu WHERE tu.id = ${alias}.added_by))`;
}

function tenantAdminId(user) {
  if (isSuperAdmin(user)) return null;
  return user?.tenant_id || user?.tenant_owner_id || user?.id || null;
}

function buildTenantUsersSubquery(paramIndex = 1) {
  return `(SELECT id FROM users WHERE ${tenantUserExpression('users')} = $${paramIndex} AND role <> 'super_admin')`;
}

function tenantUserCondition(user, alias = 'u', paramIndex = 1) {
  if (isSuperAdmin(user)) return { clause: '1=1', params: [] };
  return {
    clause: `${tenantUserExpression(alias)} = $${paramIndex}`,
    params: [tenantAdminId(user)],
  };
}

function tenantCreatedByCondition(user, alias = 't', paramIndex = 1) {
  if (isSuperAdmin(user)) return { clause: '1=1', params: [] };
  return {
    clause: `${createdByTenantExpression(alias)} = $${paramIndex}`,
    params: [tenantAdminId(user)],
  };
}

function tenantClientCondition(user, alias = 'cl', paramIndex = 1) {
  if (isSuperAdmin(user)) return { clause: '1=1', params: [] };
  return {
    clause: `${clientTenantExpression(alias)} = $${paramIndex}`,
    params: [tenantAdminId(user)],
  };
}

function tenantCaseCondition(user, alias = 'c', paramIndex = 1) {
  if (isSuperAdmin(user)) return { clause: '1=1', params: [] };
  return {
    clause: `${caseTenantExpression(alias)} = $${paramIndex}`,
    params: [tenantAdminId(user)],
  };
}

function tenantInventoryCondition(user, alias = 'ii', paramIndex = 1) {
  if (isSuperAdmin(user)) return { clause: '1=1', params: [] };
  return {
    clause: `${inventoryTenantExpression(alias)} = $${paramIndex}`,
    params: [tenantAdminId(user)],
  };
}

function tenantCreatedByInUserScope(user, paramIndex = 1, alias = null) {
  if (isSuperAdmin(user)) return { clause: '1=1', params: [] };
  const prefix = alias ? `${alias}.` : '';
  return {
    clause: `COALESCE(${prefix}tenant_id, (SELECT ${tenantUserExpression('tu')} FROM users tu WHERE tu.id = ${prefix}created_by)) = $${paramIndex}`,
    params: [tenantAdminId(user)],
  };
}

async function verifyClientAccess(clientId, user) {
  if (isSuperAdmin(user)) return true;
  const result = await query(
    `SELECT id FROM clients c WHERE c.id = $1 AND ${clientTenantExpression('c')} = $2`,
    [clientId, tenantAdminId(user)]
  );
  return result.rows.length > 0;
}

async function verifyCaseAccess(caseId, user) {
  if (isSuperAdmin(user)) return true;
  const result = await query(
    `SELECT c.id FROM cases c WHERE c.id = $1 AND ${caseTenantExpression('c')} = $2`,
    [caseId, tenantAdminId(user)]
  );
  return result.rows.length > 0;
}

async function verifyInventoryAccess(itemId, user) {
  if (isSuperAdmin(user)) return true;
  const result = await query(
    `SELECT id FROM inventory_items ii WHERE id = $1 AND ${inventoryTenantExpression('ii')} = $2`,
    [itemId, tenantAdminId(user)]
  );
  return result.rows.length > 0;
}

async function verifyCampaignAccess(campaignId, user) {
  if (isSuperAdmin(user)) return true;
  const result = await query(
    `SELECT id FROM marketing_campaigns mc
     WHERE id = $1
       AND COALESCE(mc.tenant_id, (SELECT ${tenantUserExpression('tu')} FROM users tu WHERE tu.id = mc.created_by)) = $2`,
    [campaignId, tenantAdminId(user)]
  );
  return result.rows.length > 0;
}

async function verifyTemplateAccess(templateId, user, table = 'marketing_email_templates') {
  if (isSuperAdmin(user)) return true;
  const result = await query(
    `SELECT id FROM ${table}
     WHERE id = $1
       AND COALESCE(tenant_id, (SELECT ${tenantUserExpression('tu')} FROM users tu WHERE tu.id = created_by)) = $2`,
    [templateId, tenantAdminId(user)]
  );
  return result.rows.length > 0;
}

module.exports = {
  isSuperAdmin,
  tenantAdminId,
  tenantUserExpression,
  createdByTenantExpression,
  clientTenantExpression,
  caseTenantExpression,
  inventoryTenantExpression,
  tenantUserCondition,
  tenantCreatedByCondition,
  tenantClientCondition,
  tenantCaseCondition,
  tenantInventoryCondition,
  tenantCreatedByInUserScope,
  verifyClientAccess,
  verifyCaseAccess,
  verifyInventoryAccess,
  verifyCampaignAccess,
  verifyTemplateAccess,
};

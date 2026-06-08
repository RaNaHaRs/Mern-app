const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { authenticate, requireRole, requireMinRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const automationService = require('../services/automationService');
const { isSuperAdmin, tenantUserCondition, tenantAdminId, tenantUserExpression } = require('../utils/tenantAccess');

const router = express.Router();
router.use(authenticate);

const TEAM_USER_COUNT_CONDITION = `role NOT IN ('admin','super_admin')`;

async function getTeamUserCountForTenant(ownerId) {
  const result = await query(
    `SELECT COUNT(*)::int AS count FROM users WHERE ${TEAM_USER_COUNT_CONDITION} AND COALESCE(tenant_id, tenant_owner_id) = $1`,
    [ownerId]
  );
  return result.rows[0]?.count || 0;
}

async function getTenantAdminForSuperAdmin(tenantId, assignedAdminId) {
  if (!tenantId) return null;
  const lookupId = assignedAdminId || tenantId;
  const result = await query(
    `SELECT id, max_team_users, COALESCE(tenant_id, tenant_owner_id, id) AS effective_tenant
     FROM users
     WHERE id = $1 AND role = 'admin'`,
    [lookupId]
  );
  if (!result.rows.length) return null;
  const admin = result.rows[0];
  if (tenantId && String(admin.effective_tenant) !== String(tenantId)) return null;
  return admin;
}

router.get('/', requireMinRole('senior_engineer'), async (req, res) => {
  try {
    const conditions = [];
    const params = [];
    let pi = 1;
    if (!isSuperAdmin(req.user)) {
      const tenantCondition = tenantUserCondition(req.user, 'u', pi);
      conditions.push(tenantCondition.clause);
      params.push(...tenantCondition.params);
      pi += tenantCondition.params.length;
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const result = await query(`SELECT id, username, email, full_name, role, is_active, specializations, phone, permissions, assigned_admin_id, tenant_id, tenant_owner_id, last_login, created_at FROM users u ${where} ORDER BY role, full_name`, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', requireRole('admin', 'super_admin'), auditLog('create_user', 'user'), async (req, res) => {
  try {
    const { username, email, password, full_name, role, phone, specializations, notes, permissions, tenant_id, assigned_admin_id } = req.body;
    if (!password || password.length < 8) return res.status(422).json({ error: 'Password must be at least 8 characters' });
    const hash = await bcrypt.hash(password, 12);

    const scopedTenantId = req.user.role === 'super_admin'
      ? (tenant_id || null)
      : tenantAdminId(req.user);

    let tenantOwnerId = req.user.role === 'admin'
      ? req.user.id
      : (req.user.role === 'super_admin' ? (scopedTenantId || null) : null);

    const effectiveAssignedAdminId = req.user.role === 'admin'
      ? req.user.id
      : (assigned_admin_id || null);

    if (role && role !== 'admin' && role !== 'super_admin') {
      if (req.user.role === 'admin') {
        const adminResult = await query('SELECT max_team_users FROM users WHERE id = $1', [req.user.id]);
        const maxUsers = adminResult.rows[0]?.max_team_users || 0;
        const currentCount = await getTeamUserCountForTenant(req.user.id);
        if (currentCount >= maxUsers) {
          return res.status(403).json({ error: `Team user limit reached (${maxUsers}). Upgrade plan to add more.` });
        }
      }

      if (req.user.role === 'super_admin' && scopedTenantId) {
        const tenantAdmin = await getTenantAdminForSuperAdmin(scopedTenantId, assigned_admin_id);
        if (!tenantAdmin) {
          return res.status(400).json({ error: 'Selected tenant admin not found or invalid' });
        }
        tenantOwnerId = tenantAdmin.id;
        const maxUsers = tenantAdmin.max_team_users || 0;
        const currentCount = await getTeamUserCountForTenant(tenantAdmin.id);
        if (currentCount >= maxUsers) {
          return res.status(403).json({ error: `Team user limit reached (${maxUsers}). Upgrade plan to add more.` });
        }
      }
    }

    const result = await query(
      `INSERT INTO users (username, email, password_hash, full_name, role, phone, specializations, notes, permissions, assigned_admin_id, tenant_owner_id, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id, username, email, full_name, role, is_active, created_at`,
      [
        username.toLowerCase(),
        email.toLowerCase(),
        hash,
        full_name,
        role || 'junior_engineer',
        phone || null,
        specializations || [],
        notes || null,
        permissions ? JSON.stringify(permissions) : null,
        effectiveAssignedAdminId,
        tenantOwnerId,
        scopedTenantId,
      ]
    );

    // Emit TEAM_MEMBER_CREATED or ADMIN_CREATED event based on role
    try {
      if (role && !role.includes('admin') && !role.includes('super_admin')) {
        await automationService.handleEvent('TEAM_MEMBER_CREATED', {
          user_id: result.rows[0].id,
          name: result.rows[0].full_name || result.rows[0].username,
          email: result.rows[0].email || '',
          role: result.rows[0].role
        });
      } else if (role && role.includes('admin')) {
        await automationService.handleEvent('ADMIN_CREATED', {
          user_id: result.rows[0].id,
          name: result.rows[0].full_name || result.rows[0].username,
          email: result.rows[0].email || '',
          role: result.rows[0].role
        });
      }
    } catch (eventErr) {
      console.warn('User creation event emission failed:', eventErr.message);
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.constraint?.includes('unique')) return res.status(409).json({ error: 'Username or email already exists' });
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', requireMinRole('senior_engineer'), auditLog('update_user', 'user'), async (req, res) => {
  try {
    const { full_name, phone, specializations, notes, is_active, role, permissions, assigned_admin_id } = req.body;
    // Only admin can change roles
    if (role && req.user.role !== 'admin' && req.user.role !== 'super_admin') return res.status(403).json({ error: 'Only admin can change roles' });
    let updateSql = `UPDATE users SET full_name=COALESCE($1,full_name), phone=COALESCE($2,phone), specializations=COALESCE($3,specializations), notes=COALESCE($4,notes), is_active=COALESCE($5,is_active), role=COALESCE($6,role), permissions=COALESCE($7,permissions), assigned_admin_id=COALESCE($8,assigned_admin_id), updated_at=NOW() WHERE id=$9`;
    const updateParams = [full_name, phone, specializations, notes, is_active, role, permissions ? JSON.stringify(permissions) : null, assigned_admin_id || null, req.params.id];
    if (!isSuperAdmin(req.user)) {
      updateSql += ` AND ${tenantUserExpression('users')} = $10`;
      updateParams.push(tenantAdminId(req.user));
    }
    updateSql += ` RETURNING id, username, full_name, role, is_active`;
    const result = await query(updateSql, updateParams);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id', requireMinRole('senior_engineer'), auditLog('update_user', 'user'), async (req, res) => {
  try {
    const { full_name, phone, specializations, notes, is_active, role, permissions, assigned_admin_id } = req.body;
    if (role && req.user.role !== 'admin' && req.user.role !== 'super_admin') return res.status(403).json({ error: 'Only admin can change roles' });
    let updateSql = `UPDATE users SET full_name=COALESCE($1,full_name), phone=COALESCE($2,phone), specializations=COALESCE($3,specializations), notes=COALESCE($4,notes), is_active=COALESCE($5,is_active), role=COALESCE($6,role), permissions=COALESCE($7,permissions), assigned_admin_id=COALESCE($8,assigned_admin_id), updated_at=NOW() WHERE id=$9`;
    const updateParams = [full_name, phone, specializations, notes, is_active, role, permissions ? JSON.stringify(permissions) : null, assigned_admin_id || null, req.params.id];
    if (!isSuperAdmin(req.user)) {
      updateSql += ` AND ${tenantUserExpression('users')} = $10`;
      updateParams.push(tenantAdminId(req.user));
    }
    updateSql += ` RETURNING id, username, full_name, role, is_active`;
    const result = await query(updateSql, updateParams);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/deactivate', requireRole('admin', 'super_admin'), auditLog('toggle_user_status', 'user'), async (req, res) => {
  try {
    let updateSql = `UPDATE users SET is_active = NOT is_active, updated_at = NOW() WHERE id=$1`;
    const updateParams = [req.params.id];
    if (!isSuperAdmin(req.user)) {
      updateSql += ` AND ${tenantUserExpression('users')} = $2`;
      updateParams.push(tenantAdminId(req.user));
    }
    updateSql += ` RETURNING id, username, full_name, role, is_active`;
    const result = await query(updateSql, updateParams);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/audit-logs', requireRole('admin'), async (req, res) => {
  try {
    const { page=1, limit=50, user_id, action, resource_type } = req.query;
    const offset = (parseInt(page)-1)*parseInt(limit);
    const conditions = [], params = [];
    let pi = 1;
    if (!isSuperAdmin(req.user)) {
      conditions.push(`al.tenant_id = $${pi}`);
      params.push(tenantAdminId(req.user));
      pi++;
    }
    if (user_id) { conditions.push(`al.user_id = $${pi++}`); params.push(user_id); }
    if (action) { conditions.push(`al.action ILIKE $${pi++}`); params.push(`%${action}%`); }
    if (resource_type) { conditions.push(`al.resource_type = $${pi++}`); params.push(resource_type); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const result = await query(
      `SELECT al.*, u.username, u.full_name FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id ${where} ORDER BY al.created_at DESC LIMIT $${pi} OFFSET $${pi+1}`,
      [...params, parseInt(limit), offset]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

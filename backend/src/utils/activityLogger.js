const { query } = require('../config/database');

async function logActivity({ user, tenantId, action, module, resourceType, resourceId, title, description, metadata, ipAddress, userAgent, requestId }) {
  try {
    await query(
      `INSERT INTO activity_logs (tenant_id, user_id, action, module, resource_type, resource_id, title, description, metadata, ip_address, user_agent, request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::inet, $11, $12)`,
      [
        tenantId || (user && user.tenant_id) || null,
        (user && user.id) || null,
        action,
        module || 'general',
        resourceType || null,
        resourceId || null,
        title || null,
        description || null,
        JSON.stringify(metadata || {}),
        ipAddress || (user && user.ip) || null,
        userAgent || (user && user.userAgent) || null,
        requestId || (user && user.requestId) || null,
      ]
    );
  } catch (err) {
    console.error('Activity log insert error:', err.message);
  }
}

module.exports = { logActivity };

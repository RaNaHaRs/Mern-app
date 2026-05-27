const { query } = require('../config/database');
const logger = require('../config/logger');

/**
 * Audit middleware - logs every authenticated action to audit_logs table
 */
function auditLog(action, resourceType) {
  return async (req, res, next) => {
    // Capture original json method to intercept response
    const originalJson = res.json.bind(res);
    res.json = function(body) {
      // Log after response is sent
      if (req.user && res.statusCode < 400) {
        const resourceId = req.params.id || 
                           (body && (body.id || body.case_id || body.client_id)) || 
                           null;
        
        query(
          `INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details, ip_address, user_agent)
           VALUES ($1, $2, $3, $4, $5, $6, $7::inet, $8)`,
          [
            req.user.tenant_id || null,
            req.user.id,
            action,
            resourceType,
            resourceId,
            JSON.stringify({
              method: req.method,
              path: req.path,
              query: req.query,
              statusCode: res.statusCode,
              requestId: req.requestId
            }),
            req.ip || req.connection.remoteAddress,
            req.headers['user-agent']
          ]
        ).catch(err => logger.error('Audit log error', { error: err.message }));
      }
      return originalJson(body);
    };
    next();
  };
}

module.exports = { auditLog };

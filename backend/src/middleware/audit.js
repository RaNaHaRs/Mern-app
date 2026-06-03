const { query } = require('../config/database');
const logger = require('../config/logger');

/**
 * Audit middleware - logs every authenticated action to both audit_logs and activity_logs tables.
 * @param {string} action - e.g. 'create_client', 'update_case'
 * @param {string} resourceType - e.g. 'client', 'case', 'payment'
 * @param {string} [module] - derived from path if omitted (e.g. 'clients', 'inventory')
 */
function auditLog(action, resourceType, module) {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = function(body) {
      if (req.user && res.statusCode < 400) {
        const resourceId = req.params.id ||
                           (body && (body.id || body.case_id || body.client_id)) ||
                           null;
        const derivedModule = module || req.baseUrl.split('/').pop() || 'general';
        let description, title;
        if (body && body.description) {
          description = body.description;
        } else if (body && body.message) {
          description = body.message;
        } else {
          description = action.replace(/_/g, ' ');
        }
        if (body && body.title) {
          title = body.title;
        } else if (body && body.name) {
          title = body.name;
        } else if (body && body.payment && body.payment.amount) {
          title = `${resourceType} payment`;
          description = `₹${body.payment.amount} collected for ${resourceType}`;
        } else {
          title = action.replace(/_/g, ' ');
        }

        const details = JSON.stringify({
          method: req.method,
          path: req.path,
          query: req.query,
          statusCode: res.statusCode,
          requestId: req.requestId
        });

        query(
          `INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details, ip_address, user_agent)
           VALUES ($1, $2, $3, $4, $5, $6, $7::inet, $8)`,
          [
            req.user.tenant_id || null, req.user.id, action, resourceType, resourceId,
            details, req.ip || req.connection.remoteAddress, req.headers['user-agent']
          ]
        ).catch(err => logger.error('Audit log error', { error: err.message }));

        query(
          `INSERT INTO activity_logs (tenant_id, user_id, action, module, resource_type, resource_id, title, description, metadata, ip_address, user_agent, request_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::inet, $11, $12)`,
          [
            req.user.tenant_id || null, req.user.id, action, derivedModule, resourceType,
            resourceId, title || null, description || null, details,
            req.ip || req.connection.remoteAddress, req.headers['user-agent'], req.requestId || null
          ]
        ).catch(err => logger.error('Activity log error', { error: err.message }));
      }
      return originalJson(body);
    };
    next();
  };
}

module.exports = { auditLog };

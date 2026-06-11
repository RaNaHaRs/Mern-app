/**
 * Export Routes
 * Provides CSV exports for Cases and Clients
 * CSV files open directly in Excel without any format issues
 * Respects tenant isolation and permissions
 */

const express = require('express');
const { query } = require('../config/database');
const { authenticate, requireMinRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const { isSuperAdmin, tenantCaseCondition, tenantClientCondition } = require('../utils/tenantAccess');

const router = express.Router();
router.use(authenticate);

/**
 * Escape CSV values
 */
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Helper: Convert array of objects to CSV
 */
function toCsv(rows, columns = null) {
  if (!rows || rows.length === 0) {
    return '';
  }

  const cols = columns || Object.keys(rows[0] || {});
  if (cols.length === 0) return '';
  
  const header = cols.map(escapeCSV).join(',');
  const body = rows.map(row =>
    cols.map(col => escapeCSV(row[col])).join(',')
  ).join('\n');

  return header + '\n' + body;
}

/**
 * POST /api/export/cases
 * Export cases to CSV (opens in Excel)
 */
router.post('/cases',
  requireMinRole('staff'),
  auditLog('export_cases', 'report'),
  async (req, res) => {
    try {
      const {
        filters = {},
        columns = null,
      } = req.body;

      const {
        stage, assigned_to, client_id, priority, failure_type, search
      } = filters;

      const conditions = [];
      const params = [];
      let pi = 1;

      // Apply filters
      if (stage) { conditions.push(`c.stage = $${pi++}`); params.push(stage); }
      if (assigned_to) { conditions.push(`c.assigned_engineer = $${pi++}`); params.push(assigned_to); }
      if (client_id) { conditions.push(`c.client_id = $${pi++}`); params.push(client_id); }
      if (priority) { conditions.push(`c.priority = $${pi++}`); params.push(parseInt(priority)); }
      if (failure_type) { conditions.push(`c.failure_type = $${pi++}`); params.push(failure_type); }
      if (search) {
        conditions.push(`(c.case_number ILIKE $${pi} OR cl.first_name ILIKE $${pi} OR cl.last_name ILIKE $${pi})`);
        params.push(`%${search}%`);
        pi++;
      }

      // Apply tenant isolation
      if (!isSuperAdmin(req.user)) {
        const tenantCondition = tenantCaseCondition(req.user, 'c', pi);
        conditions.push(tenantCondition.clause);
        params.push(...tenantCondition.params);
        pi += tenantCondition.params.length;
      }

      // Apply soft-delete filter
      conditions.push('c.deleted_at IS NULL');

      const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

      // Fetch data
      const result = await query(
        `SELECT
           c.id, c.case_number, c.stage, c.priority, c.failure_type,
           c.device_brand, c.device_model, c.serial_number, c.capacity_gb,
           c.interface, c.ai_risk_level, c.recovery_progress_pct,
           c.received_at, c.deadline_at, c.completed_at, c.created_at,
           cl.first_name, cl.last_name, cl.email, cl.phone, cl.company,
           u.full_name as engineer_name,
           (SELECT COUNT(*) FROM payments WHERE case_id = c.id AND status = 'paid') as payment_count,
           (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE case_id = c.id AND status = 'paid') as total_paid,
           (SELECT COALESCE(q.total_amount, 0) FROM quotations q WHERE q.case_id = c.id ORDER BY q.created_at DESC LIMIT 1) as quotation_amount
         FROM cases c
         LEFT JOIN clients cl ON c.client_id = cl.id
         LEFT JOIN users u ON c.assigned_engineer = u.id
         ${where}
         ORDER BY c.created_at DESC
         LIMIT 10000`,
        params
      );

      const rows = result.rows;
      const defaultColumns = [
        'case_number', 'stage', 'priority', 'device_brand', 'device_model',
        'serial_number', 'capacity_gb', 'failure_type', 'first_name', 'last_name',
        'email', 'company', 'engineer_name', 'total_paid', 'quotation_amount',
        'recovery_progress_pct', 'created_at', 'completed_at'
      ];
      const exportColumns = columns || defaultColumns;

      const csv = toCsv(rows, exportColumns);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="cases_export_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csv);

    } catch (err) {
      console.error('Export cases error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * POST /api/export/clients
 * Export clients to CSV (opens in Excel)
 */
router.post('/clients',
  requireMinRole('staff'),
  auditLog('export_clients', 'report'),
  async (req, res) => {
    try {
      const {
        filters = {},
        columns = null,
      } = req.body;

      const { search, is_corporate, is_vip } = filters;

      const conditions = [];
      const params = [];
      let pi = 1;

      // Apply filters
      if (search) {
        conditions.push(`(cl.first_name ILIKE $${pi} OR cl.last_name ILIKE $${pi} OR cl.phone ILIKE $${pi} OR cl.email ILIKE $${pi} OR cl.company ILIKE $${pi})`);
        params.push(`%${search}%`);
        pi++;
      }
      if (is_corporate !== undefined) {
        conditions.push(`cl.is_corporate = $${pi++}`);
        params.push(is_corporate === 'true');
      }
      if (is_vip !== undefined) {
        conditions.push(`cl.is_vip = $${pi++}`);
        params.push(is_vip === 'true');
      }

      // Apply tenant isolation
      if (!isSuperAdmin(req.user)) {
        const tenantCondition = tenantClientCondition(req.user, 'cl', pi);
        conditions.push(tenantCondition.clause);
        params.push(...tenantCondition.params);
        pi += tenantCondition.params.length;
      }

      const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

      // Fetch data
      const result = await query(
        `SELECT
           cl.id, cl.client_code, cl.first_name, cl.last_name, cl.email, cl.phone,
           cl.company, cl.is_corporate, cl.is_vip, cl.total_paid, cl.created_at,
           COUNT(c.id) FILTER (WHERE c.stage NOT IN ('completed','delivered','failed') AND c.deleted_at IS NULL) AS active_cases,
           COUNT(c.id) FILTER (WHERE c.deleted_at IS NULL) AS total_cases,
           COALESCE(SUM(
             CASE
               WHEN q.total_amount IS NULL THEN 0
               ELSE GREATEST(q.total_amount - COALESCE(paid.total_paid, 0), 0)
             END
           ) FILTER (WHERE c.deleted_at IS NULL), 0) AS pending_amount
         FROM clients cl
         LEFT JOIN cases c ON cl.id = c.client_id
         LEFT JOIN LATERAL (
           SELECT q.total_amount FROM quotations q WHERE q.case_id = c.id
           ORDER BY q.created_at DESC LIMIT 1
         ) q ON TRUE
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) AS total_paid
           FROM payments p WHERE p.case_id = c.id
         ) paid ON TRUE
         ${where}
         GROUP BY cl.id
         ORDER BY cl.created_at DESC
         LIMIT 10000`,
        params
      );

      const rows = result.rows;
      const defaultColumns = [
        'client_code', 'first_name', 'last_name', 'email', 'phone', 'company',
        'is_corporate', 'is_vip', 'total_cases', 'active_cases', 'total_paid',
        'pending_amount', 'created_at'
      ];
      const exportColumns = columns || defaultColumns;

      const csv = toCsv(rows, exportColumns);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="clients_export_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csv);

    } catch (err) {
      console.error('Export clients error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;

const express = require('express');
const { query } = require('../config/database');
const { authenticate, requireMinRole } = require('../middleware/auth');
const { isSuperAdmin, tenantCaseCondition, tenantUserCondition, tenantAdminId } = require('../utils/tenantAccess');

const router = express.Router();
router.use(authenticate);

// ─── GET /api/analytics/dashboard ────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const tenantCase = !isSuperAdmin(req.user) ? tenantCaseCondition(req.user, 'c', 1) : null;
    const tenantCaseParams = tenantCase ? tenantCase.params : [];
    const engineerTenantUser = !isSuperAdmin(req.user) ? tenantUserCondition(req.user, 'u', 1) : null;
    const engineerTenantCase = !isSuperAdmin(req.user) ? tenantCaseCondition(req.user, 'c', 2) : null;
    const engineerParams = engineerTenantUser && engineerTenantCase
      ? [...engineerTenantUser.params, ...engineerTenantCase.params]
      : engineerTenantUser
        ? engineerTenantUser.params
        : engineerTenantCase
          ? engineerTenantCase.params
          : [];

    const [casesStats, revenueStats, pendingQuoteStats, engineerStats, failureStats, recentCases, stageCounts, expenseStats] = await Promise.all([
      // Cases overview
      query(`SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE stage NOT IN ('completed','delivered','failed')) as active,
        COUNT(*) FILTER (WHERE stage = 'completed' OR stage = 'delivered') as completed,
        COUNT(*) FILTER (WHERE stage = 'failed') as failed,
        COUNT(*) FILTER (WHERE priority = 1) as critical,
        COUNT(*) FILTER (WHERE received_at >= NOW() - INTERVAL '7 days') as this_week,
        COUNT(*) FILTER (WHERE received_at >= NOW() - INTERVAL '30 days') as this_month
        FROM cases c${tenantCase ? ` WHERE ${tenantCase.clause}` : ''}`,
        tenantCaseParams),

      // Revenue this month
      query(`SELECT
        COALESCE(SUM(amount) FILTER (WHERE status = 'paid' AND paid_at >= NOW() - INTERVAL '30 days'), 0) as revenue_month,
        COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) as total_revenue,
        COUNT(*) FILTER (WHERE status = 'paid') as paid_count
        FROM payments p
        JOIN cases c ON p.case_id = c.id
        ${tenantCase ? `WHERE ${tenantCase.clause}` : ''}`,
        tenantCaseParams),

      // Pending amount from latest case quote minus received payments
      query(`SELECT
        COALESCE(SUM(GREATEST(COALESCE(q.total_amount, 0) - COALESCE(paid.total_paid, 0), 0)), 0) AS pending_revenue
        FROM cases c
        LEFT JOIN LATERAL (
          SELECT q.total_amount
          FROM quotations q
          WHERE q.case_id = c.id
          ORDER BY q.created_at DESC LIMIT 1
        ) q ON TRUE
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) AS total_paid
          FROM payments p
          WHERE p.case_id = c.id
        ) paid ON TRUE
        ${tenantCase ? `WHERE ${tenantCase.clause}` : ''}`,
        tenantCaseParams),

      // Engineer performance
      query(`SELECT u.id, u.full_name, u.role,
        COUNT(c.id) as total_cases,
        COUNT(c.id) FILTER (WHERE c.stage IN ('completed','delivered')) as completed_cases,
        AVG(EXTRACT(EPOCH FROM (c.completed_at - c.received_at))/3600) FILTER (WHERE c.completed_at IS NOT NULL) as avg_hours,
        ROUND(COUNT(c.id) FILTER (WHERE c.stage IN ('completed','delivered'))::decimal / NULLIF(COUNT(c.id),0) * 100, 1) as success_rate
        FROM users u
        LEFT JOIN cases c ON c.assigned_engineer = u.id${engineerTenantCase ? ` AND ${engineerTenantCase.clause}` : ''}
        WHERE u.role IN ('senior_engineer','junior_engineer') AND u.is_active = true${engineerTenantUser ? ` AND ${engineerTenantUser.clause}` : ''}
        GROUP BY u.id ORDER BY completed_cases DESC LIMIT 10`,
        engineerParams
      ),

      // Top failure types
      query(`SELECT failure_type, device_brand,
        COUNT(*) as count,
        ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - c.received_at))/3600) FILTER (WHERE completed_at IS NOT NULL), 1) as avg_recovery_hours
        FROM cases c
        ${tenantCase ? `WHERE c.received_at >= NOW() - INTERVAL '90 days' AND ${tenantCase.clause}` : `WHERE c.received_at >= NOW() - INTERVAL '90 days'`}
        GROUP BY failure_type, device_brand
        ORDER BY count DESC LIMIT 10`,

        tenantCaseParams),

      // Recent cases
      query(`SELECT c.id, c.case_number, c.stage, c.priority, c.failure_type, c.device_brand, c.device_model,
        c.ai_risk_level, c.created_at,
        cl.first_name, cl.last_name,
        u.full_name as engineer_name
        FROM cases c
        LEFT JOIN clients cl ON c.client_id = cl.id
        LEFT JOIN users u ON c.assigned_engineer = u.id
        ${tenantCase ? `WHERE ${tenantCase.clause}` : ''}
        ORDER BY c.created_at DESC LIMIT 10`,
        tenantCaseParams),

      // Stage distribution
      query(`SELECT stage, COUNT(*) as count FROM cases c ${tenantCase ? `WHERE ${tenantCase.clause}` : ''} GROUP BY stage ORDER BY count DESC`,
        tenantCaseParams),

      // Expenses this month (for profit calculation)
      query(`SELECT
        COALESCE(SUM(total) FILTER (WHERE date >= NOW()::date - INTERVAL '30 days'), 0) as expenses_month,
        COALESCE(SUM(total), 0) as total_expenses
        FROM accounting_expenses${!isSuperAdmin(req.user) ? ` WHERE tenant_id = $1` : ''}`,
        !isSuperAdmin(req.user) ? [tenantAdminId(req.user)] : []),
    ]);

    res.json({
      cases: casesStats.rows[0],
      revenue: {
        ...revenueStats.rows[0],
        pending_revenue: parseFloat(pendingQuoteStats.rows[0].pending_revenue),
        profit_month: parseFloat(revenueStats.rows[0].revenue_month) - parseFloat(expenseStats.rows[0].expenses_month),
      },
      engineers: engineerStats.rows,
      failureAnalytics: failureStats.rows,
      recentCases: recentCases.rows,
      stageDistribution: stageCounts.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/analytics/failure-trends ───────────────────────────
router.get('/failure-trends', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const parsedDays = Number.isInteger(parseInt(days, 10)) ? parseInt(days, 10) : 30;
    const tenantCase = !isSuperAdmin(req.user) ? tenantCaseCondition(req.user, 'c', 2) : null;
    const tenantCaseParams = tenantCase ? tenantCase.params : [];
    const result = await query(
      `SELECT
        DATE_TRUNC('day', c.received_at) as date,
        failure_type,
        device_brand,
        COUNT(*) as count
       FROM cases c
       WHERE c.received_at >= NOW() - ($1 || ' days')::INTERVAL
       ${tenantCase ? `AND ${tenantCase.clause}` : ''}
       GROUP BY DATE_TRUNC('day', c.received_at), failure_type, device_brand
       ORDER BY date DESC`,

      [parsedDays, ...tenantCaseParams]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/analytics/model-failures ───────────────────────────
router.get('/model-failures', async (req, res) => {
  try {
    const tenantCase = !isSuperAdmin(req.user) ? tenantCaseCondition(req.user, 'c', 1) : null;
    const tenantCaseParams = tenantCase ? tenantCase.params : [];
    const result = await query(
      `SELECT sm.model_number, sb.name as brand,
        COUNT(c.id) as total_cases,
        COUNT(c.id) FILTER (WHERE c.stage IN ('completed','delivered')) as recovered,
        COUNT(c.id) FILTER (WHERE c.stage = 'failed') as failed,
        ROUND(COUNT(c.id) FILTER (WHERE c.stage IN ('completed','delivered'))::decimal / NULLIF(COUNT(c.id),0) * 100, 1) as recovery_rate,
        MODE() WITHIN GROUP (ORDER BY c.failure_type) as common_failure
       FROM storage_models sm
       JOIN storage_brands sb ON sm.brand_id = sb.id
       JOIN cases c ON c.storage_model_id = sm.id
       ${tenantCase ? `WHERE ${tenantCase.clause}` : ''}
       GROUP BY sm.id, sm.model_number, sb.name
       HAVING COUNT(c.id) > 0
       ORDER BY total_cases DESC LIMIT 20`,
      tenantCaseParams
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/analytics/revenue-trend ────────────────────────────
router.get('/revenue-trend', async (req, res) => {
  try {
    const tenantCase = !isSuperAdmin(req.user) ? tenantCaseCondition(req.user, 'c', 1) : null;
    const tenantCaseParams = tenantCase ? tenantCase.params : [];
    const result = await query(
      `SELECT DATE_TRUNC('day', paid_at) as date,
        COALESCE(SUM(amount),0) as revenue,
        COUNT(*) as payment_count
       FROM payments p
       JOIN cases c ON p.case_id = c.id
       WHERE status = 'paid' AND paid_at >= NOW() - INTERVAL '30 days'
       ${tenantCase ? `AND ${tenantCase.clause}` : ''}
       GROUP BY DATE_TRUNC('day', paid_at) ORDER BY date`,
      tenantCaseParams
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

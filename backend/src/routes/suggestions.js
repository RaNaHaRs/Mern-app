const express = require('express');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { mergeProblemSuggestions } = require('../utils/problemSuggestions');

const router = express.Router();
router.use(authenticate);

function readCustomProblemsFromBody(req) {
  const raw = req.query.customProblems;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

// ─── GET /api/suggestions/problems ───────────────────────────────────────────
router.get('/problems', async (req, res) => {
  try {
    const { search = '', limit = 10 } = req.query;
    const term = String(search).trim();

    if (!term) {
      return res.json([]);
    }

    const max = Math.min(parseInt(limit, 10) || 10, 20);
    const prefix = `${term}%`;
    const contains = `%${term}%`;
    const extras = readCustomProblemsFromBody(req);

    let historyRows = [];
    let caseRows = [];

    try {
      const historyResult = await query(
        `SELECT text, use_count, last_used_at
         FROM problem_history
         WHERE text ILIKE $1
         ORDER BY
           CASE WHEN text ILIKE $2 THEN 0 ELSE 1 END,
           use_count DESC,
           last_used_at DESC NULLS LAST
         LIMIT $3`,
        [contains, prefix, max]
      );
      historyRows = historyResult.rows;

      const caseResult = await query(
        `SELECT DISTINCT symptom_notes AS text, 0 AS use_count, NULL::timestamptz AS last_used_at
         FROM cases
         WHERE symptom_notes IS NOT NULL
           AND TRIM(symptom_notes) <> ''
           AND symptom_notes ILIKE $1
         ORDER BY symptom_notes
         LIMIT $2`,
        [contains, max]
      );
      caseRows = caseResult.rows;
    } catch (dbErr) {
      console.warn('Problem suggestions DB lookup skipped:', dbErr.message);
    }

    const merged = mergeProblemSuggestions(
      [...historyRows, ...caseRows],
      term,
      max,
      extras
    );

    res.json(merged);
  } catch (e) {
    console.error('Error fetching problem suggestions:', e);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

// ─── GET /api/suggestions/diagnosis ──────────────────────────────────────────
router.get('/diagnosis', async (req, res) => {
  try {
    const { search = '', problemCategory = '', limit = 10 } = req.query;
    const term = String(search).trim();

    if (!term) {
      return res.json([]);
    }

    const max = Math.min(parseInt(limit, 10) || 10, 20);
    const contains = `%${term}%`;
    const prefix = `${term}%`;

    let conditions = 'text ILIKE $1';
    const params = [contains];
    let paramIndex = 2;

    if (problemCategory && problemCategory.trim()) {
      conditions += ` AND (problem_category = $${paramIndex} OR problem_category IS NULL)`;
      params.push(problemCategory.trim());
      paramIndex++;
    }

    params.push(prefix, max);

    const result = await query(
      `SELECT
        id,
        text,
        problem_category,
        recovery_success_rate,
        avg_recovery_time_hours,
        use_count,
        last_used_at
      FROM diagnosis_history
      WHERE ${conditions}
      ORDER BY
        CASE WHEN text ILIKE $${paramIndex} THEN 0 ELSE 1 END,
        use_count DESC,
        last_used_at DESC NULLS LAST
      LIMIT $${paramIndex + 1}`,
      params
    );

    let caseRows = [];
    try {
      const caseResult = await query(
        `SELECT DISTINCT initial_diagnosis AS text, 0 AS use_count, NULL::timestamptz AS last_used_at
         FROM cases
         WHERE initial_diagnosis IS NOT NULL
           AND TRIM(initial_diagnosis) <> ''
           AND initial_diagnosis ILIKE $1
         ORDER BY initial_diagnosis
         LIMIT $2`,
        [contains, max]
      );
      caseRows = caseResult.rows;
    } catch {
      // cases table may lack initial_diagnosis in older schemas
    }

    const seen = new Set();
    const merged = [];
    for (const row of [...result.rows, ...caseRows]) {
      const text = (row.text || '').trim();
      if (!text || seen.has(text.toLowerCase())) continue;
      seen.add(text.toLowerCase());
      merged.push({
        id: row.id || null,
        text,
        problem_category: row.problem_category || null,
        recovery_success_rate: row.recovery_success_rate || null,
        avg_recovery_time_hours: row.avg_recovery_time_hours || null,
        use_count: row.use_count || 0,
        last_used_at: row.last_used_at || null,
      });
      if (merged.length >= max) break;
    }

    res.json(merged);
  } catch (e) {
    console.error('Error fetching diagnosis suggestions:', e);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

// ─── POST /api/suggestions/problems ──────────────────────────────────────────
router.post('/problems', async (req, res) => {
  try {
    const { text, category, severity } = req.body;
    const userId = req.user?.id;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Problem text is required' });
    }

    const result = await query(
      `INSERT INTO problem_history (text, category, severity, use_count, created_by)
      VALUES ($1, $2, $3, 1, $4)
      ON CONFLICT (text) DO UPDATE
      SET
        use_count = problem_history.use_count + 1,
        last_used_at = NOW()
      RETURNING *`,
      [text.trim(), category || null, severity || null, userId || null]
    );

    res.json(result.rows[0]);
  } catch (e) {
    console.error('Error recording problem:', e);
    res.status(500).json({ error: 'Failed to record problem' });
  }
});

// ─── POST /api/suggestions/diagnosis ─────────────────────────────────────────
router.post('/diagnosis', async (req, res) => {
  try {
    const { text, problemCategory, recoverySuccessRate, avgRecoveryTimeHours } = req.body;
    const userId = req.user?.id;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Diagnosis text is required' });
    }

    const result = await query(
      `INSERT INTO diagnosis_history (
        text,
        problem_category,
        recovery_success_rate,
        avg_recovery_time_hours,
        use_count,
        created_by
      )
      VALUES ($1, $2, $3, $4, 1, $5)
      ON CONFLICT (text) DO UPDATE
      SET
        use_count = diagnosis_history.use_count + 1,
        last_used_at = NOW(),
        recovery_success_rate = COALESCE($3, diagnosis_history.recovery_success_rate),
        avg_recovery_time_hours = COALESCE($4, diagnosis_history.avg_recovery_time_hours)
      RETURNING *`,
      [
        text.trim(),
        problemCategory || null,
        recoverySuccessRate || null,
        avgRecoveryTimeHours || null,
        userId || null,
      ]
    );

    res.json(result.rows[0]);
  } catch (e) {
    console.error('Error recording diagnosis:', e);
    res.status(500).json({ error: 'Failed to record diagnosis' });
  }
});

// ─── GET /api/suggestions/problems/categories ────────────────────────────────
router.get('/problems/categories', async (req, res) => {
  try {
    const result = await query(`
      SELECT DISTINCT category
      FROM problem_history
      WHERE category IS NOT NULL
      ORDER BY category
    `);

    res.json(result.rows.map((r) => r.category));
  } catch (e) {
    console.error('Error fetching problem categories:', e);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

module.exports = router;

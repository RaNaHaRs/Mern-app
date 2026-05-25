const express = require('express');
const { query: queryValidator, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ─── GET /api/suggestions/problems ───────────────────────────────────────────
// Search problems by text with autocomplete
router.get('/problems', async (req, res) => {
  try {
    const { search = '', limit = 10 } = req.query;
    
    if (!search || search.trim().length < 2) {
      return res.json([]);
    }

    // Use PostgreSQL trigram search for fuzzy matching
    const result = await query(`
      SELECT 
        id,
        text,
        category,
        severity,
        use_count,
        last_used_at
      FROM problem_history
      WHERE text ILIKE $1 OR text % $2
      ORDER BY 
        CASE WHEN text ILIKE $3 THEN 0 ELSE 1 END,
        use_count DESC,
        last_used_at DESC
      LIMIT $4
    `, [
      `%${search}%`,
      search,
      `${search}%`,
      parseInt(limit) || 10
    ]);

    res.json(result.rows);
  } catch (e) {
    console.error('Error fetching problem suggestions:', e);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

// ─── GET /api/suggestions/diagnosis ──────────────────────────────────────────
// Search diagnosis by text with autocomplete
router.get('/diagnosis', async (req, res) => {
  try {
    const { search = '', problemCategory = '', limit = 10 } = req.query;
    
    if (!search || search.trim().length < 2) {
      return res.json([]);
    }

    let conditions = `text ILIKE $1 OR text % $2`;
    const params = [`%${search}%`, search];
    let paramIndex = 3;

    // Optional: filter by problem category if provided
    if (problemCategory && problemCategory.trim()) {
      conditions += ` AND (problem_category = $${paramIndex} OR problem_category IS NULL)`;
      params.push(problemCategory);
      paramIndex++;
    }

    params.push(parseInt(limit) || 10);

    const result = await query(`
      SELECT 
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
        CASE WHEN text ILIKE $${paramIndex - 1} THEN 0 ELSE 1 END,
        use_count DESC,
        last_used_at DESC
      LIMIT $${paramIndex}
    `, params);

    res.json(result.rows);
  } catch (e) {
    console.error('Error fetching diagnosis suggestions:', e);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

// ─── POST /api/suggestions/problems ──────────────────────────────────────────
// Record a new problem (called after case creation)
router.post('/problems', async (req, res) => {
  try {
    const { text, category, severity } = req.body;
    const userId = req.user?.id;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Problem text is required' });
    }

    // Try to insert, or update use_count if already exists
    const result = await query(`
      INSERT INTO problem_history (text, category, severity, use_count, created_by)
      VALUES ($1, $2, $3, 1, $4)
      ON CONFLICT (text) DO UPDATE
      SET 
        use_count = problem_history.use_count + 1,
        last_used_at = NOW()
      RETURNING *
    `, [text, category || null, severity || null, userId || null]);

    res.json(result.rows[0]);
  } catch (e) {
    console.error('Error recording problem:', e);
    res.status(500).json({ error: 'Failed to record problem' });
  }
});

// ─── POST /api/suggestions/diagnosis ─────────────────────────────────────────
// Record a new diagnosis (called after case creation)
router.post('/diagnosis', async (req, res) => {
  try {
    const { text, problemCategory, recoverySuccessRate, avgRecoveryTimeHours } = req.body;
    const userId = req.user?.id;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Diagnosis text is required' });
    }

    const result = await query(`
      INSERT INTO diagnosis_history (
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
      RETURNING *
    `, [text, problemCategory || null, recoverySuccessRate || null, avgRecoveryTimeHours || null, userId || null]);

    res.json(result.rows[0]);
  } catch (e) {
    console.error('Error recording diagnosis:', e);
    res.status(500).json({ error: 'Failed to record diagnosis' });
  }
});

// ─── GET /api/suggestions/problems/categories ────────────────────────────────
// Get all problem categories for filtering/grouping
router.get('/problems/categories', async (req, res) => {
  try {
    const result = await query(`
      SELECT DISTINCT category
      FROM problem_history
      WHERE category IS NOT NULL
      ORDER BY category
    `);

    res.json(result.rows.map(r => r.category));
  } catch (e) {
    console.error('Error fetching problem categories:', e);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

module.exports = router;

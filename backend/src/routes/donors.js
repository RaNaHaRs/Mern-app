const express = require('express');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { findDonors, getAllDonorMatches } = require('../services/donorEngine');

const router = express.Router();
router.use(authenticate);

router.get('/matches', async (req, res) => {
  try {
    const { min_score, brand, top_count } = req.query;
    const result = await getAllDonorMatches({
      minScore: parseFloat(min_score || 30),
      brandFilter: brand,
      topCount: parseInt(top_count, 10) || 6
    });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/find/:model_id', async (req, res) => {
  try {
    const { min_score } = req.query;
    const result = await findDonors(req.params.model_id, { minScore: parseFloat(min_score||30) });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/compatibility', async (req, res) => {
  try {
    const { model_id, donor_model_id } = req.body;
    const [model, donor] = await Promise.all([
      query('SELECT * FROM storage_models WHERE id = $1', [model_id]),
      query('SELECT * FROM storage_models WHERE id = $1', [donor_model_id])
    ]);
    if (!model.rows.length || !donor.rows.length) return res.status(404).json({ error: 'Model not found' });

    const { calculateCompatibilityScore } = require('../services/donorEngine');
    const score = calculateCompatibilityScore(model.rows[0], donor.rows[0]);

    const matchReasons = [];
    const m = model.rows[0], d = donor.rows[0];
    if (m.model_number === d.model_number) matchReasons.push('identical_model');
    if (m.pcb_number && m.pcb_number === d.pcb_number) matchReasons.push('matching_pcb');
    if (m.firmware_family && m.firmware_family === d.firmware_family) matchReasons.push('matching_firmware');
    if (m.controller_chip && m.controller_chip === d.controller_chip) matchReasons.push('matching_controller');
    if (m.head_map && m.head_map === d.head_map) matchReasons.push('matching_head_map');

    res.json({ score, matchReasons, recommendation: score >= 80 ? 'Highly Compatible' : score >= 50 ? 'Compatible' : 'Low Compatibility - Verify Before Use' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

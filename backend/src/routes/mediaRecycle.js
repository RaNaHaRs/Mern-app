const express = require('express');
const { authenticate, requireMinRole } = require('../middleware/auth');
const {
  listMediaRecycle,
  restoreMediaRecycleItem,
  permanentDeleteMediaRecycleItem,
} = require('../services/mediaRecycle');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const data = await listMediaRecycle({
      page: req.query.page,
      limit: req.query.limit,
      source: req.query.source,
      user: req.user,
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/restore', requireMinRole('junior_engineer'), async (req, res) => {
  try {
    const result = await restoreMediaRecycleItem(req.params.id, req.user);
    if (!result) return res.status(404).json({ error: 'Media not found in recycle bin' });
    res.json({ message: 'Media restored', ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/permanent-delete', requireMinRole('admin'), async (req, res) => {
  try {
    const id = await permanentDeleteMediaRecycleItem(req.params.id, req.user);
    if (!id) return res.status(404).json({ error: 'Media not found in recycle bin' });
    res.json({ message: 'Media permanently deleted', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

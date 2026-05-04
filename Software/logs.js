const router = require('express').Router();
const Log    = require('../models/Log');

// GET /api/logs?filter=success|fail&limit=N
router.get('/logs', async (req, res) => {
  try {
    const { filter, limit = 100 } = req.query;
    const q = {};
    if (filter === 'success') q.result = 'success';
    if (filter === 'fail')    q.result = 'fail';

    const logs = await Log.find(q)
      .populate('user', 'name role')
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));

    res.json(logs);
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

// GET /api/stats
router.get('/stats', async (req, res) => {
  try {
    const [total, success, fail] = await Promise.all([
      Log.countDocuments(),
      Log.countDocuments({ result: 'success' }),
      Log.countDocuments({ result: 'fail' }),
    ]);
    res.json({ total, success, fail });
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

module.exports = router;

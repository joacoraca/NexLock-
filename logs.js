/**
 * routes/logs.js - Endpoints para consultar historial de accesos
 */
const express = require('express');
const router = express.Router();
const AccessLog = require('../models/AccessLog');

/**
 * GET /api/logs
 * Query params:
 *   - filter=failed  → solo intentos fallidos
 *   - filter=success → solo intentos exitosos
 *   - limit=N        → cantidad máxima (default 100)
 */
router.get('/logs', async (req, res) => {
  try {
    const { filter, limit = 100 } = req.query;
    const query = {};

    if (filter === 'failed') query.result = 'fail';
    if (filter === 'success') query.result = 'success';

    const logs = await AccessLog.find(query)
      .populate('user', 'name role') // trae nombre y rol del usuario
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));

    res.json(logs);
  } catch (err) {
    console.error('Error obteniendo logs:', err);
    res.status(500).json({ error: 'Error obteniendo logs' });
  }
});

/**
 * GET /api/logs/:id
 * Detalle de un log específico (con imagen y datos completos)
 */
router.get('/logs/:id', async (req, res) => {
  try {
    const log = await AccessLog.findById(req.params.id).populate('user', 'name role');
    if (!log) return res.status(404).json({ error: 'Log no encontrado' });
    res.json(log);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo log' });
  }
});

/**
 * GET /api/stats
 * Estadísticas rápidas para el dashboard
 */
router.get('/stats', async (req, res) => {
  try {
    const [total, success, fail, lowLight] = await Promise.all([
      AccessLog.countDocuments(),
      AccessLog.countDocuments({ result: 'success' }),
      AccessLog.countDocuments({ result: 'fail' }),
      AccessLog.countDocuments({ reason: 'low_light' }),
    ]);

    res.json({ total, success, fail, lowLight });
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
});

module.exports = router;

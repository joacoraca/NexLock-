/**
 * routes/access.js - Endpoint principal para intentos de acceso del ESP32
 */
const express = require('express');
const router = express.Router();
const path = require('path');

const User = require('../models/User');
const AccessLog = require('../models/AccessLog');
const authMiddleware = require('../middleware/auth');
const upload = require('../middleware/upload');

/**
 * POST /api/access-attempt
 * Recibe: pin, timestamp, light_level, device_id + imagen (multipart)
 * Devuelve: { access: bool, reason: string }
 */
router.post(
  '/access-attempt',
  authMiddleware,
  upload.single('image'),
  async (req, res) => {
    const { pin, timestamp, light_level, device_id } = req.body;

    // Validación básica de inputs
    if (!pin || !light_level) {
      return res.status(400).json({ error: 'pin y light_level son requeridos' });
    }

    if (!['low', 'normal'].includes(light_level)) {
      return res.status(400).json({ error: 'light_level debe ser "low" o "normal"' });
    }

    // Ruta de imagen guardada (si se envió)
    const image_path = req.file
      ? `/uploads/${req.file.filename}`
      : null;

    let logData = {
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      light_level,
      device_id: device_id || 'unknown',
      image_path,
      user: null,
      result: 'fail',
      reason: 'invalid_pin',
    };

    try {
      // --- LÓGICA DE LUZ ---
      // Si hay poca luz, no validar nada, registrar y rechazar
      if (light_level === 'low') {
        logData.reason = 'low_light';
        logData.result = 'fail';
        await AccessLog.create(logData);
        return res.json({ access: false, reason: 'low_light' });
      }

      // --- VALIDACIÓN DE PIN ---
      // Buscar todos los usuarios y comparar PIN hasheado
      const users = await User.find();
      let matchedUser = null;

      for (const user of users) {
        const isMatch = await user.comparePin(pin);
        if (isMatch) {
          matchedUser = user;
          break;
        }
      }

      if (!matchedUser) {
        logData.reason = 'invalid_pin';
        logData.result = 'fail';
        await AccessLog.create(logData);
        return res.json({ access: false, reason: 'invalid_pin' });
      }

      // --- ACCESO CONCEDIDO ---
      logData.user = matchedUser._id;
      logData.result = 'success';
      logData.reason = 'ok';
      await AccessLog.create(logData);

      return res.json({ access: true, reason: 'ok' });

    } catch (err) {
      console.error('Error procesando intento de acceso:', err);
      return res.status(500).json({ error: 'Error interno' });
    }
  }
);

module.exports = router;

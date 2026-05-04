const router  = require('express').Router();
const User    = require('../models/User');
const Log     = require('../models/Log');
const auth    = require('../middleware/auth');

// POST /api/access-attempt  — llamado por el ESP32
router.post('/access-attempt', auth, async (req, res) => {
  const { pin, device_id } = req.body;

  if (!pin) return res.status(400).json({ error: 'pin requerido' });

  try {
    // Buscar usuario cuyo PIN coincida
    const users = await User.find();
    let matched = null;
    for (const u of users) {
      if (await u.checkPin(pin)) { matched = u; break; }
    }

    const result = matched ? 'success' : 'fail';

    await Log.create({
      device_id: device_id || 'door_1',
      result,
      user: matched?._id || null,
    });

    res.json({ access: result === 'success' });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;

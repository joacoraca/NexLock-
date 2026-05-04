const router = require('express').Router();
const User   = require('../models/User');

router.get('/users', async (req, res) => {
  try {
    const users = await User.find().select('-pin').sort({ createdAt: -1 });
    res.json(users);
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

router.post('/users', async (req, res) => {
  try {
    const { name, pin, role } = req.body;
    if (!name || !pin) return res.status(400).json({ error: 'Nombre y PIN requeridos' });
    if (!/^\d{4,8}$/.test(pin)) return res.status(400).json({ error: 'PIN debe ser 4-8 dígitos' });

    const user = await User.create({ name, pin, role });
    res.status(201).json({ _id: user._id, name: user.name, role: user.role });
  } catch (e) { res.status(500).json({ error: 'Error creando usuario' }); }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const u = await User.findByIdAndDelete(req.params.id);
    if (!u) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

module.exports = router;

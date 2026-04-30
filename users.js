/**
 * routes/users.js - CRUD de usuarios
 */
const express = require('express');
const router = express.Router();
const User = require('../models/User');

/**
 * GET /api/users
 * Lista todos los usuarios (sin exponer el PIN hasheado)
 */
router.get('/users', async (req, res) => {
  try {
    const users = await User.find().select('-pin');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo usuarios' });
  }
});

/**
 * POST /api/users
 * Crea un nuevo usuario
 * Body: { name, pin, role }
 */
router.post('/users', async (req, res) => {
  try {
    const { name, pin, role } = req.body;

    if (!name || !pin) {
      return res.status(400).json({ error: 'name y pin son requeridos' });
    }

    if (!/^\d{4,8}$/.test(pin)) {
      return res.status(400).json({ error: 'El PIN debe ser numérico de 4 a 8 dígitos' });
    }

    const user = await User.create({ name, pin, role });
    res.status(201).json({ _id: user._id, name: user.name, role: user.role });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Usuario ya existe' });
    }
    res.status(500).json({ error: 'Error creando usuario' });
  }
});

/**
 * DELETE /api/users/:id
 * Elimina un usuario por ID
 */
router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ message: 'Usuario eliminado correctamente' });
  } catch (err) {
    res.status(500).json({ error: 'Error eliminando usuario' });
  }
});

module.exports = router;

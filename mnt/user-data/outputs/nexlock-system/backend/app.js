/**
 * app.js - Configuración principal de Express
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const morgan = require('morgan');

const accessRoutes = require('./routes/access');
const logsRoutes = require('./routes/logs');
const usersRoutes = require('./routes/users');

const app = express();

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir imágenes y frontend
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/', express.static(path.join(__dirname, '../frontend')));

// Rutas API
app.use('/api', accessRoutes);
app.use('/api', logsRoutes);
app.use('/api', usersRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

module.exports = app;

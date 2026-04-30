/**
 * models/AccessLog.js - Colección de logs de acceso
 */
const mongoose = require('mongoose');

const accessLogSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null, // null si el PIN no corresponde a nadie
  },
  result: {
    type: String,
    enum: ['success', 'fail'],
    required: true,
  },
  reason: {
    type: String,
    enum: ['ok', 'invalid_pin', 'low_light', 'face_required'],
    required: true,
  },
  light_level: {
    type: String,
    enum: ['low', 'normal'],
    required: true,
  },
  image_path: {
    type: String,
    default: null,
  },
  device_id: {
    type: String,
    default: 'unknown',
  },
});

module.exports = mongoose.model('AccessLog', accessLogSchema);

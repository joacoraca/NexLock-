const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  device_id: { type: String, default: 'door_1' },
  result:    { type: String, enum: ['success', 'fail'], required: true },
  // usuario encontrado (null si pin incorrecto)
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
});

module.exports = mongoose.model('Log', schema);

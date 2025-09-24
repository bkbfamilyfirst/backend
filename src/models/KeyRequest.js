const mongoose = require('mongoose');

const keyRequestSchema = new mongoose.Schema({
  fromParent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  toRetailer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // optional; can be assigned later
  message: { type: String },
  status: { type: String, enum: ['pending', 'approved', 'denied'], default: 'pending' },
  responseMessage: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

keyRequestSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('KeyRequest', keyRequestSchema);

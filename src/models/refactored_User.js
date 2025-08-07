const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String },
    firstName: { type: String },
    lastName: { type: String },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    password: { type: String, required: true },
    role: {
        type: String,
        enum: ['admin', 'nd', 'ss', 'db', 'retailer', 'parent'],
        required: true,
    },
    // Only for parent role
    deviceImei: {
        type: String,
        unique: true,
        sparse: true
    },
    assignedKey: {
        type: String,
        unique: true,
        sparse: true
    },
    // Key tracking
    // Only for admin
    totalGenerated: { type: Number, default: 0 },
    // For all except admin and parent
    transferredKeys: { type: Number, default: 0 },
    receivedKeys: { type: Number, default: 0 },
    // Hierarchy
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    // Optional fields for business info
    companyName: { type: String },
    address: { type: String },
    status: {
        type: String,
        enum: ['active', 'inactive', 'blocked'],
        default: 'active',
    },
    bio: { type: String },
    lastLogin: { type: Date, default: Date.now },
    notes: { type: String },
    refreshTokens: [{ type: String }],
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
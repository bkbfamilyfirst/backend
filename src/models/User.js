const mongoose = require('mongoose');


const userSchema = new mongoose.Schema({
    // General fields
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
    // Parent-specific fields (from Parent model)
    deviceImei: {
        type: String,
        unique: true,
        sparse: true // Only for parents
    },
    assignedKey: {
        type: String,
        unique: true,
        sparse: true // Only for parents
    },
    // For all users
    assignedKeys: { type: Number, default: 0 },
    usedKeys: { type: Number, default: 0 },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
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

const User = mongoose.model('User', userSchema);

module.exports = User;
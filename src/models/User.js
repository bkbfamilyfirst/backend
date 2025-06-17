const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    // Keep 'name' for backward compatibility or general use (e.g., full name).
    // It can be constructed from firstName and lastName, or vice-versa, in the controller.
    name: {
        type: String,
    },
    firstName: { // NEW FIELD: To directly match frontend's 'firstName' input
        type: String,
    },
    lastName: {  // NEW FIELD: To directly match frontend's 'lastName' input
        type: String,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    phone: {
        type: String,
        required: true,
    },
    password: {
        type: String,
        required: true,
    },
    role: {
        type: String,
        enum: ['admin', 'nd', 'ss', 'db', 'retailer', 'parent'],
        required: true,
    },
    assignedKeys: {
        type: Number,
        default: 0,
    },
    usedKeys: {
        type: Number,
        default: 0,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    companyName: {
        type: String,
    },
    address: { // NEW FIELD: To directly match frontend's 'address' input (replaces 'location' if that was intended for full address)
        type: String,
    },
    // If 'location' was intended for a different, less specific purpose (e.g., city/state), you can keep it as well.
    // Otherwise, 'address' will be used for the full address.

    status: {
        type: String,
        enum: ['active', 'inactive', 'blocked'],
        default: 'active',
    },
    bio: { // Already present and matches frontend's 'bio'
        type: String,
    },
    lastLogin: {
        type: Date,
        default: Date.now,
    },
    notes: {
        type: String,
    },
    refreshTokens: [{
        type: String,
    }],
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

module.exports = User;
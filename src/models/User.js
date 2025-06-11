const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
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
    location: {
        type: String,
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'blocked'],
        default: 'active',
    },
    bio: {
        type: String,
    },
    lastLogin: {
        type: Date,
        default: Date.now,
    },
    notes: {
        type: String,
    },
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

module.exports = User; 
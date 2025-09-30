const mongoose = require('mongoose');

const keySchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true,
    },
    isAssigned: {
        type: Boolean,
        default: false,
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Child', // Reference to the Child model
    },
    currentOwner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Reference to the User model (any role: admin, nd, ss, db, retailer, parent)
        required: true,
    },
    generatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    assignedAt: {
        type: Date,
    },
    validUntil: {
        type: Date,
        required: true,
    },
}, { timestamps: true });

// Indexes to support activation queries and lookups
// Keys assigned to a child, query by assignedTo + assignedAt
keySchema.index({ assignedTo: 1, assignedAt: -1 });
// Keys currently held by a user (parent) and assignment state
keySchema.index({ currentOwner: 1, isAssigned: 1 });
// Query active keys by expiry
keySchema.index({ validUntil: 1 });
// Optional: index for createdAt for oldest-first selection
keySchema.index({ createdAt: 1 });

const Key = mongoose.model('Key', keySchema);

module.exports = Key;
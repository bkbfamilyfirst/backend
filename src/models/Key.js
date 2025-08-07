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
        ref: 'User', // Reference to the User model (parent role)
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

const Key = mongoose.model('Key', keySchema);

module.exports = Key;
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
        ref: 'Parent', // Reference to the Parent model
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
    },
}, { timestamps: true });

const Key = mongoose.model('Key', keySchema);

module.exports = Key; 
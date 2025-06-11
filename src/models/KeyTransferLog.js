const mongoose = require('mongoose');

const keyTransferLogSchema = new mongoose.Schema({
    fromUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    toUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    count: {
        type: Number,
        required: true,
    },
    date: {
        type: Date,
        default: Date.now,
    },
    status: {
        type: String,
        enum: ['completed', 'pending', 'failed', 'received', 'verified', 'confirmed', 'delivered', 'sent'],
        default: 'completed',
    },
    type: {
        type: String,
        enum: ['bulk', 'regular', 'receive', 'distribute', 'activate'],
        default: 'regular',
    },
    notes: {
        type: String,
    },
    reference: {
        type: String,
    },
}, { timestamps: true });

const KeyTransferLog = mongoose.model('KeyTransferLog', keyTransferLogSchema);

module.exports = KeyTransferLog; 
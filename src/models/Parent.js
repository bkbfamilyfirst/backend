const mongoose = require('mongoose');

const parentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    phone: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    deviceImei: {
        type: String,
        required: true,
        unique: true,
    },
    assignedKey: {
        type: String,
        required: true,
        unique: true,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // The Retailer who created this parent
        required: true,
    },
}, { timestamps: true });

const Parent = mongoose.model('Parent', parentSchema);

module.exports = Parent; 
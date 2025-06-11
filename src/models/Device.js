const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
    imei: {
        type: String,
        required: true,
        unique: true,
    },
    parent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Parent',
        required: true,
    },
    isLocked: {
        type: Boolean,
        default: false,
    },
    lockMessage: {
        type: String,
    },
    currentLocation: {
        latitude: Number,
        longitude: Number,
    },
    lastLocationSync: {
        type: Date,
    },
    simNumber: {
        type: String,
    },
    fcmToken: {
        type: String,
    },
    deviceModel: {
        type: String,
    },
    osVersion: {
        type: String,
    },
    battery: {
        type: Number,
    },
    network: {
        type: String,
    },
    installedApps: [
        { type: String }
    ], // Array of app package names
    lockedApps: [
        { type: String }
    ], // Array of locked app package names
    hiddenApps: [
        { type: String }
    ], // Array of hidden app package names
    dataEnabled: {
        type: Boolean,
        default: true,
    },
    locationEnabled: {
        type: Boolean,
        default: true,
    },
    reminderLocks: [
        {
            type: {
                type: String, // daily | weekly
                enum: ['daily', 'weekly'],
            },
            time: String, // HH:MM format
        }
    ],
}, { timestamps: true });

const Device = mongoose.model('Device', deviceSchema);

module.exports = Device; 
const mongoose = require('mongoose');

const childSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    age: {
        type: Number,
        required: true
    },
    deviceImei: {
        type: String,
        unique: true
    },
    parentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, { timestamps: true });

const Child = mongoose.model('Child', childSchema);

module.exports = Child;
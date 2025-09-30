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
    parentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Parent is now User with role 'parent'
        required: true
    },
    assignedKey: {
        type: String,
        unique: true,
        sparse: true // Only for children
    }

}, { timestamps: true });

const Child = mongoose.model('Child', childSchema);

module.exports = Child;
const Key = require('../models/Key');
const User = require('../models/User'); // Parent is now User with role 'parent'

// GET /key/info
exports.getKeyInfo = async (req, res) => {
    try {
        const { key, parentId } = req.query;

        if (!key && !parentId) {
            return res.status(400).json({ message: 'Please provide key or parentId.' });
        }

        let query = {};
        if (key) query.key = key;
        if (parentId) query.currentOwner = parentId;

        const keyInfo = await Key.find(query).populate('assignedTo', 'name'); 

        if (!keyInfo) {
            return res.status(404).json({ message: 'Key not found.' });
        }

        const today = new Date();
        const daysRemaining = Math.ceil((keyInfo.validUntil - today) / (1000 * 60 * 60 * 24));

        const response = {
            key: keyInfo.key,
            validUntil: keyInfo.validUntil.toISOString(),
            daysRemaining: daysRemaining >= 0 ? daysRemaining : 0,
            isAssigned: keyInfo.isAssigned,
            assignedTo: keyInfo.assignedTo ? {
                id: keyInfo.assignedTo._id,
                name: keyInfo.assignedTo.name
            } : null
        };

        res.status(200).json(response);
    } catch (error) {
        console.error('Error getting key info:', error);
        res.status(500).json({ message: 'Server error during key info retrieval.' });
    }
};
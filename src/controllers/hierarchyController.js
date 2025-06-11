const User = require('../models/User');
const bcrypt = require('bcryptjs');
const KeyTransferLog = require('../models/KeyTransferLog');

// POST /nd/create
exports.createNd = async (req, res) => {
    const { name, email, phone, password, assignedKeys, location, status } = req.body;

    if (!name || !email || !phone || !password || assignedKeys === undefined) {
        return res.status(400).json({ message: 'All fields are required.' });
    }

    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({ message: 'User with this email already exists.' });
        }

        const creator = req.user;
        if (creator.role === 'admin' && assignedKeys > 0) {
            // For admin creating ND, assignedKeys directly contribute to ND's keys
            // Admin doesn't have a key pool in this simplified model, but can assign.
        } else if (creator.assignedKeys - creator.usedKeys < assignedKeys) {
            return res.status(400).json({ message: 'Insufficient keys to assign.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10); // Hash password

        const newNd = new User({
            name,
            email,
            phone,
            password: hashedPassword,
            role: 'nd',
            assignedKeys,
            createdBy: req.user._id,
            location: location || '',
            status: status || 'active',
        });

        await newNd.save();

        if (creator.role !== 'admin') {
            creator.usedKeys += assignedKeys;
            await creator.save();
        }

        res.status(201).json({ message: 'ND created successfully', user: newNd });
    } catch (error) {
        console.error('Error creating ND:', error);
        res.status(500).json({ message: 'Server error during ND creation.' });
    }
};

// PATCH /nd/:id (update location/status for ND)
exports.updateNd = async (req, res) => {
    const { id } = req.params;
    const { location, status } = req.body;
    try {
        const nd = await User.findOne({ _id: id, role: 'nd' });
        if (!nd) {
            return res.status(404).json({ message: 'ND not found.' });
        }
        if (location !== undefined) nd.location = location;
        if (status !== undefined) nd.status = status;
        await nd.save();
        res.status(200).json({ message: 'ND updated successfully.', user: nd });
    } catch (error) {
        console.error('Error updating ND:', error);
        res.status(500).json({ message: 'Server error during ND update.' });
    }
};

// POST /ss/create
exports.createSs = async (req, res) => {
    const { name, email, phone, password, assignedKeys } = req.body;

    if (!name || !email || !phone || !password || assignedKeys === undefined) {
        return res.status(400).json({ message: 'All fields are required.' });
    }

    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({ message: 'User with this email already exists.' });
        }

        const creator = req.user;
        // Ensure the creator is an ND trying to create an SS
        if (creator.role !== 'nd') {
            return res.status(403).json({ message: 'Access denied: Only NDs can create SS users.' });
        }
        if (creator.assignedKeys - creator.usedKeys < assignedKeys) {
            return res.status(400).json({ message: 'Insufficient keys to assign.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10); // Hash password

        const newSs = new User({
            name,
            email,
            phone,
            password: hashedPassword,
            role: 'ss',
            assignedKeys,
            createdBy: req.user._id,
        });

        await newSs.save();

        creator.usedKeys += assignedKeys;
        await creator.save();

        res.status(201).json({ message: 'SS created successfully', user: newSs });
    } catch (error) {
        console.error('Error creating SS:', error);
        res.status(500).json({ message: 'Server error during SS creation.' });
    }
};

// POST /db/create
exports.createDb = async (req, res) => {
    const { name, email, phone, password, assignedKeys } = req.body;

    if (!name || !email || !phone || !password || assignedKeys === undefined) {
        return res.status(400).json({ message: 'All fields are required.' });
    }

    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({ message: 'User with this email already exists.' });
        }

        const creator = req.user;
        // Ensure the creator is an SS trying to create a DB
        if (creator.role !== 'ss') {
            return res.status(403).json({ message: 'Access denied: Only SS can create DB users.' });
        }
        if (creator.assignedKeys - creator.usedKeys < assignedKeys) {
            return res.status(400).json({ message: 'Insufficient keys to assign.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10); // Hash password

        const newDb = new User({
            name,
            email,
            phone,
            password: hashedPassword,
            role: 'db',
            assignedKeys,
            createdBy: req.user._id,
        });

        await newDb.save();

        creator.usedKeys += assignedKeys;
        await creator.save();

        res.status(201).json({ message: 'DB created successfully', user: newDb });
    } catch (error) {
        console.error('Error creating DB:', error);
        res.status(500).json({ message: 'Server error during DB creation.' });
    }
};

// POST /retailer/create
exports.createRetailer = async (req, res) => {
    const { name, email, phone, password, assignedKeys } = req.body;

    if (!name || !email || !phone || !password || assignedKeys === undefined) {
        return res.status(400).json({ message: 'All fields are required.' });
    }

    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({ message: 'User with this email already exists.' });
        }

        const creator = req.user;
        // Ensure the creator is a DB trying to create a Retailer
        if (creator.role !== 'db') {
            return res.status(403).json({ message: 'Access denied: Only DBs can create Retailer users.' });
        }
        if (creator.assignedKeys - creator.usedKeys < assignedKeys) {
            return res.status(400).json({ message: 'Insufficient keys to assign.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10); // Hash password

        const newRetailer = new User({
            name,
            email,
            phone,
            password: hashedPassword,
            role: 'retailer',
            assignedKeys,
            createdBy: req.user._id,
        });

        await newRetailer.save();

        creator.usedKeys += assignedKeys;
        await creator.save();

        res.status(201).json({ message: 'Retailer created successfully', user: newRetailer });
    } catch (error) {
        console.error('Error creating Retailer:', error);
        res.status(500).json({ message: 'Server error during Retailer creation.' });
    }
};

// POST /keys/transfer
exports.transferKeys = async (req, res) => {
    const { toUserId, count, status, type, notes } = req.body;
    if (!toUserId || count === undefined || count <= 0) {
        return res.status(400).json({ message: 'Invalid request parameters.' });
    }

    try {
        const fromUser = req.user;
        const toUser = await User.findById(toUserId);

        if (!toUser) {
            return res.status(404).json({ message: 'Recipient user not found.' });
        }

        // Enforce direct subordinate transfer
        if (toUser.createdBy && toUser.createdBy.toString() !== fromUser._id.toString()) {
            return res.status(403).json({ message: 'Access denied: Cannot transfer keys to a non-direct subordinate.' });
        }

        // Additionally, check roles for valid transfers (e.g., Admin -> ND, ND -> SS, etc.)
        const validTransfer = {
            'admin': 'nd',
            'nd': 'ss',
            'ss': 'db',
            'db': 'retailer',
            'retailer': 'parent' // Retailers assign direct activation keys, not distribution keys to a 'parent' user
        };
        if (toUser.role !== validTransfer[fromUser.role]) {
            return res.status(403).json({ message: `Access denied: ${fromUser.role} cannot transfer keys to ${toUser.role} directly.` });
        }
        // Special case for retailer transferring keys: they assign activation keys, not more assignedKeys. 
        // The /parent/create endpoint handles this, so this check will prevent retailer from using this endpoint.
        if (fromUser.role === 'retailer') {
            return res.status(403).json({ message: 'Retailers assign individual activation keys via /parent/create, not batches via this endpoint.' });
        }

        if (fromUser.assignedKeys - fromUser.usedKeys < count) {
            return res.status(400).json({ message: 'Insufficient keys to transfer.' });
        }

        fromUser.usedKeys += count; // Mark as used by transferer
        toUser.assignedKeys += count; // Add to recipient's total

        await fromUser.save();
        await toUser.save();

        // Log the transfer event
        await KeyTransferLog.create({
            fromUser: fromUser._id,
            toUser: toUser._id,
            count,
            date: new Date(),
            status: status || 'completed',
            type: type || 'regular',
            notes: notes || '',
        });

        res.status(200).json({ message: `Successfully transferred ${count} keys to ${toUser.name}.` });
    } catch (error) {
        console.error('Error transferring keys:', error);
        res.status(500).json({ message: 'Server error during key transfer.' });
    }
};

// GET /keys/status
exports.getKeysStatus = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // Find users to whom keys have been transferred by this user
        const transferredToUsers = await User.find({ createdBy: userId, assignedKeys: { $gt: 0 } });
        const transferredTo = transferredToUsers.map(u => ({
            id: u._id,
            name: u.name,
            count: u.assignedKeys,
        }));

        res.status(200).json({
            totalKeys: user.assignedKeys,
            used: user.usedKeys,
            remaining: user.assignedKeys - user.usedKeys,
            transferredTo: transferredTo,
        });
    } catch (error) {
        console.error('Error getting key status:', error);
        res.status(500).json({ message: 'Server error during key status retrieval.' });
    }
}; 
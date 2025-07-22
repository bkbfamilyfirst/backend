const Key = require('../models/Key');
const User = require('../models/User');
const KeyTransferLog = require('../models/KeyTransferLog');
const { generateCsv } = require('../utils/csv');
const bcrypt = require('bcrypt');
const { validationResult } = require('express-validator');

// Helper to generate a unique hexadecimal key
const generateHexKey = (length) => {
    let result = '';
    const characters = '0123456789abcdef';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
};

// Helper function to build hierarchy tree
async function buildHierarchyTree(users, parents) {
    const userMap = new Map(users.map(u => [u._id.toString(), { ...u.toObject(), children: [] }]));
    const parentMap = new Map(parents.map(p => [p._id.toString(), { ...p.toObject(), children: [] }]));

    // Add parents to user map for easier lookup by their ID for linking
    parents.forEach(p => userMap.set(p._id.toString(), { ...p.toObject(), children: [] }));

    const hierarchy = [];

    // Populate children for users
    for (const user of users) {
        if (user.createdBy && userMap.has(user.createdBy.toString())) {
            userMap.get(user.createdBy.toString()).children.push(userMap.get(user._id.toString()));
        } else if (!user.createdBy && user.role === 'admin') { // Top-level admin
            hierarchy.push(userMap.get(user._id.toString()));
        }
    }

    // Link parents to retailers
    for (const parent of parents) {
        if (parent.createdBy && userMap.has(parent.createdBy.toString())) {
            userMap.get(parent.createdBy.toString()).children.push(parentMap.get(parent._id.toString()));
        }
    }

    // Ensure the tree structure reflects Admin > ND > SS > DB > Retailer > Parent
    // This might require sorting or a more explicit recursive build for complex scenarios
    // For now, assuming direct createdBy linking is sufficient for a basic tree

    return hierarchy;
}

// POST /admin/generate-keys
exports.generateKeys = async (req, res) => {
    const { count, keyLength } = req.body;

    if (count === undefined || count <= 0 || keyLength === undefined || keyLength <= 0) {
        return res.status(400).json({ message: 'Count and keyLength must be positive numbers.' });
    }

    try {
        const generatedKeys = [];
        for (let i = 0; i < count; i++) {
            let uniqueKey;
            let isUnique = false;
            while (!isUnique) {
                uniqueKey = generateHexKey(keyLength);
                const existingKey = await Key.findOne({ key: uniqueKey });
                if (!existingKey) {
                    isUnique = true;
                }
            }
            const newKey = new Key({
                key: uniqueKey,
                generatedBy: req.user._id,
                validUntil: new Date(new Date().setFullYear(new Date().getFullYear() + 2)), // 2 years from now
            });
            await newKey.save();
            generatedKeys.push(newKey);
        }

        res.status(201).json({ message: `${count} keys generated successfully.`, keys: generatedKeys.map(k => k.key) });
    } catch (error) {
        console.error('Error generating keys:', error);
        res.status(500).json({ message: 'Server error during key generation.' });
    }
};

// GET /admin/summary
exports.getSummary = async (req, res) => {
    try {
        // User counts by role (existing logic)
        const userCounts = await User.aggregate([
            { $group: { _id: '$role', count: { $sum: 1 } } }
        ]);
        const userSummary = userCounts.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
        }, {});

        // --- Total Keys section ---
        const totalKeys = await Key.countDocuments();
        const activeKeys = await Key.countDocuments({ isAssigned: true });
        const inactiveKeys = totalKeys - activeKeys;

        // Calculate monthly growth for Total Keys
        const now = new Date();
        const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

        const keysCurrentMonth = await Key.countDocuments({
            createdAt: { $gte: startOfCurrentMonth, $lte: now }
        });

        const keysPreviousMonth = await Key.countDocuments({
            createdAt: { $gte: startOfPreviousMonth, $lt: startOfCurrentMonth }
        });

        let monthlyGrowth = 0;
        if (keysPreviousMonth > 0) {
            monthlyGrowth = ((keysCurrentMonth - keysPreviousMonth) / keysPreviousMonth) * 100;
        }

        // --- Total Activations section ---
        const totalActivations = await Parent.countDocuments();

        // Expiring Soon (30 days)
        const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const expiringSoon = await Key.countDocuments({ validUntil: { $lte: in30Days, $gte: now }, isAssigned: true });
        const validActivations = await Key.countDocuments({ validUntil: { $gt: in30Days }, isAssigned: true });

        res.status(200).json({
            ...userSummary,
            totalKeys: {
                total: totalKeys,
                active: activeKeys,
                inactive: inactiveKeys,
                monthlyGrowth: parseFloat(monthlyGrowth.toFixed(1))
            },
            totalActivations: {
                total: totalActivations,
                expiringSoon: expiringSoon,
                valid: validActivations,
                expiring: expiringSoon // Assuming 'expiring' is the same as 'expiringSoon' from the screenshot
            }
        });
    } catch (error) {
        console.error('Error getting admin summary:', error);
        res.status(500).json({ message: 'Server error during summary retrieval.' });
    }
};

// GET /users/hierarchy
exports.getUserHierarchy = async (req, res) => {
    try {
        const users = await User.find({}).sort({ role: 1 }); // Sort by role for predictable order
        const parents = await Parent.find({});

        const hierarchyTree = await buildHierarchyTree(users, parents);

        res.status(200).json(hierarchyTree);
    } catch (error) {
        console.error('Error getting user hierarchy:', error);
        res.status(500).json({ message: 'Server error during hierarchy retrieval.' });
    }
};

// GET /admin/key-activation-stats
exports.getKeyActivationStats = async (req, res) => {
    try {
        // Total Keys
        const totalKeys = await Key.countDocuments();
        const activeKeys = await Key.countDocuments({ isAssigned: true });
        const inactiveKeys = totalKeys - activeKeys;

        // Total Activations (parents with assigned keys)
        const totalActivations = await Parent.countDocuments();
        // Expiring soon (within 30 days)
        const now = new Date();
        const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const expiringSoon = await Key.countDocuments({ validUntil: { $lte: in30Days, $gte: now }, isAssigned: true });
        const valid = await Key.countDocuments({ validUntil: { $gt: in30Days }, isAssigned: true });

        res.status(200).json({
            totalKeys,
            active: activeKeys,
            inactive: inactiveKeys,
            totalActivations,
            expiringSoon,
            valid
        });
    } catch (error) {
        console.error('Error getting key/activation stats:', error);
        res.status(500).json({ message: 'Server error during key/activation stats retrieval.' });
    }
};

// GET /admin/key-inventory
exports.getKeyInventory = async (req, res) => {
    try {
        const totalGenerated = await Key.countDocuments();
        const transferred = await Key.countDocuments({ isAssigned: true });
        const remaining = totalGenerated - transferred;
        const transferProgress = totalGenerated > 0 ? (transferred / totalGenerated) * 100 : 0;

        res.status(200).json({
            totalGenerated,
            transferred,
            remaining,
            transferProgress: Math.round(transferProgress * 10) / 10 // one decimal place
        });
    } catch (error) {
        console.error('Error getting key inventory:', error);
        res.status(500).json({ message: 'Server error during key inventory retrieval.' });
    }
};

// GET /admin/key-validity-timeline
exports.getKeyValidityTimeline = async (req, res) => {
    try {
        const now = new Date();
        const in6Months = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate());
        const in12Months = new Date(now.getFullYear(), now.getMonth() + 12, now.getDate());
        const in18Months = new Date(now.getFullYear(), now.getMonth() + 18, now.getDate());
        const in24Months = new Date(now.getFullYear(), now.getMonth() + 24, now.getDate()); // Adjusted to calendar months for precision

        const keys_0_6 = await Key.countDocuments({ validUntil: { $gt: now, $lte: in6Months }, isAssigned: true });
        const keys_6_12 = await Key.countDocuments({ validUntil: { $gt: in6Months, $lte: in12Months }, isAssigned: true });
        const keys_12_18 = await Key.countDocuments({ validUntil: { $gt: in12Months, $lte: in18Months }, isAssigned: true });
        const keys_18_24 = await Key.countDocuments({ validUntil: { $gt: in18Months, $lte: in24Months }, isAssigned: true });

        // Summary statistics
        const validKeys = await Key.countDocuments({ validUntil: { $gt: now }, isAssigned: true });
        const expiringSoon = await Key.countDocuments({ validUntil: { $lte: in6Months, $gte: now }, isAssigned: true });
        
        // Average validity (in months) - improved calculation
        const assignedKeys = await Key.find({ isAssigned: true });
        let avgValidity = 0;
        if (assignedKeys.length > 0) {
            const totalMonths = assignedKeys.reduce((sum, k) => {
                const yearsDiff = k.validUntil.getFullYear() - now.getFullYear();
                const monthsDiff = k.validUntil.getMonth() - now.getMonth();
                const daysDiff = k.validUntil.getDate() - now.getDate();
                let totalMonthsForSingleKey = yearsDiff * 12 + monthsDiff;
                if (daysDiff < 0) { // If the day of the month is less, it hasn't completed that month yet
                    totalMonthsForSingleKey -= 1;
                } else if (daysDiff > 0) {
                    // If days are positive, it means it's X months and Y days, so it should be slightly more than X months
                    // For simplicity, we can add a fraction based on days
                    totalMonthsForSingleKey += (daysDiff / 30); // Approximate fractional month
                }
                return sum + totalMonthsForSingleKey;
            }, 0);
            avgValidity = totalMonths / assignedKeys.length;
        }

        res.status(200).json({
            timeline: {
                '0-6': keys_0_6,
                '6-12': keys_6_12,
                '12-18': keys_12_18,
                '18-24': keys_18_24
            },
            summary: {
                validKeys,
                expiringSoon,
                averageValidity: Math.round(avgValidity * 10) / 10 // one decimal place
            }
        });
    } catch (error) {
        console.error('Error getting key validity timeline:', error);
        res.status(500).json({ message: 'Server error during key validity timeline retrieval.' });
    }
};

// GET /admin/nd-list
exports.getNdList = async (req, res) => {
    try {
        const nds = await User.find({ role: 'nd' }).select('-password');
        const result = nds.map(nd => ({
            id: nd._id,
            name: nd.name,
            email: nd.email,
            phone: nd.phone,
            location: nd.location,
            status: nd.status,
            assignedKeys: nd.assignedKeys,
            usedKeys: nd.usedKeys,
            balance: nd.assignedKeys - nd.usedKeys,
            createdAt: nd.createdAt,
            updatedAt: nd.updatedAt
        }));
        res.status(200).json({ message: 'National Distributors fetched successfully.', nds: result });
    } catch (error) {
        console.error('Error fetching ND list:', error);
        res.status(500).json({ message: 'Server error during ND list retrieval.' });
    }
};

// GET /admin/nd-stats
exports.getNdStats = async (req, res) => {
    try {
        const total = await User.countDocuments({ role: 'nd' });
        const active = await User.countDocuments({ role: 'nd', status: 'active' });
        const inactive = await User.countDocuments({ role: 'nd', status: 'inactive' });
        const blocked = await User.countDocuments({ role: 'nd', status: 'blocked' });
        const keysAssigned = await User.aggregate([
            { $match: { role: 'nd' } },
            { $group: { _id: null, total: { $sum: '$assignedKeys' }, used: { $sum: '$usedKeys' } } }
        ]);
        const totalAssignedKeys = keysAssigned[0]?.total || 0;
        const totalUsedKeys = keysAssigned[0]?.used || 0;
        const balanceKeys = totalAssignedKeys - totalUsedKeys;

        res.status(200).json({
            total,
            active,
            inactive,
            blocked,
            totalAssignedKeys,
            totalUsedKeys,
            balanceKeys
        });
    } catch (error) {
        console.error('Error getting ND stats:', error);
        res.status(500).json({ message: 'Server error during ND stats retrieval.' });
    }
};

// GET /admin/nd-assignments
exports.getNdAssignments = async (req, res) => {
    try {
        // Find recent transfers to NDs (limit 10, most recent first)
        const logs = await KeyTransferLog.find({
            toUser: { $in: (await User.find({ role: 'nd' }).distinct('_id')) }
        })
        .sort({ date: -1 })
        .limit(10)
        .populate('fromUser', 'name email role')
        .populate('toUser', 'name email role');

        const result = logs.map(log => ({
            from: log.fromUser ? { id: log.fromUser._id, name: log.fromUser.name, role: log.fromUser.role } : null,
            to: log.toUser ? { id: log.toUser._id, name: log.toUser.name, role: log.toUser.role } : null,
            count: log.count,
            date: log.date,
        }));
        res.status(200).json({ message: 'ND assignments fetched successfully.', assignments: result });
    } catch (error) {
        console.error('Error fetching ND assignments:', error);
        res.status(500).json({ message: 'Server error during ND assignments retrieval.' });
    }
};

// GET /admin/transfer-stats
exports.getTransferStats = async (req, res) => {
    try {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // Total transfers today
        const transfersToday = await KeyTransferLog.countDocuments({ date: { $gte: startOfToday } });
        // Weekly transfer volume
        const weeklyTransfers = await KeyTransferLog.countDocuments({ date: { $gte: startOfWeek } });
        // Average daily transfers (this month)
        const daysThisMonth = (now - startOfMonth) / (1000 * 60 * 60 * 24) + 1;
        const monthlyTransfers = await KeyTransferLog.countDocuments({ date: { $gte: startOfMonth } });
        const avgDailyTransfers = Math.round(monthlyTransfers / daysThisMonth);
        // Active Distributors
        const activeNDs = await User.countDocuments({ role: 'nd', status: 'active' });

        res.status(200).json({
            transfersToday,
            weeklyTransfers,
            avgDailyTransfers,
            activeNDs
        });
    } catch (error) {
        console.error('Error fetching transfer stats:', error);
        res.status(500).json({ message: 'Server error during transfer stats retrieval.' });
    }
};

// GET /admin/key-transfer-logs
exports.getKeyTransferLogs = async (req, res) => {
    try {
        const { startDate, endDate, distributorId, status, type, search, page = 1, limit = 10 } = req.query;
        const filter = {};
        if (startDate || endDate) {
            filter.date = {};
            if (startDate) filter.date.$gte = new Date(startDate);
            if (endDate) filter.date.$lte = new Date(endDate);
        }
        if (distributorId) filter.toUser = distributorId;
        if (status) filter.status = status;
        if (type) filter.type = type;
        if (search) {
            // Search by notes or user names (requires population)
            filter.$or = [
                { notes: { $regex: search, $options: 'i' } }
            ];
        }
        const skip = (parseInt(page) - 1) * parseInt(limit);
        let query = KeyTransferLog.find(filter)
            .sort({ date: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('fromUser', 'name email role')
            .populate('toUser', 'name email role');
        // If searching by user name, do a post-filter
        let logs = await query.exec();
        if (search) {
            logs = logs.filter(log =>
                (log.fromUser && log.fromUser.name && log.fromUser.name.toLowerCase().includes(search.toLowerCase())) ||
                (log.toUser && log.toUser.name && log.toUser.name.toLowerCase().includes(search.toLowerCase())) ||
                (log.notes && log.notes.toLowerCase().includes(search.toLowerCase()))
            );
        }
        const total = await KeyTransferLog.countDocuments(filter);
        const result = logs.map((log, idx) => ({
            transferId: log._id,
            timestamp: log.date,
            from: log.fromUser ? { id: log.fromUser._id, name: log.fromUser.name, role: log.fromUser.role } : null,
            to: log.toUser ? { id: log.toUser._id, name: log.toUser.name, role: log.toUser.role } : null,
            count: log.count,
            status: log.status,
            type: log.type,
            notes: log.notes,
        }));
        res.status(200).json({
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            logs: result
        });
    } catch (error) {
        console.error('Error fetching key transfer logs:', error);
        res.status(500).json({ message: 'Server error during key transfer logs retrieval.' });
    }
};

// GET /admin/key-transfer-logs/export
exports.exportKeyTransferLogs = async (req, res) => {
    try {
        const { startDate, endDate, distributorId, status, type, search } = req.query;
        const filter = {};
        if (startDate || endDate) {
            filter.date = {};
            if (startDate) filter.date.$gte = new Date(startDate);
            if (endDate) filter.date.$lte = new Date(endDate);
        }
        if (distributorId) filter.toUser = distributorId;
        if (status) filter.status = status;
        if (type) filter.type = type;
        if (search) {
            filter.$or = [
                { notes: { $regex: search, $options: 'i' } }
            ];
        }
        let query = KeyTransferLog.find(filter)
            .sort({ date: -1 })
            .populate('fromUser', 'name email role')
            .populate('toUser', 'name email role');
        let logs = await query.exec();
        if (search) {
            logs = logs.filter(log =>
                (log.fromUser && log.fromUser.name && log.fromUser.name.toLowerCase().includes(search.toLowerCase())) ||
                (log.toUser && log.toUser.name && log.toUser.name.toLowerCase().includes(search.toLowerCase())) ||
                (log.notes && log.notes.toLowerCase().includes(search.toLowerCase()))
            );
        }
        // Prepare data for CSV
        const csvData = logs.map(log => ({
            Date: log.date ? log.date.toISOString().split('T')[0] : '',
            Type: log.status === 'completed' && log.fromUser && log.fromUser.role === 'admin' ? 'Received' : (log.status === 'completed' ? 'Sent' : log.status),
            Quantity: log.count,
            From: log.fromUser ? log.fromUser.name : '',
            To: log.toUser ? log.toUser.name : '',
            Status: log.status,
            TransferType: log.type,
            Notes: log.notes || '',
            Balance: '' // Optionally calculate running balance if needed
        }));
        const fields = ['Date', 'Type', 'Quantity', 'From', 'To', 'Status', 'TransferType', 'Notes', 'Balance'];
        const csv = generateCsv(csvData, fields);
        res.header('Content-Type', 'text/csv');
        res.attachment('key-transfer-logs.csv');
        return res.send(csv);
    } catch (error) {
        console.error('Error exporting key transfer logs:', error);
        res.status(500).json({ message: 'Server error during export.' });
    }
};

// POST /admin/transfer-keys-to-nd
exports.transferKeysToNd = async (req, res) => {
    try {
        const { ndId, keysToTransfer } = req.body;

        if (!ndId || !keysToTransfer || keysToTransfer <= 0) {
            return res.status(400).json({ message: 'Please provide a valid National Distributor ID and a positive number of keys to transfer.' });
        }

        const ndUser = await User.findOne({ _id: ndId, role: 'nd' });
        if (!ndUser) {
            return res.status(404).json({ message: 'National Distributor not found.' });
        }

        // Check available unassigned keys in the global pool
        const availableUnassignedKeysCount = await Key.countDocuments({ isAssigned: false });
        if (keysToTransfer > availableUnassignedKeysCount) {
            return res.status(400).json({ message: `Cannot transfer ${keysToTransfer} keys. Only ${availableUnassignedKeysCount} unassigned keys available in the system.` });
        }

        // Find and update a batch of unassigned keys
        // Note: This approach updates keys in a non-deterministic order. If specific keys need to be tracked, the Key model would need an 'assignedTo' field.
        const keysToMarkAssigned = await Key.find({ isAssigned: false }).limit(keysToTransfer);
        const keyIdsToUpdate = keysToMarkAssigned.map(key => key._id);

        await Key.updateMany(
            { _id: { $in: keyIdsToUpdate } },
            { $set: { isAssigned: true } }
        );

        // Update the ND's assignedKeys
        ndUser.assignedKeys += keysToTransfer;
        await ndUser.save();

        // Create a KeyTransferLog entry
        const newKeyTransferLog = new KeyTransferLog({
            fromUser: req.user._id, // Admin is the sender
            toUser: ndId,
            count: keysToTransfer,
            status: 'completed',
            type: 'bulk',
            notes: `Bulk transferred ${keysToTransfer} keys from Admin to ND: ${ndUser.name}`
        });
        await newKeyTransferLog.save();

        res.status(200).json({ message: 'Keys transferred to National Distributor successfully.' });

    } catch (error) {
        console.error('Error transferring keys to ND:', error);
        res.status(500).json({ message: 'Server error during key transfer.' });
    }
};

// POST /admin/nd
exports.addNd = async (req, res) => {
    try {
        const { name, email, phone, location, status, assignedKeys, companyName, notes } = req.body;
        const adminUserId = req.user._id;

        if (!name || !email || !phone || !location || !companyName) {
            return res.status(400).json({ message: 'Please provide company name, contact person name, email, phone, and location.' });
        }

        // Check if email already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({ message: 'User with this email already exists.' });
        }

        // Fetch available unassigned keys in the global pool
        const availableUnassignedKeysCount = await Key.countDocuments({ isAssigned: false });
        const keysToAssign = assignedKeys || 0;

        if (keysToAssign > availableUnassignedKeysCount) {
            return res.status(400).json({ message: `Cannot assign ${keysToAssign} keys. Only ${availableUnassignedKeysCount} unassigned keys available in the system.` });
        }

        // Generate a default password (e.g., first part of email + 123, or a random string)
        const defaultPassword = email.split('@')[0] + '123';
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);

        const newNd = new User({
            name,
            email,
            phone,
            password: hashedPassword,
            role: 'nd',
            createdBy: adminUserId,
            location,
            companyName,
            status: status || 'active',
            assignedKeys: keysToAssign,
            usedKeys: 0,
            notes: notes || '',
        });

        await newNd.save();

        // Mark keys as assigned in the Key model
        const keysToMarkAssigned = await Key.find({ isAssigned: false }).limit(keysToAssign);
        await Key.updateMany(
            { _id: { $in: keysToMarkAssigned.map(key => key._id) } },
            { $set: { isAssigned: true } }
        );

        // Create a KeyTransferLog entry for the bulk transfer from Admin to ND
        if (keysToAssign > 0) {
            const newKeyTransferLog = new KeyTransferLog({
                fromUser: adminUserId,
                toUser: newNd._id,
                count: keysToAssign,
                status: 'completed',
                type: 'bulk',
                notes: `Bulk assigned ${keysToAssign} keys during ND creation`
            });
            await newKeyTransferLog.save();
        }

        res.status(201).json({ message: 'National Distributor created successfully.', nd: { id: newNd._id, name: newNd.name, email: newNd.email, defaultPassword, companyName: newNd.companyName, notes: newNd.notes } });

    } catch (error) {
        console.error('Error adding new ND for Admin:', error);
        res.status(500).json({ message: 'Server error during ND creation.' });
    }
};

// PATCH /admin/nd/:ndId
exports.editNd = async (req, res) => {
    try {
        const { ndId } = req.params;
        const { name, email, phone, location, status, companyName, notes } = req.body;

        const ndUser = await User.findById(ndId);
        if (!ndUser || ndUser.role !== 'nd') {
            return res.status(404).json({ message: 'National Distributor not found.' });
        }

        // Update fields if provided
        if (name) ndUser.name = name;
        if (email) {
            const existingUser = await User.findOne({ email, _id: { $ne: ndId } });
            if (existingUser) {
                return res.status(409).json({ message: 'User with this email already exists.' });
            }
            ndUser.email = email;
        }
        if (phone) ndUser.phone = phone;
        if (location) ndUser.location = location;
        if (status) ndUser.status = status;
        if (companyName) ndUser.companyName = companyName;
        if (notes) ndUser.notes = notes;

        await ndUser.save();

        res.status(200).json({ message: 'National Distributor updated successfully.', nd: ndUser });

    } catch (error) {
        console.error('Error updating ND:', error);
        res.status(500).json({ message: 'Server error during ND update.' });
    }
};

// PATCH /admin/nd/deactivate/:ndId
exports.deactivateNd = async (req, res) => {
    try {
        const { ndId } = req.params;
        const ndUser = await User.findById(ndId);

        if (!ndUser || ndUser.role !== 'nd') {
            return res.status(404).json({ message: 'National Distributor not found.' });
        }

        ndUser.status = 'inactive';
        await ndUser.save();

        res.status(200).json({ message: 'National Distributor deactivated successfully.', nd: ndUser });
    } catch (error) {
        console.error('Error deactivating ND:', error);
        res.status(500).json({ message: 'Server error during ND deactivation.' });
    }
};

// PATCH /admin/nd/block/:ndId
exports.blockNd = async (req, res) => {
    try {
        const { ndId } = req.params;
        const ndUser = await User.findById(ndId);

        if (!ndUser || ndUser.role !== 'nd') {
            return res.status(404).json({ message: 'National Distributor not found.' });
        }

        ndUser.status = 'blocked';
        await ndUser.save();

        res.status(200).json({ message: 'National Distributor blocked successfully.', nd: ndUser });
    } catch (error) {
        console.error('Error blocking ND:', error);
        res.status(500).json({ message: 'Server error during ND blocking.' });
    }
};

// DELETE /admin/nd/:ndId
exports.deleteNd = async (req, res) => {
    try {
        const { ndId } = req.params;
        const ndUser = await User.findById(ndId);

        if (!ndUser || ndUser.role !== 'nd') {
            return res.status(404).json({ message: 'National Distributor not found.' });
        }

        // Optionally, reassign keys or handle them as needed before deletion
        // For now, keys assigned to this ND will become unassigned
        await Key.updateMany({ assignedTo: ndId }, { $set: { isAssigned: false, assignedTo: null } });
        await ndUser.deleteOne();

        res.status(200).json({ message: 'National Distributor deleted successfully.' });
    } catch (error) {
        console.error('Error deleting ND:', error);
        res.status(500).json({ message: 'Server error during ND deletion.' });
    }
};

// GET /admin/profile
exports.getAdminProfile = async (req, res) => {
    try {
        // Assuming req.user contains the authenticated admin user's details (e.g., from auth middleware)
        const adminUser = await User.findById(req.user._id).select('-password -refreshTokens -__v');

        if (!adminUser || adminUser.role !== 'admin') {
            return res.status(404).json({ message: 'Admin profile not found.' });
        }

        // Prepare data to match the frontend's PersonalInformation formData and AdminProfile interface
        const profileData = {
            _id: adminUser._id,
            firstName: adminUser.firstName || (adminUser.name ? adminUser.name.split(' ')[0] : ''),
            lastName: adminUser.lastName || (adminUser.name ? adminUser.name.split(' ').slice(1).join(' ') : ''),
            email: adminUser.email,
            phone: adminUser.phone,
            address: adminUser.address || '', // Map 'address' directly
            bio: adminUser.bio || '',
            role: adminUser.role,
            assignedKeys: adminUser.assignedKeys,
            usedKeys: adminUser.usedKeys,
            createdAt: adminUser.createdAt,
            updatedAt: adminUser.updatedAt,
            lastLogin: adminUser.lastLogin,
            status: adminUser.status,
            // Ensure the 'name' field is available for the AdminProfile interface, combine firstName and lastName
            name: `${adminUser.firstName || ''} ${adminUser.lastName || ''}`.trim() || adminUser.name,
        };

        res.status(200).json(profileData);
    } catch (error) {
        console.error('Error fetching admin profile:', error);
        res.status(500).json({ message: 'Server error during profile retrieval.' });
    }
};

// PATCH /admin/profile
exports.editAdminProfile = async (req, res) => {
    try {
        const { firstName, lastName, email, phone, address, bio } = req.body;
        const adminUser = await User.findById(req.user._id);

        if (!adminUser || adminUser.role !== 'admin') {
            return res.status(404).json({ message: 'Admin profile not found.' });
        }

        // Update fields if provided
        if (firstName !== undefined) adminUser.firstName = firstName;
        if (lastName !== undefined) adminUser.lastName = lastName;
        // Update the 'name' field based on firstName and lastName
        adminUser.name = `${adminUser.firstName || ''} ${adminUser.lastName || ''}`.trim();


        if (email !== undefined) {
            // Check if new email already exists for another user
            const existingUser = await User.findOne({ email, _id: { $ne: adminUser._id } });
            if (existingUser) {
                return res.status(409).json({ message: 'User with this email already exists.' });
            }
            adminUser.email = email;
        }
        if (phone !== undefined) adminUser.phone = phone;
        if (address !== undefined) adminUser.address = address; // Update the 'address' field
        if (bio !== undefined) adminUser.bio = bio;

        await adminUser.save();

        // Return updated profile data matching the frontend structure and AdminProfile interface
        const updatedProfileData = {
            _id: adminUser._id,
            firstName: adminUser.firstName,
            lastName: adminUser.lastName,
            email: adminUser.email,
            phone: adminUser.phone,
            address: adminUser.address,
            bio: adminUser.bio,
            role: adminUser.role,
            assignedKeys: adminUser.assignedKeys,
            usedKeys: adminUser.usedKeys,
            createdAt: adminUser.createdAt,
            updatedAt: adminUser.updatedAt,
            lastLogin: adminUser.lastLogin,
            status: adminUser.status,
            name: adminUser.name, // The combined name
        };

        res.status(200).json({ message: 'Profile updated successfully.', profile: updatedProfileData });
    } catch (error) {
        console.error('Error editing admin profile:', error);
        res.status(500).json({ message: 'Server error during profile update.' });
    }
};

// PATCH /admin/change-password
exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const adminUser = await User.findById(req.user._id); // Assuming req.user contains the authenticated admin user

        if (!adminUser || adminUser.role !== 'admin') {
            return res.status(404).json({ message: 'Admin not found.' });
        }

        // Verify current password
        const isMatch = await bcrypt.compare(currentPassword, adminUser.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid current password.' });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        adminUser.password = hashedPassword;
        await adminUser.save();

        res.status(200).json({ message: 'Password changed successfully.' });
    } catch (error) {
        console.error('Error changing password:', error);
        res.status(500).json({ message: 'Server error during password change.' });
    }
};
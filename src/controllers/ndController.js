const User = require('../models/User');
const KeyTransferLog = require('../models/KeyTransferLog');
const { generateCsv } = require('../utils/csv');
const bcrypt = require('bcrypt');

// GET /nd/ss-list
const getSsList = async (req, res) => {
    try {
        const ssList = await User.find({ role: 'ss', createdBy: req.user._id }).select('-password');
        const result = ssList.map(ss => ({
            id: ss._id,
            name: ss.name,
            email: ss.email,
            phone: ss.phone,
            address: ss.address, // Use address field consistently
            status: ss.status,
            assignedKeys: ss.assignedKeys || 0,
            usedKeys: ss.usedKeys || 0,
            balance: (ss.assignedKeys || 0) - (ss.usedKeys || 0),
            createdAt: ss.createdAt,
            updatedAt: ss.updatedAt
        }));
        res.status(200).json({
            message: 'State Supervisors fetched successfully.', 
            ss: result
        });
    } catch (error) {
        console.error('Error getting SS list for ND:', error);
        res.status(500).json({ message: 'Server error during SS list retrieval.' });
    }
};

// GET /nd/ss-stats
const getSsStats = async (req, res) => {
    try {
        const total = await User.countDocuments({ role: 'ss', createdBy: req.user._id });
        const active = await User.countDocuments({ role: 'ss', createdBy: req.user._id, status: 'active' });
        const blocked = await User.countDocuments({ role: 'ss', createdBy: req.user._id, status: 'blocked' });
        const keysAssignedAgg = await User.aggregate([
            { $match: { role: 'ss', createdBy: req.user._id } },
            { $group: { _id: null, total: { $sum: '$assignedKeys' } } }
        ]);
        const totalKeys = keysAssignedAgg[0]?.total || 0;
        res.status(200).json({ total, active, blocked, totalKeys });
    } catch (error) {
        console.error('Error getting SS stats for ND:', error);
        res.status(500).json({ message: 'Server error during SS stats retrieval.' });
    }
};

// GET /nd/key-transfer-logs
const getKeyTransferLogs = async (req, res) => {
    try {
        const { startDate, endDate, status, type, search, page = 1, limit = 10 } = req.query;
        const ndUserId = req.user._id;
        const ssIds = await User.find({ role: 'ss', createdBy: ndUserId }).distinct('_id');

        let queryFilter = {};

        // Apply type filter if specified
        if (type === 'Sent') {
            queryFilter.$or = [
                { fromUser: ndUserId },
                { fromUser: { $in: ssIds } }
            ];
        } else if (type === 'Received') {
            queryFilter.$or = [
                { toUser: ndUserId },
                { toUser: { $in: ssIds } }
            ];
        } else { // 'All' or no type specified
            queryFilter.$or = [
                { fromUser: ndUserId },
                { toUser: ndUserId },
                { fromUser: { $in: ssIds } },
                { toUser: { $in: ssIds } }
            ];
        }

        // Apply date filter
        if (startDate || endDate) {
            queryFilter.date = {};
            if (startDate) queryFilter.date.$gte = new Date(startDate);
            if (endDate) queryFilter.date.$lte = new Date(endDate);
        }

        // Apply status filter
        if (status) {
            queryFilter.status = status;
        }

        // Initial query to MongoDB, populate users for name search later
        const skip = (parseInt(page) - 1) * parseInt(limit);
        let query = KeyTransferLog.find(queryFilter)
            .sort({ date: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('fromUser', 'name email role')
            .populate('toUser', 'name email role');

        let logs = await query.exec();

        // Client-side filtering for populated user names if search term is present
        if (search) {
            logs = logs.filter(log =>
                (log.fromUser && log.fromUser.name && log.fromUser.name.toLowerCase().includes(search.toLowerCase())) ||
                (log.toUser && log.toUser.name && log.toUser.name.toLowerCase().includes(search.toLowerCase())) ||
                (log.notes && log.notes.toLowerCase().includes(search.toLowerCase()))
            );
        }
        
        // Count total documents for pagination without limit/skip
        const total = await KeyTransferLog.countDocuments(queryFilter);

        // Map logs to desired response format, including correct 'Type' for UI
        const result = logs.map(log => {
            let transactionTypeForUI = '';
            if (log.toUser && log.toUser._id.toString() === ndUserId.toString()) {
                transactionTypeForUI = 'Received';
            } else if (log.fromUser && log.fromUser._id.toString() === ndUserId.toString()) {
                transactionTypeForUI = 'Sent';
            } else if (log.toUser && ssIds.includes(log.toUser._id.toString())) {
                transactionTypeForUI = 'Received';
            } else if (log.fromUser && ssIds.includes(log.fromUser._id.toString())) {
                transactionTypeForUI = 'Sent';
            } else {
                transactionTypeForUI = log.type; 
            }

            return {
                transferId: log._id,
                timestamp: log.date,
                from: log.fromUser ? { id: log.fromUser._id, name: log.fromUser.name, role: log.fromUser.role } : null,
                to: log.toUser ? { id: log.toUser._id, name: log.toUser.name, role: log.toUser.role } : null,
                count: log.count,
                status: log.status,
                type: transactionTypeForUI,
                notes: log.notes,
            };
        });

        res.status(200).json({ total, page: parseInt(page), limit: parseInt(limit), logs: result });

    } catch (error) {
        console.error('Error fetching ND key transfer logs:', error);
        res.status(500).json({ message: 'Server error during key transfer logs retrieval.' });
    }
};

// GET /nd/key-transfer-logs/export
const exportKeyTransferLogs = async (req, res) => {
    try {
        const { startDate, endDate, status, type, search } = req.query;
        const ssIds = await User.find({ role: 'ss', createdBy: req.user._id }).distinct('_id');
        const filter = {
            $or: [
                { fromUser: req.user._id },
                { toUser: req.user._id },
                { fromUser: { $in: ssIds } },
                { toUser: { $in: ssIds } }
            ]
        };
        if (startDate || endDate) {
            filter.date = {};
            if (startDate) filter.date.$gte = new Date(startDate);
            if (endDate) filter.date.$lte = new Date(endDate);
        }
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
        const csvData = logs.map(log => ({
            Date: log.date ? log.date.toISOString().split('T')[0] : '',
            Type: log.status === 'completed' && log.fromUser && log.fromUser.role === 'admin' ? 'Received' : (log.status === 'completed' ? 'Sent' : log.status),
            Quantity: log.count,
            From: log.fromUser ? log.fromUser.name : '',
            To: log.toUser ? log.toUser.name : '',
            Status: log.status,
            TransferType: log.type,
            Notes: log.notes || '',
            Balance: ''
        }));
        const fields = ['Date', 'Type', 'Quantity', 'From', 'To', 'Status', 'TransferType', 'Notes', 'Balance'];
        const csv = generateCsv(csvData, fields);
        res.header('Content-Type', 'text/csv');
        res.attachment('key-transfer-logs.csv');
        return res.send(csv);
    } catch (error) {
        console.error('Error exporting ND key transfer logs:', error);
        res.status(500).json({ message: 'Server error during export.' });
    }
};

// GET /nd/reports/summary
const getReportsSummary = async (req, res) => {
    try {
        const ndUserId = req.user._id;
        const ssIds = await User.find({ role: 'ss', createdBy: ndUserId }).distinct('_id');

        // Current ND's assignedKeys and usedKeys for balance
        const ndUser = await User.findById(ndUserId).select('assignedKeys usedKeys');
        const ndAssignedKeys = ndUser?.assignedKeys || 0;
        const ndUsedKeys = ndUser?.usedKeys || 0;
        const balanceKeys = ndAssignedKeys - ndUsedKeys;
        const transferRate = ndAssignedKeys > 0 ? ((ndUsedKeys / ndAssignedKeys) * 100).toFixed(2) : 0;

        // Total Transferred Keys: Sum of count from KeyTransferLog where fromUser is the current ND user
        const totalTransferredKeysAgg = await KeyTransferLog.aggregate([
            { $match: { fromUser: ndUserId, status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$count' } } }
        ]);
        const totalTransferredKeys = totalTransferredKeysAgg[0]?.total || 0;

        const totalKeysTransferredSummary = await KeyTransferLog.aggregate([
            { $match: { $or: [ { fromUser: ndUserId }, { fromUser: { $in: ssIds } } ] } },
            { $group: { _id: null, total: { $sum: '$count' } } }
        ]);
        const totalKeysTransferred = totalKeysTransferredSummary[0]?.total || 0;

        const parentCount = await Parent.countDocuments({ createdBy: { $in: ssIds } });

        res.status(200).json({
            totalReceivedKeys: ndAssignedKeys,
            totalTransferredKeys,
            assignedKeys: ndAssignedKeys,
            usedKeys: ndUsedKeys,
            balanceKeys,
            transferRate: parseFloat(transferRate),
            totalActivations: parentCount,
            totalKeysTransferred: totalKeysTransferred
        });
    } catch (error) {
        console.error('Error getting ND reports summary:', error);
        res.status(500).json({ message: 'Server error during reports summary retrieval.' });
    }
};

// DELETE /nd/ss/:id
const deleteSs = async (req, res) => {
    try {
        const { id } = req.params;
        const ss = await User.findOne({ _id: id, role: 'ss', createdBy: req.user._id });

        if (!ss) {
            return res.status(404).json({ message: 'State Supervisor not found or not authorized to delete.' });
        }

        await User.deleteOne({ _id: id });
        // TODO: Handle cascading deletes or reassignment of associated data (e.g., KeyTransferLogs, Parents created by this SS)
        res.status(200).json({ message: 'State Supervisor deleted successfully.' });
    } catch (error) {
        console.error('Error deleting SS for ND:', error);
        res.status(500).json({ message: 'Server error during SS deletion.' });
    }
};

// PUT /nd/ss/:id
const updateSs = async (req, res) => {
    try {
        const { id } = req.params;
        const ndUserId = req.user._id;

        // Validate the ID parameter
        if (!id || id === 'undefined') {
            return res.status(400).json({ message: 'Invalid SS ID provided.' });
        }

        // Validate ObjectId format
        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ message: 'Invalid SS ID format.' });
        }

        // Extract updatable fields from request body
        const { firstName, lastName, phone, companyName, address, status } = req.body;

        // First, verify the SS exists and belongs to this ND
        const existingSs = await User.findOne({ 
            _id: id, 
            role: 'ss', 
            createdBy: ndUserId 
        });

        if (!existingSs) {
            return res.status(404).json({ message: 'State Supervisor not found or not authorized.' });
        }

        // Build update object
        const updates = {};
        if (firstName !== undefined) updates.firstName = firstName;
        if (lastName !== undefined) updates.lastName = lastName;
        if (phone !== undefined) updates.phone = phone;
        if (companyName !== undefined) updates.companyName = companyName;
        if (address !== undefined) updates.address = address;
        if (status !== undefined) updates.status = status;

        // Construct 'name' from 'firstName' and 'lastName' if provided
        if (firstName !== undefined || lastName !== undefined) {
            const newFirstName = firstName !== undefined ? firstName : existingSs.firstName;
            const newLastName = lastName !== undefined ? lastName : existingSs.lastName;
            updates.name = `${newFirstName || ''} ${newLastName || ''}`.trim();
        }

        // Update the SS
        const updatedSs = await User.findByIdAndUpdate(
            id, 
            { $set: updates }, 
            { new: true, runValidators: true }
        ).select('-password');

        if (!updatedSs) {
            return res.status(404).json({ message: 'State Supervisor not found.' });
        }

        res.status(200).json({ 
            message: 'State Supervisor updated successfully.', 
            ss: updatedSs 
        });

    } catch (error) {
        console.error('Error updating SS for ND:', error);
        res.status(500).json({ message: 'Server error during SS update.' });
    }
};

// GET /nd/profile
const getNdProfile = async (req, res) => {
    try {
        const ndProfile = await User.findById(req.user._id).select('-password');
        if (!ndProfile) {
            return res.status(404).json({ message: 'National Distributor profile not found.' });
        }
        res.status(200).json(ndProfile);
    } catch (error) {
        console.error('Error fetching ND profile:', error);
        res.status(500).json({ message: 'Server error during ND profile retrieval.' });
    }
};

// PUT /nd/profile
const updateNdProfile = async (req, res) => {
    try {
        const ndUserId = req.user._id;

        // Extract specific updatable fields from req.body
        const { firstName, lastName, phone, companyName, address, bio } = req.body;

        const updates = {};
        if (firstName !== undefined) updates.firstName = firstName;
        if (lastName !== undefined) updates.lastName = lastName;
        if (phone !== undefined) updates.phone = phone;
        if (companyName !== undefined) updates.companyName = companyName;
        if (address !== undefined) updates.address = address;
        if (bio !== undefined) updates.bio = bio;

        // Construct 'name' from 'firstName' and 'lastName' if both are provided
        if (firstName !== undefined && lastName !== undefined) {
            updates.name = `${firstName} ${lastName}`.trim();
        } else if (firstName !== undefined && !lastName) {
            updates.name = firstName;
        } else if (lastName !== undefined && !firstName) {
            updates.name = lastName;
        }

        const updatedNdProfile = await User.findByIdAndUpdate(ndUserId, { $set: updates }, { new: true, runValidators: true }).select('-password');

        if (!updatedNdProfile) {
            return res.status(404).json({ message: 'National Distributor profile not found.' });
        }

        res.status(200).json(updatedNdProfile);
    } catch (error) {
        console.error('Error updating ND profile:', error);
        res.status(500).json({ message: 'Server error during ND profile update.' });
    }
};

// POST /nd/ss
const addSs = async (req, res) => {
    try {
        const { name, email, phone, address, status, assignedKeys } = req.body;
        const ndUserId = req.user._id;

        // Basic validation
        if (!name || !email || !phone || !address) {
            return res.status(400).json({ message: 'Please provide name, email, phone, and address.' });
        }

        // Check if email already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({ message: 'User with this email already exists.' });
        }

        // Fetch current ND's key balance
        const ndUser = await User.findById(ndUserId);
        if (!ndUser) {
            return res.status(404).json({ message: 'National Distributor user not found.' });
        }

        const ndAssignedKeys = ndUser.assignedKeys || 0;
        const ndUsedKeys = ndUser.usedKeys || 0;
        const ndBalanceKeys = ndAssignedKeys - ndUsedKeys;
        const keysToAssign = assignedKeys || 0;

        if (keysToAssign > ndBalanceKeys) {
            return res.status(400).json({ message: `Cannot assign ${keysToAssign} keys. ND only has ${ndBalanceKeys} available keys.` });
        }

        // Generate a default password (e.g., first part of email + 123, or a random string)
        const defaultPassword = email.split('@')[0] + '123'; // Example: user@example.com -> user123
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);

        const newSs = new User({
            name,
            email,
            phone,
            password: hashedPassword,
            role: 'ss',
            createdBy: ndUserId,
            address,
            status: status || 'active',
            assignedKeys: keysToAssign,
            usedKeys: 0,
        });

        await newSs.save();

        // Update ND's usedKeys and assignedKeys
        ndUser.usedKeys += keysToAssign;
        await ndUser.save();

        // Respond with the new SS user, excluding sensitive info
        const responseSs = newSs.toObject();
        delete responseSs.password; // Remove password for general response

        res.status(201).json({ message: 'State Supervisor added successfully.', ss: responseSs, defaultPassword: defaultPassword });

    } catch (error) {
        console.error('Error adding new SS for ND:', error);
        res.status(500).json({ message: 'Server error during SS creation.' });
    }
};

// POST /nd/transfer-keys-to-ss
const transferKeysToSs = async (req, res) => {
    try {
        const { ssId, keysToTransfer } = req.body;
        const ndUserId = req.user._id;

        // Basic validation
        if (!ssId || !keysToTransfer) {
            return res.status(400).json({ message: 'Please provide ssId and keysToTransfer.' });
        }

        const ss = await User.findOne({ _id: ssId, role: 'ss', createdBy: ndUserId });
        if (!ss) {
            return res.status(404).json({ message: 'State Supervisor not found or not authorized to transfer keys.' });
        }

        const ndUser = await User.findById(ndUserId);
        if (!ndUser) {
            return res.status(404).json({ message: 'National Distributor user not found.' });
        }

        const ndAssignedKeys = ndUser.assignedKeys || 0;
        const ndUsedKeys = ndUser.usedKeys || 0;
        const ndBalanceKeys = ndAssignedKeys - ndUsedKeys;
        const keysToAssign = keysToTransfer || 0;

        if (keysToAssign > ndBalanceKeys) {
            return res.status(400).json({ message: `Cannot assign ${keysToAssign} keys. ND only has ${ndBalanceKeys} available keys.` });
        }

        // Update ND's usedKeys and SS's assignedKeys
        ndUser.usedKeys += keysToAssign;
        ss.assignedKeys += keysToAssign;
        await ndUser.save();
        await ss.save();

        // Create a new KeyTransferLog entry
        const newKeyTransferLog = new KeyTransferLog({
            fromUser: ndUserId,
            toUser: ssId,
            count: keysToAssign,
            status: 'completed',
            type: 'regular',
            notes: `Transferred ${keysToAssign} keys from ND to SS`
        });
        await newKeyTransferLog.save();

        res.status(200).json({ message: 'Keys transferred successfully.' });
    } catch (error) {
        console.error('Error transferring keys to SS:', error);
        res.status(500).json({ message: 'Server error during key transfer.' });
    }
};

module.exports = {
    getSsList,
    getSsStats,
    getKeyTransferLogs,
    exportKeyTransferLogs,
    getReportsSummary,
    deleteSs,
    updateSs,
    getNdProfile,
    updateNdProfile,
    addSs,
    transferKeysToSs,
};
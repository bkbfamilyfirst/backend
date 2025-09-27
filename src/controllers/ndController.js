const Key = require('../models/Key');
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
            receivedKeys: ss.receivedKeys || 0,
            transferredKeys: ss.transferredKeys || 0,
            balance: (ss.receivedKeys || 0) - (ss.transferredKeys || 0),
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
            { $group: { _id: null, total: { $sum: '$receivedKeys' } } }
        ]);
        const totalKeys = keysAssignedAgg[0]?.total || 0;
        // Fetch ND's transferredKeys property
        const ndUser = await User.findById(req.user._id).select('transferredKeys');
        // Aggregate receivedKeys for all SS users under this ND
        const receivedKeysAgg = await User.aggregate([
            { $match: { role: 'ss', createdBy: req.user._id } },
            { $group: { _id: null, total: { $sum: '$receivedKeys' } } }
        ]);
        const totalReceivedKeys = receivedKeysAgg[0]?.total || 0;
        res.status(200).json({
            total,
            active,
            blocked,
            totalKeys,
            transferredKeys: ndUser?.transferredKeys || 0,
            receivedKeys: totalReceivedKeys
        });
    } catch (error) {
        console.error('Error getting SS stats for ND:', error);
        res.status(500).json({ message: 'Server error during SS stats retrieval.' });
    }
};

// GET /nd/key-transfer-logs
// GET /nd/key-transfer-logs
const getKeyTransferLogs = async (req, res) => {
    try {
        // Parse and validate query parameters
        const { 
            startDate, 
            endDate, 
            status, 
            type, 
            search, 
            page = 1, 
            limit = 10 
        } = req.query;

        const parsedPage = parseInt(page, 10) || 1;
        const parsedLimit = parseInt(limit, 10) || 10;
        const skip = (parsedPage - 1) * parsedLimit;
        
        const ndUserId = req.user._id;
        const ndUserIdStr = ndUserId.toString();
        
        // Get all SS users created by this ND (will be used for filtering)
        const ssUsers = await User.find({ role: 'ss', createdBy: ndUserId });
        const ssIds = ssUsers.map(ss => ss._id);
        const ssIdStrings = ssIds.map(id => id.toString());
        
        // Build base query filter
        let queryFilter = {};

        // Apply type filter (Sent/Received/All)
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
        } else {
            // 'All' or no type specified - include all logs relevant to ND and SS users
            queryFilter.$or = [
                { fromUser: ndUserId },
                { toUser: ndUserId },
                { fromUser: { $in: ssIds } },
                { toUser: { $in: ssIds } }
            ];
        }

        // Apply date filtering
        if (startDate || endDate) {
            queryFilter.date = {};
            if (startDate) queryFilter.date.$gte = new Date(startDate);
            if (endDate) {
                // Set the end date to the end of the day
                const endOfDay = new Date(endDate);
                endOfDay.setHours(23, 59, 59, 999);
                queryFilter.date.$lte = endOfDay;
            }
        }

        // Apply status filter
        if (status) {
            queryFilter.status = status;
        }

        // Apply text search on notes field directly in the query when possible
        if (search) {
            // Add notes text search to the filter (can be done at DB level)
            queryFilter.$and = queryFilter.$and || [];
            queryFilter.$and.push({
                $or: [
                    { notes: { $regex: search, $options: 'i' } }
                    // We can't filter on populated fields (fromUser.name, toUser.name) directly in the query
                    // We'll do that client-side after population
                ]
            });
        }

        // Initial query without limit/skip for accurate total count if using search
        let countQuery = KeyTransferLog.find(queryFilter);
        
        // Main query with pagination
        let query = KeyTransferLog.find(queryFilter)
            .sort({ date: -1, _id: -1 }) // Stable sort with _id as tiebreaker
            .skip(skip)
            .limit(parsedLimit)
            .populate('fromUser', 'name email role')
            .populate('toUser', 'name email role');

        // Execute the main query
        let logs = await query.exec();
        
        // If search term is present, apply additional client-side filtering for user names
        const needsClientSideFiltering = search && search.trim().length > 0;
        
        if (needsClientSideFiltering) {
            logs = logs.filter(log =>
                (log.fromUser && log.fromUser.name && 
                    log.fromUser.name.toLowerCase().includes(search.toLowerCase())) ||
                (log.toUser && log.toUser.name && 
                    log.toUser.name.toLowerCase().includes(search.toLowerCase())) ||
                (log.notes && log.notes.toLowerCase().includes(search.toLowerCase()))
            );
            
            // For search with name filters, we need to get total count with the same filtering
            // This is expensive but necessary for accurate pagination
            const allLogs = await KeyTransferLog.find(queryFilter)
                .populate('fromUser', 'name')
                .populate('toUser', 'name');
                
            const filteredLogs = allLogs.filter(log =>
                (log.fromUser && log.fromUser.name && 
                    log.fromUser.name.toLowerCase().includes(search.toLowerCase())) ||
                (log.toUser && log.toUser.name && 
                    log.toUser.name.toLowerCase().includes(search.toLowerCase())) ||
                (log.notes && log.notes.toLowerCase().includes(search.toLowerCase()))
            );
            
            var total = filteredLogs.length;
        } else {
            // If no client-side filtering, we can use countDocuments for better performance
            var total = await KeyTransferLog.countDocuments(queryFilter);
        }

        // Map logs to desired response format with the correct transaction type
        const result = logs.map(log => {
            // Determine transaction type from the ND's perspective
            let transactionType;
            
            const fromIdStr = log.fromUser?._id?.toString();
            const toIdStr = log.toUser?._id?.toString();
            
            if (fromIdStr === ndUserIdStr || ssIdStrings.includes(fromIdStr)) {
                // ND or any of its SS users is the sender
                transactionType = 'Sent';
            } else if (toIdStr === ndUserIdStr || ssIdStrings.includes(toIdStr)) {
                // ND or any of its SS users is the receiver
                transactionType = 'Received';
            } else {
                // Fallback to the log's type field
                transactionType = log.type || 'Unknown';
            }

            return {
                transferId: log._id,
                timestamp: log.date,
                from: log.fromUser ? { 
                    id: log.fromUser._id, 
                    name: log.fromUser.name, 
                    role: log.fromUser.role 
                } : null,
                to: log.toUser ? { 
                    id: log.toUser._id, 
                    name: log.toUser.name, 
                    role: log.toUser.role 
                } : null,
                count: log.count,
                status: log.status,
                type: transactionType,
                notes: log.notes,
            };
        });

        res.status(200).json({ 
            total, 
            page: parsedPage, 
            limit: parsedLimit, 
            logs: result,
            // Add useful debug info
            filters: {
                type,
                status,
                dateRange: startDate || endDate ? { start: startDate, end: endDate } : null,
                search: search || null
            }
        });

    } catch (error) {
        console.error('Error fetching ND key transfer logs:', error);
        res.status(500).json({ 
            message: 'Server error during key transfer logs retrieval.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
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

        // Current ND' receivedKeys and transferredKeys for balance
        const ndUser = await User.findById(ndUserId).select('receivedKeys transferredKeys');
        const ndReceivedKeys = ndUser?.receivedKeys || 0;
        const ndTransferredKeys = ndUser?.transferredKeys || 0;
        const balanceKeys = ndReceivedKeys - ndTransferredKeys;
        const transferRate = ndReceivedKeys > 0 ? ((ndTransferredKeys / ndReceivedKeys) * 100).toFixed(2) : 0;

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

        // Count parents using User model with role 'parent'
        const parentCount = await User.countDocuments({ role: 'parent', createdBy: { $in: ssIds } });

        res.status(200).json({
            totalReceivedKeys: ndReceivedKeys,
            totalTransferredKeys,
            transferredKeys: ndTransferredKeys,
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
    const { firstName, lastName, phone, companyName, address, status, password } = req.body;

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
        // If a password was provided, validate and hash it before saving
        if (password !== undefined) {
            if (typeof password !== 'string' || password.length < 6) {
                return res.status(400).json({ message: 'Password must be a string with at least 6 characters.' });
            }
            const hashedPassword = await bcrypt.hash(password, 10);
            updates.password = hashedPassword;
        }

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

// POST /nd/ss/:id/change-password
const changeSsPassword = async (req, res) => {
    try {
        const { id } = req.params;
        const ndUserId = req.user._id;
        const { newPassword } = req.body;

        if (!id || id === 'undefined' || !id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ message: 'Invalid SS ID provided.' });
        }

        const { validatePassword, hashPassword } = require('../utils/password');
        const check = validatePassword(newPassword);
        if (!check.valid) return res.status(400).json({ message: check.message });

        // Ensure SS exists and belongs to this ND
        const ss = await User.findOne({ _id: id, role: 'ss', createdBy: ndUserId });
        if (!ss) {
            return res.status(404).json({ message: 'State Supervisor not found or not authorized.' });
        }

        const hashed = await hashPassword(newPassword);
        await User.updateOne({ _id: id }, { $set: { password: hashed } });

        res.status(200).json({ message: 'Password updated successfully.' });
    } catch (error) {
        console.error('Error changing SS password for ND:', error);
        res.status(500).json({ message: 'Server error during SS password change.' });
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
        const { name, username, email, phone, address, status, receivedKeys, password } = req.body;
        const ndUserId = req.user._id;

        // Basic validation
        if (!name || !username || !email || !phone || !address || !password) {
            return res.status(400).json({ message: 'Please provide name, username, email, phone, address, and password.' });
        }

        // Check if username, email, or phone already exists
        const existingUser = await User.findOne({ $or: [ { email }, { phone }, { username } ] });
        if (existingUser) {
            let conflictField = existingUser.email === email ? 'email' : (existingUser.phone === phone ? 'phone' : 'username');
            return res.status(409).json({ message: `User with this ${conflictField} already exists.` });
        }

        // Fetch current ND's key balance
        const ndUser = await User.findById(ndUserId);
        if (!ndUser) {
            return res.status(404).json({ message: 'National Distributor user not found.' });
        }

        const ndReceivedKeys = ndUser.receivedKeys || 0;
        const ndTransferredKeys = ndUser.transferredKeys || 0;
        const ndBalanceKeys = ndReceivedKeys - ndTransferredKeys;
        const keysToAssign = receivedKeys || 0;

        if (keysToAssign > ndBalanceKeys) {
            return res.status(400).json({ message: `Cannot assign ${keysToAssign} keys. ND only has ${ndBalanceKeys} available keys.` });
        }

        // Hash the provided password
        const hashedPassword = await bcrypt.hash(password, 10);

        const newSs = new User({
            name,
            username,
            email,
            phone,
            password: hashedPassword,
            role: 'ss',
            createdBy: ndUserId,
            address,
            status: status || 'active',
            receivedKeys: keysToAssign,
            transferredKeys: 0,
        });

        await newSs.save();

        // Update ND's transferredKeys and receivedKeys
        ndUser.transferredKeys += keysToAssign;
        await ndUser.save();

        res.status(201).json({
            message: 'State Supervisor added successfully.',
            ss: {
                id: newSs._id,
                name: newSs.name,
                username: newSs.username,
                email: newSs.email,
                phone: newSs.phone,
                password,
                address: newSs.address,
                status: newSs.status,
                receivedKeys: newSs.receivedKeys,
                transferredKeys: newSs.transferredKeys
            }
        });

    } catch (error) {
        console.error('Error adding new SS for ND:', error);
        res.status(500).json({ message: 'Server error during SS creation.' });
    }
};

// POST /nd/transfer-keys-to-ss
const transferKeysToSs = async (req, res) => {
    try {
        const { ssId, keysToTransfer } = req.body;
        if (!ssId || !keysToTransfer || keysToTransfer <= 0) {
            return res.status(400).json({ message: 'Please provide a valid SS ID and a positive number of keys to transfer.' });
        }
        const ssUser = await User.findOne({ _id: ssId, role: 'ss', createdBy: req.user._id });
        if (!ssUser) {
            return res.status(404).json({ message: 'State Supervisor not found.' });
        }
        
        // Count available unassigned keys currently owned by ND
        const availableUnassignedKeysCount = await Key.countDocuments({ isAssigned: false, currentOwner: req.user._id });
        if (keysToTransfer > availableUnassignedKeysCount) {
            return res.status(400).json({ message: `Cannot transfer ${keysToTransfer} keys. Only ${availableUnassignedKeysCount} unassigned keys available for this ND.` });
        }
        
        // Find keys to update
        const keysToMarkAssigned = await Key.find({ isAssigned: false, currentOwner: req.user._id }).limit(keysToTransfer);
        const keyIdsToUpdate = keysToMarkAssigned.map(key => key._id);
        
        // Use transactions for consistency
        const session = await mongoose.startSession();
        session.startTransaction();
        
        try {
            // Update key ownership
            await Key.updateMany(
                { _id: { $in: keyIdsToUpdate } },
                { $set: { currentOwner: ssUser._id } },
                { session }
            );
            
            // Increment transferredKeys for ND (sender)
            const ndResult = await User.updateOne(
                { _id: req.user._id },
                { $inc: { transferredKeys: keysToTransfer } },
                { session }
            );
            
            // Increment receivedKeys for SS (receiver)
            const ssResult = await User.updateOne(
                { _id: ssUser._id },
                { $inc: { receivedKeys: keysToTransfer } },
                { session }
            );
            
            // Create KeyTransferLog with explicit date
            const newKeyTransferLog = new KeyTransferLog({
                fromUser: req.user._id,
                toUser: ssId,
                count: keysToTransfer,
                status: 'completed',
                type: 'bulk',
                date: new Date(), // Explicitly set date
                notes: `Bulk transferred ${keysToTransfer} keys from ND to SS: ${ssUser.name}`
            });
            await newKeyTransferLog.save({ session });
            
            // Verify updates succeeded
            if (ndResult.modifiedCount !== 1 || ssResult.modifiedCount !== 1) {
                throw new Error('Failed to update user counters');
            }
            
            await session.commitTransaction();
            res.status(200).json({ 
                message: 'Keys transferred to State Supervisor successfully.',
                ndUpdated: ndResult.modifiedCount === 1,
                ssUpdated: ssResult.modifiedCount === 1,
                keysUpdated: keyIdsToUpdate.length
            });
        } catch (error) {
            await session.abortTransaction();
            console.error('Transaction error during key transfer:', error);
            res.status(500).json({ message: 'Transaction error during key transfer.' });
        } finally {
            session.endSession();
        }
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
    changeSsPassword,
    getNdProfile,
    updateNdProfile,
    addSs,
    transferKeysToSs,
};
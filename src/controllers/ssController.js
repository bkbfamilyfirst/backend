const Key = require('../models/Key');
const User = require('../models/User');
const KeyTransferLog = require('../models/KeyTransferLog');
const bcrypt = require('bcrypt');
// GET /ss/dashboard/summary
const getDashboardSummary = async (req, res) => {
    try {
        const ssUserId = req.user._id;

        const ssUser = await User.findById(ssUserId).select('receivedKeys transferredKeys');
        if (!ssUser) {
            return res.status(404).json({ message: 'State Supervisor user not found.' });
        }

        const totalReceivedKeys = ssUser.receivedKeys || 0;
        const totalTransferredKeys = ssUser.transferredKeys || 0;
        const balanceKeys = totalReceivedKeys - totalTransferredKeys;
        const transferStatus = totalReceivedKeys > 0 ? ((totalTransferredKeys / totalReceivedKeys) * 100).toFixed(2) : 0;

        const now = new Date();
        const todayStart = new Date(now.setHours(0, 0, 0, 0));
        const lastWeekStart = new Date(todayStart);
        lastWeekStart.setDate(todayStart.getDate() - 7);
        const twoWeeksAgoStart = new Date(todayStart);
        twoWeeksAgoStart.setDate(todayStart.getDate() - 14);

        const receivedKeysTodayAgg = await KeyTransferLog.aggregate([
            { $match: { toUser: ssUserId, status: 'completed', date: { $gte: todayStart } } },
            { $group: { _id: null, total: { $sum: '$count' } } }
        ]);
        const receivedKeysToday = receivedKeysTodayAgg[0]?.total || 0;

        const receivedKeysThisWeekAgg = await KeyTransferLog.aggregate([
            { $match: { toUser: ssUserId, status: 'completed', date: { $gte: lastWeekStart } } },
            { $group: { _id: null, total: { $sum: '$count' } } }
        ]);
        const receivedKeysThisWeek = receivedKeysThisWeekAgg[0]?.total || 0;

        const receivedKeysLastWeekAgg = await KeyTransferLog.aggregate([
            { $match: { toUser: ssUserId, status: 'completed', date: { $gte: twoWeeksAgoStart, $lt: lastWeekStart } } },
            { $group: { _id: null, total: { $sum: '$count' } } }
        ]);
        const receivedKeysLastWeek = receivedKeysLastWeekAgg[0]?.total || 0;

        let receivedKeysLastWeekChangePercentage = 0;
        if (receivedKeysLastWeek > 0) {
            receivedKeysLastWeekChangePercentage = (((receivedKeysThisWeek - receivedKeysLastWeek) / receivedKeysLastWeek) * 100).toFixed(2);
        } else if (receivedKeysThisWeek > 0) {
            receivedKeysLastWeekChangePercentage = 100;
        }

        const lastBatchLog = await KeyTransferLog.findOne({ toUser: ssUserId, status: 'completed' }).sort({ date: -1 });
        let lastBatchDetails = null;
        if (lastBatchLog) {
            const hoursAgo = Math.floor((now - lastBatchLog.date) / (1000 * 60 * 60));
            lastBatchDetails = {
                count: lastBatchLog.count,
                timeAgo: `${hoursAgo} hours ago`
            };
        }

        const dbUsersCreatedBySs = await User.find({ role: 'db', createdBy: ssUserId }).distinct('_id');
        const totalActiveRetailers = await User.countDocuments({ role: 'retailer', createdBy: { $in: dbUsersCreatedBySs }, status: 'active' });

        // const growthThisMonth = '8.3%';

        // const regionalDistribution = {
        //     north: 0,
        //     south: 0,
        //     east: 0,
        //     west: 0,
        // };

        const retailerIdsUnderSs = await User.find({ role: 'retailer', createdBy: { $in: dbUsersCreatedBySs } }).distinct('_id');

        const todayActivations = await User.countDocuments({
            role: 'parent',
            createdBy: { $in: retailerIdsUnderSs },
            createdAt: { $gte: todayStart }
        });

        const avgDaily = 0;
        const weeklyPerformance = [];

        res.status(200).json({
            receivedKeys: totalReceivedKeys,
            receivedKeysDetails: {
                changeFromLastWeek: parseFloat(receivedKeysLastWeekChangePercentage),
                today: receivedKeysToday,
                thisWeek: receivedKeysThisWeek,
                lastBatch: lastBatchDetails
            },
            balanceKeys: balanceKeys,
            transferStatus: parseFloat(transferStatus),
            transferredKeys: totalTransferredKeys,
            available: balanceKeys,
            retailerCount: {
                totalActiveRetailers,
                // growthThisMonth,
                // regionalDistribution,
            },
            dailyActivations: {
                today: todayActivations,
                avgDaily: avgDaily,
                weeklyPerformance: weeklyPerformance,
            }
        });
    } catch (error) {
        console.error('Error getting SS dashboard summary:', error);
        res.status(500).json({ message: 'Server error during SS dashboard summary retrieval.' });
    }
};

// GET /ss/distributors
const getDistributorList = async (req, res) => {
    try {
    const distributors = await User.find({ role: 'db', createdBy: req.user._id }).select('name email phone role receivedKeys transferredKeys createdBy address status createdAt updatedAt');
        
        const formattedDistributors = distributors.map(db => ({
            _id: db._id,
            name: db.name,
            email: db.email,
            phone: db.phone,
            role: db.role,
            receivedKeys: db.receivedKeys || 0,
            transferredKeys: db.transferredKeys || 0,
            createdBy: db.createdBy,
            status: db.status,
            address: db.address || "Not specified",
            createdAt: db.createdAt,
            updatedAt: db.updatedAt
        }));

        res.status(200).json(formattedDistributors);
    } catch (error) {
        console.error('Error getting Distributor list for SS:', error);
        res.status(500).json({ message: 'Server error during Distributor list retrieval.' });
    }
};

// GET /ss/distributors/stats
const getDistributorStats = async (req, res) => {
    try {
        const total = await User.countDocuments({ role: 'db', createdBy: req.user._id });
        const active = await User.countDocuments({ role: 'db', createdBy: req.user._id, status: 'active' });
        const inactive = await User.countDocuments({ role: 'db', createdBy: req.user._id, status: 'inactive' });

        // Aggregate transferredKeys and receivedKeys for DB users
        const transferredKeysAgg = await User.aggregate([
            { $match: { role: 'db', createdBy: req.user._id } },
            { $group: { _id: null, total: { $sum: '$transferredKeys' } } }
        ]);
        const receivedKeysAgg = await User.aggregate([
            { $match: { role: 'db', createdBy: req.user._id } },
            { $group: { _id: null, total: { $sum: '$receivedKeys' } } }
        ]);
        const totalTransferredKeys = transferredKeysAgg[0]?.total || 0;
        const totalReceivedKeys = receivedKeysAgg[0]?.total || 0;
        res.status(200).json({ total, active, inactive, totalTransferredKeys, totalReceivedKeys });
    } catch (error) {
        console.error('Error getting Distributor stats for SS:', error);
        res.status(500).json({ message: 'Server error during Distributor stats retrieval.' });
    }
};

// GET /ss/key-transfer-logs
const getKeyTransferLogs = async (req, res) => {
    try {
        const { startDate, endDate, status, type, search, page = 1, limit = 10 } = req.query;
        const distributorIds = await User.find({ role: 'db', createdBy: req.user._id }).distinct('_id');
        const filter = {
            $or: [
                { fromUser: req.user._id },
                { toUser: req.user._id },
                { fromUser: { $in: distributorIds } },
                { toUser: { $in: distributorIds } }
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
        const skip = (parseInt(page) - 1) * parseInt(limit);
        let query = KeyTransferLog.find(filter)
            .sort({ date: -1 })
            .skip(skip)
            .limit(parseInt(limit))
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
        const total = await KeyTransferLog.countDocuments(filter);
        const result = logs.map(log => {
            let direction = null;
            if (log.fromUser && String(log.fromUser._id) === String(req.user._id)) {
                direction = 'Sent';
            } else if (log.toUser && String(log.toUser._id) === String(req.user._id)) {
                direction = 'Received';
            }
            return {
                transferId: log._id,
                timestamp: log.date,
                from: log.fromUser ? { id: log.fromUser._id, name: log.fromUser.name, role: log.fromUser.role } : null,
                to: log.toUser ? { id: log.toUser._id, name: log.toUser.name, role: log.toUser.role } : null,
                count: log.count,
                status: log.status,
                type: log.type,
                notes: log.notes,
                direction
            };
        });
        res.status(200).json({ total, page: parseInt(page), limit: parseInt(limit), logs: result });
    } catch (error) {
        console.error('Error fetching SS key transfer logs:', error);
        res.status(500).json({ message: 'Server error during key transfer logs retrieval.' });
    }
};

// POST /ss/distributors
const addDistributor = async (req, res) => {
    const session = await User.startSession();
    session.startTransaction();
    try {
        // Prefer `address`; accept legacy `location` for compatibility
        const { name, username, email, phone, location, address, status, receivedKeys, password } = req.body;
        const finalAddress = address || location;
        const ssUserId = req.user._id;

        if (!name || !username || !email || !phone || !finalAddress || !password) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Please provide name, username, email, phone, address (or legacy location), and password.' });
        }

        // Check if username, email, or phone already exists
        const existingUser = await User.findOne({ $or: [ { email }, { phone }, { username } ] }).session(session);
        if (existingUser) {
            let conflictField = existingUser.email === email ? 'email' : (existingUser.phone === phone ? 'phone' : 'username');
            await session.abortTransaction();
            session.endSession();
            return res.status(409).json({ message: `User with this ${conflictField} already exists.` });
        }

        const ssUser = await User.findById(ssUserId).session(session);
        if (!ssUser) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: 'State Supervisor user not found.' });
        }

        const ssReceivedKeys = ssUser.receivedKeys || 0;
        const ssTransferredKeys = ssUser.transferredKeys || 0;
        const ssBalanceKeys = ssReceivedKeys - ssTransferredKeys;
        const keysToAssign = receivedKeys || 0;

        if (keysToAssign > ssBalanceKeys) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: `Cannot assign ${keysToAssign} keys. SS only has ${ssBalanceKeys} available keys.` });
        }

        // Hash the provided password
        const hashedPassword = await bcrypt.hash(password, 10);

        const newDistributor = new User({
            name,
            username,
            email,
            phone,
            password: hashedPassword,
            role: 'db',
            createdBy: ssUserId,
            address: finalAddress,
            status: status || 'active',
            receivedKeys: keysToAssign,
            transferredKeys: 0,
        });

        await newDistributor.save({ session });

        ssUser.transferredKeys += keysToAssign;
        await ssUser.save({ session });

        // Create KeyTransferLog for initial assignment if keys assigned
        if (keysToAssign > 0) {
            const newKeyTransferLog = new KeyTransferLog({
                fromUser: ssUserId,
                toUser: newDistributor._id,
                count: keysToAssign,
                status: 'completed',
                type: 'initial',
                notes: `Initial assignment of ${keysToAssign} keys to new Distributor: ${name}`
            });
            await newKeyTransferLog.save({ session });
        }

        await session.commitTransaction();
        session.endSession();

        const responseDistributor = newDistributor.toObject();
        delete responseDistributor.password;
        responseDistributor.address = newDistributor.address || "Not specified";

        res.status(201).json({ message: 'Distributor added successfully.', distributor: responseDistributor, password });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Error adding new Distributor for SS:', error);
        res.status(500).json({ message: `Server error during Distributor creation. ${error.message}` });
    }
};

// POST /ss/distributors/:id/change-password
const changeDistributorPassword = async (req, res) => {
    try {
        const { id } = req.params;
        const ssUserId = req.user._id;
        const { newPassword } = req.body;

        if (!id || id === 'undefined' || !id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ message: 'Invalid Distributor ID provided.' });
        }

        const { validatePassword, hashPassword } = require('../utils/password');
        const check = validatePassword(newPassword);
        if (!check.valid) return res.status(400).json({ message: check.message });

        // Ensure distributor exists and belongs to this SS
        const distributor = await User.findOne({ _id: id, role: 'db', createdBy: ssUserId });
        if (!distributor) {
            return res.status(404).json({ message: 'Distributor not found or not authorized.' });
        }

        const hashed = await hashPassword(newPassword);
        await User.updateOne({ _id: id }, { $set: { password: hashed } });

        res.status(200).json({ message: 'Password updated successfully.' });
    } catch (error) {
        console.error('Error changing Distributor password for SS:', error);
        res.status(500).json({ message: 'Server error during distributor password change.' });
    }
};

// PUT /ss/distributors/:id
const updateDistributor = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const distributor = await User.findOne({ _id: id, role: 'db', createdBy: req.user._id });

        if (!distributor) {
            return res.status(404).json({ message: 'Distributor not found or not authorized to update.' });
        }

        // Expect 'address' in updates (frontend should send address)

        delete updates.role;
        delete updates.password;
        delete updates.receivedKeys;
        delete updates.transferredKeys;
        delete updates.createdBy;
        delete updates.email;

        const updatedDistributor = await User.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true }).select('-password');

    // Map backend 'address' to response address field
    const responseDistributor = updatedDistributor.toObject();
    responseDistributor.address = updatedDistributor.address || "Not specified";

        res.status(200).json(responseDistributor);
    } catch (error) {
        console.error('Error updating Distributor for SS:', error);
        res.status(500).json({ message: 'Server error during Distributor update.' });
    }
};

// DELETE /ss/distributors/:id
const deleteDistributor = async (req, res) => {
    try {
        const { id } = req.params;
        const distributor = await User.findOne({ _id: id, role: 'db', createdBy: req.user._id });

        if (!distributor) {
            return res.status(404).json({ message: 'Distributor not found or not authorized to delete.' });
        }

        await User.deleteOne({ _id: id });
        res.status(200).json({ message: 'Distributor deleted successfully.' });
    } catch (error) {
        console.error('Error deleting Distributor for SS:', error);
        res.status(500).json({ message: 'Server error during Distributor deletion.' });
    }
};

// POST /ss/transfer-keys-to-db
const transferKeysToDb = async (req, res) => {
    const session = await User.startSession();
    session.startTransaction();
    try {
        const { dbId, keysToTransfer } = req.body;
        if (!dbId || !keysToTransfer || keysToTransfer <= 0) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Please provide a valid Distributor ID and a positive number of keys to transfer.' });
        }
        const dbUser = await User.findOne({ _id: dbId, role: 'db', createdBy: req.user._id }).session(session);
        if (!dbUser) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: 'Distributor not found.' });
        }
        // Count available unassigned keys currently owned by SS
        const availableUnassignedKeysCount = await Key.countDocuments({ isAssigned: false, currentOwner: req.user._id }).session(session);
        if (keysToTransfer > availableUnassignedKeysCount) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: `Cannot transfer ${keysToTransfer} keys. Only ${availableUnassignedKeysCount} unassigned keys available for you.` });
        }
        // Find and update a batch of unassigned keys owned by this SS
        const keysToMarkAssigned = await Key.find({ isAssigned: false, currentOwner: req.user._id }).limit(keysToTransfer).session(session);
        const keyIdsToUpdate = keysToMarkAssigned.map(key => key._id);
        
        
        await Key.updateMany(
            { _id: { $in: keyIdsToUpdate } },
            { $set: { currentOwner: dbUser._id } },
            { session }
        );
        // Increment transferredKeys for SS (sender)
        await User.updateOne(
            { _id: req.user._id },
            { $inc: { transferredKeys: keysToTransfer } },
            { session }
        );
        // Increment receivedKeys for DB (receiver)
        await User.updateOne(
            { _id: dbUser._id },
            { $inc: { receivedKeys: keysToTransfer } },
            { session }
        );
        // Create KeyTransferLog
        const newKeyTransferLog = new KeyTransferLog({
            fromUser: req.user._id,
            toUser: dbId,
            count: keysToTransfer,
            status: 'completed',
            type: 'bulk',
            notes: `Bulk transferred ${keysToTransfer} keys from SS to DB: ${dbUser.name}`
        });
        await newKeyTransferLog.save({ session });
        await session.commitTransaction();
        session.endSession();
        res.status(200).json({ message: 'Keys transferred to Distributor successfully.' });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Error transferring keys to DB:', error);
        res.status(500).json({ message: 'Server error during key transfer.' });
    }
};

// GET /ss/profile
const getSsProfile = async (req, res) => {
    try {
        const ssProfile = await User.findById(req.user._id).select('-password');
        if (!ssProfile) {
            return res.status(404).json({ message: 'State Supervisor profile not found.' });
        }

    // Provide address field in profile response
    const responseProfile = ssProfile.toObject();
    responseProfile.address = ssProfile.address || "Not specified";

        res.status(200).json(responseProfile);
    } catch (error) {
        console.error('Error fetching SS profile:', error);
        res.status(500).json({ message: 'Server error during SS profile retrieval.' });
    }
};

// PUT /ss/profile
const updateSsProfile = async (req, res) => {
    try {
        const updates = req.body;
        const ssUserId = req.user._id;

        // Expect 'address' in updates (frontend should send address)

        delete updates.role;
        delete updates.password;
        delete updates.receivedKeys;
        delete updates.transferredKeys;
        delete updates.createdBy;
        delete updates.email;

        const updatedSsProfile = await User.findByIdAndUpdate(ssUserId, { $set: updates }, { new: true, runValidators: true }).select('-password');

        if (!updatedSsProfile) {
            return res.status(404).json({ message: 'State Supervisor profile not found.' });
        }

    // Provide address field in response profile
    const responseProfile = updatedSsProfile.toObject();
    responseProfile.address = updatedSsProfile.address || "Not specified";

        res.status(200).json(responseProfile);
    } catch (error) {
        console.error('Error updating SS profile:', error);
        res.status(500).json({ message: 'Server error during SS profile update.' });
    }
};

module.exports = {
    getDashboardSummary,
    getDistributorList,
    getDistributorStats,
    getKeyTransferLogs,
    addDistributor,
    updateDistributor,
    deleteDistributor,
    transferKeysToDb,
    getSsProfile,
    updateSsProfile,
    changeDistributorPassword,
};
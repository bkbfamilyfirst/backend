const User = require('../models/User');
const KeyTransferLog = require('../models/KeyTransferLog');
const Parent = require('../models/Parent');
const bcrypt = require('bcrypt');

// GET /ss/dashboard/summary
const getDashboardSummary = async (req, res) => {
    try {
        const ssUserId = req.user._id;

        const ssUser = await User.findById(ssUserId).select('assignedKeys usedKeys');
        if (!ssUser) {
            return res.status(404).json({ message: 'State Supervisor user not found.' });
        }

        const totalReceivedKeys = ssUser.assignedKeys || 0;
        const allocatedKeys = ssUser.usedKeys || 0;
        const balanceKeys = totalReceivedKeys - allocatedKeys;
        const allocationStatus = totalReceivedKeys > 0 ? ((allocatedKeys / totalReceivedKeys) * 100).toFixed(2) : 0;

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

        const growthThisMonth = '8.3%';

        const regionalDistribution = {
            north: 0,
            south: 0,
            east: 0,
            west: 0,
        };

        const retailerIdsUnderSs = await User.find({ role: 'retailer', createdBy: { $in: dbUsersCreatedBySs } }).distinct('_id');

        const todayActivations = await Parent.countDocuments({
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
            allocationStatus: parseFloat(allocationStatus),
            allocated: allocatedKeys,
            available: balanceKeys,
            retailerCount: {
                totalActiveRetailers,
                growthThisMonth,
                regionalDistribution,
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
        const distributors = await User.find({ role: 'db', createdBy: req.user._id }).select('name email phone role assignedKeys usedKeys createdBy location address status createdAt updatedAt');
        
        const formattedDistributors = distributors.map(db => ({
            _id: db._id,
            name: db.name,
            email: db.email,
            phone: db.phone,
            role: db.role,
            assignedKeys: db.assignedKeys || 0,
            usedKeys: db.usedKeys || 0,
            createdBy: db.createdBy,
            status: db.status,
            location: db.location || db.address || "Not specified",
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
        const keysAssignedAgg = await User.aggregate([
            { $match: { role: 'db', createdBy: req.user._id } },
            { $group: { _id: null, total: { $sum: '$assignedKeys' } } }
        ]);
        const totalKeys = keysAssignedAgg[0]?.total || 0;

        res.status(200).json({ total, active, inactive, totalKeys });
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
        const result = logs.map(log => ({
            transferId: log._id,
            timestamp: log.date,
            from: log.fromUser ? { id: log.fromUser._id, name: log.fromUser.name, role: log.fromUser.role } : null,
            to: log.toUser ? { id: log.toUser._id, name: log.toUser.name, role: log.toUser.role } : null,
            count: log.count,
            status: log.status,
            type: log.type,
            notes: log.notes,
        }));
        res.status(200).json({ total, page: parseInt(page), limit: parseInt(limit), logs: result });
    } catch (error) {
        console.error('Error fetching SS key transfer logs:', error);
        res.status(500).json({ message: 'Server error during key transfer logs retrieval.' });
    }
};

// POST /ss/distributors
const addDistributor = async (req, res) => {
    try {
        const { name, email, phone, location, status, assignedKeys } = req.body;
        const ssUserId = req.user._id;

        if (!name || !email || !phone || !location) {
            return res.status(400).json({ message: 'Please provide name, email, phone, and region.' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({ message: 'User with this email already exists.' });
        }

        const ssUser = await User.findById(ssUserId);
        if (!ssUser) {
            return res.status(404).json({ message: 'State Supervisor user not found.' });
        }

        const ssAssignedKeys = ssUser.assignedKeys || 0;
        const ssUsedKeys = ssUser.usedKeys || 0;
        const ssBalanceKeys = ssAssignedKeys - ssUsedKeys;
        const keysToAssign = assignedKeys || 0;

        if (keysToAssign > ssBalanceKeys) {
            return res.status(400).json({ message: `Cannot assign ${keysToAssign} keys. SS only has ${ssBalanceKeys} available keys.` });
        }

        const defaultPassword = email.split('@')[0] + '123';
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);

        const newDistributor = new User({
            name,
            email,
            phone,
            password: hashedPassword,
            role: 'db',
            createdBy: ssUserId,
            address: location, // Map frontend 'location' to backend 'address' field
            status: status || 'active',
            assignedKeys: keysToAssign,
            usedKeys: 0,
        });

        await newDistributor.save();

        ssUser.usedKeys += keysToAssign;
        await ssUser.save();

        const responseDistributor = newDistributor.toObject();
        delete responseDistributor.password;
        // Map backend 'address' to frontend 'location' for consistency
        responseDistributor.location = newDistributor.address || "Not specified";

        res.status(201).json({ message: 'Distributor added successfully.', distributor: responseDistributor, defaultPassword: defaultPassword });

    } catch (error) {
        console.error('Error adding new Distributor for SS:', error);
        res.status(500).json({ message: 'Server error during Distributor creation.' });
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

        // Map frontend 'location' to backend 'address' field if present
        if (updates.location) {
            updates.address = updates.location;
            delete updates.location;
        }

        delete updates.role;
        delete updates.password;
        delete updates.assignedKeys;
        delete updates.usedKeys;
        delete updates.createdBy;
        delete updates.email;

        const updatedDistributor = await User.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true }).select('-password');

        // Map backend 'address' to frontend 'location' for consistency
        const responseDistributor = updatedDistributor.toObject();
        responseDistributor.location = updatedDistributor.address || "Not specified";

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
    try {
        const { dbId, keysToTransfer } = req.body;
        const ssUserId = req.user._id;

        if (!dbId || !keysToTransfer || keysToTransfer <= 0) {
            return res.status(400).json({ message: 'Please provide dbId and a positive number of keys to transfer.' });
        }

        const dbUser = await User.findOne({ _id: dbId, role: 'db', createdBy: ssUserId });
        if (!dbUser) {
            return res.status(404).json({ message: 'Distributor not found or not authorized to transfer keys.' });
        }

        const ssUser = await User.findById(ssUserId);
        if (!ssUser) {
            return res.status(404).json({ message: 'State Supervisor user not found.' });
        }

        const ssAssignedKeys = ssUser.assignedKeys || 0;
        const ssUsedKeys = ssUser.usedKeys || 0;
        const ssBalanceKeys = ssAssignedKeys - ssUsedKeys;
        const keysToAssign = keysToTransfer || 0;

        if (keysToAssign > ssBalanceKeys) {
            return res.status(400).json({ message: `Cannot transfer ${keysToAssign} keys. SS only has ${ssBalanceKeys} available keys.` });
        }

        ssUser.usedKeys += keysToAssign;
        dbUser.assignedKeys += keysToAssign;
        await ssUser.save();
        await dbUser.save();

        const newKeyTransferLog = new KeyTransferLog({
            fromUser: ssUserId,
            toUser: dbId,
            count: keysToAssign,
            status: 'completed',
            type: 'regular',
            notes: `Transferred ${keysToAssign} keys from SS to Distributor`
        });
        await newKeyTransferLog.save();

        res.status(200).json({ message: 'Keys transferred successfully to Distributor.' });

    } catch (error) {
        console.error('Error transferring keys to Distributor:', error);
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

        // Map backend 'address' to frontend 'location' for consistency
        const responseProfile = ssProfile.toObject();
        responseProfile.location = ssProfile.address || "Not specified";

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

        // Map frontend 'location' to backend 'address' field if present
        if (updates.location) {
            updates.address = updates.location;
            delete updates.location;
        }

        delete updates.role;
        delete updates.password;
        delete updates.assignedKeys;
        delete updates.usedKeys;
        delete updates.createdBy;
        delete updates.email;

        const updatedSsProfile = await User.findByIdAndUpdate(ssUserId, { $set: updates }, { new: true, runValidators: true }).select('-password');

        if (!updatedSsProfile) {
            return res.status(404).json({ message: 'State Supervisor profile not found.' });
        }

        // Map backend 'address' to frontend 'location' for consistency
        const responseProfile = updatedSsProfile.toObject();
        responseProfile.location = updatedSsProfile.address || "Not specified";

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
};
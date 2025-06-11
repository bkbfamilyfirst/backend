const User = require('../models/User');
const KeyTransferLog = require('../models/KeyTransferLog');
const Parent = require('../models/Parent'); // Assuming Parent model might be used for activations
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

// GET /db/dashboard/summary
const getDashboardSummary = async (req, res) => {
    try {
        const dbUserId = req.user._id;

        const dbUser = await User.findById(dbUserId).select('assignedKeys usedKeys');
        if (!dbUser) {
            return res.status(404).json({ message: 'Distributor user not found.' });
        }

        const totalReceivedKeys = dbUser.assignedKeys || 0; // This is the total assigned to DB
        const allocatedKeys = dbUser.usedKeys || 0; // Keys DB has assigned to retailers
        const balanceKeys = totalReceivedKeys - allocatedKeys;
        const allocationStatus = totalReceivedKeys > 0 ? ((allocatedKeys / totalReceivedKeys) * 100).toFixed(2) : 0;

        // Date calculations for filters
        const now = new Date();
        const todayStart = new Date(now.setHours(0, 0, 0, 0));
        const lastWeekStart = new Date(todayStart);
        lastWeekStart.setDate(todayStart.getDate() - 7); // Start of last week
        const twoWeeksAgoStart = new Date(todayStart);
        twoWeeksAgoStart.setDate(todayStart.getDate() - 14); // Start of two weeks ago

        // Received Keys Today
        const receivedKeysTodayAgg = await KeyTransferLog.aggregate([
            { $match: { toUser: dbUserId, status: 'completed', date: { $gte: todayStart } } },
            { $group: { _id: null, total: { $sum: '$count' } } }
        ]);
        const receivedKeysToday = receivedKeysTodayAgg[0]?.total || 0;

        // Received Keys This Week (since lastWeekStart)
        const receivedKeysThisWeekAgg = await KeyTransferLog.aggregate([
            { $match: { toUser: dbUserId, status: 'completed', date: { $gte: lastWeekStart } } },
            { $group: { _id: null, total: { $sum: '$count' } } }
        ]);
        const receivedKeysThisWeek = receivedKeysThisWeekAgg[0]?.total || 0;

        // Received Keys Last Week (between twoWeeksAgoStart and lastWeekStart)
        const receivedKeysLastWeekAgg = await KeyTransferLog.aggregate([
            { $match: { toUser: dbUserId, status: 'completed', date: { $gte: twoWeeksAgoStart, $lt: lastWeekStart } } },
            { $group: { _id: null, total: { $sum: '$count' } } }
        ]);
        const receivedKeysLastWeek = receivedKeysLastWeekAgg[0]?.total || 0;

        // Percentage change from last week
        let receivedKeysLastWeekChangePercentage = 0;
        if (receivedKeysLastWeek > 0) {
            receivedKeysLastWeekChangePercentage = (((receivedKeysThisWeek - receivedKeysLastWeek) / receivedKeysLastWeek) * 100).toFixed(2);
        } else if (receivedKeysThisWeek > 0) {
            receivedKeysLastWeekChangePercentage = 100; // If nothing last week, and something this week, it's 100% increase
        }

        // Last batch details (most recent transfer TO this DB)
        const lastBatchLog = await KeyTransferLog.findOne({ toUser: dbUserId, status: 'completed' }).sort({ date: -1 });
        let lastBatchDetails = null;
        if (lastBatchLog) {
            const hoursAgo = Math.floor((now - lastBatchLog.date) / (1000 * 60 * 60));
            lastBatchDetails = {
                count: lastBatchLog.count,
                timeAgo: `${hoursAgo} hours ago`
            };
        }

        // Retailer Count
        const totalActiveRetailers = await User.countDocuments({ role: 'retailer', createdBy: dbUserId, status: 'active' });

        // Placeholder for growth this month
        const growthThisMonth = '8.3%';

        // Placeholder for Regional Distribution
        const regionalDistribution = {
            north: 2847,
            south: 3456,
            east: 2134,
            west: 1508
        };

        // Daily Activations (Roll-up View)
        const retailerIds = await User.find({ role: 'retailer', createdBy: dbUserId }).distinct('_id');

        // Activations Today
        const dailyActivationsToday = await Parent.countDocuments({
            createdBy: { $in: retailerIds },
            createdAt: { $gte: todayStart }
        });

        // Placeholder for Avg Daily (Requires more complex calculations over time)
        const avgDailyActivations = 0;

        // Placeholder for Weekly Performance (Requires daily aggregation for Mon-Sun)
        const weeklyPerformance = [
            { day: 'Mon', activations: 0, percentage: 0 },
            { day: 'Tue', activations: 0, percentage: 0 },
            { day: 'Wed', activations: 0, percentage: 0 },
            { day: 'Thu', activations: 0, percentage: 0 },
            { day: 'Fri', activations: 0, percentage: 0 },
            { day: 'Sat', activations: 0, percentage: 0 },
            { day: 'Sun', activations: 0, percentage: 0 }
        ];


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
                today: dailyActivationsToday,
                avgDaily: avgDailyActivations,
                weeklyPerformance: weeklyPerformance,
            }
        });

    } catch (error) {
        console.error('Error getting DB dashboard summary:', error);
        res.status(500).json({ message: 'Server error during DB dashboard summary retrieval.' });
    }
};

// GET /db/dashboard/retailer-performance
const getActivationSummaryAndTopRetailers = async (req, res) => {
    try {
        const dbUserId = req.user._id;
        const retailerIds = await User.find({ role: 'retailer', createdBy: dbUserId }).distinct('_id');

        const now = new Date();
        const todayStart = new Date(now.setHours(0, 0, 0, 0));

        // Get start of the current week (Monday)
        const currentDay = now.getDay(); // 0 for Sunday, 1 for Monday, ..., 6 for Saturday
        const diffToMonday = now.getDate() - currentDay + (currentDay === 0 ? -6 : 1); // Adjust for Sunday
        const thisWeekStart = new Date(now.setDate(diffToMonday));
        thisWeekStart.setHours(0, 0, 0, 0);

        // Get start of the current month
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        thisMonthStart.setHours(0, 0, 0, 0);

        // Targets from screenshot - hardcoded for now
        const targetToday = 1500;
        const targetThisWeek = 10000;
        const targetThisMonth = 40000;

        // Activations Today
        const activationsToday = await Parent.countDocuments({
            createdBy: { $in: retailerIds },
            createdAt: { $gte: todayStart }
        });

        // Activations This Week
        const activationsThisWeek = await Parent.countDocuments({
            createdBy: { $in: retailerIds },
            createdAt: { $gte: thisWeekStart }
        });

        // Activations This Month
        const activationsThisMonth = await Parent.countDocuments({
            createdBy: { $in: retailerIds },
            createdAt: { $gte: thisMonthStart }
        });

        // Calculate percentages and remaining
        const todayPercentage = targetToday > 0 ? ((activationsToday / targetToday) * 100).toFixed(1) : 0;
        const todayRemaining = targetToday - activationsToday;

        const thisWeekPercentage = targetThisWeek > 0 ? ((activationsThisWeek / targetThisWeek) * 100).toFixed(1) : 0;
        const thisWeekRemaining = targetThisWeek - activationsThisWeek;

        const thisMonthPercentage = targetThisMonth > 0 ? ((activationsThisMonth / targetThisMonth) * 100).toFixed(1) : 0;
        const thisMonthRemaining = targetThisMonth - activationsThisMonth;

        // Top Performing Retailers - Placeholder, needs aggregation based on activations
        const topPerformingRetailers = []; // This will be complex aggregation, keeping as placeholder for now

        res.status(200).json({
            activationSummary: {
                today: {
                    count: activationsToday,
                    target: targetToday,
                    percentage: parseFloat(todayPercentage),
                    remaining: todayRemaining
                },
                thisWeek: {
                    count: activationsThisWeek,
                    target: targetThisWeek,
                    percentage: parseFloat(thisWeekPercentage),
                    remaining: thisWeekRemaining
                },
                thisMonth: {
                    count: activationsThisMonth,
                    target: targetThisMonth,
                    percentage: parseFloat(thisMonthPercentage),
                    remaining: thisMonthRemaining
                }
            },
            topPerformingRetailers: topPerformingRetailers,
        });

    } catch (error) {
        console.error('Error getting DB retailer performance summary:', error);
        res.status(500).json({ message: 'Server error during DB retailer performance retrieval.' });
    }
};

// GET /db/retailers (Retailer Overview/Directory)
const getRetailerList = async (req, res) => {
    try {
        const retailers = await User.find({ role: 'retailer', createdBy: req.user._id }).select('name email phone role assignedKeys usedKeys createdBy location status');
        res.status(200).json(retailers);
    } catch (error) {
        console.error('Error getting Retailer list for DB:', error);
        res.status(500).json({ message: 'Server error during Retailer list retrieval.' });
    }
};

// POST /db/retailers (Add Retailer)
const addRetailer = async (req, res) => {
    try {
        const { name, email, phone, location, status, assignedKeys } = req.body;
        const dbUserId = req.user._id;

        if (!name || !email || !phone || !location) {
            return res.status(400).json({ message: 'Please provide name, email, phone, and region.' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({ message: 'User with this email already exists.' });
        }

        // Fetch current DB's key balance
        const dbUser = await User.findById(dbUserId);
        if (!dbUser) {
            return res.status(404).json({ message: 'Distributor user not found.' });
        }

        const dbAssignedKeys = dbUser.assignedKeys || 0;
        const dbUsedKeys = dbUser.usedKeys || 0;
        const dbBalanceKeys = dbAssignedKeys - dbUsedKeys;
        const keysToAssign = assignedKeys || 0;

        if (keysToAssign > dbBalanceKeys) {
            return res.status(400).json({ message: `Cannot assign ${keysToAssign} keys. Distributor only has ${dbBalanceKeys} available keys.` });
        }

        const defaultPassword = email.split('@')[0] + '123';
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);

        const newRetailer = new User({
            name,
            email,
            phone,
            password: hashedPassword,
            role: 'retailer',
            createdBy: dbUserId,
            location,
            status: status || 'active',
            assignedKeys: keysToAssign,
            usedKeys: 0,
        });

        await newRetailer.save();

        // Update DB's usedKeys
        dbUser.usedKeys += keysToAssign;
        await dbUser.save();

        const responseRetailer = newRetailer.toObject();
        delete responseRetailer.password;

        res.status(201).json({ message: 'Retailer added successfully.', retailer: responseRetailer, defaultPassword: defaultPassword });

    } catch (error) {
        console.error('Error adding new Retailer for DB:', error);
        res.status(500).json({ message: 'Server error during Retailer creation.' });
    }
};

// PUT /db/retailers/:id
const updateRetailer = async (req, res) => {
    try {
        const { id } = req.params;
        // Validate if the ID is a valid MongoDB ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid Retailer ID format.' });
        }
        const updates = req.body;

        const retailer = await User.findOne({ _id: id, role: 'retailer', createdBy: req.user._id });

        if (!retailer) {
            return res.status(404).json({ message: 'Retailer not found or not authorized to update.' });
        }

        delete updates.role;
        delete updates.password;
        delete updates.assignedKeys;
        delete updates.usedKeys;
        delete updates.createdBy;
        delete updates.email;

        const updatedRetailer = await User.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true }).select('-password');

        res.status(200).json(updatedRetailer);
    } catch (error) {
        console.error('Error updating Retailer for DB:', error);
        res.status(500).json({ message: 'Server error during Retailer update.' });
    }
};

// DELETE /db/retailers/:id
const deleteRetailer = async (req, res) => {
    try {
        const { id } = req.params;
        const retailer = await User.findOne({ _id: id, role: 'retailer', createdBy: req.user._id });

        if (!retailer) {
            return res.status(404).json({ message: 'Retailer not found or not authorized to delete.' });
        }

        await User.deleteOne({ _id: id });
        res.status(200).json({ message: 'Retailer deleted successfully.' });
    } catch (error) {
        console.error('Error deleting Retailer for DB:', error);
        res.status(500).json({ message: 'Server error during Retailer deletion.' });
    }
};

// POST /db/transfer-keys-to-retailer
const transferKeysToRetailer = async (req, res) => {
    try {
        const { retailerId, keysToTransfer } = req.body;
        const dbUserId = req.user._id;

        if (!retailerId || !keysToTransfer || keysToTransfer <= 0) {
            return res.status(400).json({ message: 'Please provide retailerId and a positive number of keys to transfer.' });
        }

        const retailerUser = await User.findOne({ _id: retailerId, role: 'retailer', createdBy: dbUserId });
        if (!retailerUser) {
            return res.status(404).json({ message: 'Retailer not found or not authorized to transfer keys.' });
        }

        const dbUser = await User.findById(dbUserId);
        if (!dbUser) {
            return res.status(404).json({ message: 'Distributor user not found.' });
        }

        const dbAssignedKeys = dbUser.assignedKeys || 0;
        const dbUsedKeys = dbUser.usedKeys || 0;
        const dbBalanceKeys = dbAssignedKeys - dbUsedKeys;
        const keysToAssign = keysToTransfer || 0;

        if (keysToAssign > dbBalanceKeys) {
            return res.status(400).json({ message: `Cannot transfer ${keysToAssign} keys. Distributor only has ${dbBalanceKeys} available keys.` });
        }

        dbUser.usedKeys += keysToAssign;
        retailerUser.assignedKeys += keysToAssign;
        await dbUser.save();
        await retailerUser.save();

        const newKeyTransferLog = new KeyTransferLog({
            fromUser: dbUserId,
            toUser: retailerId,
            count: keysToAssign,
            status: 'completed',
            type: 'distribute', // Changed from 'regular' to 'distribute'
            notes: `Transferred ${keysToAssign} keys from Distributor to Retailer`
        });
        await newKeyTransferLog.save();

        res.status(200).json({ message: 'Keys transferred successfully to Retailer.' });

    } catch (error) {
        console.error('Error transferring keys to Retailer:', error);
        res.status(500).json({ message: 'Server error during key transfer.' });
    }
};

// GET /db/key-transfer-logs
const getKeyTransferLogs = async (req, res) => {
    try {
        const { startDate, endDate, status, type, search, page = 1, limit = 10 } = req.query;
        const retailerIds = await User.find({ role: 'retailer', createdBy: req.user._id }).distinct('_id');
        const filter = {
            $or: [
                { fromUser: req.user._id },
                { toUser: req.user._id },
                { fromUser: { $in: retailerIds } },
                { toUser: { $in: retailerIds } }
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
        console.error('Error fetching DB key transfer logs:', error);
        res.status(500).json({ message: 'Server error during key transfer logs retrieval.' });
    }
};

// GET /db/profile
const getDbProfile = async (req, res) => {
    try {
        const dbUserId = req.user._id;

        const dbUser = await User.findById(dbUserId).select('-password');
        if (!dbUser) {
            return res.status(404).json({ message: 'Distributor profile not found.' });
        }

        // Quick Stats: Retailers
        const totalRetailers = await User.countDocuments({ role: 'retailer', createdBy: dbUserId });

        // Quick Stats: Keys Managed (sum of assignedKeys to Retailers by this DB)
        const keysManagedAggregation = await User.aggregate([
            { $match: { role: 'retailer', createdBy: dbUserId } },
            { $group: { _id: null, totalAssignedKeys: { $sum: '$assignedKeys' } } }
        ]);
        const keysManaged = keysManagedAggregation[0]?.totalAssignedKeys || 0;

        res.status(200).json({
            personalInformation: {
                firstName: dbUser.name ? dbUser.name.split(' ')[0] : '',
                lastName: dbUser.name ? dbUser.name.split(' ').slice(1).join(' ') : '',
                email: dbUser.email,
                phone: dbUser.phone,
                address: dbUser.location,
                bio: dbUser.bio || '',
            },
            profileStats: {
                joined: dbUser.createdAt,
                lastLogin: dbUser.lastLogin || null, // Assuming a 'lastLogin' field is available
                quickStats: {
                    retailers: totalRetailers,
                    keysManaged: keysManaged,
                }
            }
        });

    } catch (error) {
        console.error('Error fetching DB profile:', error);
        res.status(500).json({ message: 'Server error during DB profile retrieval.' });
    }
};

// PUT /db/profile
const updateDbProfile = async (req, res) => {
    try {
        const updates = req.body;
        const dbUserId = req.user._id;

        const dbUser = await User.findById(dbUserId);
        if (!dbUser) {
            return res.status(404).json({ message: 'Distributor profile not found.' });
        }

        // Prevent sensitive or restricted fields from being updated via this endpoint
        delete updates.email;
        delete updates.role;
        delete updates.password;
        delete updates.assignedKeys;
        delete updates.usedKeys;
        delete updates.createdBy;
        delete updates.createdAt;
        delete updates.updatedAt;
        delete updates.lastLogin; // Prevent updating lastLogin directly

        // Handle name splitting if provided as first/last
        if (updates.firstName !== undefined && updates.lastName !== undefined) {
            updates.name = `${updates.firstName} ${updates.lastName}`.trim();
            delete updates.firstName;
            delete updates.lastName;
        } else if (updates.firstName !== undefined) {
            const currentLastName = dbUser.name ? dbUser.name.split(' ').slice(1).join(' ') : '';
            updates.name = `${updates.firstName} ${currentLastName}`.trim();
            delete updates.firstName;
        } else if (updates.lastName !== undefined) {
            const currentFirstName = dbUser.name ? dbUser.name.split(' ')[0] : '';
            updates.name = `${currentFirstName} ${updates.lastName}`.trim();
            delete updates.lastName;
        }

        // Map address to location field
        if (updates.address !== undefined) {
            updates.location = updates.address;
            delete updates.address;
        }

        const updatedDbProfile = await User.findByIdAndUpdate(dbUserId, { $set: updates }, { new: true, runValidators: true }).select('-password');

        if (!updatedDbProfile) {
            return res.status(404).json({ message: 'Distributor profile not found.' });
        }

        res.status(200).json({
            message: 'Distributor profile updated successfully.',
            profile: {
                firstName: updatedDbProfile.name ? updatedDbProfile.name.split(' ')[0] : '',
                lastName: updatedDbProfile.name ? updatedDbProfile.name.split(' ').slice(1).join(' ') : '',
                email: updatedDbProfile.email,
                phone: updatedDbProfile.phone,
                address: updatedDbProfile.location,
                bio: updatedDbProfile.bio || '',
            }
        });

    } catch (error) {
        console.error('Error updating DB profile:', error);
        res.status(500).json({ message: 'Server error during DB profile update.' });
    }
};

// GET /db/retailers/:id/activations
const getRetailerActivations = async (req, res) => {
    try {
        const { id: retailerId } = req.params;
        const dbUserId = req.user._id;

        // Verify the retailer exists and belongs to this DB
        const retailer = await User.findOne({ _id: retailerId, role: 'retailer', createdBy: dbUserId });
        if (!retailer) {
            return res.status(404).json({ message: 'Retailer not found or not authorized.' });
        }

        // Count parents created by this retailer
        const activationsCount = await Parent.countDocuments({ createdBy: retailerId });

        res.status(200).json({ retailerId: retailerId, activations: activationsCount });

    } catch (error) {
        console.error('Error fetching retailer activations:', error);
        res.status(500).json({ message: 'Server error during Retailer activations retrieval.' });
    }
};

// GET /db/dashboard/key-stats
const getDbKeyDistributionStats = async (req, res) => {
    try {
        const dbUserId = req.user._id;

        const dbUser = await User.findById(dbUserId).select('assignedKeys usedKeys');
        if (!dbUser) {
            return res.status(404).json({ message: 'Distributor user not found.' });
        }

        const totalReceivedKeys = dbUser.assignedKeys || 0; // This is the total assigned to DB
        const allocatedKeys = dbUser.usedKeys || 0; // Keys DB has assigned to retailers
        const balanceKeys = totalReceivedKeys - allocatedKeys;

        // Date calculations for filters
        const now = new Date();
        const todayStart = new Date(now.setHours(0, 0, 0, 0));
        const lastWeekStart = new Date(todayStart);
        lastWeekStart.setDate(todayStart.getDate() - 7); // Start of last week

        // Received from SS: Current logic for receivedKeysToday and receivedKeysThisWeek is correct
        const receivedKeysTodayAgg = await KeyTransferLog.aggregate([
            { $match: { toUser: dbUserId, status: 'completed', date: { $gte: todayStart } } },
            { $group: { _id: null, total: { $sum: '$count' } } }
        ]);
        const receivedKeysToday = receivedKeysTodayAgg[0]?.total || 0;

        const receivedKeysThisWeekAgg = await KeyTransferLog.aggregate([
            { $match: { toUser: dbUserId, status: 'completed', date: { $gte: lastWeekStart } } },
            { $group: { _id: null, total: { $sum: '$count' } } }
        ]);
        const receivedKeysThisWeek = receivedKeysThisWeekAgg[0]?.total || 0;

        // Distributed: This is already allocatedKeys (dbUser.usedKeys)
        // Calculate pending transfers (from DB to Retailers)
        const pendingDistributedKeysAgg = await KeyTransferLog.aggregate([
            { $match: { fromUser: dbUserId, status: 'pending' } },
            { $group: { _id: null, total: { $sum: '$count' } } }
        ]);
        const pendingDistributedKeys = pendingDistributedKeysAgg[0]?.total || 0;

        // Low stock alert
        const lowStockThreshold = 3000; // Define your threshold here
        const lowStockAlert = balanceKeys < lowStockThreshold;

        // Key Distribution Overview
        const totalDistributed = allocatedKeys;
        const totalRemaining = balanceKeys;
        const totalKeys = totalReceivedKeys;
        const distributionProgress = totalKeys > 0 ? ((totalDistributed / totalKeys) * 100).toFixed(1) : 0;

        res.status(200).json({
            totalInventory: totalReceivedKeys,
            receivedFromSs: {
                total: receivedKeysToday,
                thisWeek: receivedKeysThisWeek,
            },
            distributed: {
                total: allocatedKeys,
                pending: pendingDistributedKeys,
            },
            available: {
                total: balanceKeys,
                lowStockAlert: lowStockAlert ? 'Low stock alert' : null,
            },
            keyDistributionOverview: {
                distributionProgress: parseFloat(distributionProgress),
                distributed: totalDistributed,
                remaining: totalRemaining,
                total: totalKeys,
            },
        });

    } catch (error) {
        console.error('Error getting DB key distribution stats:', error);
        res.status(500).json({ message: 'Server error during DB key distribution stats retrieval.' });
    }
};

// GET /db/recent-key-batches
const getRecentKeyBatches = async (req, res) => {
    try {
        const dbUserId = req.user._id;
        const { page = 1, limit = 10, search = '' } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const filter = {
            toUser: dbUserId,
            type: 'receive', // Assuming 'receive' type for incoming batches from SS
        };

        if (search) {
            filter.notes = { $regex: search, $options: 'i' };
        }

        const batches = await KeyTransferLog.find(filter)
            .sort({ date: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('fromUser', 'name role'); // Populate fromUser to get SS name

        const totalBatches = await KeyTransferLog.countDocuments(filter);

        const formattedBatches = batches.map(batch => ({
            batchId: batch._id,
            batchInfo: batch.notes || 'Standard batch delivery', // Or generate based on type/date
            quantity: batch.count,
            ssReference: batch.reference || `REF-SS-${batch._id.toString().slice(-3).toUpperCase()}`, // Placeholder for SS reference
            receivedDate: batch.date,
            status: batch.status,
            // Actions: Client-side logic for 'Verify' button based on status
        }));

        res.status(200).json({
            total: totalBatches,
            page: parseInt(page),
            limit: parseInt(limit),
            batches: formattedBatches,
        });

    } catch (error) {
        console.error('Error fetching recent key batches for DB:', error);
        res.status(500).json({ message: 'Server error during recent key batches retrieval.' });
    }
};

// GET /db/distribution-history
const getDistributionHistory = async (req, res) => {
    try {
        const dbUserId = req.user._id;
        const { page = 1, limit = 10, search = '' } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const filter = {
            fromUser: dbUserId,
            type: 'distribute', // Assuming 'distribute' type for keys transferred to retailers
        };

        if (search) {
            filter.notes = { $regex: search, $options: 'i' };
        }

        const history = await KeyTransferLog.find(filter)
            .sort({ date: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('toUser', 'name email location'); // Populate toUser for retailer name and region

        const totalHistory = await KeyTransferLog.countDocuments(filter);

        const formattedHistory = history.map(entry => ({
            transferId: entry._id,
            retailer: {
                id: entry.toUser._id,
                name: entry.toUser.name,
                email: entry.toUser.email,
            },
            quantity: entry.count,
            batch: entry.notes || `DB-Batch-${entry._id.toString().slice(-5).toUpperCase()}`, // Placeholder for batch, maybe use reference
            region: entry.toUser.location,
            date: entry.date,
            status: entry.status,
            // Actions: Client-side logic for 'Confirm', 'Mark Delivered', 'Mark Sent' based on status
        }));

        res.status(200).json({
            total: totalHistory,
            page: parseInt(page),
            limit: parseInt(limit),
            history: formattedHistory,
        });

    } catch (error) {
        console.error('Error fetching distribution history for DB:', error);
        res.status(500).json({ message: 'Server error during distribution history retrieval.' });
    }
};

// GET /db/movement-history
const getMovementHistory = async (req, res) => {
    try {
        const dbUserId = req.user._id;
        const { page = 1, limit = 10, search = '', type, status } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const filter = {
            $or: [
                { fromUser: dbUserId },
                { toUser: dbUserId }
            ]
        };

        if (type) {
            filter.type = type;
        }
        if (status) {
            filter.status = status;
        }
        if (search) {
            // Apply search to notes, and potentially from/to user names if populated
            filter.$or = [
                { fromUser: dbUserId, notes: { $regex: search, $options: 'i' } },
                { toUser: dbUserId, notes: { $regex: search, $options: 'i' } }
            ];
            // Additional conditions for populated fields will be handled after initial query
        }

        const history = await KeyTransferLog.find(filter)
            .sort({ date: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('fromUser', 'name role')
            .populate('toUser', 'name role');

        let filteredHistory = history;
        if (search) {
             filteredHistory = history.filter(log =>
                (log.fromUser && log.fromUser.name && log.fromUser.name.toLowerCase().includes(search.toLowerCase())) ||
                (log.toUser && log.toUser.name && log.toUser.name.toLowerCase().includes(search.toLowerCase())) ||
                (log.notes && log.notes.toLowerCase().includes(search.toLowerCase()))
            );
        }

        const total = await KeyTransferLog.countDocuments(filter); // Total before client-side search filtering

        const formattedHistory = filteredHistory.map(entry => ({
            logId: entry._id,
            timestamp: entry.date,
            type: entry.type,
            description: entry.notes,
            quantity: entry.count,
            from: entry.fromUser ? { id: entry.fromUser._id, name: entry.fromUser.name, role: entry.fromUser.role } : null,
            to: entry.toUser ? { id: entry.toUser._id, name: entry.toUser.name, role: entry.toUser.role } : null,
            reference: entry.reference,
            status: entry.status,
        }));

        res.status(200).json({
            total: total,
            page: parseInt(page),
            limit: parseInt(limit),
            logs: formattedHistory,
        });

    } catch (error) {
        console.error('Error fetching movement history for DB:', error);
        res.status(500).json({ message: 'Server error during movement history retrieval.' });
    }
};

// PUT /db/recent-key-batches/:id/actionType
const handleRecentKeyBatchAction = async (req, res) => {
    try {
        const { id, actionType } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid ID format.' });
        }

        const dbUserId = req.user._id;
        const batch = await KeyTransferLog.findOne({
            _id: id,
            toUser: dbUserId,
            type: 'receive',
        });

        if (!batch) {
            return res.status(404).json({ message: 'Batch not found or cannot perform action.' });
        }

        let message;
        switch (actionType) {
            case 'verify':
                if (batch.status === 'verified') {
                    return res.status(400).json({ message: 'Batch is already verified.' });
                }
                batch.status = 'verified';
                message = 'Batch marked as verified successfully.';
                break;
            case 'mark-received':
                if (batch.status === 'received' || batch.status === 'verified') {
                    return res.status(400).json({ message: 'Batch is already marked as received or verified.' });
                }
                batch.status = 'received';
                message = 'Batch marked as received successfully.';
                break;
            default:
                return res.status(400).json({ message: 'Invalid action type for recent key batches.' });
        }

        await batch.save();
        res.status(200).json({ message });

    } catch (error) {
        console.error(`Error handling recent key batch action ${req.params.actionType}:`, error);
        res.status(500).json({ message: 'Server error during recent key batch action.' });
    }
};

// PUT /db/distribution-history/:id/actionType
const handleDistributionHistoryAction = async (req, res) => {
    try {
        const { id, actionType } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid ID format.' });
        }

        const dbUserId = req.user._id;
        const batch = await KeyTransferLog.findOne({
            _id: id,
            fromUser: dbUserId,
            type: 'distribute',
        });

        if (!batch) {
            return res.status(404).json({ message: 'Batch not found or cannot perform action.' });
        }

        let message;
        switch (actionType) {
            case 'confirm':
                if (batch.status === 'confirmed' || batch.status === 'sent' || batch.status === 'delivered') {
                    return res.status(400).json({ message: 'Batch is already confirmed or further along.' });
                }
                batch.status = 'confirmed';
                message = 'Batch marked as confirmed successfully.';
                break;
            case 'mark-delivered':
                if (batch.status === 'delivered') {
                    return res.status(400).json({ message: 'Batch is already marked as delivered.' });
                }
                batch.status = 'delivered';
                message = 'Batch marked as delivered successfully.';
                break;
            case 'mark-sent':
                if (batch.status === 'sent' || batch.status === 'delivered') {
                    return res.status(400).json({ message: 'Batch is already marked as sent or delivered.' });
                }
                batch.status = 'sent';
                message = 'Batch marked as sent successfully.';
                break;
            default:
                return res.status(400).json({ message: 'Invalid action type for distribution history.' });
        }

        await batch.save();
        res.status(200).json({ message });

    } catch (error) {
        console.error(`Error handling distribution history action ${req.params.actionType}:`, error);
        res.status(500).json({ message: 'Server error during distribution history action.' });
    }
};

// POST /db/receive-keys-from-ss
const receiveKeysFromSs = async (req, res) => {
    try {
        const { batchNumber, quantity, ssReference, notes, fromSsId } = req.body;
        const dbUserId = req.user._id;

        if (!batchNumber || !quantity || quantity <= 0 || !fromSsId) {
            return res.status(400).json({ message: 'Please provide batchNumber, quantity, and fromSsId.' });
        }

        // Optional: Verify fromSsId is a valid SS user
        const ssUser = await User.findById(fromSsId);
        if (!ssUser || ssUser.role !== 'ss') {
            return res.status(400).json({ message: 'Invalid or unauthorized SS user ID.' });
        }

        const dbUser = await User.findById(dbUserId);
        if (!dbUser) {
            return res.status(404).json({ message: 'Distributor user not found.' });
        }

        // Update DB's assigned keys (total received)
        dbUser.assignedKeys += quantity;
        await dbUser.save();

        const newKeyTransferLog = new KeyTransferLog({
            fromUser: fromSsId,
            toUser: dbUserId,
            count: quantity,
            status: 'received', // Initial status when DB receives keys
            type: 'receive',
            notes: notes || `Received batch ${batchNumber} from SS: ${ssUser.name}`,
            reference: ssReference,
        });

        await newKeyTransferLog.save();

        res.status(201).json({ message: 'Keys received successfully.', batch: newKeyTransferLog });

    } catch (error) {
        console.error('Error receiving keys from SS:', error);
        res.status(500).json({ message: 'Server error during key reception.' });
    }
};

// POST /db/distribute-keys-to-retailers
const distributeKeysToRetailers = async (req, res) => {
    try {
        const { retailerId, quantity, sourceBatch } = req.body;
        const dbUserId = req.user._id;

        if (!retailerId || !quantity || quantity <= 0) {
            return res.status(400).json({ message: 'Please provide retailerId and a positive number of keys to distribute.' });
        }

        if (!mongoose.Types.ObjectId.isValid(retailerId)) {
            return res.status(400).json({ message: 'Invalid Retailer ID format.' });
        }

        const retailerUser = await User.findOne({ _id: retailerId, role: 'retailer', createdBy: dbUserId });
        if (!retailerUser) {
            return res.status(404).json({ message: 'Retailer not found or not authorized to distribute keys to.' });
        }

        const dbUser = await User.findById(dbUserId);
        if (!dbUser) {
            return res.status(404).json({ message: 'Distributor user not found.' });
        }

        const dbBalanceKeys = (dbUser.assignedKeys || 0) - (dbUser.usedKeys || 0);

        if (quantity > dbBalanceKeys) {
            return res.status(400).json({ message: `Cannot distribute ${quantity} keys. Distributor only has ${dbBalanceKeys} available keys.` });
        }

        // Update DB's used keys and retailer's assigned keys
        dbUser.usedKeys += quantity;
        retailerUser.assignedKeys += quantity;
        await dbUser.save();
        await retailerUser.save();

        const newKeyTransferLog = new KeyTransferLog({
            fromUser: dbUserId,
            toUser: retailerId,
            count: quantity,
            status: 'sent', // Initial status when DB distributes keys
            type: 'distribute',
            notes: `Distributed ${quantity} keys to retailer: ${retailerUser.name}`,
            // reference: sourceBatch, // If you want to link it to a specific received batch
        });

        // If sourceBatch is provided, try to link it or add to notes
        if (sourceBatch) {
            const sourceBatchLog = await KeyTransferLog.findById(sourceBatch);
            if (sourceBatchLog) {
                newKeyTransferLog.notes += ` (from source batch ${sourceBatchLog.reference || sourceBatchLog._id.toString().slice(-5)})`;
                newKeyTransferLog.reference = sourceBatchLog.reference || sourceBatchLog._id; // Use source batch reference
            } else {
                newKeyTransferLog.notes += ` (from unknown source batch ${sourceBatch})`;
            }
        }

        await newKeyTransferLog.save();

        res.status(200).json({ message: 'Keys distributed successfully to Retailer.', distribution: newKeyTransferLog });

    } catch (error) {
        console.error('Error distributing keys to Retailer:', error);
        res.status(500).json({ message: 'Server error during key distribution.' });
    }
};

module.exports = {
    getDashboardSummary,
    getActivationSummaryAndTopRetailers,
    getRetailerList,
    addRetailer,
    updateRetailer,
    deleteRetailer,
    transferKeysToRetailer,
    getKeyTransferLogs,
    getDbProfile,
    updateDbProfile,
    getRetailerActivations,
    getDbKeyDistributionStats,
    getRecentKeyBatches,
    handleRecentKeyBatchAction,
    getDistributionHistory,
    handleDistributionHistoryAction,
    getMovementHistory,
    receiveKeysFromSs,
    distributeKeysToRetailers,
}; 
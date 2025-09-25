const Key = require('../models/Key');
const User = require('../models/User');
// const Parent = require('../models/Parent.js'); // Parent model removed. Use User model with role: 'parent'.
const KeyTransferLog = require('../models/KeyTransferLog');
const { generateCsv } = require('../utils/csv');
const { validatePassword, hashPassword } = require('../utils/password');
const { validationResult } = require('express-validator');
// Paginated ND list
exports.getNdListPaginated = async (req, res) => {
    try {
        // Parse & validate query params
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const rawLimit = parseInt(req.query.limit) || 10;
        const MAX_LIMIT = 100;
        const limit = Math.min(Math.max(1, rawLimit), MAX_LIMIT);
        const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 500) : null;
        const status = req.query.status;
        const allowedStatuses = ['active', 'inactive', 'blocked'];
        if (status && !allowedStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status value' });
        }
        const startDateRaw = req.query.startDate;
        const endDateRaw = req.query.endDate;
        let startDate, endDate;
        if (startDateRaw) {
            startDate = new Date(startDateRaw);
            if (isNaN(startDate.getTime())) return res.status(400).json({ error: 'Invalid startDate format' });
        }
        if (endDateRaw) {
            endDate = new Date(endDateRaw);
            if (isNaN(endDate.getTime())) return res.status(400).json({ error: 'Invalid endDate format' });
        }
        const sortBy = req.query.sortBy || 'createdAt';
        const allowedSortBy = ['name', 'createdAt', 'assignedKeys', 'receivedKeys'];
        if (!allowedSortBy.includes(sortBy)) return res.status(400).json({ error: 'Invalid sortBy value' });
        const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1; // default desc

        // Build aggregation pipeline
        const match = { role: 'nd' };
        if (status) match.status = status;
        if (startDate || endDate) {
            match.createdAt = {};
            if (startDate) match.createdAt.$gte = startDate;
            if (endDate) {
                // include entire day for endDate if time not specified
                endDate.setHours(23,59,59,999);
                match.createdAt.$lte = endDate;
            }
        }

        const pipeline = [ { $match: match } ];

        // Search - prefer $text if index exists, otherwise regex OR across fields
        if (search) {
            // simple tokenization: split by whitespace and require all terms to match (AND)
            const terms = search.split(/\s+/).filter(Boolean);
            const andClauses = terms.map(term => ({
                $or: [
                    { name: { $regex: term, $options: 'i' } },
                    { username: { $regex: term, $options: 'i' } },
                    { email: { $regex: term, $options: 'i' } },
                    { phone: { $regex: term, $options: 'i' } },
                    { companyName: { $regex: term, $options: 'i' } }
                ]
            }));
            pipeline.push({ $match: { $and: andClauses } });
        }

        // Sorting
        const sortStage = { $sort: { [sortBy]: sortOrder, _id: 1 } };

        // Facet for data + total
        const skip = (page - 1) * limit;
        pipeline.push({ $facet: {
            data: [ sortStage, { $skip: skip }, { $limit: limit }, { $project: {
                id: '$_id', name: 1, username:1, email:1, phone:1, role:1,
                assignedKeys:1, usedKeys:1, transferredKeys:1, receivedKeys:1, companyName:1,
                address:1, status:1, bio:1, notes:1, createdBy:1, lastLogin:1, createdAt:1, updatedAt:1
            }} ],
            totalCount: [ { $count: 'count' } ]
        }});

        const aggResult = await User.aggregate(pipeline).allowDiskUse(true).exec();
        const data = aggResult[0]?.data || [];
        const total = aggResult[0]?.totalCount[0]?.count || 0;
        const totalPages = Math.max(1, Math.ceil(total / limit));

        // Map entries to expected shape
        const entries = data.map(u => ({
            id: u.id,
            name: u.name,
            username: u.username,
            email: u.email,
            phone: u.phone,
            role: u.role,
            assignedKeys: u.assignedKeys || 0,
            usedKeys: u.usedKeys || 0,
            transferredKeys: u.transferredKeys || 0,
            receivedKeys: u.receivedKeys || 0,
            companyName: u.companyName,
            address: u.address,
            status: u.status,
            bio: u.bio,
            notes: u.notes,
            createdBy: u.createdBy,
            lastLogin: u.lastLogin,
            joinedDate: u.createdAt,
            createdAt: u.createdAt,
            updatedAt: u.updatedAt
        }));

        return res.json({ entries, totalPages, total, page, limit });
    } catch (err) {
        console.error('Error in getNdListPaginated:', err);
        return res.status(500).json({ message: 'Server error' });
    }
};

// Generic paginated list builder for users by role to avoid duplication
async function getListPaginatedByRole(req, res, role, allowedSortBy = ['name', 'createdAt']) {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const rawLimit = parseInt(req.query.limit) || 10;
        const MAX_LIMIT = 100;
        const limit = Math.min(Math.max(1, rawLimit), MAX_LIMIT);
        const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 500) : null;
        const status = req.query.status;
        const allowedStatuses = ['active', 'inactive', 'blocked'];
        if (status && !allowedStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status value' });
        }
        const startDateRaw = req.query.startDate;
        const endDateRaw = req.query.endDate;
        let startDate, endDate;
        if (startDateRaw) {
            startDate = new Date(startDateRaw);
            if (isNaN(startDate.getTime())) return res.status(400).json({ error: 'Invalid startDate format' });
        }
        if (endDateRaw) {
            endDate = new Date(endDateRaw);
            if (isNaN(endDate.getTime())) return res.status(400).json({ error: 'Invalid endDate format' });
        }
        const sortBy = req.query.sortBy || 'createdAt';
        if (!allowedSortBy.includes(sortBy)) return res.status(400).json({ error: 'Invalid sortBy value' });
        const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

        const match = { role };
        if (status) match.status = status;
        if (startDate || endDate) {
            match.createdAt = {};
            if (startDate) match.createdAt.$gte = startDate;
            if (endDate) {
                endDate.setHours(23,59,59,999);
                match.createdAt.$lte = endDate;
            }
        }

        const pipeline = [ { $match: match } ];
        if (search) {
            const terms = search.split(/\s+/).filter(Boolean);
            const andClauses = terms.map(term => ({
                $or: [
                    { name: { $regex: term, $options: 'i' } },
                    { username: { $regex: term, $options: 'i' } },
                    { email: { $regex: term, $options: 'i' } },
                    { phone: { $regex: term, $options: 'i' } },
                    { companyName: { $regex: term, $options: 'i' } }
                ]
            }));
            pipeline.push({ $match: { $and: andClauses } });
        }

        const sortStage = { $sort: { [sortBy]: sortOrder, _id: 1 } };
        const skip = (page - 1) * limit;
        pipeline.push({ $facet: {
            data: [ sortStage, { $skip: skip }, { $limit: limit }, { $project: {
                id: '$_id', name: 1, username:1, email:1, phone:1, role:1,
                assignedKeys:1, usedKeys:1, transferredKeys:1, receivedKeys:1, companyName:1,
                address:1, status:1, bio:1, notes:1, createdBy:1, lastLogin:1, createdAt:1, updatedAt:1
            }} ],
            totalCount: [ { $count: 'count' } ]
        }});

        const aggResult = await User.aggregate(pipeline).allowDiskUse(true).exec();
        const data = aggResult[0]?.data || [];
        const total = aggResult[0]?.totalCount[0]?.count || 0;
        const totalPages = Math.max(1, Math.ceil(total / limit));

        const entries = data.map(u => ({
            id: u.id,
            name: u.name,
            username: u.username,
            email: u.email,
            phone: u.phone,
            role: u.role,
            assignedKeys: u.assignedKeys || 0,
            usedKeys: u.usedKeys || 0,
            transferredKeys: u.transferredKeys || 0,
            receivedKeys: u.receivedKeys || 0,
            companyName: u.companyName,
            address: u.address,
            status: u.status,
            bio: u.bio,
            notes: u.notes,
            createdBy: u.createdBy,
            lastLogin: u.lastLogin,
            joinedDate: u.createdAt,
            createdAt: u.createdAt,
            updatedAt: u.updatedAt
        }));

        return res.json({ entries, totalPages, total, page, limit });
    } catch (err) {
        console.error('Error in getListPaginatedByRole:', err);
        return res.status(500).json({ message: 'Server error' });
    }
}

// GET /admin/admin-list-paginated
exports.getAdminListPaginated = async (req, res) => getListPaginatedByRole(req, res, 'admin', ['name', 'createdAt']);

// Edit admin (reuse helper)
exports.editAdmin = async (req, res) => adminUpdateUserByRole(req, res, 'admin');

// PATCH /admin/admin/:id/change-password - Admin changing another admin's password
exports.adminChangePassword = async (req, res) => {
    try {
        const { id } = req.params;
        const { password } = req.body || {};
        if (!id) return res.status(400).json({ message: 'Admin id is required' });
        // Validate password using centralized helper
        const { valid, message } = validatePassword(password);
        if (!valid) return res.status(400).json({ message });

        const adminUser = await User.findOne({ _id: id, role: 'admin' });
        if (!adminUser) return res.status(404).json({ message: 'Admin user not found.' });

    const hashed = await hashPassword(String(password));
    adminUser.password = hashed;
        adminUser.refreshTokens = [];
        adminUser.passwordResetCount = (adminUser.passwordResetCount || 0) + 1;
        await adminUser.save();

        const safe = adminUser.toObject();
        delete safe.password;
        delete safe.refreshTokens;
        delete safe.__v;

        return res.status(200).json({ message: 'Admin password updated successfully.', admin: safe });
    } catch (error) {
        console.error('Error in adminChangePassword:', error);
        return res.status(500).json({ message: 'Server error during admin password change.' });
    }
};

// Paginated SS list
exports.getSsListPaginated = async (req, res) => {
    try {
        // Parse & validate query params
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const rawLimit = parseInt(req.query.limit) || 10;
        const MAX_LIMIT = 100;
        const limit = Math.min(Math.max(1, rawLimit), MAX_LIMIT);
        const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 500) : null;
        const status = req.query.status;
        const allowedStatuses = ['active', 'inactive', 'blocked'];
        if (status && !allowedStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status value' });
        }
        const startDateRaw = req.query.startDate;
        const endDateRaw = req.query.endDate;
        let startDate, endDate;
        if (startDateRaw) {
            startDate = new Date(startDateRaw);
            if (isNaN(startDate.getTime())) return res.status(400).json({ error: 'Invalid startDate format' });
        }
        if (endDateRaw) {
            endDate = new Date(endDateRaw);
            if (isNaN(endDate.getTime())) return res.status(400).json({ error: 'Invalid endDate format' });
        }
        const sortBy = req.query.sortBy || 'createdAt';
        const allowedSortBy = ['name', 'createdAt', 'assignedKeys', 'receivedKeys'];
        if (!allowedSortBy.includes(sortBy)) return res.status(400).json({ error: 'Invalid sortBy value' });
        const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1; // default desc

        // Build aggregation pipeline
        const match = { role: 'ss' };
        if (status) match.status = status;
        if (startDate || endDate) {
            match.createdAt = {};
            if (startDate) match.createdAt.$gte = startDate;
            if (endDate) {
                endDate.setHours(23,59,59,999);
                match.createdAt.$lte = endDate;
            }
        }

        const pipeline = [ { $match: match } ];

        if (search) {
            const terms = search.split(/\s+/).filter(Boolean);
            const andClauses = terms.map(term => ({
                $or: [
                    { name: { $regex: term, $options: 'i' } },
                    { username: { $regex: term, $options: 'i' } },
                    { email: { $regex: term, $options: 'i' } },
                    { phone: { $regex: term, $options: 'i' } },
                    { companyName: { $regex: term, $options: 'i' } }
                ]
            }));
            pipeline.push({ $match: { $and: andClauses } });
        }

        const sortStage = { $sort: { [sortBy]: sortOrder, _id: 1 } };
        const skip = (page - 1) * limit;
        pipeline.push({ $facet: {
            data: [ sortStage, { $skip: skip }, { $limit: limit }, { $project: {
                id: '$_id', name: 1, username:1, email:1, phone:1, password:1, role:1,
                assignedKeys:1, usedKeys:1, transferredKeys:1, receivedKeys:1, companyName:1,
                address:1, status:1, bio:1, notes:1, createdBy:1, lastLogin:1, createdAt:1, updatedAt:1
            }} ],
            totalCount: [ { $count: 'count' } ]
        }});

        const aggResult = await User.aggregate(pipeline).allowDiskUse(true).exec();
        const data = aggResult[0]?.data || [];
        const total = aggResult[0]?.totalCount[0]?.count || 0;
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const entries = data.map(u => ({
            id: u.id,
            name: u.name,
            username: u.username,
            email: u.email,
            phone: u.phone,
            role: u.role,
            assignedKeys: u.assignedKeys || 0,
            usedKeys: u.usedKeys || 0,
            transferredKeys: u.transferredKeys || 0,
            receivedKeys: u.receivedKeys || 0,
            companyName: u.companyName,
            address: u.address,
            status: u.status,
            bio: u.bio,
            notes: u.notes,
            createdBy: u.createdBy,
            lastLogin: u.lastLogin,
            joinedDate: u.createdAt,
            createdAt: u.createdAt,
            updatedAt: u.updatedAt
        }));

        return res.json({ entries, totalPages, total, page, limit });
    } catch (err) {
        console.error('Error in getSsListPaginated:', err);
        return res.status(500).json({ message: 'Server error' });
    }
};

// Paginated DB list
exports.getDbListPaginated = async (req, res) => {
    try {
        // Parse & validate query params
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const rawLimit = parseInt(req.query.limit) || 10;
        const MAX_LIMIT = 100;
        const limit = Math.min(Math.max(1, rawLimit), MAX_LIMIT);
        const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 500) : null;
        const status = req.query.status;
        const allowedStatuses = ['active', 'inactive', 'blocked'];
        if (status && !allowedStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status value' });
        }
        const startDateRaw = req.query.startDate;
        const endDateRaw = req.query.endDate;
        let startDate, endDate;
        if (startDateRaw) {
            startDate = new Date(startDateRaw);
            if (isNaN(startDate.getTime())) return res.status(400).json({ error: 'Invalid startDate format' });
        }
        if (endDateRaw) {
            endDate = new Date(endDateRaw);
            if (isNaN(endDate.getTime())) return res.status(400).json({ error: 'Invalid endDate format' });
        }
        const sortBy = req.query.sortBy || 'createdAt';
        const allowedSortBy = ['name', 'createdAt', 'assignedKeys', 'receivedKeys'];
        if (!allowedSortBy.includes(sortBy)) return res.status(400).json({ error: 'Invalid sortBy value' });
        const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1; // default desc

        // Build aggregation pipeline
        const match = { role: 'db' };
        if (status) match.status = status;
        if (startDate || endDate) {
            match.createdAt = {};
            if (startDate) match.createdAt.$gte = startDate;
            if (endDate) {
                endDate.setHours(23,59,59,999);
                match.createdAt.$lte = endDate;
            }
        }

        const pipeline = [ { $match: match } ];

        if (search) {
            const terms = search.split(/\s+/).filter(Boolean);
            const andClauses = terms.map(term => ({
                $or: [
                    { name: { $regex: term, $options: 'i' } },
                    { username: { $regex: term, $options: 'i' } },
                    { email: { $regex: term, $options: 'i' } },
                    { phone: { $regex: term, $options: 'i' } },
                    { companyName: { $regex: term, $options: 'i' } }
                ]
            }));
            pipeline.push({ $match: { $and: andClauses } });
        }

        const sortStage = { $sort: { [sortBy]: sortOrder, _id: 1 } };
        const skip = (page - 1) * limit;
        pipeline.push({ $facet: {
            data: [ sortStage, { $skip: skip }, { $limit: limit }, { $project: {
                id: '$_id', name: 1, username:1, email:1, phone:1, password:1, role:1,
                assignedKeys:1, usedKeys:1, transferredKeys:1, receivedKeys:1, companyName:1,
                address:1, status:1, bio:1, notes:1, createdBy:1, lastLogin:1, createdAt:1, updatedAt:1
            }} ],
            totalCount: [ { $count: 'count' } ]
        }});

        const aggResult = await User.aggregate(pipeline).allowDiskUse(true).exec();
        const data = aggResult[0]?.data || [];
        const total = aggResult[0]?.totalCount[0]?.count || 0;
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const entries = data.map(u => ({
            id: u.id,
            name: u.name,
            username: u.username,
            email: u.email,
            phone: u.phone,
            password: u.password,
            role: u.role,
            assignedKeys: u.assignedKeys || 0,
            usedKeys: u.usedKeys || 0,
            transferredKeys: u.transferredKeys || 0,
            receivedKeys: u.receivedKeys || 0,
            companyName: u.companyName,
            address: u.address,
            status: u.status,
            bio: u.bio,
            notes: u.notes,
            createdBy: u.createdBy,
            lastLogin: u.lastLogin,
            joinedDate: u.createdAt,
            createdAt: u.createdAt,
            updatedAt: u.updatedAt
        }));

        return res.json({ entries, totalPages, total, page, limit });
    } catch (err) {
        console.error('Error in getDbListPaginated:', err);
        return res.status(500).json({ message: 'Server error' });
    }
};

// Paginated Retailer list
exports.getRetailerListPaginated = async (req, res) => {
    try {
        // Parse & validate query params
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const rawLimit = parseInt(req.query.limit) || 10;
        const MAX_LIMIT = 100;
        const limit = Math.min(Math.max(1, rawLimit), MAX_LIMIT);
        const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 500) : null;
        const status = req.query.status;
        const allowedStatuses = ['active', 'inactive', 'blocked'];
        if (status && !allowedStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status value' });
        }
        const startDateRaw = req.query.startDate;
        const endDateRaw = req.query.endDate;
        let startDate, endDate;
        if (startDateRaw) {
            startDate = new Date(startDateRaw);
            if (isNaN(startDate.getTime())) return res.status(400).json({ error: 'Invalid startDate format' });
        }
        if (endDateRaw) {
            endDate = new Date(endDateRaw);
            if (isNaN(endDate.getTime())) return res.status(400).json({ error: 'Invalid endDate format' });
        }
        const sortBy = req.query.sortBy || 'createdAt';
        const allowedSortBy = ['name', 'createdAt', 'assignedKeys', 'receivedKeys'];
        if (!allowedSortBy.includes(sortBy)) return res.status(400).json({ error: 'Invalid sortBy value' });
        const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1; // default desc

        // Build aggregation pipeline
        const match = { role: 'retailer' };
        if (status) match.status = status;
        if (startDate || endDate) {
            match.createdAt = {};
            if (startDate) match.createdAt.$gte = startDate;
            if (endDate) {
                endDate.setHours(23,59,59,999);
                match.createdAt.$lte = endDate;
            }
        }

        const pipeline = [ { $match: match } ];

        if (search) {
            const terms = search.split(/\s+/).filter(Boolean);
            const andClauses = terms.map(term => ({
                $or: [
                    { name: { $regex: term, $options: 'i' } },
                    { username: { $regex: term, $options: 'i' } },
                    { email: { $regex: term, $options: 'i' } },
                    { phone: { $regex: term, $options: 'i' } },
                    { companyName: { $regex: term, $options: 'i' } }
                ]
            }));
            pipeline.push({ $match: { $and: andClauses } });
        }

        const sortStage = { $sort: { [sortBy]: sortOrder, _id: 1 } };
        const skip = (page - 1) * limit;
        pipeline.push({ $facet: {
            data: [ sortStage, { $skip: skip }, { $limit: limit }, { $project: {
                id: '$_id', name: 1, username:1, email:1, phone:1, password:1, role:1,
                assignedKeys:1, usedKeys:1, transferredKeys:1, receivedKeys:1, companyName:1,
                address:1, status:1, bio:1, notes:1, createdBy:1, lastLogin:1, createdAt:1, updatedAt:1
            }} ],
            totalCount: [ { $count: 'count' } ]
        }});

        const aggResult = await User.aggregate(pipeline).allowDiskUse(true).exec();
        const data = aggResult[0]?.data || [];
        const total = aggResult[0]?.totalCount[0]?.count || 0;
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const entries = data.map(u => ({
            id: u.id,
            name: u.name,
            username: u.username,
            email: u.email,
            phone: u.phone,
            password: u.password,
            role: u.role,
            assignedKeys: u.assignedKeys || 0,
            usedKeys: u.usedKeys || 0,
            transferredKeys: u.transferredKeys || 0,
            receivedKeys: u.receivedKeys || 0,
            companyName: u.companyName,
            address: u.address,
            status: u.status,
            bio: u.bio,
            notes: u.notes,
            createdBy: u.createdBy,
            lastLogin: u.lastLogin,
            joinedDate: u.createdAt,
            createdAt: u.createdAt,
            updatedAt: u.updatedAt
        }));

        return res.json({ entries, totalPages, total, page, limit });
    } catch (err) {
        console.error('Error in getRetailerListPaginated:', err);
        return res.status(500).json({ message: 'Server error' });
    }
};

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
    // Parents are now users with role 'parent'
    const parentUsers = users.filter(u => u.role === 'parent');
    // Add parents to user map for easier lookup by their ID for linking (redundant, but keeps logic similar)
    parentUsers.forEach(p => userMap.set(p._id.toString(), { ...p.toObject(), children: [] }));

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
    for (const parent of parentUsers) {
        if (parent.createdBy && userMap.has(parent.createdBy.toString())) {
            userMap.get(parent.createdBy.toString()).children.push(userMap.get(parent._id.toString()));
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
                currentOwner: req.user._id,
                validUntil: new Date(new Date().setFullYear(new Date().getFullYear() + 2)), // 2 years from now
            });
            await newKey.save();
            generatedKeys.push(newKey);
        }
        // Increment totalGenerated for admin
        await User.updateOne(
            { _id: req.user._id, role: 'admin' },
            { $inc: { totalGenerated: count } }
        );
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
        const totalActivations = await User.countDocuments({ role: 'parent' });

        // Expiring Soon (30 days)
        const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const expiringSoon = await Key.countDocuments({ validUntil: { $lte: in30Days, $gte: now }, isAssigned: true });
        const validActivations = await Key.countDocuments({ validUntil: { $gt: in30Days }, isAssigned: true });

        // Get totalGenerated and transferredKeys for all admins
        const adminUsers = await User.find({ role: 'admin' }).select('name email totalGenerated transferredKeys');
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
            },
            adminStats: adminUsers.map(a => ({
                id: a._id,
                name: a.name,
                email: a.email,
                totalGenerated: a.totalGenerated || 0,
                transferredKeys: a.transferredKeys || 0
            }))
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
        // Parents are now users with role 'parent'
        const hierarchyTree = await buildHierarchyTree(users, []);

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
        const totalActivations = await User.countDocuments({ role: 'parent' });
        // Expiring soon (within 30 days)
        const now = new Date();
        const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const expiringSoon = await Key.countDocuments({ validUntil: { $lte: in30Days, $gte: now }, isAssigned: true });
        const valid = await Key.countDocuments({ validUntil: { $gt: in30Days }, isAssigned: true });

        // Get totalGenerated and transferredKeys for all admins
        const adminUsers = await User.find({ role: 'admin' }).select('name email totalGenerated transferredKeys');
        res.status(200).json({
            totalKeys,
            active: activeKeys,
            inactive: inactiveKeys,
            totalActivations,
            expiringSoon,
            valid,
            adminStats: adminUsers.map(a => ({
                id: a._id,
                name: a.name,
                email: a.email,
                totalGenerated: a.totalGenerated || 0,
                transferredKeys: a.transferredKeys || 0
            }))
        });
    } catch (error) {
        console.error('Error getting key/activation stats:', error);
        res.status(500).json({ message: 'Server error during key/activation stats retrieval.' });
    }
};

// GET /admin/last-key-generation
exports.getLastKeyGeneration = async (req, res) => {
    try {
        // Find the most recent key creation timestamp
        const latestKey = await Key.findOne({}).sort({ createdAt: -1 }).select('createdAt');
        if (!latestKey) {
            return res.status(404).json({ message: 'No keys found.' });
        }
        // Count all keys created at that timestamp
        const count = await Key.countDocuments({ createdAt: latestKey.createdAt });
        res.status(200).json({
            count,
            generatedAt: latestKey.createdAt.toISOString()
        });
    } catch (error) {
        console.error('Error getting last key generation:', error);
        res.status(500).json({ message: 'Server error during last key generation retrieval.' });
    }
};

// POST /admin/reset-password/:id
// Admin-supplied password change: admin must provide the plaintext password in the body.
// This endpoint will hash & store the provided password, clear refresh tokens, and return success.
exports.resetUserPasswordByAdmin = async (req, res) => {
    try {
        const userId = req.params.id;
        if (!userId) return res.status(400).json({ message: 'User id is required' });

        const { password } = req.body || {};
        // Validate password using centralized helper
        const { valid: valid2, message: message2 } = validatePassword(password);
        if (!valid2) return res.status(400).json({ message: message2 });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

    // Hash and save provided password using helper
    const hashed = await hashPassword(String(password));
    user.password = hashed;
        // Clear refresh tokens to invalidate existing sessions
        if (user.refreshTokens) user.refreshTokens = [];
        user.passwordResetCount = (user.passwordResetCount || 0) + 1;
        await user.save();

        return res.status(200).json({ id: user._id, username: user.username, message: 'Password updated successfully.' });
    } catch (error) {
        console.error('Error in resetUserPasswordByAdmin:', error);
        return res.status(500).json({ message: 'Server error during password reset.' });
    }
};
// GET /admin/key-inventory
exports.getKeyInventory = async (req, res) => {
    try {
        const totalGenerated = await Key.countDocuments();
        // Count keys whose currentOwner is not any admin (i.e., transferred from admin)
        const adminUsersRaw = await User.find({ role: 'admin' }).select('_id name email totalGenerated transferredKeys');
        const adminIds = adminUsersRaw.map(u => u._id);
        let transferred = 0;
        if (adminIds.length > 0) {
            transferred = await Key.countDocuments({ currentOwner: { $nin: adminIds } });
        }
        const remaining = totalGenerated - transferred;
        const transferProgress = totalGenerated > 0 ? (transferred / totalGenerated) * 100 : 0;

        res.status(200).json({
            totalGenerated,
            transferred,
            remaining,
            transferProgress: Math.round(transferProgress * 10) / 10, // one decimal place
            adminStats: adminUsersRaw.map(a => ({
                id: a._id,
                name: a.name,
                email: a.email,
                totalGenerated: a.totalGenerated || 0,
                transferredKeys: a.transferredKeys || 0
            }))
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
            location: nd.address,
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


        // Only transfer keys where currentOwner is the admin user
        const availableUnassignedKeysCount = await Key.countDocuments({ isAssigned: false, currentOwner: req.user._id });
        if (keysToTransfer > availableUnassignedKeysCount) {
            return res.status(400).json({ message: `Cannot transfer ${keysToTransfer} keys. Only ${availableUnassignedKeysCount} unassigned keys available for this admin.` });
        }

        // Find and update a batch of unassigned keys owned by this admin
        const keysToMarkAssigned = await Key.find({ isAssigned: false, currentOwner: req.user._id }).limit(keysToTransfer);
        const keyIdsToUpdate = keysToMarkAssigned.map(key => key._id);

        await Key.updateMany(
            { _id: { $in: keyIdsToUpdate } },
            { $set: { currentOwner: ndUser._id } }
        );

        // Update the ND's assignedKeys
        ndUser.assignedKeys += keysToTransfer;
        await ndUser.save();
        // Increment transferredKeys for admin (sender)
        await User.updateOne(
            { _id: req.user._id },
            { $inc: { transferredKeys: keysToTransfer } }
        );
        // Increment receivedKeys for ND (receiver)
        await User.updateOne(
            { _id: ndUser._id },
            { $inc: { receivedKeys: keysToTransfer } }
        );
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
    const { name, username, email, phone, address, status, assignedKeys, companyName, notes, password } = req.body;
        const adminUserId = req.user._id;

        if (!name || !username || !email || !phone || !address || !companyName || !password) {
            return res.status(400).json({ message: 'Please provide company name, contact person name, username, email, phone, address, and password.' });
        }

        // Check if username, email, or phone already exists
        const existingUser = await User.findOne({ $or: [ { email }, { phone }, { username } ] });
        if (existingUser) {
            let conflictField = existingUser.email === email ? 'email' : (existingUser.phone === phone ? 'phone' : 'username');
            return res.status(409).json({ message: `User with this ${conflictField} already exists.` });
        }

        // Fetch available unassigned keys in the global pool
        const availableUnassignedKeysCount = await Key.countDocuments({ isAssigned: false });
        const keysToAssign = assignedKeys || 0;

        if (keysToAssign > availableUnassignedKeysCount) {
            return res.status(400).json({ message: `Cannot assign ${keysToAssign} keys. Only ${availableUnassignedKeysCount} Unassigned keys available in the system.` });
        }

    // Validate and hash the provided password
    const { valid: ndValid, message: ndMessage } = validatePassword(password);
    if (!ndValid) return res.status(400).json({ message: ndMessage });

    const hashedPassword = await hashPassword(password);

        const newNd = new User({
            name,
            username,
            email,
            phone,
            password: hashedPassword,
            role: 'nd',
            createdBy: adminUserId,
            address: address,
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
            { $set: { isAssigned: true, currentOwner: newNd._id } }
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

        res.status(201).json({
            message: 'National Distributor created successfully.',
            nd: {
                id: newNd._id,
                name: newNd.name,
                username: newNd.username,
                email: newNd.email,
                phone: newNd.phone,
                password,
                companyName: newNd.companyName,
                notes: newNd.notes
            }
        });

    } catch (error) {
        console.error('Error adding new ND for Admin:', error);
        res.status(500).json({ message: 'Server error during ND creation.' });
    }
};

// PATCH /admin/nd/:ndId

// Generic helper to update a user by role with admin privileges
async function adminUpdateUserByRole(req, res, expectedRole) {
    try {
        const { id } = req.params;
        const updates = req.body || {};

        // Ensure target exists and has expected role
        const target = await User.findById(id);
        if (!target || target.role !== expectedRole) {
            return res.status(404).json({ message: `${expectedRole.toUpperCase()} not found.` });
        }

        // Allowed fields to update (extendable)
        const allowedFields = ['name', 'firstName', 'lastName', 'email', 'phone', 'status', 'companyName', 'notes', 'address', 'bio'];

        // Build $set and $inc objects for atomic partial update
        const set = {};
        const inc = {};
        for (const key of allowedFields) {
            if (Object.prototype.hasOwnProperty.call(updates, key) && updates[key] !== undefined) {
                set[key] = updates[key];
            }
        }

        // Note: username changes are ignored here for safety (silent ignore)

        // email uniqueness check
        if (updates.email !== undefined) {
            const existing = await User.findOne({ email: updates.email, _id: { $ne: id } });
            if (existing) return res.status(409).json({ message: 'Email already in use.' });
            set.email = updates.email;
        }

        // phone uniqueness check
        if (updates.phone !== undefined) {
            const existing = await User.findOne({ phone: updates.phone, _id: { $ne: id } });
            if (existing) return res.status(409).json({ message: 'Phone already in use.' });
            set.phone = updates.phone;
        }

        // Password change (admin can set a new password) -> hash & clear refresh tokens, increment counter
        let willIncrementPasswordCount = false;
        if (Object.prototype.hasOwnProperty.call(updates, 'password') && updates.password !== undefined && updates.password !== '') {
            const { valid: updValid, message: updMessage } = validatePassword(updates.password);
            if (!updValid) return res.status(400).json({ message: updMessage });
            const hashed = await hashPassword(String(updates.password));
            set.password = hashed;
            set.refreshTokens = [];
            willIncrementPasswordCount = true;
        }

        // If nothing to update, return current sanitized user
        if (Object.keys(set).length === 0 && !willIncrementPasswordCount) {
            const safeUser = target.toObject();
            delete safeUser.password;
            delete safeUser.refreshTokens;
            delete safeUser.__v;
            return res.status(200).json({ message: `${expectedRole.toUpperCase()} updated successfully.`, [expectedRole]: safeUser });
        }

        const updateDoc = {};
        if (Object.keys(set).length > 0) updateDoc.$set = set;
        if (willIncrementPasswordCount) updateDoc.$inc = { passwordResetCount: 1 };

        const updated = await User.findOneAndUpdate({ _id: id, role: expectedRole }, updateDoc, { new: true, runValidators: true });
        if (!updated) return res.status(404).json({ message: `${expectedRole.toUpperCase()} not found.` });

        const safeUser = updated.toObject();
        delete safeUser.password;
        delete safeUser.refreshTokens;
        delete safeUser.__v;

        return res.status(200).json({ message: `${expectedRole.toUpperCase()} updated successfully.`, [expectedRole]: safeUser });
    } catch (error) {
        console.error(`Error updating ${expectedRole}:`, error);
        return res.status(500).json({ message: 'Server error during update.' });
    }
}

// PATCH /admin/ss/:id - Edit SS by admin
exports.editSs = async (req, res) => adminUpdateUserByRole(req, res, 'ss');

// PATCH /admin/db/:id - Edit DB by admin
exports.editDb = async (req, res) => adminUpdateUserByRole(req, res, 'db');

// PATCH /admin/retailer/:id - Edit Retailer by admin
exports.editRetailer = async (req, res) => adminUpdateUserByRole(req, res, 'retailer');

// PATCH /admin/parent/:id - Edit Parent by admin
exports.editParent = async (req, res) => adminUpdateUserByRole(req, res, 'parent');

// PATCH /admin/nd/:ndId - Edit ND
exports.editNd = async (req, res) => {
    try {
        const { ndId } = req.params;
        if (!ndId) return res.status(400).json({ message: 'ndId is required' });

        // Collect allowed fields from body (only set if present)
        // Prefer `address` field; accept legacy `location` and map it to `address` for compatibility
        const allowed = ['name', 'email', 'phone', 'address', 'status', 'companyName', 'notes', 'bio'];
        const updates = {};
        for (const key of allowed) {
            if (Object.prototype.hasOwnProperty.call(req.body, key) && req.body[key] !== undefined) {
                updates[key] = req.body[key];
            }
        }
        // Back-compat: if `address` not provided but `location` is, map it
        if ((!Object.prototype.hasOwnProperty.call(updates, 'address') || updates.address === undefined) && Object.prototype.hasOwnProperty.call(req.body, 'location') && req.body.location !== undefined) {
            updates.address = req.body.location;
        }

        // If admin provided a password, hash it and include in update
        if (Object.prototype.hasOwnProperty.call(req.body, 'password') && req.body.password !== undefined && req.body.password !== '') {
            updates.password = await bcrypt.hash(String(req.body.password), 10);
            // clear refreshTokens via update
            updates.refreshTokens = [];
            updates.passwordResetCount = (Number(req.body.passwordResetCount) || 0) + 1; // keep count if provided, else 1
        }

        // If email is being changed, ensure uniqueness
        if (updates.email) {
            const existingUser = await User.findOne({ email: updates.email, _id: { $ne: ndId } });
            if (existingUser) return res.status(409).json({ message: 'User with this email already exists.' });
        }

        // If phone is being changed, ensure uniqueness
        if (updates.phone) {
            const existingPhone = await User.findOne({ phone: updates.phone, _id: { $ne: ndId } });
            if (existingPhone) return res.status(409).json({ message: 'User with this phone already exists.' });
        }

        // Perform partial update (only provided fields) to avoid touching required fields unintentionally
        const updated = await User.findOneAndUpdate({ _id: ndId, role: 'nd' }, { $set: updates }, { new: true, runValidators: true });
        if (!updated) return res.status(404).json({ message: 'National Distributor not found.' });

        const safe = updated.toObject();
        delete safe.password;
        delete safe.refreshTokens;
        delete safe.__v;

        return res.status(200).json({ message: 'National Distributor updated successfully.', nd: safe });
    } catch (error) {
        console.error('Error updating ND:', error);
        return res.status(500).json({ message: 'Server error during ND update.' });
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
            totalGenerated: adminUser.totalGenerated || 0,
            transferredKeys: adminUser.transferredKeys || 0,
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
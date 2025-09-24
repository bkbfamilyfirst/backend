const User = require('../models/User');
const Key = require('../models/Key');
const { validatePassword, hashPassword } = require('../utils/password');
const jwt = require('jsonwebtoken');
const Device = require('../models/Device');
const Child = require('../models/Child');
const KeyRequest = require('../models/KeyRequest');
const Notification = require('../models/Notification');

// GET /parent/profile
exports.getParentProfile = async (req, res) => {
    try {
        // req.user._id should be set by authentication middleware
        const parent = await User.findOne({ _id: req.user._id, role: 'parent' }).select('-password -refreshTokens');
        if (!parent) {
            return res.status(404).json({ message: 'Parent not found.' });
        }
        res.status(200).json({
            id: parent._id,
            name: parent.name,
            email: parent.email,
            phone: parent.phone,
            deviceImei: parent.deviceImei,
            assignedKey: parent.assignedKey,
            address: parent.address,
            status: parent.status,
            lastLogin: parent.lastLogin,
            notes: parent.notes
        });
    } catch (error) {
        console.error('Error fetching parent profile:', error);
        res.status(500).json({ message: 'Server error during profile fetch.' });
    }
};

const generateAccessToken = (user) => {
    return jwt.sign({ id: user._id, role: user.role }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
};

const generateRefreshToken = (user) => {
    return jwt.sign({ id: user._id, role: user.role }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
};


const findDeviceAndVerifyParent = async (deviceId, parentId) => {
    const device = await Device.findById(deviceId);
    if (!device) {
        return { status: 404, message: 'Device not found.' };
    }
    // Find the parent (User with role 'parent') associated with this device's IMEI
    const parentProfile = await User.findOne({ deviceImei: device.imei, role: 'parent' });
    if (!parentProfile || parentProfile._id.toString() !== parentId.toString()) {
        return { status: 403, message: 'Access denied: Device does not belong to this parent.' };
    }
    return { status: 200, device, parentProfile };
};

// POST /parent/create
exports.createParent = async (req, res) => {
    // Prefer `address` if provided (back-compat not required here, but keep pattern)
    const { name, phone, email, deviceImei, assignedKey, address, role } = req.body;
    if (!name || !phone || !email || !deviceImei || !assignedKey) {
        return res.status(400).json({ message: 'All fields are required.' });
    }
    try {
        // Check if email or IMEI already exists
        const existingParentByEmail = await User.findOne({ email, role: 'parent' });
        if (existingParentByEmail) {
            return res.status(409).json({ message: 'Parent with this email already exists.' });
        }
        const existingParentByImei = await User.findOne({ deviceImei, role: 'parent' });
        if (existingParentByImei) {
            return res.status(409).json({ message: 'Parent with this device IMEI already exists.' });
        }
        // Check if assignedKey is valid and not already assigned
        const key = await Key.findOne({ key: assignedKey });
        if (!key) {
            return res.status(404).json({ message: 'Invalid activation key.' });
        }
        if (key.isAssigned) {
            return res.status(409).json({ message: 'Activation key already assigned.' });
        }
        // Hash password (auto-generate or from req.body)
        let password = req.body.password;
        if (!password) {
            password = Math.random().toString(36).slice(-8); // Generate random 8-char password
        }
        // Validate provided password when present
        const passCheck = validatePassword(password);
        if (!passCheck.valid) return res.status(400).json({ message: passCheck.message });
        const hashedPassword = await hashPassword(password);
        // Create parent as User with role 'parent'
        const parent = new User({
            name,
            phone,
            email,
            password: hashedPassword,
            role: 'parent',
            deviceImei,
            assignedKey,
            createdBy: req.user._id,
        });
        if (address) parent.address = address;
        await parent.save();
        // Assign key
        key.isAssigned = true;
        key.assignedTo = parent._id;
        key.assignedAt = new Date();
        await key.save();
        res.status(201).json({
            message: 'Parent created successfully.',
            parent: {
                id: parent._id,
                name: parent.name,
                phone: parent.phone,
                email: parent.email,
                deviceImei: parent.deviceImei,
                assignedKey: parent.assignedKey,
            }
        });
    } catch (error) {
        console.error('Error creating parent:', error);
        res.status(500).json({ message: 'Server error during parent creation.' });
    }
};
        
// GET /parent/list
exports.listParents = async (req, res) => {
    try {
        const parents = await User.find({ createdBy: req.user._id, role: 'parent' });
        res.status(200).json(parents);
    } catch (error) {
        console.error('Error listing parents:', error);
        res.status(500).json({ message: 'Server error during parent listing.' });
    }
};

// POST /parent/child - create a child for the authenticated parent
exports.createChild = async (req, res) => {
    try {
        const parentId = req.user && req.user._id;
        if (!parentId) return res.status(401).json({ message: 'Authentication required.' });

        // Ensure caller is a parent and fetch their record
        const parent = await User.findOne({ _id: parentId, role: 'parent' });
        if (!parent) return res.status(404).json({ message: 'Parent not found.' });

        // Check whether parent has an assigned activation key
        if (!parent.assignedKey) {
            return res.status(403).json({ message: 'No activation key found. Please request an activation key from your retailer to register a child.' });
        }

        // Verify the key exists and is assigned to this parent
        const keyRecord = await Key.findOne({ key: parent.assignedKey });
        if (!keyRecord || String(keyRecord.assignedTo) !== String(parent._id)) {
            return res.status(403).json({ message: 'Your activation key is missing or invalid. Please contact your retailer to obtain a valid key.' });
        }

        const { name, age, deviceImei } = req.body || {};
        if (!name || age === undefined) {
            return res.status(400).json({ message: 'Child name and age are required.' });
        }

        // If deviceImei provided, ensure uniqueness
        if (deviceImei) {
            const existing = await Child.findOne({ deviceImei });
            if (existing) return res.status(409).json({ message: 'Device IMEI already registered to another child.' });
        }

        const child = new Child({ name, age, deviceImei: deviceImei || undefined, parentId: parent._id });
        await child.save();

        // Increment parent's usedKeys counter (if tracking usage)
        await User.updateOne({ _id: parent._id }, { $inc: { usedKeys: 1 } });

        return res.status(201).json({
            message: 'Child created successfully.',
            child: {
                id: child._id,
                name: child.name,
                age: child.age,
                deviceImei: child.deviceImei,
                parentId: child.parentId
            }
        });
    } catch (error) {
        console.error('Error creating child:', error);
        return res.status(500).json({ message: 'Server error during child creation.' });
    }
};

// POST /parent/request-key - parent requests a key (optionally target a retailer)
exports.requestKey = async (req, res) => {
    try {
        const parentId = req.user && req.user._id;
        if (!parentId) return res.status(401).json({ message: 'Authentication required.' });

        const parent = await User.findOne({ _id: parentId, role: 'parent' });
        if (!parent) return res.status(404).json({ message: 'Parent not found.' });

        const { retailerId, message } = req.body || {};

        // Create key request
        const kr = new KeyRequest({ fromParent: parent._id, toRetailer: retailerId || undefined, message: message || '' });
        await kr.save();

        // Notify retailer if provided
        if (retailerId) {
            const notif = new Notification({ userId: retailerId, type: 'key_request', message: `New key request from parent ${parent.name}`, meta: { keyRequestId: kr._id, parentId: parent._id } });
            await notif.save();
        }

        return res.status(201).json({ message: 'Key request created successfully.', request: kr });
    } catch (error) {
        console.error('Error creating key request:', error);
        return res.status(500).json({ message: 'Server error during key request.' });
    }
};


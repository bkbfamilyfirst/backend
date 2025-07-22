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
const User = require('../models/User');
const Key = require('../models/Key');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const generateAccessToken = (user) => {
    return jwt.sign({ id: user._id, role: user.role }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
};

const generateRefreshToken = (user) => {
    return jwt.sign({ id: user._id, role: user.role }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
};

// Helper to find device and verify ownership (for parent-related actions)
const Device = require('../models/Device');
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
    const { name, phone, email, deviceImei, assignedKey, role } = req.body;
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
        const hashedPassword = await bcrypt.hash(password, 10);
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
            },
            password: req.body.password ? undefined : password // Only return if auto-generated
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
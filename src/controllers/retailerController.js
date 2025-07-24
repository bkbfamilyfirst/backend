// GET /retailer/parent-list
exports.listParents = async (req, res) => {
    try {
        const parents = await User.find({ createdBy: req.user._id, role: 'parent' });
        res.status(200).json(parents);
    } catch (error) {
        console.error('Error listing parents:', error);
        res.status(500).json({ message: 'Server error during parent listing.' });
    }
};
// POST /retailer/create-parent
exports.createParent = async (req, res) => {
    const { name, phone, email, deviceImei, assignedKey } = req.body;
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
const User = require('../models/User');
const Key = require('../models/Key');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// GET /retailer/profile
exports.getRetailerProfile = async (req, res) => {
  try {
    const retailer = await User.findById(req.user.id).select('-password');
    if (!retailer || retailer.role !== 'retailer') {
      return res.status(404).json({ message: 'Retailer not found' });
    }
    res.json(retailer);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /retailer/stats
exports.getRetailerStats = async (req, res) => {
  try {
    const retailerId = req.user.id;
    // Count keys assigned to this retailer
    const totalKeys = await Key.countDocuments({ assignedTo: retailerId });
    // Count parents created by this retailer
    const totalParents = await User.countDocuments({ createdBy: retailerId, role: 'parent' });
    // Count key transfers from this retailer
    const totalTransfers = await KeyTransferLog.countDocuments({ from: retailerId, transferType: 'retailer-to-parent' });
    res.json({ totalKeys, totalParents, totalTransfers });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /retailer/activation-history with filter support
exports.getActivationHistory = async (req, res) => {
  try {
    const retailerId = req.user.id;
    const filter = req.query.filter || 'all';
    let query = { from: retailerId, transferType: 'retailer-to-parent' };

    if (filter === 'today') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      query.createdAt = { $gte: start, $lte: end };
    }
    // Pending: keys assigned but parent not yet activated (customize as needed)
    if (filter === 'pending') {
      query.status = 'pending'; // Only if you track status in KeyTransferLog
    }

    let logs = await KeyTransferLog.find(query)
      .populate('to', 'name mobile status')
      .populate('keys', 'keyNumber')
      .sort({ createdAt: -1 });

    // Active devices: return parents with status 'active' created by this retailer
    if (filter === 'active-devices') {
      const parents = await User.find({ createdBy: retailerId, role: 'parent', status: 'active' })
        .select('name phone email deviceImei assignedKey status createdAt');
      return res.json(parents);
    }

    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /retailer/key-info
exports.getKeyInfo = async (req, res) => {
  try {
    const retailerId = req.user.id;
    // Find all keys assigned to this retailer
    const keys = await Key.find({ assignedTo: retailerId });
    res.json(keys);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /retailer/logout
exports.logout = async (req, res) => {
  // For JWT, logout is handled on client by deleting token, but you can implement blacklist if needed
  res.json({ message: 'Logged out successfully' });
};

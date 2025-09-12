const User = require('../models/User');
const Key = require('../models/Key');
const KeyTransferLog = require('../models/KeyTransferLog');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// GET /retailer/owned-keys
exports.listOwnedKeys = async (req, res) => {
  try {
    const retailerId = req.user.id;
    // Find all keys where currentOwner is this retailer
    const keys = await Key.find({ isAssigned: false, currentOwner: retailerId });
    res.status(200).json({
      message: 'Keys owned by retailer fetched successfully.',
      keys
    });
  } catch (err) {
    console.error('Error fetching owned keys for retailer:', err);
    res.status(500).json({ message: 'Server error while fetching owned keys.' });
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
// GET /retailer/reports
exports.getReports = async (req, res) => {
  try {
    const retailerId = req.user.id;
    // Get full retailer user doc for all fields
    const retailerUser = await User.findById(retailerId).select('assignedKeys usedKeys transferredKeys receivedKeys');
    // Total keys for retailer: use assignedKeys as the main metric
    const totalKeys = retailerUser?.assignedKeys || 0;
    // Total assigned keys (from User model)
    const assignedKeys = retailerUser?.assignedKeys || 0;
    // Used keys (transferred to parents)
    const usedKeys = retailerUser?.usedKeys || 0;
    // Balance = assigned - used
    const totalBalance = assignedKeys - usedKeys;
    // Total transferred (from User model: transferredKeys)
    const totalTransferred = retailerUser?.transferredKeys || 0;
    const totalReceived = retailerUser?.receivedKeys || 0;
    // Daily activations (today)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const dailyActivations = await KeyTransferLog.countDocuments({
      from: retailerId,
      transferType: 'retailer-to-parent',
      createdAt: { $gte: todayStart, $lte: todayEnd }
    });
    // Total active parents
    const totalActiveParents = await User.countDocuments({ createdBy: retailerId, role: 'parent', status: 'active' });
    res.json({
      totalKeys,
      assignedKeys,
      usedKeys,
      totalBalance,
      totalTransferred,
      totalReceived,
      dailyActivations,
      totalActiveParents
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};
// GET /retailer/dashboard-summary
exports.getDashboardSummary = async (req, res) => {
  try {
    const retailerId = req.user.id;
    const retailerUser = await User.findById(retailerId).select('assignedKeys usedKeys transferredKeys receivedKeys');
    // Today's activations
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const todaysActivations = await KeyTransferLog.countDocuments({
      from: retailerId,
      transferType: 'retailer-to-parent',
      createdAt: { $gte: todayStart, $lte: todayEnd }
    });
    // Total activations
    const totalActivations = await KeyTransferLog.countDocuments({
      from: retailerId,
      transferType: 'retailer-to-parent'
    });
    // Pending activations (if status is tracked)
    const pendingActivations = await KeyTransferLog.countDocuments({
      from: retailerId,
      transferType: 'retailer-to-parent',
      status: 'pending'
    });
    // Active devices (parents with status 'active')
    const activeDevices = await User.countDocuments({
      createdBy: retailerId,
      role: 'parent',
      status: 'active'
    });
    // Add assigned/used/transferred/received keys to dashboard summary
    res.json({
      todaysActivations,
      totalActivations,
      pendingActivations,
      activeDevices,
      assignedKeys: retailerUser?.assignedKeys || 0,
      usedKeys: retailerUser?.usedKeys || 0,
      transferredKeys: retailerUser?.transferredKeys || 0,
      receivedKeys: retailerUser?.receivedKeys || 0
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};


// GET /retailer/parent-list
exports.listParents = async (req, res) => {
    try {
        const parents = await User.find({ createdBy: req.user._id, role: 'parent' });
        res.status(200).json(
          {
            message: 'Parents fetched successfully.',
            parents
          });
    } catch (error) {
        console.error('Error listing parents:', error);
        res.status(500).json({ message: 'Server error during parent listing.' });
    }
};
// POST /retailer/create-parent
exports.createParent = async (req, res) => {
  const { name, phone, email, password, assignedKey } = req.body;
  console.log('[createParent] Incoming request:', { name, phone, email, assignedKey });
  if (!name || !phone) {
    console.log('[createParent] Missing required fields:', { name, phone });
    return res.status(400).json({ message: 'Parent name and phone are required.' });
  }
  try {
    // If email is provided, check if it already exists
    if (email) {
      console.log('[createParent] Checking for existing parent by email:', email);
      const existingParentByEmail = await User.findOne({ email, role: 'parent' });
      if (existingParentByEmail) {
        console.log('[createParent] Duplicate email found:', email);
        return res.status(409).json({ message: 'Parent with this email already exists.' });
      }
    }
    // If phone is provided, check if it already exists
    if (phone) {
      console.log('[createParent] Checking for existing parent by phone:', phone);
      const existingParentByPhone = await User.findOne({ phone, role: 'parent' });
      if (existingParentByPhone) {
        console.log('[createParent] Duplicate phone found:', phone);
        return res.status(409).json({ message: 'Parent with this phone number already exists.' });
      }
    }
    // Hash password (auto-generate or from req.body)
    let password = req.body.password;
    if (!password) {
      password = Math.random().toString(36).slice(-8); // Generate random 8-char password
      console.log('[createParent] Auto-generated password:', password);
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    // Create parent as User with role 'parent'
    const parentData = {
      name,
      phone,
      password: hashedPassword,
      role: 'parent',
      createdBy: req.user._id,
    };
    if (email) parentData.email = email;
    if (assignedKey) parentData.assignedKey = assignedKey;
    console.log('[createParent] Creating parent with data:', parentData);
    const parent = new User(parentData);
    await parent.save();
    console.log('[createParent] Parent created:', parent._id);
    // If assignedKey is provided, assign key and update stats
    if (assignedKey) {
      console.log('[createParent] AssignedKey provided, processing key assignment:', assignedKey);
      const key = await Key.findOne({ key: assignedKey });
      if (!key) {
        console.log('[createParent] Invalid activation key:', assignedKey);
        return res.status(404).json({ message: 'Invalid activation key.' });
      }
      if (key.isAssigned) {
        console.log('[createParent] Activation key already assigned:', assignedKey);
        return res.status(409).json({ message: 'Activation key already assigned.' });
      }
      key.isAssigned = true;
      key.assignedTo = parent._id;
      key.assignedAt = new Date();
      key.currentOwner = parent._id;
      await key.save();
      console.log('[createParent] Key assigned to parent:', parent._id);
      // Increment assignedKeys for retailer
      await User.updateOne(
        { _id: req.user._id },
        { $inc: { transferredKeys: 1 } }
      );
      await User.updateOne(
        { _id: parent._id },
        { $inc: { receivedKeys: 1, assignedKeys: 1 } }
      );
      console.log('[createParent] Retailer and parent stats updated.');
    }
    res.status(201).json({
      message: 'Parent created successfully.',
      parent: {
        id: parent._id,
        name: parent.name,
        phone: parent.phone,
        email: parent.email,
        assignedKey: parent.assignedKey,
      },
      password: req.body.password ? undefined : password // Only return if auto-generated
    });
    console.log('[createParent] Success response sent.');
  } catch (error) {
    console.error('[createParent] Error creating parent:', error);
    res.status(500).json({ message: `Server error during parent creation. ${error}` });
  }
};


// GET /retailer/profile
exports.getRetailerProfile = async (req, res) => {
  try {
    const retailer = await User.findById(req.user.id).select('-password');
    if (!retailer || retailer.role !== 'retailer') {
      return res.status(404).json({ message: 'Retailer not found' });
    }
    // Add assignedKeys, usedKeys, transferredKeys, receivedKeys to profile response
    res.json({
      id: retailer._id,
      name: retailer.name,
      email: retailer.email,
      phone: retailer.phone,
      address: retailer.address,
      status: retailer.status,
      assignedKeys: retailer.assignedKeys || 0,
      usedKeys: retailer.usedKeys || 0,
      transferredKeys: retailer.transferredKeys || 0,
      receivedKeys: retailer.receivedKeys || 0,
      createdAt: retailer.createdAt,
      updatedAt: retailer.updatedAt
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /retailer/stats
exports.getRetailerStats = async (req, res) => {
  try {
    const retailerId = req.user.id;
    const retailerUser = await User.findById(retailerId).select('transferredKeys receivedKeys assignedKeys usedKeys');
    // For retailers, totalKeys is assignedKeys
    const totalKeys = retailerUser?.assignedKeys || 0;
    // Count parents created by this retailer
    const totalParents = await User.countDocuments({ createdBy: retailerId, role: 'parent' });
    res.json({
      totalKeys,
      totalParents,
      assignedKeys: retailerUser?.assignedKeys || 0,
      usedKeys: retailerUser?.usedKeys || 0,
      totalTransfers: retailerUser?.transferredKeys || 0,
      totalReceived: retailerUser?.receivedKeys || 0
    });
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
      return res.json(
        {
          message: 'Active devices fetched successfully.',
          parents
        });
    }

    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: 'Server error', err });
  }
};

// GET /retailer/key-info
exports.eyInfo = async (req, res) => {
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

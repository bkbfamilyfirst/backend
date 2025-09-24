const User = require('../models/User');
const Key = require('../models/Key');
const KeyTransferLog = require('../models/KeyTransferLog');
const { validatePassword, hashPassword } = require('../utils/password');
const jwt = require('jsonwebtoken');
const KeyRequest = require('../models/KeyRequest');
const Notification = require('../models/Notification');
const mongoose = require('mongoose');

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
    const period = req.query.period || 'daily';
    // Get full retailer user doc for all fields
    const retailerUser = await User.findById(retailerId).select('assignedKeys usedKeys transferredKeys receivedKeys');
    // Total keys for retailer: use assignedKeys as the main metric
    const totalKeys = retailerUser?.receivedKeys || 0;
    // Total assigned keys (from User model)
    const assignedKeys = retailerUser?.assignedKeys || 0;
    // Used keys (transferred to parents)
    const usedKeys = retailerUser?.usedKeys || 0;
    // Balance = assigned - used
    const totalBalance = totalKeys - retailerUser?.transferredKeys;
    // Total transferred (from User model: transferredKeys)
    const totalTransferred = retailerUser?.transferredKeys || 0;
    const totalReceived = retailerUser?.receivedKeys || 0;

    // Period-based activations
    let dateFilter = {};
    const now = new Date();
    if (period === 'daily') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      dateFilter = { $gte: start, $lte: end };
    } else if (period === 'weekly') {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      start.setHours(0, 0, 0, 0);
      dateFilter = { $gte: start, $lte: now };
    } else if (period === 'monthly') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      dateFilter = { $gte: start, $lte: now };
    } else if (period === 'yearly') {
      const start = new Date(now.getFullYear(), 0, 1);
      dateFilter = { $gte: start, $lte: now };
    }
    const periodActivations = await KeyTransferLog.countDocuments({
      from: retailerId,
      transferType: 'retailer-to-parent',
      createdAt: dateFilter
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
      periodActivations,
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

// GET /retailer/key-requests - list key requests sent to this retailer or unassigned
exports.listKeyRequests = async (req, res) => {
  try {
    const retailerId = req.user._id;
    const requests = await KeyRequest.find({ $or: [ { toRetailer: retailerId }, { toRetailer: { $exists: false } } ] })
      .populate('fromParent', 'name phone email')
      .sort({ createdAt: -1 });
    res.json({ requests });
  } catch (err) {
    console.error('Error listing key requests:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// PATCH /retailer/key-requests/:id/approve - approve request and optionally assign a key
exports.approveKeyRequest = async (req, res) => {
  const retailerId = req.user._id;
  const requestId = req.params.id;
  const { keyToAssignId, responseMessage } = req.body || {};

  // Pre-check request exists and authorization before opening a session
  const krPre = await KeyRequest.findById(requestId).select('toRetailer status fromParent');
  if (!krPre) return res.status(404).json({ message: 'Key request not found.' });
  if (krPre.toRetailer && String(krPre.toRetailer) !== String(retailerId)) {
    return res.status(403).json({ message: 'Not authorized to manage this request.' });
  }

  // Try to run the critical section in a transaction when sessions are available
  let session;
  try {
    session = await mongoose.startSession();
  } catch (e) {
    session = null;
  }

  if (session && session.startTransaction) {
    try {
      let assignedKey = null;
      await session.withTransaction(async () => {
        // Atomically change request status from 'pending' to 'approved' so only one approver can succeed
        const krSession = await KeyRequest.findOneAndUpdate(
          { _id: requestId, status: 'pending' },
          { $set: { status: 'approved', toRetailer: retailerId, responseMessage: responseMessage || '' } },
          { new: true, session }
        );
        if (!krSession) throw new Error('Key request is no longer pending or not found (idempotent guard)');

        if (keyToAssignId) {
          // Try by _id first
          let key = null;
          try {
            key = await Key.findOne({ _id: keyToAssignId, isAssigned: false }).session(session);
          } catch (e) {
            // ignore
          }
          if (!key) {
            key = await Key.findOne({ key: keyToAssignId, isAssigned: false }).session(session);
          }
          if (!key) throw new Error('Key not found or already assigned.');
          key.isAssigned = true;
          key.assignedTo = krSession.fromParent;
          key.assignedAt = new Date();
          key.currentOwner = krSession.fromParent;
          await key.save({ session });
          assignedKey = key;

          // Update stats
          await User.updateOne({ _id: krSession.fromParent }, { $inc: { receivedKeys: 1, assignedKeys: 1 } }, { session });
          await User.updateOne({ _id: retailerId }, { $inc: { transferredKeys: 1 } }, { session });
        } else {
          // Atomically pick the oldest unassigned key owned by this retailer
          const key = await Key.findOneAndUpdate(
            { currentOwner: retailerId, isAssigned: false },
            { $set: { isAssigned: true, assignedTo: krSession.fromParent, assignedAt: new Date(), currentOwner: krSession.fromParent } },
            { new: true, sort: { createdAt: 1 }, session }
          );
          if (!key) throw new Error('No available keys in your pool to assign. Please add keys or specify a key to assign.');
          assignedKey = key;

          // Update parent and retailer stats
          await User.updateOne({ _id: krSession.fromParent }, { $inc: { receivedKeys: 1, assignedKeys: 1 } }, { session });
          await User.updateOne({ _id: retailerId }, { $inc: { transferredKeys: 1 } }, { session });
        }

        // Write transfer log inside transaction
        if (assignedKey) {
          const log = new KeyTransferLog({ fromUser: retailerId, toUser: krSession.fromParent, count: 1, status: 'completed', type: 'retailer-to-parent', notes: `Assigned key ${assignedKey.key} to parent ${krSession.fromParent}` });
          await log.save({ session });
        }

        // Notify parent (notification saved inside transaction)
        const notif = new Notification({ userId: krSession.fromParent, type: 'key_request_approved', message: `Your key request was approved by retailer. ${responseMessage || ''}`, meta: { keyRequestId: krSession._id, assignedKeyId: assignedKey?._id || null } });
        await notif.save({ session });
      }); // end transaction

  session.endSession();
  // Return assignedKey details along with updated request
  const updatedRequest = await KeyRequest.findById(requestId);
  return res.json({ message: 'Key request approved.', request: updatedRequest, assignedKey: assignedKey ? assignedKey.toObject() : null });
    } catch (err) {
      console.error('Transaction failed approving key request:', err);
      try { if (session) await session.abortTransaction(); } catch(e){}
      try { if (session) session.endSession(); } catch(e){}
      // Fall back to non-transactional path below
    }
  }

  // Non-transactional fallback (existing behavior) - but still perform an atomic status flip to enforce idempotency
  try {
    let assignedKey = null;
    // Atomically flip KeyRequest status to 'approved' (idempotency guard)
    const krAtomic = await KeyRequest.findOneAndUpdate(
      { _id: requestId, status: 'pending' },
      { $set: { status: 'approved', toRetailer: retailerId, responseMessage: responseMessage || '' } },
      { new: true }
    );
    if (!krAtomic) return res.status(409).json({ message: 'Key request is no longer pending or not found (idempotent guard).' });

    if (keyToAssignId) {
      let key = null;
      try { key = await Key.findOne({ _id: keyToAssignId, isAssigned: false }); } catch(e){}
      if (!key) key = await Key.findOne({ key: keyToAssignId, isAssigned: false });
      if (!key) return res.status(404).json({ message: 'Key not found or already assigned.' });
      key.isAssigned = true;
      key.assignedTo = krAtomic.fromParent;
      key.assignedAt = new Date();
      key.currentOwner = krAtomic.fromParent;
      await key.save();
      assignedKey = key;
      await User.updateOne({ _id: krAtomic.fromParent }, { $inc: { receivedKeys: 1, assignedKeys: 1 } });
      await User.updateOne({ _id: retailerId }, { $inc: { transferredKeys: 1 } });
    } else {
      const key = await Key.findOneAndUpdate(
        { currentOwner: retailerId, isAssigned: false },
        { $set: { isAssigned: true, assignedTo: krAtomic.fromParent, assignedAt: new Date(), currentOwner: krAtomic.fromParent } },
        { new: true, sort: { createdAt: 1 } }
      );
      if (!key) return res.status(400).json({ message: 'No available keys in your pool to assign. Please add keys or specify a key to assign.' });
      assignedKey = key;
      await User.updateOne({ _id: krAtomic.fromParent }, { $inc: { receivedKeys: 1, assignedKeys: 1 } });
      await User.updateOne({ _id: retailerId }, { $inc: { transferredKeys: 1 } });
    }

    if (assignedKey) {
      try {
        const log = new KeyTransferLog({ fromUser: retailerId, toUser: kr.fromParent, count: 1, status: 'completed', type: 'retailer-to-parent', notes: `Assigned key ${assignedKey.key} to parent ${kr.fromParent}` });
        await log.save();
      } catch (e) {
        console.error('Failed to write KeyTransferLog:', e);
      }
    }

    // Create notification (include assignedKey id for parent consumption)
    const notif = new Notification({ userId: krAtomic.fromParent, type: 'key_request_approved', message: `Your key request was approved by retailer. ${responseMessage || ''}`, meta: { keyRequestId: krAtomic._id, assignedKeyId: assignedKey?._id || null } });
    await notif.save();

    return res.json({ message: 'Key request approved.', request: krAtomic, assignedKey: assignedKey ? assignedKey.toObject() : null });
  } catch (err) {
    console.error('Error approving key request (fallback):', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// PATCH /retailer/key-requests/:id/deny - deny request
exports.denyKeyRequest = async (req, res) => {
  try {
    const retailerId = req.user._id;
    const requestId = req.params.id;
    const { responseMessage } = req.body || {};

    const kr = await KeyRequest.findById(requestId);
    if (!kr) return res.status(404).json({ message: 'Key request not found.' });
    if (kr.toRetailer && String(kr.toRetailer) !== String(retailerId)) {
      return res.status(403).json({ message: 'Not authorized to manage this request.' });
    }

    kr.status = 'denied';
    kr.responseMessage = responseMessage || '';
    await kr.save();

    const notif = new Notification({ userId: kr.fromParent, type: 'key_request_denied', message: `Your key request was denied. ${responseMessage || ''}`, meta: { keyRequestId: kr._id } });
    await notif.save();

    return res.json({ message: 'Key request denied.' });
  } catch (err) {
    console.error('Error denying key request:', err);
    res.status(500).json({ message: 'Server error' });
  }
};
// POST /retailer/create-parent
exports.createParent = async (req, res) => {
  // Expect 'address' from frontend
    const { name, username, phone, email, password, assignedKey, address } = req.body;
  console.log('[createParent] Incoming request:', { name, username, phone, email, assignedKey, address, notes });
  if (!name || !username || !phone) {
    console.log('[createParent] Missing required fields:', { name, username, phone });
    return res.status(400).json({ message: 'Parent name, username, and phone are required.' });
  }
  try {
    // If username is provided, check if it already exists
    if (username) {
      console.log('[createParent] Checking for existing parent by username:', username);
      const existingParentByUsername = await User.findOne({ username, role: 'parent' });
      if (existingParentByUsername) {
        console.log('[createParent] Duplicate username found:', username);
        return res.status(409).json({ message: 'Parent with this username already exists.' });
      }
    }
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
    const passCheck = validatePassword(password);
    if (!passCheck.valid) return res.status(400).json({ message: passCheck.message });
    const hashedPassword = await hashPassword(password);
    // Create parent as User with role 'parent'
    const parentData = {
      name,
      username,
      phone,
      password: hashedPassword,
      role: 'parent',
      createdBy: req.user._id,
    };
  if (email) parentData.email = email;
  if (assignedKey) parentData.assignedKey = assignedKey;
  if (address) parentData.address = address;
  if (notes) parentData.notes = notes;
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
        username: parent.username,
        phone: parent.phone,
        email: parent.email,
        address: parent.address,
        notes: parent.notes,
        assignedKey: parent.assignedKey,
      }
    });
    console.log('[createParent] Success response sent.');
  } catch (error) {
    console.error('[createParent] Error creating parent:', error);
    res.status(500).json({ message: `Server error during parent creation. ${error}` });
  }
};

// POST /retailer/parents/:id/change-password
exports.changeParentPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const retailerId = req.user._id;
    const { newPassword } = req.body;

    if (!id || id === 'undefined' || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: 'Invalid Parent ID provided.' });
    }

    const { validatePassword, hashPassword } = require('../utils/password');
    const check = validatePassword(newPassword);
    if (!check.valid) return res.status(400).json({ message: check.message });

    // Ensure parent exists and belongs to this retailer
    const parent = await User.findOne({ _id: id, role: 'parent', createdBy: retailerId });
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found or not authorized.' });
    }

    const hashed = await hashPassword(newPassword);
    await User.updateOne({ _id: id }, { $set: { password: hashed } });

    res.status(200).json({ message: 'Password updated successfully.' });
  } catch (err) {
    console.error('Error changing parent password for retailer:', err);
    res.status(500).json({ message: 'Server error during parent password change.' });
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
      username: retailer.username,
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
exports.keyInfo = async (req, res) => {
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

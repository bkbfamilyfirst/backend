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
    res.status(500).json({ message: `Error fetching owned keys: ${err.message}` });
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
    res.status(500).json({ message: `Error fetching key info: ${err.message}` });
  }
};
// GET /retailer/reports
exports.getReports = async (req, res) => {
  try {
    const retailerId = req.user.id;
    const period = req.query.period || 'daily';
    const retailerUser = await User.findById(retailerId).select('transferredKeys receivedKeys');
    const receivedKeys = retailerUser?.receivedKeys || 0;
    const transferredKeys = retailerUser?.transferredKeys || 0;
    const totalBalance = receivedKeys - transferredKeys;

    // Resolve parents and children belonging to this retailer
    const parentIds = await User.find({ createdBy: retailerId, role: 'parent' }).distinct('_id');
    const childIds = parentIds.length > 0
      ? await User.find({ createdBy: { $in: parentIds }, role: 'child' }).distinct('_id')
      : [];

    // Period-based activations (keys assigned to children)
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

    const periodActivations = childIds.length > 0
      ? await Key.countDocuments({ assignedTo: { $in: childIds }, assignedAt: dateFilter })
      : 0;

    // Total active parents (unchanged)
    const totalActiveParents = await User.countDocuments({ createdBy: retailerId, role: 'parent', status: 'active' });

    res.json({
      receivedKeys,
      transferredKeys,
      totalBalance,
      periodActivations,
      totalActiveParents
    });
  } catch (err) {
    res.status(500).json({ message: `Error fetching reports: ${err.message}` });
  }
};

// GET /retailer/dashboard-summary
exports.getDashboardSummary = async (req, res) => {
  try {
    const retailerId = req.user.id;
    const retailerUser = await User.findById(retailerId).select('transferredKeys receivedKeys');
    // Resolve parents and children for this retailer
    const parentIds = await User.find({ createdBy: retailerId, role: 'parent' }).distinct('_id');
    const childIds = parentIds.length > 0
      ? await User.find({ createdBy: { $in: parentIds }, role: 'child' }).distinct('_id')
      : [];

    // Today's activations (keys assigned to children today)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const todaysActivations = childIds.length > 0
      ? await Key.countDocuments({ assignedTo: { $in: childIds }, assignedAt: { $gte: todayStart, $lte: todayEnd } })
      : 0;

    // Total activations (keys ever assigned to children)
    const totalActivations = childIds.length > 0
      ? await Key.countDocuments({ assignedTo: { $in: childIds } })
      : 0;

    // Pending activations: keys currently with parents (parents hold key) but not assigned to child
    const pendingActivations = parentIds.length > 0
      ? await Key.countDocuments({ currentOwner: { $in: parentIds }, isAssigned: false })
      : 0;

    // Active devices: distinct children that have an active key (validUntil > now)
    const now = new Date();
    const activeChildIds = childIds.length > 0
      ? await Key.distinct('assignedTo', { assignedTo: { $in: childIds }, isAssigned: true, validUntil: { $gt: now } })
      : [];
    const activeDevices = activeChildIds.length;
    // Add assigned/used/transferred/received keys to dashboard summary
    res.json({
      todaysActivations,
      totalActivations,
      pendingActivations,
      activeDevices,
      receivedKeys: retailerUser?.receivedKeys || 0,
      transferredKeys: retailerUser?.transferredKeys || 0
    });
  } catch (err) {
    res.status(500).json({ message: `Error fetching dashboard summary: ${err.message}` });
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
        res.status(500).json({ message: `Error listing parents: ${error.message}` });
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
    res.status(500).json({ message: `Error listing key requests: ${err.message}` });
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
          // Ensure the key is in the retailer's pool (currentOwner matches retailer)
          if (key.currentOwner && String(key.currentOwner) !== String(retailerId)) {
            throw new Error('Key is not available in your pool.');
          }
          key.isAssigned = false;
          key.assignedTo = krSession.fromParent;
          key.assignedAt = new Date();
          key.currentOwner = krSession.fromParent;
          await key.save({ session });
          assignedKey = key;

          // Update stats (parent receives, retailer increments transferred)
          await User.updateOne({ _id: krSession.fromParent }, { $inc: { receivedKeys: 1 } }, { session });
          await User.updateOne({ _id: retailerId }, { $inc: { transferredKeys: 1 } }, { session });
        } else {
          // Atomically pick the oldest unassigned key owned by this retailer
          const key = await Key.findOneAndUpdate(
            { currentOwner: retailerId, isAssigned: false },
            { $set: { isAssigned: false, assignedTo: krSession.fromParent, assignedAt: new Date(), currentOwner: krSession.fromParent } },
            { new: true, sort: { createdAt: 1 }, session }
          );
          if (!key) throw new Error('No available keys in your pool to assign. Please add keys or specify a key to assign.');
          assignedKey = key;

          // Update parent and retailer stats
          await User.updateOne({ _id: krSession.fromParent }, { $inc: { receivedKeys: 1 } }, { session });
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
      if (key.currentOwner && String(key.currentOwner) !== String(retailerId)) return res.status(400).json({ message: 'Key is not available in your pool.' });
      key.isAssigned = false;
      key.assignedTo = krAtomic.fromParent;
      key.assignedAt = new Date();
      key.currentOwner = krAtomic.fromParent;
      await key.save();
      assignedKey = key;
  await User.updateOne({ _id: krAtomic.fromParent }, { $inc: { receivedKeys: 1 } });
  await User.updateOne({ _id: retailerId }, { $inc: { transferredKeys: 1 } });
    } else {
      const key = await Key.findOneAndUpdate(
        { currentOwner: retailerId, isAssigned: false },
        { $set: { isAssigned: false, assignedTo: krAtomic.fromParent, assignedAt: new Date(), currentOwner: krAtomic.fromParent } },
        { new: true, sort: { createdAt: 1 } }
      );
      if (!key) return res.status(400).json({ message: 'No available keys in your pool to assign. Please add keys or specify a key to assign.' });
      assignedKey = key;
  await User.updateOne({ _id: krAtomic.fromParent }, { $inc: { receivedKeys: 1 } });
  await User.updateOne({ _id: retailerId }, { $inc: { transferredKeys: 1 } });
    }

    if (assignedKey) {
      try {
        const log = new KeyTransferLog({ fromUser: retailerId, toUser: krAtomic.fromParent, count: 1, status: 'completed', type: 'retailer-to-parent', notes: `Assigned key ${assignedKey.key} to parent ${krAtomic.fromParent}` });
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
    return res.status(500).json({ message: `Error approving key request: ${err.message}` });
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
    res.status(500).json({ message: `Error denying key request: ${err.message}` });
  }
};
// POST /retailer/create-parent
exports.createParent = async (req, res) => {
  // Expect 'address' from frontend
    const { name, username, phone, email, password, address, assignedKey, notes } = req.body;
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
    // let password = req.body.password;
    // if (!password) {
    //   password = Math.random().toString(36).slice(-8); // Generate random 8-char password
    //   console.log('[createParent] Auto-generated password:', password);
    // }
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
      key.isAssigned = false;
      key.assignedTo = parent._id;
      key.assignedAt = new Date();
      key.currentOwner = parent._id;
      await key.save();
      console.log('[createParent] Key assigned to parent:', parent._id);
      // Increment transferred keys for retailer
      await User.updateOne(
        { _id: req.user._id },
        { $inc: { transferredKeys: 1 } }
      );
      await User.updateOne(
        { _id: parent._id },
        { $inc: { receivedKeys: 1 } }
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
    res.status(500).json({ message: `Error creating parent: ${error.message}` });
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
    res.status(500).json({ message: `Error changing parent password: ${err.message}` });
  }
};


// GET /retailer/profile
exports.getRetailerProfile = async (req, res) => {
  try {
    const retailer = await User.findById(req.user.id).select('-password');
    if (!retailer || retailer.role !== 'retailer') {
      return res.status(404).json({ message: 'Retailer not found' });
    }
    // Add transferredKeys, receivedKeys to profile response
    res.json({
      id: retailer._id,
      name: retailer.name,
      email: retailer.email,
      phone: retailer.phone,
      username: retailer.username,
      address: retailer.address,
      status: retailer.status,
      transferredKeys: retailer.transferredKeys || 0,
      receivedKeys: retailer.receivedKeys || 0,
      createdAt: retailer.createdAt,
      updatedAt: retailer.updatedAt
    });
  } catch (err) {
    res.status(500).json({ message: `Error fetching retailer profile: ${err.message}` });
  }
};
// GET /retailer/stats
exports.getRetailerStats = async (req, res) => {
  try {
    const retailerId = req.user.id;
    const retailerUser = await User.findById(retailerId).select('transferredKeys receivedKeys');
    // For retailers, totalKeys is receivedKeys
    const totalKeys = retailerUser?.receivedKeys || 0;
    // Count parents created by this retailer
    const totalParents = await User.countDocuments({ createdBy: retailerId, role: 'parent' });
    res.json({
      totalKeys,
      totalParents,
      totalTransferred: retailerUser?.transferredKeys || 0,
      totalReceived: retailerUser?.receivedKeys || 0
    });
  } catch (err) {
    res.status(500).json({ message: `Error fetching retailer stats: ${err.message}` });
  }
};

// GET /retailer/activation-history with filter support (returns paginated keys)
exports.getActivationHistory = async (req, res) => {
  try {
    const retailerId = req.user.id;
    const filter = req.query.filter || 'all';
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    // Resolve parents and children ids
    const parentIds = await User.find({ createdBy: retailerId, role: 'parent' }).distinct('_id');
    const childIds = parentIds.length > 0
      ? await User.find({ createdBy: { $in: parentIds }, role: 'child' }).distinct('_id')
      : [];

    // Build key query based on filter
    const now = new Date();
    let keyQuery = {};
    if (filter === 'today') {
      // Keys assigned to children today
      const start = new Date(); start.setHours(0,0,0,0);
      const end = new Date(); end.setHours(23,59,59,999);
      keyQuery = { assignedTo: { $in: childIds }, isAssigned: true, assignedAt: { $gte: start, $lte: end } };
    } else if (filter === 'pending') {
      // Keys currently with parents (received by parent but not assigned to child)
      keyQuery = { currentOwner: { $in: parentIds }, isAssigned: false };
    } else if (filter === 'active-devices') {
      // Keys assigned to children and still valid
      keyQuery = { assignedTo: { $in: childIds }, isAssigned: true, validUntil: { $gt: now } };
    } else if (filter === 'activations') {
      // Keys assigned to children (no date filter)
      keyQuery = { assignedTo: { $in: childIds }, isAssigned: true };
    } else {
      // 'all' - include keys held by parents or assigned to children under this retailer
      keyQuery = { $or: [ { currentOwner: { $in: parentIds } }, { assignedTo: { $in: childIds } } ] };
    }

    // If no parents/children exist, return empty
    if (parentIds.length === 0 && childIds.length === 0) {
      return res.json({ total: 0, page, limit, keys: [] });
    }

    // Count and fetch keys with pagination
    const total = await Key.countDocuments(keyQuery);
    const keys = await Key.find(keyQuery)
      .sort({ assignedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('currentOwner', 'name role')
      .populate('assignedTo', 'name role createdBy')
      .lean();

    // Format keys for response, include parent/child info where applicable
    const formatted = await Promise.all(keys.map(async k => {
      // Determine parent if currentOwner is a parent
      let parent = null;
      if (k.currentOwner) {
        const u = await User.findById(k.currentOwner).select('_id name role createdBy').lean();
        if (u && u.role === 'parent') parent = { id: u._id, name: u.name };
      }
      // Determine child if assignedTo
      let child = null;
      if (k.assignedTo) {
        const c = await User.findById(k.assignedTo).select('_id name createdBy').lean();
        if (c) child = { id: c._id, name: c.name, parentId: c.createdBy };
      }

      // Status normalization
      let status = 'unknown';
      if (k.isAssigned && k.assignedTo) {
        status = (k.validUntil && new Date(k.validUntil) > now) ? 'active' : 'expired';
      } else if (k.currentOwner && parentIds.some(id => String(id) === String(k.currentOwner))) {
        status = 'pending';
      } else {
        status = 'in_pool';
      }

      return {
        id: k._id,
        key: k.key,
        isAssigned: k.isAssigned,
        assignedAt: k.assignedAt,
        validUntil: k.validUntil,
        currentOwner: k.currentOwner,
        parent,
        child,
        status
      };
    }));

    res.json({ total, page, limit, keys: formatted });
  } catch (err) {
    res.status(500).json({ message: `Error fetching activation history: ${err.message}` });
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
    res.status(500).json({ message: `Error fetching key info: ${err.message}` });
  }
};

// POST /retailer/transfer-keys-to-parent
exports.transferKeysToParent = async (req, res) => {
    try {
        const { parentId, keysToTransfer } = req.body;
        if (!parentId || !keysToTransfer || keysToTransfer <= 0) {
            return res.status(400).json({ message: 'Please provide a valid Parent ID and a positive number of keys to transfer.' });
        }
        const parentUser = await User.findOne({ _id: parentId, role: 'parent', createdBy: req.user._id });
        if (!parentUser) {
            return res.status(404).json({ message: 'Parent not found.' });
        }
        // Count available unassigned keys currently owned by DB
        const availableUnassignedKeysCount = await Key.countDocuments({ isAssigned: false, currentOwner: req.user._id });
        if (keysToTransfer > availableUnassignedKeysCount) {
            return res.status(400).json({ message: `Cannot transfer ${keysToTransfer} keys. Only ${availableUnassignedKeysCount} unassigned keys available for this DB.` });
        }
        // Find and update a batch of unassigned keys owned by this DB
        const keysToMarkAssigned = await Key.find({ isAssigned: false, currentOwner: req.user._id }).limit(keysToTransfer);
        const keyIdsToUpdate = keysToMarkAssigned.map(key => key._id);
        const session = await mongoose.startSession();
        session.startTransaction();
        try{
            await Key.updateMany(
                { _id: { $in: keyIdsToUpdate } },
                { $set: { currentOwner: parentUser._id } },
                { session }
            );

        // Increment transferredKeys for Retailer (sender)
        await User.updateOne(
            { _id: req.user._id },
            { $inc: { transferredKeys: keysToTransfer } },
            { session }
        );
        // Increment receivedKeys for Parent (receiver)
        await User.updateOne(
            { _id: parentUser._id },
            { $inc: { receivedKeys: keysToTransfer } },
            { session }
        );
        // Create KeyTransferLog
        const newKeyTransferLog = new KeyTransferLog({
            fromUser: req.user._id,
            toUser: parentId,
            count: keysToTransfer,
            status: 'completed',
            type: 'bulk',
            notes: `Bulk transferred ${keysToTransfer} keys from Retailer to Parent: ${parentUser.name}`
        });
        await newKeyTransferLog.save({ session });
        await session.commitTransaction();
        res.status(200).json({ message: 'Keys transferred to Parent successfully.' });
        } catch (e) {
            await session.abortTransaction();
            console.error('Error during key transfer transaction:', e);
            res.status(500).json({ message: `Error transferring keys: ${e.message}` });
        } finally {
            session.endSession();
        }
    } catch (error) {
        console.error('Error transferring keys to Parent:', error);
        res.status(500).json({ message: `Server error during key transfer. ${error.message}` });
    }
};

// POST /retailer/logout
exports.logout = async (req, res) => {
  // For JWT, logout is handled on client by deleting token, but you can implement blacklist if needed
  res.json({ message: 'Logged out successfully' });
};

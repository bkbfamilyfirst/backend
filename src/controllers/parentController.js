const User = require('../models/User');
const Key = require('../models/Key');
const { validatePassword, hashPassword } = require('../utils/password');
const jwt = require('jsonwebtoken');
const Device = require('../models/Device');
const Child = require('../models/Child');
const KeyRequest = require('../models/KeyRequest');
const Notification = require('../models/Notification');
const mongoose = require('mongoose'); // add near other requires

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
// exports.createParent = async (req, res) => {
//     // Prefer `address` if provided (back-compat not required here, but keep pattern)
//     const { name, phone, email, deviceImei, assignedKey, address, role } = req.body;
//     if (!name || !phone || !email || !deviceImei || !assignedKey) {
//         return res.status(400).json({ message: 'All fields are required.' });
//     }
//     try {
//         // Check if email or IMEI already exists
//         const existingParentByEmail = await User.findOne({ email, role: 'parent' });
//         if (existingParentByEmail) {
//             return res.status(409).json({ message: 'Parent with this email already exists.' });
//         }
//         const existingParentByImei = await User.findOne({ deviceImei, role: 'parent' });
//         if (existingParentByImei) {
//             return res.status(409).json({ message: 'Parent with this device IMEI already exists.' });
//         }
//         // Check if assignedKey is valid and not already assigned
//         const key = await Key.findOne({ key: assignedKey });
//         if (!key) {
//             return res.status(404).json({ message: 'Invalid activation key.' });
//         }
//         if (key.isAssigned) {
//             return res.status(409).json({ message: 'Activation key already assigned.' });
//         }
//         // Hash password (auto-generate or from req.body)
//         let password = req.body.password;
//         if (!password) {
//             password = Math.random().toString(36).slice(-8); // Generate random 8-char password
//         }
//         // Validate provided password when present
//         const passCheck = validatePassword(password);
//         if (!passCheck.valid) return res.status(400).json({ message: passCheck.message });
//         const hashedPassword = await hashPassword(password);
//         // Create parent as User with role 'parent'
//         const parent = new User({
//             name,
//             phone,
//             email,
//             password: hashedPassword,
//             role: 'parent',
//             deviceImei,
//             assignedKey,
//             createdBy: req.user._id,
//         });
//         if (address) parent.address = address;
//         await parent.save();
//         // Assign key
//         key.isAssigned = true;
//         key.assignedTo = parent._id;
//         key.assignedAt = new Date();
//         await key.save();
//         res.status(201).json({
//             message: 'Parent created successfully.',
//             parent: {
//                 id: parent._id,
//                 name: parent.name,
//                 phone: parent.phone,
//                 email: parent.email,
//                 deviceImei: parent.deviceImei,
//                 assignedKey: parent.assignedKey,
//             }
//         });
//     } catch (error) {
//         console.error('Error creating parent:', error);
//         res.status(500).json({ message: 'Server error during parent creation.' });
//     }
// };
        
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
// Replace createChild with transaction-safe implementation that atomically claims a key and assigns it to the new child
exports.createChild = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        const parentId = req.user && req.user._id;
        if (!parentId) return res.status(401).json({ message: 'Authentication required.' });

        const parent = await User.findOne({ _id: parentId, role: 'parent' });
        if (!parent) return res.status(404).json({ message: 'Parent not found.' });

        const { name, age } = req.body || {};
        if (!name || age === undefined) {
            return res.status(400).json({ message: 'Child name and age are required.' });
        }

        // Start transaction to avoid race conditions when claiming a key
        session.startTransaction();
        // Atomically find & mark a key as temporarily claimed (isAssigned true prevents others claiming)
        const availableKey = await Key.findOneAndUpdate(
            { currentOwner: parent._id, isAssigned: false },
            { $set: { isAssigned: true } },
            { session, new: true }
        );

        if (!availableKey) {
            await session.abortTransaction();
            session.endSession();
            return res.status(403).json({ message: 'No available activation key found. Please request a key from your retailer.' });
        }

        // Create child with assignedKey referencing the Key._id
        const child = new Child({
            name,
            age,
            parentId: parent._id,
            assignedKey: availableKey._id
        });
        await child.save({ session });

        // Finalize key assignment: set assignedTo, assignedAt, validUntil (2 years)
        const twoYears = new Date();
        twoYears.setFullYear(twoYears.getFullYear() + 2);
        await Key.updateOne(
            { _id: availableKey._id, isAssigned: true }, // ensure we still hold the claim
            { $set: { assignedTo: child._id, assignedAt: new Date(), validUntil: twoYears } },
            { session }
        );

        // Increment parent's transferredKeys counter
        await User.updateOne({ _id: parent._id }, { $inc: { transferredKeys: 1 } }, { session });

        await session.commitTransaction();
        session.endSession();

        return res.status(201).json({
            message: 'Child created successfully.',
            child: {
                id: child._id,
                name: child.name,
                age: child.age,
                parentId: child.parentId,
                assignedKey: child.assignedKey
            }
        });
    } catch (error) {
        try { await session.abortTransaction(); } catch (e) {}
        session.endSession();
        console.error('Error creating child:', error);
        return res.status(500).json({ message: `Server error during child creation. ${error?.message}` });
    }
};

// POST /parent/request-key - parent requests a key (optionally target a retailer)
exports.requestKey = async (req, res) => {
    try {
        const parentId = req.user && req.user._id;
        if (!parentId) return res.status(401).json({ message: 'Authentication required.' });

        const parent = await User.findOne({ _id: parentId, role: 'parent' });
        if (!parent) return res.status(404).json({ message: 'Parent not found.' });

        // Determine retailer from parent.createdBy (no input required from client)
        const retailerId = parent.createdBy;

        // Compose a standard message server-side
        const message = `Parent ${parent.name} has requested an activation key.`;

        // Create key request targeting the retailer found from parent.createdBy (if any)
        const kr = new KeyRequest({
            fromParent: parent._id,
            toRetailer: retailerId || undefined,
            message
        });
        await kr.save();

        // Notify retailer if it exists
        if (retailerId) {
            const retailer = await User.findOne({ _id: retailerId, role: 'retailer' });
            if (retailer) {
                const notif = new Notification({
                    userId: retailerId,
                    type: 'key_request',
                    message: `New key request from parent ${parent.name}`,
                    meta: { keyRequestId: kr._id, parentId: parent._id }
                });
                await notif.save();
            }
        }

        return res.status(201).json({ message: 'Key request created successfully.', request: kr });
    } catch (error) {
        console.error('Error creating key request:', error);
        return res.status(500).json({ message: 'Server error during key request.' });
    }
};

exports.getKeyStatus = async (req, res) => {
    try {
        const parentId = req.user && req.user._id;
        if (!parentId) {
            return res.status(401).json({ message: 'Authentication required.' });
        }

        // Find all keys for this parent that are NOT assigned
        const unassignedKeys = await Key.find({ currentOwner: parentId, isAssigned: false });

        const keyCount = unassignedKeys.length;

        if (keyCount === 0) {
            return res.status(200).json({ message: 'You have 0 keys available.' });
        }

        return res.status(200).json({ 
            message: `You have ${keyCount} keys available.`,
            keys: unassignedKeys 
        });
    } catch (error) {
        console.error('Error retrieving key status:', error);
        return res.status(500).json({ message: 'Server error during key status retrieval.' });
    }
};
const Parent = require('../models/Parent');
const Key = require('../models/Key');
const User = require('../models/User');

// Helper to find device and verify ownership (for parent-related actions)
const findDeviceAndVerifyParent = async (deviceId, parentId) => {
    const device = await Device.findById(deviceId);
    if (!device) {
        return { status: 404, message: 'Device not found.' };
    }

    // Find the parent associated with this device's IMEI
    const parentProfile = await Parent.findOne({ deviceImei: device.imei });

    if (!parentProfile || parentProfile._id.toString() !== parentId.toString()) {
        return { status: 403, message: 'Access denied: Device does not belong to this parent.' };
    }
    return { status: 200, device, parentProfile };
};

// POST /parent/create
exports.createParent = async (req, res) => {
    const { name, phone, email, deviceImei, assignedKey } = req.body;

    if (!name || !phone || !email || !deviceImei || !assignedKey) {
        return res.status(400).json({ message: 'All fields are required.' });
    }

    try {
        // Check if email or IMEI already exists
        const existingParentByEmail = await Parent.findOne({ email });
        if (existingParentByEmail) {
            return res.status(409).json({ message: 'Parent with this email already exists.' });
        }

        const existingParentByImei = await Parent.findOne({ deviceImei });
        if (existingParentByImei) {
            return res.status(409).json({ message: 'Device with this IMEI is already registered.' });
        }

        // Check if the assignedKey is valid and unassigned
        const keyToAssign = await Key.findOne({ key: assignedKey });

        if (!keyToAssign) {
            return res.status(404).json({ message: 'Assigned key not found.' });
        }

        if (keyToAssign.isAssigned) {
            return res.status(409).json({ message: 'Assigned key is already in use.' });
        }

        const retailer = req.user;

        // Check if the retailer has enough keys to assign
        if (retailer.assignedKeys - retailer.usedKeys < 1) {
            return res.status(400).json({ message: 'Retailer has no keys remaining to assign.' });
        }

        // Create new Parent
        const newParent = new Parent({
            name,
            phone,
            email,
            deviceImei,
            assignedKey,
            createdBy: retailer._id,
        });

        await newParent.save();

        // Mark key as assigned
        keyToAssign.isAssigned = true;
        keyToAssign.assignedTo = newParent._id;
        keyToAssign.assignedAt = new Date();
        await keyToAssign.save();

        // Update retailer's key counts
        retailer.usedKeys += 1;
        await retailer.save();

        res.status(201).json({ message: 'Parent profile created successfully', parent: newParent });
    } catch (error) {
        console.error('Error creating parent profile:', error);
        res.status(500).json({ message: 'Server error during parent profile creation.' });
    }
};

// GET /parent/list
exports.listParents = async (req, res) => {
    try {
        const parents = await Parent.find({ createdBy: req.user._id });
        res.status(200).json(parents);
    } catch (error) {
        console.error('Error listing parents:', error);
        res.status(500).json({ message: 'Server error during parent listing.' });
    }
}; 
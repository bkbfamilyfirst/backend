const Device = require('../models/Device');
const Parent = require('../models/Parent');
const Key = require('../models/Key');

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

// 5.1 POST /device/register
exports.registerDevice = async (req, res) => {
    const { imei, simNumber, fcmToken, deviceModel, osVersion, activationKey } = req.body;

    if (!imei || !simNumber || !fcmToken || !deviceModel || !osVersion || !activationKey) {
        return res.status(400).json({ message: 'All fields are required for device registration.' });
    }

    try {
        // Check if device with this IMEI already exists
        const existingDevice = await Device.findOne({ imei });
        if (existingDevice) {
            return res.status(409).json({ message: 'Device with this IMEI is already registered.' });
        }

        // Validate activation key
        const keyRecord = await Key.findOne({ key: activationKey });
        if (!keyRecord) {
            return res.status(404).json({ message: 'Activation key not found.' });
        }
        if (keyRecord.isAssigned) {
            return res.status(409).json({ message: 'Activation key already used.' });
        }
        if (keyRecord.validUntil && new Date() > keyRecord.validUntil) {
            return res.status(400).json({ message: 'Activation key has expired.' });
        }

        // Find the parent associated with this key (from assignedTo field in Key model)
        const parent = await Parent.findById(keyRecord.assignedTo);
        if (!parent) {
            return res.status(404).json({ message: 'Associated parent not found for this key.' });
        }

        const newDevice = new Device({
            imei,
            simNumber,
            fcmToken,
            deviceModel,
            osVersion,
            parentId: parent._id, // Link to the parent who assigned the key
            lastSync: new Date(),
            isLocked: false,
            dataRestricted: false,
            locationTrackingEnabled: true,
            status: 'online',
            installedApps: [],
            hiddenApps: [],
        });

        await newDevice.save();

        // Mark key as used upon device registration
        keyRecord.isAssigned = true; // This might be redundant if parent/create already sets it
        await keyRecord.save();

        res.status(201).json({ message: 'Device registered successfully.', device: newDevice });
    } catch (error) {
        console.error('Error registering device:', error);
        res.status(500).json({ message: 'Server error during device registration.' });
    }
};

// 5.2 POST /device/sync-location
exports.syncLocation = async (req, res) => {
    const { imei, latitude, longitude, battery, network } = req.body;
    if (!imei || latitude === undefined || longitude === undefined) {
        return res.status(400).json({ message: 'IMEI, latitude, and longitude are required.' });
    }

    try {
        const device = await Device.findOne({ imei });
        if (!device) {
            return res.status(404).json({ message: 'Device not found.' });
        }

        device.location = { latitude, longitude };
        device.battery = battery;
        device.network = network;
        device.lastSync = new Date();
        device.status = 'online';

        await device.save();
        res.status(200).json({ message: 'Location synced successfully.' });
    } catch (error) {
        console.error('Error syncing location:', error);
        res.status(500).json({ message: 'Server error during location sync.' });
    }
};

// 5.3 POST /device/sync-apps
exports.syncApps = async (req, res) => {
    const { imei, apps } = req.body;
    if (!imei || !apps || !Array.isArray(apps)) {
        return res.status(400).json({ message: 'IMEI and an array of apps are required.' });
    }
    try {
        const device = await Device.findOne({ imei });
        if (!device) {
            return res.status(404).json({ message: 'Device not found.' });
        }
        device.installedApps = apps;
        device.lastSync = new Date();
        await device.save();
        res.status(200).json({ message: 'Apps synced successfully.' });
    } catch (error) {
        console.error('Error syncing apps:', error);
        res.status(500).json({ message: 'Server error during app sync.' });
    }
};

// 5.4 POST /device/status-update
exports.updateStatus = async (req, res) => {
    const { imei, status, isLocked, dataRestricted, locationTrackingEnabled } = req.body;
    if (!imei || !status) {
        return res.status(400).json({ message: 'IMEI and status are required.' });
    }
    try {
        const device = await Device.findOne({ imei });
        if (!device) {
            return res.status(404).json({ message: 'Device not found.' });
        }
        device.status = status;
        if (isLocked !== undefined) device.isLocked = isLocked;
        if (dataRestricted !== undefined) device.dataRestricted = dataRestricted;
        if (locationTrackingEnabled !== undefined) device.locationTrackingEnabled = locationTrackingEnabled;
        device.lastSync = new Date();
        await device.save();
        res.status(200).json({ message: 'Device status updated successfully.' });
    } catch (error) {
        console.error('Error updating device status:', error);
        res.status(500).json({ message: 'Server error during device status update.' });
    }
};

// 4.1 POST /device/lock
exports.lockDevice = async (req, res) => {
    const { deviceId, message } = req.body;
    if (!deviceId) return res.status(400).json({ message: 'Device ID is required.' });
    try {
        const { status, message: statusMessage, device } = await findDeviceAndVerifyParent(deviceId, req.user._id);
        if (status !== 200) return res.status(status).json({ message: statusMessage });

        device.isLocked = true;
        device.lockMessage = message || 'Device locked by parent.';
        await device.save();
        res.status(200).json({ message: 'Device locked successfully.' });
    } catch (error) {
        console.error('Error locking device:', error);
        res.status(500).json({ message: 'Server error during device lock.' });
    }
};

// 4.2 POST /device/unlock
exports.unlockDevice = async (req, res) => {
    const { deviceId } = req.body;
    if (!deviceId) return res.status(400).json({ message: 'Device ID is required.' });
    try {
        const { status, message: statusMessage, device } = await findDeviceAndVerifyParent(deviceId, req.user._id);
        if (status !== 200) return res.status(status).json({ message: statusMessage });

        device.isLocked = false;
        device.lockMessage = null;
        await device.save();
        res.status(200).json({ message: 'Device unlocked successfully.' });
    } catch (error) {
        console.error('Error unlocking device:', error);
        res.status(500).json({ message: 'Server error during device unlock.' });
    }
};

// 4.3 GET /device/location
exports.getDeviceLocation = async (req, res) => {
    const { deviceId } = req.query;
    if (!deviceId) return res.status(400).json({ message: 'Device ID is required.' });
    try {
        const { status, message: statusMessage, device } = await findDeviceAndVerifyParent(deviceId, req.user._id);
        if (status !== 200) return res.status(status).json({ message: statusMessage });

        if (!device.location || !device.lastSync) {
            return res.status(404).json({ message: 'Location data not available for this device.' });
        }
        res.status(200).json({ location: device.location, lastSync: device.lastSync });
    } catch (error) {
        console.error('Error getting device location:', error);
        res.status(500).json({ message: 'Server error during device location retrieval.' });
    }
};

// 4.4 POST /device/reminder-lock
exports.setReminderLock = async (req, res) => {
    const { deviceId, type, time } = req.body;
    if (!deviceId || !type || !time) {
        return res.status(400).json({ message: 'Device ID, type, and time are required.' });
    }
    try {
        const { status, message: statusMessage, device } = await findDeviceAndVerifyParent(deviceId, req.user._id);
        if (status !== 200) return res.status(status).json({ message: statusMessage });

        // For simplicity, we are just storing the reminder settings.
        // A real implementation would require a scheduled job to trigger the lock.
        device.reminderLock = { type, time };
        await device.save();
        res.status(200).json({ message: 'Reminder lock set successfully.', reminderLock: device.reminderLock });
    } catch (error) {
        console.error('Error setting reminder lock:', error);
        res.status(500).json({ message: 'Server error during reminder lock setup.' });
    }
};

// 4.5 POST /device/sim-info
exports.getSimInfo = async (req, res) => {
    const { deviceId } = req.body;
    if (!deviceId) return res.status(400).json({ message: 'Device ID is required.' });
    try {
        const { status, message: statusMessage, device } = await findDeviceAndVerifyParent(deviceId, req.user._id);
        if (status !== 200) return res.status(status).json({ message: statusMessage });

        res.status(200).json({ simNumber: device.simNumber });
    } catch (error) {
        console.error('Error getting SIM info:', error);
        res.status(500).json({ message: 'Server error during SIM info retrieval.' });
    }
};

// 4.6 POST /device/data-toggle
exports.toggleData = async (req, res) => {
    const { deviceId, action } = req.body;
    if (!deviceId || !action || !['enable', 'disable'].includes(action)) {
        return res.status(400).json({ message: 'Device ID and action (enable/disable) are required.' });
    }
    try {
        const { status, message: statusMessage, device } = await findDeviceAndVerifyParent(deviceId, req.user._id);
        if (status !== 200) return res.status(status).json({ message: statusMessage });

        device.dataRestricted = (action === 'disable');
        await device.save();
        res.status(200).json({ message: `Data ${action === 'enable' ? 'enabled' : 'disabled'} successfully.` });
    } catch (error) {
        console.error('Error toggling data:', error);
        res.status(500).json({ message: 'Server error during data toggle.' });
    }
};

// 4.7 POST /device/location-toggle
exports.toggleLocation = async (req, res) => {
    const { deviceId, action } = req.body;
    if (!deviceId || !action || !['enable', 'disable'].includes(action)) {
        return res.status(400).json({ message: 'Device ID and action (enable/disable) are required.' });
    }
    try {
        const { status, message: statusMessage, device } = await findDeviceAndVerifyParent(deviceId, req.user._id);
        if (status !== 200) return res.status(status).json({ message: statusMessage });

        device.locationTrackingEnabled = (action === 'enable');
        await device.save();
        res.status(200).json({ message: `Location tracking ${action === 'enable' ? 'enabled' : 'disabled'} successfully.` });
    } catch (error) {
        console.error('Error toggling location tracking:', error);
        res.status(500).json({ message: 'Server error during location toggle.' });
    }
};

// 4.8 POST /device/app-lock
exports.lockApp = async (req, res) => {
    const { deviceId, apps } = req.body;
    if (!deviceId || !apps || !Array.isArray(apps)) {
        return res.status(400).json({ message: 'Device ID and an array of app names are required.' });
    }
    try {
        const { status, message: statusMessage, device } = await findDeviceAndVerifyParent(deviceId, req.user._id);
        if (status !== 200) return res.status(status).json({ message: statusMessage });

        // Add apps to lockedApps array, avoiding duplicates
        device.lockedApps = [...new Set([...device.lockedApps, ...apps])];
        await device.save();
        res.status(200).json({ message: 'Apps locked successfully.', lockedApps: device.lockedApps });
    } catch (error) {
        console.error('Error locking apps:', error);
        res.status(500).json({ message: 'Server error during app lock.' });
    }
};

// 4.9 POST /device/app-unlock
exports.unlockApp = async (req, res) => {
    const { deviceId, apps } = req.body;
    if (!deviceId || !apps || !Array.isArray(apps)) {
        return res.status(400).json({ message: 'Device ID and an array of app names are required.' });
    }
    try {
        const { status, message: statusMessage, device } = await findDeviceAndVerifyParent(deviceId, req.user._id);
        if (status !== 200) return res.status(status).json({ message: statusMessage });

        // Remove apps from lockedApps array
        device.lockedApps = device.lockedApps.filter(app => !apps.includes(app));
        await device.save();
        res.status(200).json({ message: 'Apps unlocked successfully.', lockedApps: device.lockedApps });
    } catch (error) {
        console.error('Error unlocking apps:', error);
        res.status(500).json({ message: 'Server error during app unlock.' });
    }
};

// 4.10 POST /device/hide-app
exports.hideApp = async (req, res) => {
    const { deviceId, apps } = req.body;
    if (!deviceId || !apps || !Array.isArray(apps)) {
        return res.status(400).json({ message: 'Device ID and an array of app names are required.' });
    }
    try {
        const { status, message: statusMessage, device } = await findDeviceAndVerifyParent(deviceId, req.user._id);
        if (status !== 200) return res.status(status).json({ message: statusMessage });

        // Add apps to hiddenApps array, avoiding duplicates
        device.hiddenApps = [...new Set([...device.hiddenApps, ...apps])];
        await device.save();
        res.status(200).json({ message: 'Apps hidden successfully.', hiddenApps: device.hiddenApps });
    } catch (error) {
        console.error('Error hiding apps:', error);
        res.status(500).json({ message: 'Server error during app hide.' });
    }
};

// 4.11 POST /device/unhide-app
exports.unhideApp = async (req, res) => {
    const { deviceId, apps } = req.body;
    if (!deviceId || !apps || !Array.isArray(apps)) {
        return res.status(400).json({ message: 'Device ID and an array of app names are required.' });
    }
    try {
        const { status, message: statusMessage, device } = await findDeviceAndVerifyParent(deviceId, req.user._id);
        if (status !== 200) return res.status(status).json({ message: statusMessage });

        // Remove apps from hiddenApps array
        device.hiddenApps = device.hiddenApps.filter(app => !apps.includes(app));
        await device.save();
        res.status(200).json({ message: 'Apps unhidden successfully.', hiddenApps: device.hiddenApps });
    } catch (error) {
        console.error('Error unhiding apps:', error);
        res.status(500).json({ message: 'Server error during app unhide.' });
    }
}; 
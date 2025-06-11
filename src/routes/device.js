const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const deviceController = require('../controllers/deviceController');

// 5.1 POST /device/register
router.post('/register', deviceController.registerDevice);

// 5.2 POST /device/sync-location
router.post('/sync-location', deviceController.syncLocation);

// 5.3 POST /device/sync-apps
router.post('/sync-apps', deviceController.syncApps);

// 5.4 POST /device/status-update
router.post('/status-update', deviceController.updateStatus);

// 4.1 POST /device/lock
router.post('/lock', authenticateToken, authorizeRole(['parent']), deviceController.lockDevice);

// 4.2 POST /device/unlock
router.post('/unlock', authenticateToken, authorizeRole(['parent']), deviceController.unlockDevice);

// 4.3 GET /device/location
router.get('/location', authenticateToken, authorizeRole(['parent']), deviceController.getDeviceLocation);

// 4.4 POST /device/reminder-lock
router.post('/reminder-lock', authenticateToken, authorizeRole(['parent']), deviceController.setReminderLock);

// 4.5 POST /device/sim-info
router.post('/sim-info', authenticateToken, authorizeRole(['parent']), deviceController.getSimInfo);

// 4.6 POST /device/data-toggle
router.post('/data-toggle', authenticateToken, authorizeRole(['parent']), deviceController.toggleData);

// 4.7 POST /device/location-toggle
router.post('/location-toggle', authenticateToken, authorizeRole(['parent']), deviceController.toggleLocation);

// 4.8 POST /device/app-lock
router.post('/app-lock', authenticateToken, authorizeRole(['parent']), deviceController.lockApp);

// 4.9 POST /device/app-unlock
router.post('/app-unlock', authenticateToken, authorizeRole(['parent']), deviceController.unlockApp);

// 4.10 POST /device/hide-app
router.post('/hide-app', authenticateToken, authorizeRole(['parent']), deviceController.hideApp);

// 4.11 POST /device/unhide-app
router.post('/unhide-app', authenticateToken, authorizeRole(['parent']), deviceController.unhideApp);

module.exports = router; 
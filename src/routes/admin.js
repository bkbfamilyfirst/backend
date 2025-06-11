const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

// POST /admin/generate-keys
router.post('/generate-keys', authenticateToken, authorizeRole(['admin']), adminController.generateKeys);

// POST /admin/transfer-keys-to-nd
router.post('/transfer-keys-to-nd', authenticateToken, authorizeRole(['admin']), adminController.transferKeysToNd);

// POST /admin/nd
router.post('/nd', authenticateToken, authorizeRole(['admin']), adminController.addNd);

// GET /admin/summary
router.get('/summary', authenticateToken, authorizeRole(['admin']), adminController.getSummary);

// GET /users/hierarchy
router.get('/users/hierarchy', authenticateToken, authorizeRole(['admin']), adminController.getUserHierarchy);

// GET /admin/key-activation-stats
router.get('/key-activation-stats', authenticateToken, authorizeRole(['admin']), adminController.getKeyActivationStats);

// GET /admin/key-inventory
router.get('/key-inventory', authenticateToken, authorizeRole(['admin']), adminController.getKeyInventory);

// GET /admin/key-validity-timeline
router.get('/key-validity-timeline', authenticateToken, authorizeRole(['admin']), adminController.getKeyValidityTimeline);

// GET /admin/nd-list
router.get('/nd-list', authenticateToken, authorizeRole(['admin']), adminController.getNdList);

// GET /admin/nd-stats
router.get('/nd-stats', authenticateToken, authorizeRole(['admin']), adminController.getNdStats);

// GET /admin/nd-assignments
router.get('/nd-assignments', authenticateToken, authorizeRole(['admin']), adminController.getNdAssignments);

// GET /admin/transfer-stats
router.get('/transfer-stats', authenticateToken, authorizeRole(['admin']), adminController.getTransferStats);

// GET /admin/key-transfer-logs
router.get('/key-transfer-logs', authenticateToken, authorizeRole(['admin']), adminController.getKeyTransferLogs);

// GET /admin/key-transfer-logs/export
router.get('/key-transfer-logs/export', authenticateToken, authorizeRole(['admin']), adminController.exportKeyTransferLogs);

module.exports = router; 
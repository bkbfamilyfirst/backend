
const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const retailerController = require('../controllers/retailerController');

// GET /retailer/parent-list
router.get('/parent-list', authenticateToken, authorizeRole(['retailer']), retailerController.listParents);

router.get('/dashboard-summary', authenticateToken, authorizeRole(['retailer']), retailerController.getDashboardSummary);

router.get('/reports', authenticateToken, authorizeRole(['retailer']), retailerController.getReports);

// POST /retailer/create-parent
router.post('/create-parent', authenticateToken, authorizeRole(['retailer']), retailerController.createParent);

// GET /retailer/profile
router.get('/profile', authenticateToken, authorizeRole(['retailer']), retailerController.getRetailerProfile);

// GET /retailer/stats
router.get('/stats', authenticateToken, authorizeRole(['retailer']), retailerController.getRetailerStats);

// GET /retailer/owned-keys
router.get('/owned-keys', authenticateToken, authorizeRole(['retailer']), retailerController.listOwnedKeys);

// GET /retailer/activation-history
router.get('/activation-history', authenticateToken, authorizeRole(['retailer']), retailerController.getActivationHistory);

// POST /retailer/parents/:id/change-password
router.post('/parents/:id/change-password', authenticateToken, authorizeRole(['retailer']), retailerController.changeParentPassword);

// Key requests management
router.get('/key-requests', authenticateToken, authorizeRole(['retailer']), retailerController.listKeyRequests);
router.patch('/key-requests/:id/approve', authenticateToken, authorizeRole(['retailer']), retailerController.approveKeyRequest);
router.patch('/key-requests/:id/deny', authenticateToken, authorizeRole(['retailer']), retailerController.denyKeyRequest);

// GET /retailer/key-info
router.get('/key-info', authenticateToken, authorizeRole(['retailer']), retailerController.getKeyInfo);
router.post('/transfer-keys-to-parent', authenticateToken, authorizeRole(['retailer']), retailerController.transferKeysToParent);
// POST /retailer/logout
router.post('/logout', authenticateToken, authorizeRole(['retailer']), retailerController.logout);

module.exports = router;

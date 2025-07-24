// GET /retailer/parent-list
router.get('/parent-list', authenticateToken, authorizeRole(['retailer']), retailerController.listParents);
// POST /retailer/create-parent
router.post('/create-parent', authenticateToken, authorizeRole(['retailer']), retailerController.createParent);
const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const retailerController = require('../controllers/retailerController');

// GET /retailer/profile
router.get('/profile', authenticateToken, authorizeRole(['retailer']), retailerController.getRetailerProfile);

// GET /retailer/stats
router.get('/stats', authenticateToken, authorizeRole(['retailer']), retailerController.getRetailerStats);

// GET /retailer/activation-history
router.get('/activation-history', authenticateToken, authorizeRole(['retailer']), retailerController.getActivationHistory);

// GET /retailer/key-info
router.get('/key-info', authenticateToken, authorizeRole(['retailer']), retailerController.getKeyInfo);

// POST /retailer/logout
router.post('/logout', authenticateToken, authorizeRole(['retailer']), retailerController.logout);

module.exports = router;

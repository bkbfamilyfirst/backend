const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const ssController = require('../controllers/ssController');

// SS Dashboard Summary
router.get('/dashboard/summary', authenticateToken, authorizeRole(['ss']), ssController.getDashboardSummary);

// Get List of Distributors for SS
router.get('/distributors', authenticateToken, authorizeRole(['ss']), ssController.getDistributorList);

// Get Distributor Stats for SS
router.get('/distributors/stats', authenticateToken, authorizeRole(['ss']), ssController.getDistributorStats);

// Get Key Transfer Logs for SS
router.get('/key-transfer-logs', authenticateToken, authorizeRole(['ss']), ssController.getKeyTransferLogs);

// Add New Distributor
router.post('/distributors', authenticateToken, authorizeRole(['ss']), ssController.addDistributor);

// Update Distributor
router.put('/distributors/:id', authenticateToken, authorizeRole(['ss']), ssController.updateDistributor);

// POST /ss/distributors/:id/change-password
router.post('/distributors/:id/change-password', authenticateToken, authorizeRole(['ss']), ssController.changeDistributorPassword);

// Delete Distributor
router.delete('/distributors/:id', authenticateToken, authorizeRole(['ss']), ssController.deleteDistributor);

// Transfer Keys to Distributor
router.post('/transfer-keys-to-db', authenticateToken, authorizeRole(['ss']), ssController.transferKeysToDb);

// Get SS Profile
router.get('/profile', authenticateToken, authorizeRole(['ss']), ssController.getSsProfile);

// Update SS Profile
router.put('/profile', authenticateToken, authorizeRole(['ss']), ssController.updateSsProfile);

module.exports = router; 
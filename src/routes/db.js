const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const dbController = require('../controllers/dbController');

// DB Dashboard Summary
router.get('/dashboard/summary', authenticateToken, authorizeRole(['db']), dbController.getDashboardSummary);

// Get Key Distribution Stats
router.get('/dashboard/key-stats', authenticateToken, authorizeRole(['db']), dbController.getDbKeyDistributionStats);

// Activation Summary and Top Performing Retailers
router.get('/dashboard/retailer-performance', authenticateToken, authorizeRole(['db']), dbController.getActivationSummaryAndTopRetailers);

// Get Retailer List (Overview/Directory)
router.get('/retailers', authenticateToken, authorizeRole(['db']), dbController.getRetailerList);

// Add New Retailer
router.post('/retailers', authenticateToken, authorizeRole(['db']), dbController.addRetailer);

// Update Retailer
router.put('/retailers/:id', authenticateToken, authorizeRole(['db']), dbController.updateRetailer);

// Delete Retailer
router.delete('/retailers/:id', authenticateToken, authorizeRole(['db']), dbController.deleteRetailer);

// Transfer Keys to Retailer
router.post('/transfer-keys-to-retailer', authenticateToken, authorizeRole(['db']), dbController.transferKeysToRetailer);

// Get Key Transfer Logs for DB
router.get('/key-transfer-logs', authenticateToken, authorizeRole(['db']), dbController.getKeyTransferLogs);

// Get DB Profile
router.get('/profile', authenticateToken, authorizeRole(['db']), dbController.getDbProfile);

// Update DB Profile
router.put('/profile', authenticateToken, authorizeRole(['db']), dbController.updateDbProfile);

// GET /db/retailers/:id/activations
router.get('/retailers/:id/activations', authenticateToken, authorizeRole(['db']), dbController.getRetailerActivations);

// Get Recent Key Batches
router.get('/recent-key-batches', authenticateToken, authorizeRole(['db']), dbController.getRecentKeyBatches);

// Generic Action Endpoint for Recent Key Batches
router.put('/recent-key-batches/:id/:actionType', authenticateToken, authorizeRole(['db']), dbController.handleRecentKeyBatchAction);

// Get Distribution History
router.get('/distribution-history', authenticateToken, authorizeRole(['db']), dbController.getDistributionHistory);

// Generic Action Endpoint for Distribution History
router.put('/distribution-history/:id/:actionType', authenticateToken, authorizeRole(['db']), dbController.handleDistributionHistoryAction);

// POST Receive Keys from SS
router.post('/receive-keys-from-ss', authenticateToken, authorizeRole(['db']), dbController.receiveKeysFromSs);

// POST Distribute Keys to Retailers
router.post('/distribute-keys-to-retailers', authenticateToken, authorizeRole(['db']), dbController.distributeKeysToRetailers);

// Get Movement History
router.get('/movement-history', authenticateToken, authorizeRole(['db']), dbController.getMovementHistory);

module.exports = router; 
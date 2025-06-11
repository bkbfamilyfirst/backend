const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const hierarchyController = require('../controllers/hierarchyController');

// 2.1 POST /nd/create
router.post('/nd/create', authenticateToken, authorizeRole(['admin']), hierarchyController.createNd);

// PATCH /nd/:id (update location/status for ND)
router.patch('/nd/:id', authenticateToken, authorizeRole(['admin']), hierarchyController.updateNd);

// 2.2 POST /ss/create
router.post('/ss/create', authenticateToken, authorizeRole(['nd']), hierarchyController.createSs);

// 2.3 POST /db/create
router.post('/db/create', authenticateToken, authorizeRole(['ss']), hierarchyController.createDb);

// 2.4 POST /retailer/create
router.post('/retailer/create', authenticateToken, authorizeRole(['db']), hierarchyController.createRetailer);

// 2.5 POST /keys/transfer
router.post('/keys/transfer', authenticateToken, authorizeRole(['admin', 'nd', 'ss', 'db', 'retailer']), hierarchyController.transferKeys);

// 2.6 GET /keys/status
router.get('/keys/status', authenticateToken, authorizeRole(['admin', 'nd', 'ss', 'db', 'retailer']), hierarchyController.getKeysStatus);

module.exports = router; 
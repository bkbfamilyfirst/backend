const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const ndController = require('../controllers/ndController');

// GET /nd/ss-list
router.get('/ss-list', authenticateToken, authorizeRole(['nd']), ndController.getSsList);

// GET /nd/ss-stats
router.get('/ss-stats', authenticateToken, authorizeRole(['nd']), ndController.getSsStats);

// GET /nd/key-transfer-logs
router.get('/key-transfer-logs', authenticateToken, authorizeRole(['nd']), ndController.getKeyTransferLogs);

// GET /nd/key-transfer-logs/export
router.get('/key-transfer-logs/export', authenticateToken, authorizeRole(['nd']), ndController.exportKeyTransferLogs);

// GET /nd/reports/summary
router.get('/reports/summary', authenticateToken, authorizeRole(['nd']), ndController.getReportsSummary);

// DELETE /nd/ss/:id
router.delete('/ss/:id', authenticateToken, authorizeRole(['nd']), ndController.deleteSs);

// PUT /nd/ss/:id
router.put('/ss/:id', authenticateToken, authorizeRole(['nd']), ndController.updateSs);

// POST /nd/ss/:id/change-password
router.post('/ss/:id/change-password', authenticateToken, authorizeRole(['nd']), ndController.changeSsPassword);

// GET /nd/profile
router.get('/profile', authenticateToken, authorizeRole(['nd']), ndController.getNdProfile);

// PUT /nd/profile
router.put('/profile', authenticateToken, authorizeRole(['nd']), ndController.updateNdProfile);

// POST /nd/ss
router.post('/ss', authenticateToken, authorizeRole(['nd']), ndController.addSs);

// POST /nd/transfer-keys-to-ss
router.post('/transfer-keys-to-ss', authenticateToken, authorizeRole(['nd']), ndController.transferKeysToSs);

module.exports = router; 
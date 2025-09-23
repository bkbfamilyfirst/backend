const express = require('express');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

const router = express.Router();
const User = require('../models/User');

// GET /admin/nd-list-paginated
router.get('/nd-list-paginated', authenticateToken, authorizeRole(['admin']), adminController.getNdListPaginated);

// GET /admin/ss-list-paginated
router.get('/ss-list-paginated', authenticateToken, authorizeRole(['admin']), adminController.getSsListPaginated);

// GET /admin/db-list-paginated
router.get('/db-list-paginated', authenticateToken, authorizeRole(['admin']), adminController.getDbListPaginated);

// GET /admin/retailer-list-paginated
router.get('/retailer-list-paginated', authenticateToken, authorizeRole(['admin']), adminController.getRetailerListPaginated);
router.post('/transfer-keys-to-nd', authenticateToken, authorizeRole(['admin']), adminController.transferKeysToNd);

router.post('/generate-keys', authenticateToken, authorizeRole(['admin']), adminController.generateKeys);

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

// GET /admin/admin-list-paginated
router.get('/admin-list-paginated', authenticateToken, authorizeRole(['admin']), adminController.getAdminListPaginated);

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

// PATCH /admin/nd/:ndId - Edit ND
router.patch('/nd/:ndId', authenticateToken, authorizeRole(['admin']), adminController.editNd);

// PATCH /admin/ss/:id - Edit SS by admin
router.patch('/ss/:id', authenticateToken, authorizeRole(['admin']), adminController.editSs);

// PATCH /admin/db/:id - Edit DB by admin
router.patch('/db/:id', authenticateToken, authorizeRole(['admin']), adminController.editDb);

// PATCH /admin/retailer/:id - Edit Retailer by admin
router.patch('/retailer/:id', authenticateToken, authorizeRole(['admin']), adminController.editRetailer);

// PATCH /admin/parent/:id - Edit Parent by admin
router.patch('/parent/:id', authenticateToken, authorizeRole(['admin']), adminController.editParent);

// PATCH /admin/nd/deactivate/:ndId - Deactivate ND
router.patch('/nd/deactivate/:ndId', authenticateToken, authorizeRole(['admin']), adminController.deactivateNd);

// PATCH /admin/nd/block/:ndId - Block ND
router.patch('/nd/block/:ndId', authenticateToken, authorizeRole(['admin']), adminController.blockNd);

// DELETE /admin/nd/:ndId - Delete ND
router.delete('/nd/:ndId', authenticateToken, authorizeRole(['admin']), adminController.deleteNd);

// GET /admin/profile
router.get('/profile', authenticateToken, authorizeRole(['admin']), adminController.getAdminProfile);

// PATCH /admin/profile
router.patch('/profile', authenticateToken, authorizeRole(['admin']), adminController.editAdminProfile);

// PATCH /admin/change-password
router.patch('/change-password', authenticateToken, authorizeRole(['admin']), adminController.changePassword);

// Admin management: edit other admins and change their password
router.patch('/admin/:id', authenticateToken, authorizeRole(['admin']), adminController.editAdmin);
router.patch('/admin/:id/change-password', authenticateToken, authorizeRole(['admin']), adminController.adminChangePassword);

// GET /admin/last-key-generation
router.get('/last-key-generation', authenticateToken, authorizeRole(['admin']), adminController.getLastKeyGeneration);

// POST /admin/reset-password/:id - Admin-triggered password reset (returns plaintext once)
router.post('/reset-password/:id', authenticateToken, authorizeRole(['admin']), adminController.resetUserPasswordByAdmin);

module.exports = router;
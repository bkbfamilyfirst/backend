const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const keyController = require('../controllers/keyController');

// GET /key/info
router.get('/info', authenticateToken, authorizeRole(['parent', 'retailer']), keyController.getKeyInfo);

module.exports = router;
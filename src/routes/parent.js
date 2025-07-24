const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const parentController = require('../controllers/parentController');




// 3.3 GET /parent/profile (for parent to view their own profile)
router.get('/profile', authenticateToken, authorizeRole(['parent']), parentController.getParentProfile);

module.exports = router;
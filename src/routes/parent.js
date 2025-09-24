const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const parentController = require('../controllers/parentController');




// 3.3 GET /parent/profile (for parent to view their own profile)
router.get('/profile', authenticateToken, authorizeRole(['parent']), parentController.getParentProfile);

// POST /parent/child - create a child
router.post('/child', authenticateToken, authorizeRole(['parent']), parentController.createChild);

// POST /parent/request-key - request an activation key (optionally target a retailer)
router.post('/request-key', authenticateToken, authorizeRole(['parent']), parentController.requestKey);

module.exports = router;
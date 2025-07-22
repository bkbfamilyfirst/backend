const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const parentController = require('../controllers/parentController');

// 3.1 POST /parent/create
router.post('/create', authenticateToken, authorizeRole(['retailer']), parentController.createParent);


// 3.2 GET /parent/list
router.get('/list', authenticateToken, authorizeRole(['retailer']), parentController.listParents);

// 3.3 GET /parent/profile (for parent to view their own profile)
router.get('/profile', authenticateToken, authorizeRole(['parent']), parentController.getParentProfile);

module.exports = router;
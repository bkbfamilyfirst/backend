const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const childController = require('../controllers/childController');

// POST /child/create
router.post('/create', authenticateToken, authorizeRole(['parent']), childController.addChild);

module.exports = router;
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const authController = require('../controllers/authController');

// 1.1 POST /auth/login
router.post('/login', authController.login);

// POST /auth/refresh-token
router.post('/refresh-token', authController.refreshToken);

// POST /auth/logout
router.post('/logout', authController.logout);

// Optional: Get current user details (example for authenticated route)
router.get('/me', authenticateToken, authController.getMe);

module.exports = router; 
const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Middleware to verify JWT and check roles
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401); // No token

    jwt.verify(token, process.env.JWT_SECRET || 'supersecretjwtkey', async (err, user) => {
        if (err) return res.sendStatus(403); // Invalid token

        try {
            const foundUser = await User.findById(user.id); // Fetch user from DB
            if (!foundUser) return res.sendStatus(403); // User not found

            req.user = foundUser; // Attach the full user object from DB
            next();
        } catch (error) {
            console.error('Error authenticating token:', error);
            res.status(500).json({ message: 'Server error during authentication.' });
        }
    });
};

const authorizeRole = (roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Access denied.' });
        }
        next();
    };
};

module.exports = { authenticateToken, authorizeRole }; 
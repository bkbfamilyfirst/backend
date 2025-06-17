const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Middleware to verify JWT and check roles
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        return res.status(401).json({ message: 'Access token missing.' }); // No token provided
    }

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, async (err, user) => {
        if (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ message: 'Access token expired.', expired: true }); // Token expired
            } else {
                return res.status(403).json({ message: 'Invalid access token.' }); // Other JWT errors
            }
        }

        try {
            const foundUser = await User.findById(user.id);
            if (!foundUser) {
                return res.status(403).json({ message: 'User not found.' }); // User not found in DB
            }

            req.user = foundUser;
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
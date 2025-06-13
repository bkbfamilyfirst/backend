const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const hierarchyRoutes = require('./routes/hierarchy');
const adminRoutes = require('./routes/admin');
const parentRoutes = require('./routes/parent');
const ndRoutes = require('./routes/nd');
const ssRoutes = require('./routes/ss')
const dbRoutes = require('./routes/db')
const app = express();

// CORS configuration
const corsOptions = {
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400 // 24 hours
};

// Middleware
app.use(cors(corsOptions));
app.use(bodyParser.json()); // for parsing application/json

// Routes
app.use('/auth', authRoutes);
app.use('/hierarchy', hierarchyRoutes);
app.use('/admin', adminRoutes);
app.use('/parent', parentRoutes);
app.use('/nd', ndRoutes);
app.use('/ss', ssRoutes);
app.use('/db', dbRoutes);

// Basic route for testing
app.get('/', (req, res) => {
    res.send('Family First API is running!');
});

module.exports = app; 
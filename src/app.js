const express = require('express');
const bodyParser = require('body-parser');
const authRoutes = require('./routes/auth');
const hierarchyRoutes = require('./routes/hierarchy');
const adminRoutes = require('./routes/admin');
const parentRoutes = require('./routes/parent');
const ndRoutes = require('./routes/nd');
const ssRoutes = require('./routes/ss')
const dbRoutes = require('./routes/db')
const app = express();

// Middleware
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
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

// CORS configuration with debugging
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000'];

console.log('🌐 CORS Configuration:');
console.log('Environment:', process.env.NODE_ENV);
console.log('Allowed Origins:', allowedOrigins);

let corsOptions;

// If wildcard is set, use simple CORS config
if (allowedOrigins.includes('*')) {
    console.log('🌐 Using wildcard CORS - allowing all origins');
    corsOptions = {
        origin: true, // Allow all origins
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true,
        maxAge: 86400 // 24 hours
    };
} else {
    corsOptions = {
        origin: function (origin, callback) {
            console.log('🔍 CORS Check - Request Origin:', origin);
            console.log('🔍 Allowed Origins:', allowedOrigins);
            
            // Allow requests with no origin (like mobile apps or curl requests)
            if (!origin) {
                console.log('✅ No origin header - allowing request');
                return callback(null, true);
            }
            
            if (allowedOrigins.indexOf(origin) !== -1) {
                console.log('✅ Origin allowed:', origin);
                callback(null, true);
            } else {
                console.log('❌ Origin blocked:', origin);
                console.log('❌ Available origins:', allowedOrigins);
                callback(new Error('Not allowed by CORS'));
            }
        },
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true,
        maxAge: 86400 // 24 hours
    };
}

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
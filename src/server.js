require('dotenv').config();
const app = require('./app');
const mongoose = require('mongoose');

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://bkbfamilyfirst:OretfeQZwdKXs6UF@cluster0.aht6olz.mongodb.net/';

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('MongoDB connected successfully.');

        // Detect whether MongoDB transactions are supported (replica set + server version >= 4.0)
        (async () => {
            try {
                const admin = mongoose.connection.db.admin();
                const build = await admin.command({ buildInfo: 1 });
                const ismaster = await admin.command({ ismaster: 1 });
                const version = build?.version || 'unknown';
                const major = parseInt((version || '').split('.')[0] || '0', 10);
                const isReplicaSet = !!(ismaster && ismaster.setName);
                const supportsTransactions = isReplicaSet && major >= 4;
                console.log(`MongoDB server version: ${version}`);
                console.log(`MongoDB replica set detected: ${isReplicaSet ? ismaster.setName : 'no'}`);
                console.log(`MongoDB transactions supported: ${supportsTransactions}`);
                // Expose the information as an environment variable and app local so other modules can read it
                process.env.DB_SUPPORTS_TRANSACTIONS = supportsTransactions ? 'true' : 'false';
                try {
                    app.locals.dbSupportsTransactions = supportsTransactions;
                } catch (e) {
                    // ignore if app not available
                }
            } catch (e) {
                console.log('Could not detect MongoDB transaction support:', e.message || e);
                console.log('MongoDB transactions supported: false');
            } finally {
                app.listen(PORT, () => {
                    console.log(`Server is running on port ${PORT}`);
                });
            }
        })();
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1); // Exit process with failure
    });

// Add this line - Export the app for serverless environments
module.exports = app;
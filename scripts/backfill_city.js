// Simple migration script to backfill `city` field on users from the `address` string.
// Usage: node scripts/backfill_city.js --uri "mongodb://..." [--dry-run] [--limit N]

const mongoose = require('mongoose');
const User = require('../src/models/User');
const yargs = require('yargs');

const argv = yargs
    .option('uri', { type: 'string', demandOption: true, describe: 'MongoDB connection URI' })
    .option('dry-run', { type: 'boolean', default: false, describe: 'Do not write changes' })
    .option('limit', { type: 'number', default: 0, describe: 'Limit number of documents to process (0 = all)' })
    .help()
    .argv;

async function guessCityFromAddress(address) {
    if (!address || typeof address !== 'string') return null;
    // Simple heuristics: split by commas and newlines, trim tokens, prefer one of the last tokens which are likely city/state
    const parts = address.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) return null;
    if (parts.length === 1) return parts[0];
    // Prefer second last if it's not numeric; else last
    const cand = parts[parts.length - 2] || parts[parts.length - 1];
    // Remove any postal codes or numeric-only tokens
    if (/^\d+$/.test(cand)) return parts[parts.length - 1] || null;
    return cand;
}

async function main() {
    await mongoose.connect(argv.uri, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB');

    const query = { role: 'retailer' };
    const cursor = User.find(query).cursor();
    let processed = 0;
    for (let user = await cursor.next(); user != null; user = await cursor.next()) {
        if (argv.limit && processed >= argv.limit) break;
        const address = user.address || '';
        const guessed = await guessCityFromAddress(address);
        if (!guessed) {
            console.log(`Skipping ${user._id} - no city guessed from address: "${address}"`);
            processed++;
            continue;
        }
        if (argv['dry-run']) {
            console.log(`[dry-run] ${user._id} -> city: ${guessed}`);
        } else {
            user.city = guessed;
            await user.save();
            console.log(`Updated ${user._id} -> city: ${guessed}`);
        }
        processed++;
    }

    console.log(`Processed ${processed} retailer(s).`);
    await mongoose.disconnect();
}

main().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});

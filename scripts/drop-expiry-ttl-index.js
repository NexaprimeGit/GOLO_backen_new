/**
 * Migration script: Drop the old TTL index on expiryDate
 * 
 * The old index was:  { expiryDate: 1 }, { expireAfterSeconds: 0 }
 * This caused MongoDB to AUTO-DELETE ads when their expiryDate passed,
 * which is not what we want — we need a 1-day grace period.
 * 
 * Run this ONCE against your production database:
 *   node scripts/drop-expiry-ttl-index.js
 * 
 * Or run directly in MongoDB shell:
 *   db.ads.dropIndex("expiryDate_1")
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI not set in .env');
    process.exit(1);
  }

  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db(); // Uses the database from the URI
    const collection = db.collection('ads');

    // List current indexes
    const indexes = await collection.indexes();
    console.log('\nCurrent indexes on "ads" collection:');
    indexes.forEach(idx => {
      const ttlInfo = idx.expireAfterSeconds !== undefined 
        ? ` (TTL: ${idx.expireAfterSeconds}s)` 
        : '';
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}${ttlInfo}`);
    });

    // Check if TTL index exists
    const ttlIndex = indexes.find(
      idx => idx.key && idx.key.expiryDate !== undefined && idx.expireAfterSeconds !== undefined
    );

    if (ttlIndex) {
      console.log(`\n⚠️  Found TTL index: "${ttlIndex.name}" — dropping it...`);
      await collection.dropIndex(ttlIndex.name);
      console.log('✅ TTL index dropped successfully!');
      console.log('   Ads will no longer be auto-deleted by MongoDB.');
      console.log('   The application now handles expiry + 1-day grace period.');
    } else {
      console.log('\n✅ No TTL index found on expiryDate — nothing to do.');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.close();
    console.log('\nDone.');
  }
}

main();

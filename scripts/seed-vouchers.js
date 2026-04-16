const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/golo';

// Define Schema inline for seed
const voucherSchema = new mongoose.Schema(
  {
    userId: mongoose.Schema.Types.ObjectId,
    offerId: mongoose.Schema.Types.ObjectId,
    voucherId: { type: String, unique: true, index: true },
    qrCode: { type: String, unique: true, index: true },
    merchantId: mongoose.Schema.Types.ObjectId,
    offerTitle: String,
    merchantName: String,
    discount: String,
    offerImage: String,
    status: {
      type: String,
      enum: ['active', 'claimed', 'redeemed', 'expired'],
      default: 'active',
      index: true,
    },
    claimedAt: Date,
    redeemedAt: Date,
    redeemedByMerchantId: mongoose.Schema.Types.ObjectId,
    expiresAt: { type: Date, index: true },
    validityHours: { type: Number, default: 720 },
    redemptionCode: { type: String, unique: true, sparse: true },
    shareEmail: String,
    sharedAt: Date,
  },
  { timestamps: true }
);

async function seed() {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Get collections
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    const bannersCollection = db.collection('banner_promotions');
    const vouchersCollection = db.collection('vouchers');

    // Clear existing vouchers (optional)
    await vouchersCollection.deleteMany({});
    console.log('🗑️  Cleared existing vouchers');

    // Get some users for testing
    const users = await usersCollection
      .find({ accountType: 'user' })
      .limit(5)
      .toArray();
    console.log(`👥 Found ${users.length} test users`);

    if (users.length === 0) {
      console.warn(
        '⚠️  No users found. Please create some users first via /users/register'
      );
      process.exit(0);
    }

    // Get some merchants/banners for testing
    const merchants = await usersCollection
      .find({ accountType: 'merchant' })
      .limit(3)
      .toArray();
    console.log(`🏪 Found ${merchants.length} test merchants`);

    const banners = await bannersCollection.find({}).limit(5).toArray();
    console.log(`🎯 Found ${banners.length} test offers/banners`);

    if (banners.length === 0) {
      console.warn(
        '⚠️  No banners/offers found. Please create some offers first via /banners'
      );
      process.exit(0);
    }

    // Generate sample vouchers
    const sampleVouchers = [];
    let voucherIndex = 1;

    // Create vouchers for different statuses
    users.slice(0, 3).forEach((user, userIndex) => {
      // Active voucher
      const voucherId1 = `VOUCHER-${Date.now()}-${userIndex}-1`;
      sampleVouchers.push({
        userId: new mongoose.Types.ObjectId(user._id),
        offerId: new mongoose.Types.ObjectId(banners[0]._id),
        voucherId: voucherId1,
        qrCode: `voucher-${voucherId1}-${banners[0]._id}`,
        merchantId: new mongoose.Types.ObjectId(
          merchants[0]?._id || banners[0].merchantId
        ),
        offerTitle: banners[0].bannerTitle || '50% Off',
        merchantName: banners[0].merchantName || 'Test Merchant',
        discount: '50%',
        offerImage: banners[0].imageUrl,
        status: 'active',
        claimedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        expiresAt: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000), // 28 days from now
        validityHours: 720,
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      });

      // Redeemed voucher
      const voucherId2 = `VOUCHER-${Date.now()}-${userIndex}-2`;
      sampleVouchers.push({
        userId: new mongoose.Types.ObjectId(user._id),
        offerId: new mongoose.Types.ObjectId(banners[1]?._id || banners[0]._id),
        voucherId: voucherId2,
        qrCode: `voucher-${voucherId2}-${banners[1]?._id || banners[0]._id}`,
        merchantId: new mongoose.Types.ObjectId(
          merchants[0]?._id || banners[0].merchantId
        ),
        offerTitle: banners[1]?.bannerTitle || '30% Off',
        merchantName: banners[1]?.merchantName || 'Test Merchant',
        discount: '30%',
        offerImage: banners[1]?.imageUrl,
        status: 'redeemed',
        claimedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        redeemedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        redeemedByMerchantId: new mongoose.Types.ObjectId(
          merchants[0]?._id || banners[0].merchantId
        ),
        expiresAt: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
        validityHours: 720,
        redemptionCode: `RDM-${Date.now()}-${userIndex}`,
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      });

      // Expired voucher
      const voucherId3 = `VOUCHER-${Date.now()}-${userIndex}-3`;
      sampleVouchers.push({
        userId: new mongoose.Types.ObjectId(user._id),
        offerId: new mongoose.Types.ObjectId(banners[2]?._id || banners[0]._id),
        voucherId: voucherId3,
        qrCode: `voucher-${voucherId3}-${banners[2]?._id || banners[0]._id}`,
        merchantId: new mongoose.Types.ObjectId(
          merchants[1]?._id || banners[0].merchantId
        ),
        offerTitle: banners[2]?.bannerTitle || 'Free Delivery',
        merchantName: banners[2]?.merchantName || 'Test Merchant 2',
        discount: 'Free',
        offerImage: banners[2]?.imageUrl,
        status: 'expired',
        claimedAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000), // 35 days ago
        expiresAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // Expired 5 days ago
        validityHours: 720,
        createdAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      });
    });

    // Insert vouchers
    const result = await vouchersCollection.insertMany(sampleVouchers);
    console.log(`\n✅ Successfully seeded ${result.insertedIds.length} vouchers`);

    // Print summary
    console.log('\n📊 Seeded Vouchers Summary:');
    console.log(`   - Total Vouchers: ${sampleVouchers.length}`);
    const active = sampleVouchers.filter((v) => v.status === 'active').length;
    const redeemed = sampleVouchers.filter((v) => v.status === 'redeemed').length;
    const expired = sampleVouchers.filter((v) => v.status === 'expired').length;
    console.log(`   - Active: ${active}`);
    console.log(`   - Redeemed: ${redeemed}`);
    console.log(`   - Expired: ${expired}`);

    console.log('\n🧪 Test Scenarios:');
    console.log(`1. User ID for claims: ${users[0]._id}`);
    console.log(
      `2. Test active voucher ID (should be displayable): ${sampleVouchers[0].voucherId}`
    );
    console.log(`3. Test merchant ID: ${merchants[0]?._id || 'Create a merchant first'}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
}

seed();

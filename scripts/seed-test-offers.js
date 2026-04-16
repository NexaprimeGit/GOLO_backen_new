require('dotenv').config();
const mongoose = require('mongoose');

const testOffers = [
  {
    requestId: 'OFFER-001',
    merchantId: new mongoose.Types.ObjectId(),
    merchantName: 'The Royal Maratha',
    merchantEmail: 'royal@maratha.com',
    bannerTitle: '50% Off Signature Thali',
    bannerCategory: 'FLAT 50% OFF',
    imageUrl: '/images/deal2.avif',
    startDate: new Date(),
    selectedDates: [new Date()],
    status: 'active'
  },
  {
    requestId: 'OFFER-002',
    merchantId: new mongoose.Types.ObjectId(),
    merchantName: 'Sky Lounge',
    merchantEmail: 'sky@lounge.com',
    bannerTitle: 'Buy 1 Get 1 Free',
    bannerCategory: 'BOGO',
    imageUrl: '/images/banner3.avif',
    startDate: new Date(),
    selectedDates: [new Date()],
    status: 'active'
  },
  {
    requestId: 'OFFER-003',
    merchantId: new mongoose.Types.ObjectId(),
    merchantName: 'Glow & Shine Wellness',
    merchantEmail: 'glow@shine.com',
    bannerTitle: 'Organic Facial Spa',
    bannerCategory: '40% OFF',
    imageUrl: '/images/place2.avif',
    startDate: new Date(),
    selectedDates: [new Date()],
    status: 'active'
  },
  {
    requestId: 'OFFER-004',
    merchantId: new mongoose.Types.ObjectId(),
    merchantName: 'Hotel Sayaji',
    merchantEmail: 'hotel@sayaji.com',
    bannerTitle: 'Weekend Breakfast',
    bannerCategory: 'SAVE ₹200',
    imageUrl: '/images/deal2.avif',
    startDate: new Date(),
    selectedDates: [new Date()],
    status: 'active'
  },
  {
    requestId: 'OFFER-005',
    merchantId: new mongoose.Types.ObjectId(),
    merchantName: 'Pro Wash Kolhapur',
    merchantEmail: 'pro@wash.com',
    bannerTitle: 'Car Deep Cleaning',
    bannerCategory: 'LIMITED TIME',
    imageUrl: '/images/banner3.avif',
    startDate: new Date(),
    selectedDates: [new Date()],
    status: 'active'
  },
  {
    requestId: 'OFFER-006',
    merchantId: new mongoose.Types.ObjectId(),
    merchantName: 'Little Italy',
    merchantEmail: 'italy@little.com',
    bannerTitle: 'Classic Pizza Combo',
    bannerCategory: 'COMBO DEAL',
    imageUrl: '/images/deal2.avif',
    startDate: new Date(),
    selectedDates: [new Date()],
    status: 'active'
  }
];

async function seedOffers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB');

    const collection = mongoose.connection.collection('banner_promotions');
    
    // Drop existing offers
    await collection.deleteMany({});
    console.log('✓ Cleared existing offers');

    // Insert new offers
    const result = await collection.insertMany(testOffers);
    console.log(`✓ Seeded ${result.length} test offers`);
    
    // Print IDs for reference
    console.log('\nOffer IDs for frontend:');
    const inserted = await collection.find({}).toArray();
    inserted.forEach((offer, idx) => {
      console.log(`${idx + 1}. ${offer.bannerTitle} - ID: ${offer._id}`);
    });

    await mongoose.connection.close();
    console.log('\n✓ Database connection closed');
  } catch (error) {
    console.error('Error seeding offers:', error.message);
    process.exit(1);
  }
}

seedOffers();

const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'topic-creator',
  brokers: ['localhost:9092']
});

const topics = [
  // Command topics
  'ad.create',
  'ad.update',
  'ad.delete',
  'ad.get',
  'ad.get.by.category',
  'ad.get.by.user',
  'ad.search',
  'ad.get.nearby',
  
  // Event topics
  'ad.created',
  'ad.updated',
  'ad.deleted',
  'ad.viewed',
  'ad.expired',
  'ad.promoted',
  
  // Response topics
  'ad.response',
  'ad.error',
  
  // Dead Letter Queue
  'ad.dlq',

  // User event topics
  'user.registered',
  'user.logged.in',
  'user.logged.out',
  'user.updated',
  'user.deleted',
  'user.ads.fetched',
  'user.ads.created',

  // Payment event topics
  'payment.created',
  'payment.succeeded',
  'payment.failed',
  'payment.refunded',
  'payment.webhook.processed',

  // Report and moderation topics
  'ad.report.submitted',
  'ad.auto.disabled',
  'ad.review.request',
  'reports.status',

  // Banner promotion topics
  'banner.promotion.submitted',
  'banner.promotion.reviewed',
  'banner.promotion.paid',
  'banner.promotion.deleted',

  // Chat command/event topics
  'chat.start.conversation',
  'chat.list.conversations',
  'chat.list.messages',
  'chat.send.message',
  'chat.delete.conversation',
  'chat.conversation.started',
  'chat.message.sent',
  'chat.conversation.deleted',

  // Call command/event topics
  'call.get.history',
  'call.get.by.id',
  'call.create.invite',
  'call.accept',
  'call.reject',
  'call.end',
  'call.invited',
  'call.accepted',
  'call.rejected',
  'call.ended',

  // Analytics command topics
  'analytics.device.breakdown',
  'analytics.top.regions',
  'analytics.top.pages',
  'analytics.events',
  'analytics.recent.activity',

  // Audit logs command/event topics
  'audit.log.create',
  'audit.log.list',
  'audit.log.created',

  // Voucher command/event topics
  'voucher.claim',
  'voucher.get.my',
  'voucher.get.by.id',
  'voucher.verify',
  'voucher.redeem',
  'voucher.generate.code',
  'voucher.claimed',
  'voucher.verified',
  'voucher.redeemed',
  'voucher.shared',

  // Orders command/event topics
  'order.get.merchant',
  'order.get.stats',
  'order.update.status',
  'order.status.updated',

  // Reviews command/event topics
  'review.get.merchant',
  'review.get.stats',
  'review.update.status',
  'review.status.updated',

  // Merchant dashboard command/event topics
  'merchant.dashboard.summary',
  'merchant.dashboard.summary.generated'
];

async function createTopics() {
  const admin = kafka.admin();
  
  try {
    await admin.connect();
    console.log('✅ Connected to Kafka');
    
    const existingTopics = await admin.listTopics();
    console.log('Existing topics:', existingTopics);
    
    for (const topic of topics) {
      if (!existingTopics.includes(topic)) {
        await admin.createTopics({
          topics: [{
            topic,
            numPartitions: 3,
            replicationFactor: 1
          }]
        });
        console.log(`✅ Created topic: ${topic}`);
      } else {
        console.log(`⏭️ Topic already exists: ${topic}`);
      }
    }
    
    console.log('\n✅ All topics created successfully!');
    
    // Verify topics were created
    const finalTopics = await admin.listTopics();
    console.log('\n📋 Final topics list:', finalTopics);
    
  } catch (error) {
    console.error('❌ Error creating topics:', error);
  } finally {
    await admin.disconnect();
    console.log('👋 Disconnected from Kafka');
  }
}

// Run the script
createTopics().catch(console.error);

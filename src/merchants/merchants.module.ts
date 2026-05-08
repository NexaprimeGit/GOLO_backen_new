import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MerchantsService } from './merchants.service';
import { MerchantsController } from './merchants.controller';
import { Merchant, MerchantSchema } from '../users/schemas/merchant.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Review, ReviewSchema } from '../reviews/schemas/review.schema';
import { KafkaModule } from '../kafka/kafka.module';
import { RedisModule } from '../common/services/redis.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Merchant.name, schema: MerchantSchema },
      { name: User.name, schema: UserSchema },
      { name: Review.name, schema: ReviewSchema },
    ]),
    KafkaModule, // Merchant registration, status updates
    RedisModule, // Cache merchant profiles, ratings
  ],
  controllers: [MerchantsController],
  providers: [MerchantsService],
  exports: [MerchantsService],
})
export class MerchantsModule {}

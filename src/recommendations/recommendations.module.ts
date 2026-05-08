import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';
import { OfferPromotion, OfferPromotionSchema } from '../offers/schemas/offer-promotion.schema';
import { Merchant, MerchantSchema } from '../users/schemas/merchant.schema';
import { UsersModule } from '../users/users.module';
import { RedisModule } from '../common/services/redis.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OfferPromotion.name, schema: OfferPromotionSchema },
      { name: Merchant.name, schema: MerchantSchema },
    ]),
    UsersModule,
    RedisModule,
  ],
  controllers: [RecommendationsController],
  providers: [RecommendationsService],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}

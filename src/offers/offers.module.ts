import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { KafkaModule } from '../kafka/kafka.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Merchant, MerchantSchema } from '../users/schemas/merchant.schema';
import { MerchantProduct, MerchantProductSchema } from '../merchant-products/schemas/merchant-product.schema';
import { OfferPromotion, OfferPromotionSchema } from './schemas/offer-promotion.schema';
import { OfferLikeHistory, OfferLikeHistorySchema } from './schemas/offer-like-history.schema';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OfferPromotion.name, schema: OfferPromotionSchema },
      { name: OfferLikeHistory.name, schema: OfferLikeHistorySchema },
      { name: User.name, schema: UserSchema },
      { name: Merchant.name, schema: MerchantSchema },
      { name: MerchantProduct.name, schema: MerchantProductSchema },
    ]),
    forwardRef(() => KafkaModule),
  ],
  controllers: [OffersController],
  providers: [OffersService],
  exports: [OffersService],
})
export class OffersModule {}

import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { KafkaModule } from '../kafka/kafka.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Merchant, MerchantSchema } from '../users/schemas/merchant.schema';
import { OfferPromotion, OfferPromotionSchema } from './schemas/offer-promotion.schema';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OfferPromotion.name, schema: OfferPromotionSchema },
      { name: User.name, schema: UserSchema },
      { name: Merchant.name, schema: MerchantSchema },
    ]),
    forwardRef(() => KafkaModule),
  ],
  controllers: [OffersController],
  providers: [OffersService],
  exports: [OffersService],
})
export class OffersModule {}

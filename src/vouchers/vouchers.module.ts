import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VouchersController } from './vouchers.controller';
import { VouchersService } from './vouchers.service';
import { Voucher, VoucherSchema } from './schemas/voucher.schema';
import { BannerPromotion, BannerPromotionSchema } from '../banners/schemas/banner-promotion.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { KafkaModule } from '../kafka/kafka.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Voucher.name, schema: VoucherSchema },
      { name: BannerPromotion.name, schema: BannerPromotionSchema },
      { name: User.name, schema: UserSchema },
    ]),
    forwardRef(() => KafkaModule),
  ],
  controllers: [VouchersController],
  providers: [VouchersService],
  exports: [VouchersService],
})
export class VouchersModule {}

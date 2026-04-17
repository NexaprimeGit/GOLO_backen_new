import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Ad, AdSchema } from '../ads/schemas/category-schemas/ad.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { Review, ReviewSchema } from '../reviews/schemas/review.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { MerchantDashboardController } from './merchant-dashboard.controller';
import { MerchantDashboardKafkaController } from './merchant-dashboard.kafka.controller';
import { MerchantDashboardService } from './merchant-dashboard.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Ad.name, schema: AdSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [MerchantDashboardController, MerchantDashboardKafkaController],
  providers: [MerchantDashboardService],
})
export class MerchantDashboardModule {}

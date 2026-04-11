import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AdsService } from './ads.service';
import { AdsController } from './ads.controller';
import { Ad, AdSchema } from './schemas/category-schemas/ad.schema';
import { BannerPromotion, BannerPromotionSchema } from './schemas/banner-promotion.schema';
import { User, UserSchema } from '../users/schemas/user.schema'; // IMPORT User schema
import { Report, ReportSchema } from './schemas/report.schema';
import { KafkaModule } from '../kafka/kafka.module';

@Module({
  imports: [
    // Register Ad model
    MongooseModule.forFeature([{ name: Ad.name, schema: AdSchema }]),

    // Register Report model
    MongooseModule.forFeature([{ name: Report.name, schema: ReportSchema }]),

    // Register Banner Promotion model
    MongooseModule.forFeature([{ name: BannerPromotion.name, schema: BannerPromotionSchema }]),

    // 🔴 CRITICAL: Register User model HERE
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),

    EventEmitterModule.forRoot(),
    forwardRef(() => KafkaModule),
  ],
  controllers: [AdsController],
  providers: [AdsService],
  exports: [AdsService],
})
export class AdsModule { }
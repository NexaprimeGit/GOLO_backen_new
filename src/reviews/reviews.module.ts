import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Review, ReviewSchema } from './schemas/review.schema';
import { ReviewsKafkaController } from './reviews.kafka.controller';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Review.name, schema: ReviewSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [ReviewsController, ReviewsKafkaController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}

import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ReviewsService } from './reviews.service';
import { ReviewStatus } from './schemas/review.schema';

@Controller('reviews')
@UseGuards(JwtAuthGuard)
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get('merchant')
  async getMerchantReviews(
    @CurrentUser() user: any,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    const merchantId = user?.id || user?._id;
    return this.reviewsService.getMerchantReviews(merchantId, Number(page), Number(limit), status, search);
  }

  @Get('merchant/stats')
  async getMerchantReviewStats(@CurrentUser() user: any) {
    const merchantId = user?.id || user?._id;
    return this.reviewsService.getMerchantReviewStats(merchantId);
  }

  @Patch(':reviewId/status')
  async updateReviewStatus(
    @CurrentUser() user: any,
    @Param('reviewId') reviewId: string,
    @Body('status') status: ReviewStatus,
  ) {
    const merchantId = user?.id || user?._id;
    return this.reviewsService.updateReviewStatus(merchantId, reviewId, status);
  }
}

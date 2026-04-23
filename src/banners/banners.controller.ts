import {
  Body,
  Controller,
  Put,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BannersService } from './banners.service';
import { BannerPromotionType } from './schemas/banner-promotion.schema';
import { SubmitBannerPromotionDto } from './dto/submit-banner-promotion.dto';
import { ReviewBannerPromotionDto } from './dto/review-banner-promotion.dto';
import { PayBannerPromotionDto } from './dto/pay-banner-promotion.dto';
import { UpdateBannerPromotionDto } from './dto/update-banner-promotion.dto';

@Controller('banners')
export class BannersController {
  constructor(private readonly bannersService: BannersService) {}

  @Post('promotions/request')
  @UseGuards(JwtAuthGuard)
  async submitBannerPromotionRequest(
    @Body() body: SubmitBannerPromotionDto,
    @CurrentUser() user: any,
  ) {
    const request = await this.bannersService.submitBannerPromotionRequest(
      user.id,
      body,
    );

    return {
      success: true,
      message: 'Banner promotion request submitted for review',
      data: request,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('promotions/my')
  @UseGuards(JwtAuthGuard)
  async getMyBannerPromotions(
    @CurrentUser() user: any,
    @Query('type') type?: string,
  ) {
    const promotionType =
      type === BannerPromotionType.OFFER
        ? BannerPromotionType.OFFER
        : BannerPromotionType.BANNER;
    const rows = await this.bannersService.listMerchantPromotionsByType(
      user.id,
      promotionType,
    );
    return {
      success: true,
      data: rows,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('promotions/template/save')
  @UseGuards(JwtAuthGuard)
  async saveOfferTemplate(
    @Body()
    body: {
      formData?: Record<string, any>;
      selectedProducts?: Array<Record<string, any>>;
    },
    @CurrentUser() user: any,
  ) {
    const data = await this.bannersService.saveMerchantOfferTemplate(
      user.id,
      body,
    );
    return {
      success: true,
      message: 'Offer template saved successfully',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('promotions/template')
  @UseGuards(JwtAuthGuard)
  async getOfferTemplate(@CurrentUser() user: any) {
    const data = await this.bannersService.getMerchantOfferTemplate(user.id);
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Delete('promotions/template')
  @UseGuards(JwtAuthGuard)
  async clearOfferTemplate(@CurrentUser() user: any) {
    const data = await this.bannersService.clearMerchantOfferTemplate(user.id);
    return {
      success: true,
      message: 'Offer template cleared successfully',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('promotions/:requestId/pay')
  @UseGuards(JwtAuthGuard)
  async payForApprovedBannerPromotion(
    @Param('requestId') requestId: string,
    @Body() body: PayBannerPromotionDto,
    @CurrentUser() user: any,
  ) {
    const updated = await this.bannersService.markBannerPromotionAsPaid(
      requestId,
      user.id,
      body.paymentReference,
    );
    return {
      success: true,
      message: 'Payment recorded and banner activated',
      data: updated,
      timestamp: new Date().toISOString(),
    };
  }

  @Put('promotions/:requestId')
  @UseGuards(JwtAuthGuard)
  async updateMyBannerPromotion(
    @Param('requestId') requestId: string,
    @Body() body: UpdateBannerPromotionDto,
    @CurrentUser() user: any,
    @Query('type') type?: string,
  ) {
    const promotionType =
      type === BannerPromotionType.OFFER
        ? BannerPromotionType.OFFER
        : BannerPromotionType.BANNER;
    const updated = await this.bannersService.updateMerchantBannerPromotion(
      requestId,
      user.id,
      body,
      promotionType,
    );
    return {
      success: true,
      message: 'Banner promotion updated successfully',
      data: updated,
      timestamp: new Date().toISOString(),
    };
  }

  @Delete('promotions/:requestId')
  @UseGuards(JwtAuthGuard)
  async deleteMyBannerPromotion(
    @Param('requestId') requestId: string,
    @CurrentUser() user: any,
    @Query('type') type?: string,
  ) {
    const promotionType =
      type === BannerPromotionType.OFFER
        ? BannerPromotionType.OFFER
        : BannerPromotionType.BANNER;
    const result = await this.bannersService.deleteMerchantBannerPromotion(
      requestId,
      user.id,
      promotionType,
    );
    return {
      success: true,
      message: 'Banner promotion deleted successfully',
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('promotions/active')
  async getActiveHomepageBanners(@Query('limit') limit?: string) {
    const safeLimit = Math.max(1, Math.min(5, Number(limit) || 5));
    const rows = await this.bannersService.getActiveHomepageBanners(safeLimit);
    return {
      success: true,
      data: rows,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('promotions/offers/nearby')
  async getNearbyOffers(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radiusKm') radiusKm?: string,
    @Query('location') location?: string,
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('sort') sort?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const requestPayload = {
      latitude: lat ? Number(lat) : undefined,
      longitude: lng ? Number(lng) : undefined,
      radiusKm: radiusKm ? Number(radiusKm) : undefined,
      location,
      query: q,
      category,
      sort,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    };

    const fallbackPage = requestPayload.page && requestPayload.page > 0 ? requestPayload.page : 1;
    const fallbackLimit =
      requestPayload.limit && requestPayload.limit > 0 ? requestPayload.limit : 20;

    const timeoutPromise = new Promise<{
      data: any[];
      pagination: { page: number; limit: number; total: number; pages: number };
    }>((resolve) => {
      setTimeout(() => {
        resolve({
          data: [],
          pagination: {
            page: fallbackPage,
            limit: fallbackLimit,
            total: 0,
            pages: 0,
          },
        });
      }, 8000);
    });

    const data = await Promise.race([
      this.bannersService.getNearbyOffers(requestPayload),
      timeoutPromise,
    ]);

    return {
      success: true,
      ...data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('promotions/offers/:offerId')
  async getPublicOfferDetails(@Param('offerId') offerId: string) {
    const data = await this.bannersService.getPublicOfferDetails(offerId);
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('admin/promotions')
  @UseGuards(JwtAuthGuard)
  async adminListBannerPromotions(
    @Query('status') status: string,
    @CurrentUser() user: any,
  ) {
    if (!['admin', 'manager'].includes(String(user?.role || '').toLowerCase())) {
      throw new ForbiddenException(
        'Only admin/manager can view banner moderation queue',
      );
    }

    const rows = await this.bannersService.listBannerPromotionsForAdmin(status);
    return {
      success: true,
      data: rows,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('admin/promotions/:requestId/review')
  @UseGuards(JwtAuthGuard)
  async adminReviewBannerPromotion(
    @Param('requestId') requestId: string,
    @Body() body: ReviewBannerPromotionDto,
    @CurrentUser() user: any,
  ) {
    if (!['admin', 'manager'].includes(String(user?.role || '').toLowerCase())) {
      throw new ForbiddenException(
        'Only admin/manager can review banner promotions',
      );
    }

    const result = await this.bannersService.reviewBannerPromotionRequest(
      requestId,
      body.decision,
      user.id,
      body.adminNotes,
    );

    return {
      success: true,
      message: `Banner request ${body.decision === 'approve' ? 'approved' : 'rejected'} successfully`,
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  @Delete('admin/promotions/:requestId')
  @UseGuards(JwtAuthGuard)
  async adminDeleteBannerPromotion(
    @Param('requestId') requestId: string,
    @CurrentUser() user: any,
  ) {
    if (!['admin', 'manager'].includes(String(user?.role || '').toLowerCase())) {
      throw new ForbiddenException(
        'Only admin/manager can delete banner promotions',
      );
    }

    const result = await this.bannersService.deleteBannerPromotion(requestId);

    return {
      success: true,
      message: 'Banner promotion deleted successfully',
      data: result,
      timestamp: new Date().toISOString(),
    };
  }
}

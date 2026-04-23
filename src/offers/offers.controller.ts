import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  UseGuards,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OffersService } from './offers.service';
import { KafkaService } from '../kafka/kafka.service';
import { KAFKA_TOPICS } from '../common/constants/kafka-topics';
import { SubmitBannerPromotionDto } from '../banners/dto/submit-banner-promotion.dto';
import { UpdateBannerPromotionDto } from '../banners/dto/update-banner-promotion.dto';

@Controller('offers')
export class OffersController {
  constructor(
    private readonly offersService: OffersService,
    private readonly kafkaService: KafkaService,
  ) {}

  @Post('request')
  @UseGuards(JwtAuthGuard)
  async submitOfferRequest(@Body() body: SubmitBannerPromotionDto, @CurrentUser() user: any) {
    try {
      const userId = user?.id || user?.sub || user?._id;
      if (!userId) {
        throw new UnauthorizedException('Authentication required');
      }

      if (!body || typeof body !== 'object') {
        throw new BadRequestException('Invalid request payload');
      }

      const payload = { ...body } as any;

      if (!payload.title || !payload.category) {
        throw new BadRequestException('Offer title and category are required');
      }

      const request = await this.offersService.submitOfferPromotionRequest(String(userId), payload);

      try {
        await this.kafkaService?.emit(KAFKA_TOPICS.OFFER_PROMOTION_SUBMITTED, {
          requestId: request.requestId,
          merchantId: String(userId),
          title: request.title,
          category: request.category,
          totalPrice: request.totalPrice,
        });
      } catch (kafkaError) {
        console.error('[Offers] Kafka emit error:', kafkaError.message);
      }

      return {
        success: true,
        message: 'Offer promotion request submitted for review',
        data: request,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[Offers] Submit error:', error.message, error.stack);
      throw error;
    }
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  async getMyOffers(@CurrentUser() user: any, @Query('type') type?: string) {
    const rows = await this.offersService.listMerchantOffers(user.id);
    return { success: true, data: rows, timestamp: new Date().toISOString() };
  }

  @Put(':requestId')
  @UseGuards(JwtAuthGuard)
  async updateMyOffer(@Param('requestId') requestId: string, @Body() body: UpdateBannerPromotionDto, @CurrentUser() user: any) {
    const updated = await this.offersService.updateMerchantOffer(requestId, user.id, body);
    try { await this.kafkaService.emit(KAFKA_TOPICS.OFFER_PROMOTION_REVIEWED, { requestId, merchantId: user.id }); } catch {}
    return { success: true, message: 'Offer updated', data: updated, timestamp: new Date().toISOString() };
  }

  @Delete(':requestId')
  @UseGuards(JwtAuthGuard)
  async deleteMyOffer(@Param('requestId') requestId: string, @CurrentUser() user: any) {
    const result = await this.offersService.deleteMerchantOffer(requestId, user.id);
    try { await this.kafkaService.emit(KAFKA_TOPICS.OFFER_PROMOTION_DELETED, { requestId, merchantId: user.id }); } catch {}
    return { success: true, message: 'Offer deleted', data: result, timestamp: new Date().toISOString() };
  }

  @Get('nearby')
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

    const fn = (this.offersService as any).getNearbyOffers;
    const data = fn ? await fn.call(this.offersService, requestPayload) : { data: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } };
    return { success: true, ...data, timestamp: new Date().toISOString() };
  }

  // Template endpoints (must be BEFORE :offerId route)
  @Post('template/save')
  @UseGuards(JwtAuthGuard)
  async saveOfferTemplate(@Body() body: any, @CurrentUser() user: any) {
    const data = await this.offersService.saveOfferTemplate(user.id, body);
    return { success: true, message: 'Offer template saved successfully', data, timestamp: new Date().toISOString() };
  }

  @Get('template')
  @UseGuards(JwtAuthGuard)
  async getOfferTemplate(@CurrentUser() user: any) {
    const data = await this.offersService.getOfferTemplate(user.id);
    return { success: true, data, timestamp: new Date().toISOString() };
  }

  @Delete('template')
  @UseGuards(JwtAuthGuard)
  async clearOfferTemplate(@CurrentUser() user: any) {
    const data = await this.offersService.clearOfferTemplate(user.id);
    return { success: true, message: 'Offer template cleared successfully', data, timestamp: new Date().toISOString() };
  }

  @Get(':offerId')
  async getPublicOfferDetails(@Param('offerId') offerId: string) {
    const data = await this.offersService.getPublicOfferDetails(offerId);
    return { success: true, data, timestamp: new Date().toISOString() };
  }
}

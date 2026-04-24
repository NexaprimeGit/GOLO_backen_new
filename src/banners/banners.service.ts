import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { KafkaService } from '../kafka/kafka.service';
import { KAFKA_TOPICS } from '../common/constants/kafka-topics';
import { RedisService } from '../common/services/redis.service';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Merchant, MerchantDocument } from '../users/schemas/merchant.schema';
import {
  BannerPromotionType,
  BannerPaymentStatus,
  BannerPromotion,
  BannerPromotionDocument,
  BannerPromotionStatus,
} from './schemas/banner-promotion.schema';
import {
  PromotionTypeDto,
  SubmitBannerPromotionDto,
} from './dto/submit-banner-promotion.dto';
import { UpdateBannerPromotionDto } from './dto/update-banner-promotion.dto';

@Injectable()
export class BannersService implements OnModuleInit {
  private readonly logger = new Logger(BannersService.name);
  private readonly legacyOfferCategorySet = new Set([
    'special',
    'festival',
    'limited time',
    'combo',
    'clearance',
  ]);

  constructor(
    @InjectModel(BannerPromotion.name)
    private readonly bannerPromotionModel: Model<BannerPromotionDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Merchant.name)
    private readonly merchantModel: Model<MerchantDocument>,
    private readonly redisService: RedisService,
    @Optional() private readonly kafkaService?: KafkaService,
  ) {}

  private toRadians(value: number): number {
    return (value * Math.PI) / 180;
  }

  private calculateDistanceKm(
    latitudeA: number,
    longitudeA: number,
    latitudeB: number,
    longitudeB: number,
  ): number {
    const earthRadiusKm = 6371;
    const dLat = this.toRadians(latitudeB - latitudeA);
    const dLon = this.toRadians(longitudeB - longitudeA);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(latitudeA)) *
        Math.cos(this.toRadians(latitudeB)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
  }

  private hasValidMerchantCoordinates(
    latitude: number,
    longitude: number,
  ): boolean {
    const inValidRange =
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180;

    // (0,0) is a common placeholder/invalid value for this app.
    if (!inValidRange) {
      return false;
    }

    return !(Math.abs(latitude) < 0.000001 && Math.abs(longitude) < 0.000001);
  }

  private isLikelyLegacyOffer(row: {
    promotionType?: BannerPromotionType;
    bannerCategory?: string;
    bannerTitle?: string;
  }): boolean {
    if (row?.promotionType === BannerPromotionType.OFFER) {
      return true;
    }

    if (row?.promotionType) {
      return false;
    }

    const category = String(row?.bannerCategory || '').trim().toLowerCase();
    if (this.legacyOfferCategorySet.has(category)) {
      return true;
    }

    const title = String(row?.bannerTitle || '').trim().toLowerCase();
    return title.includes('offer') || title.includes('deal');
  }

  private merchantListByTypeCacheKey(
    merchantId: string,
    type: BannerPromotionType,
  ): string {
    return `golo:banners:merchant:${merchantId}:${type}`;
  }

  private adminListCacheKey(status?: string): string {
    return `golo:banners:admin:${status || 'all'}`;
  }

  private activeBannersCacheKey(limit: number): string {
    return `golo:banners:active:${limit}`;
  }

  private normalizeDateStrings(dateStrings: string[] = []): Date[] {
    return Array.from(new Set(dateStrings))
      .map((dateStr) => {
        const parsed = new Date(dateStr);
        if (Number.isNaN(parsed.getTime())) {
          return null;
        }

        const normalized = new Date(parsed);
        normalized.setHours(0, 0, 0, 0);
        return normalized;
      })
      .filter((date): date is Date => date !== null)
      .sort((a, b) => a.getTime() - b.getTime());
  }

  private offerTemplateCacheKey(merchantId: string): string {
    return `golo:banners:template:${merchantId}`;
  }

  private async invalidateBannerCache(merchantId?: string): Promise<void> {
    await this.redisService.deleteByPattern('golo:banners:active:*');
    await this.redisService.deleteByPattern('golo:banners:admin:*');
    if (merchantId) {
      await this.redisService.deleteByPattern(`golo:banners:merchant:${merchantId}:*`);
    }
  }

  async onModuleInit() {
    if (this.kafkaService) {
      this.logger.log('Kafka service connected for BannersService');
    }
  }

  async saveMerchantOfferTemplate(
    merchantId: string,
    payload: {
      formData?: Record<string, any>;
      selectedProducts?: Array<Record<string, any>>;
    },
  ) {
    const cacheKey = this.offerTemplateCacheKey(merchantId);
    const normalized = {
      formData: payload?.formData || {},
      selectedProducts: Array.isArray(payload?.selectedProducts)
        ? payload.selectedProducts
        : [],
      updatedAt: new Date().toISOString(),
    };

    const persisted = await this.redisService.set(
      cacheKey,
      normalized,
      7 * 24 * 60 * 60,
    );

    if (!persisted) {
      throw new BadRequestException('Failed to save template to cache');
    }

    return normalized;
  }

  async getMerchantOfferTemplate(merchantId: string) {
    const cacheKey = this.offerTemplateCacheKey(merchantId);
    const cached = await this.redisService.get<{
      formData?: Record<string, any>;
      selectedProducts?: Array<Record<string, any>>;
      updatedAt?: string;
    }>(cacheKey);

    if (!cached) {
      return null;
    }

    return {
      formData: cached.formData || {},
      selectedProducts: Array.isArray(cached.selectedProducts)
        ? cached.selectedProducts
        : [],
      updatedAt: cached.updatedAt,
    };
  }

  async clearMerchantOfferTemplate(merchantId: string) {
    const cacheKey = this.offerTemplateCacheKey(merchantId);
    await this.redisService.del(cacheKey);
    return { cleared: true };
  }

  async submitBannerPromotionRequest(
    merchantId: string,
    payload: SubmitBannerPromotionDto,
  ): Promise<BannerPromotion> {
    const merchant = await this.userModel
      .findById(merchantId)
      .select('name email role accountType')
      .lean()
      .exec();

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    if (merchant.role !== 'merchant' && merchant.accountType !== 'merchant') {
      throw new ForbiddenException(
        'Only merchants can submit banner promotion requests',
      );
    }

    const merchantProfile = await this.merchantModel
      .findOne({ userId: merchantId })
      .select('storeLocation storeLocationLatitude storeLocationLongitude')
      .lean()
      .exec();

    const merchantLatitude = Number(merchantProfile?.storeLocationLatitude);
    const merchantLongitude = Number(merchantProfile?.storeLocationLongitude);
    const hasStoreCoordinates =
      Number.isFinite(merchantLatitude) &&
      Number.isFinite(merchantLongitude) &&
      merchantLatitude >= -90 &&
      merchantLatitude <= 90 &&
      merchantLongitude >= -180 &&
      merchantLongitude <= 180;

    if (!hasStoreCoordinates) {
      throw new BadRequestException(
        'Store coordinates missing. Please set your store location on merchant profile map before publishing offers.',
      );
    }

    const normalizedDates = this.normalizeDateStrings(payload.selectedDates || []);

    if (!normalizedDates.length) {
      throw new BadRequestException(
        'Please select at least one valid visibility date',
      );
    }

    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);
    if (normalizedDates[0] < todayUtc) {
      throw new BadRequestException('Selected dates cannot be in the past');
    }

    const startDate = new Date(normalizedDates[0]);
    startDate.setUTCHours(0, 0, 0, 0);
    const endDate = new Date(normalizedDates[normalizedDates.length - 1]);
    endDate.setUTCHours(23, 59, 59, 999);

    const selectedDays = normalizedDates.length;
    const dailyRate = Number(payload.dailyRate ?? 240);
    const platformFee = Number(payload.platformFee ?? (selectedDays > 0 ? 49 : 0));
    const computedTotal = dailyRate * selectedDays + platformFee;
    const selectedProducts = (payload.selectedProducts || []).map((product) => ({
      productId: String(product.productId),
      productName: String(product.productName),
      imageUrl: product.imageUrl || '',
      originalPrice: Number(product.originalPrice || 0),
      offerPrice: Number(product.offerPrice || 0),
      stockQuantity: Number(product.stockQuantity || 0),
    }));

    const promotionType =
      payload.promotionType === PromotionTypeDto.OFFER
        ? BannerPromotionType.OFFER
        : BannerPromotionType.BANNER;

    const request = await this.bannerPromotionModel.create({
      requestId: uuidv4(),
      merchantId,
      merchantName: merchant.name || 'Merchant',
      merchantEmail: merchant.email || '-',
      bannerTitle: payload.bannerTitle?.trim(),
      bannerCategory: payload.bannerCategory?.trim(),
      description: payload.description?.trim() || '',
      promotionType,
      imageUrl: payload.imageUrl,
      recommendedSize: payload.recommendedSize || '1920 x 520 px',
      selectedDates: normalizedDates,
      startDate,
      endDate,
      selectedDays,
      dailyRate,
      platformFee,
      totalPrice: Number(payload.totalPrice || computedTotal),
      loyaltyRewardEnabled: Boolean(payload.loyaltyRewardEnabled),
      loyaltyStarsToOffer: Number(payload.loyaltyStarsToOffer || 0),
      loyaltyStarsPerPurchase: Number(payload.loyaltyStarsPerPurchase || 1),
      loyaltyScorePerStar: Number(payload.loyaltyScorePerStar || 10),
      promotionExpiryText: payload.promotionExpiryText || '',
      termsAndConditions: payload.termsAndConditions || '',
      exampleUsage: payload.exampleUsage || '',
      selectedProducts,
      status: BannerPromotionStatus.UNDER_REVIEW,
      paymentStatus: BannerPaymentStatus.PENDING,
      isHomepageVisible: false,
    });

    if (this.kafkaService) {
      await this.kafkaService.emit(KAFKA_TOPICS.BANNER_PROMOTION_SUBMITTED, {
        requestId: request.requestId,
        merchantId,
        bannerTitle: request.bannerTitle,
        bannerCategory: request.bannerCategory,
        totalPrice: request.totalPrice,
      });
    }

    await this.invalidateBannerCache(merchantId);

    return request;
  }

  async listMerchantBannerPromotions(merchantId: string): Promise<BannerPromotion[]> {
    return this.listMerchantPromotionsByType(merchantId, BannerPromotionType.BANNER);
  }

  async listMerchantPromotionsByType(
    merchantId: string,
    promotionType: BannerPromotionType,
  ): Promise<BannerPromotion[]> {
    const cacheKey = this.merchantListByTypeCacheKey(merchantId, promotionType);
    const cached = await this.redisService.get<BannerPromotion[]>(cacheKey);
    if (cached) {
      return cached;
    }

    await this.expireBannerPromotions();
    const rows = await this.bannerPromotionModel
      .find({ merchantId, promotionType })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    await this.redisService.set(cacheKey, rows, 120);
    return rows;
  }

  async listBannerPromotionsForAdmin(status?: string): Promise<BannerPromotion[]> {
    const cacheKey = this.adminListCacheKey(status);
    const cached = await this.redisService.get<BannerPromotion[]>(cacheKey);
    if (cached) {
      return cached;
    }

    await this.expireBannerPromotions();

    const filter: Record<string, any> = {};
    if (status && status !== 'all') {
      filter.status = status;
    }

    const rows = await this.bannerPromotionModel
      .find(filter)
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    await this.redisService.set(cacheKey, rows, 60);
    return rows;
  }

  async reviewBannerPromotionRequest(
    requestId: string,
    decision: 'approve' | 'reject',
    adminId: string,
    adminNotes?: string,
  ): Promise<BannerPromotion> {
    const request = await this.bannerPromotionModel.findOne({ requestId }).exec();
    if (!request) {
      throw new NotFoundException('Banner promotion request not found');
    }

    if (request.status !== BannerPromotionStatus.UNDER_REVIEW) {
      throw new BadRequestException('Only under review requests can be moderated');
    }

    request.reviewedBy = adminId;
    request.reviewedAt = new Date();
    request.adminNotes = adminNotes || '';

    if (decision === 'approve') {
      request.status = BannerPromotionStatus.APPROVED;
      request.isHomepageVisible = true;
    } else {
      request.status = BannerPromotionStatus.REJECTED;
      request.isHomepageVisible = false;
    }

    await request.save();

    if (this.kafkaService) {
      await this.kafkaService.emit(KAFKA_TOPICS.BANNER_PROMOTION_REVIEWED, {
        requestId,
        decision,
        adminId,
      });
    }

    await this.invalidateBannerCache(request.merchantId);

    return request;
  }

  async markBannerPromotionAsPaid(
    requestId: string,
    merchantId: string,
    paymentReference?: string,
  ): Promise<BannerPromotion> {
    const request = await this.bannerPromotionModel
      .findOne({ requestId, merchantId })
      .exec();
    if (!request) {
      throw new NotFoundException('Banner promotion request not found');
    }

    if (request.status !== BannerPromotionStatus.APPROVED) {
      throw new BadRequestException('Only approved requests can be paid and activated');
    }

    request.paymentStatus = BannerPaymentStatus.PAID;
    request.paidAt = new Date();
    request.paymentReference = paymentReference || '';
    request.status = BannerPromotionStatus.ACTIVE;
    request.isHomepageVisible = true;

    await request.save();
    await this.enforceActiveBannerLimit(5);

    if (this.kafkaService) {
      await this.kafkaService.emit(KAFKA_TOPICS.BANNER_PROMOTION_PAID, {
        requestId,
        merchantId,
        paymentReference: request.paymentReference,
      });
    }

    await this.invalidateBannerCache(merchantId);

    return request;
  }

  async updateMerchantBannerPromotion(
    requestId: string,
    merchantId: string,
    payload: UpdateBannerPromotionDto,
    expectedType: BannerPromotionType = BannerPromotionType.BANNER,
  ): Promise<BannerPromotion> {
    const request = await this.bannerPromotionModel
      .findOne({ requestId, merchantId, promotionType: expectedType })
      .exec();
    if (!request) {
      throw new NotFoundException('Banner promotion request not found');
    }

    if (payload.bannerTitle !== undefined) {
      request.bannerTitle = payload.bannerTitle.trim();
    }
    if (payload.bannerCategory !== undefined) {
      request.bannerCategory = payload.bannerCategory.trim();
    }
    if (payload.description !== undefined) {
      request.description = payload.description.trim();
    }
    if (payload.imageUrl !== undefined) {
      request.imageUrl = payload.imageUrl;
    }
    if (payload.recommendedSize !== undefined) {
      request.recommendedSize = payload.recommendedSize;
    }

    if (payload.loyaltyRewardEnabled !== undefined) {
      request.loyaltyRewardEnabled = payload.loyaltyRewardEnabled;
    }

    if (payload.loyaltyStarsToOffer !== undefined) {
      request.loyaltyStarsToOffer = Number(payload.loyaltyStarsToOffer || 0);
    }

    if (payload.loyaltyStarsPerPurchase !== undefined) {
      request.loyaltyStarsPerPurchase = Number(payload.loyaltyStarsPerPurchase || 1);
    }

    if (payload.loyaltyScorePerStar !== undefined) {
      request.loyaltyScorePerStar = Number(payload.loyaltyScorePerStar || 10);
    }

    if (payload.promotionExpiryText !== undefined) {
      request.promotionExpiryText = payload.promotionExpiryText;
    }

    if (payload.termsAndConditions !== undefined) {
      request.termsAndConditions = payload.termsAndConditions;
    }

    if (payload.exampleUsage !== undefined) {
      request.exampleUsage = payload.exampleUsage;
    }

    if (Array.isArray(payload.selectedProducts)) {
      request.selectedProducts = payload.selectedProducts.map((product) => ({
        productId: String(product.productId),
        productName: String(product.productName),
        imageUrl: product.imageUrl || '',
        originalPrice: Number(product.originalPrice || 0),
        offerPrice: Number(product.offerPrice || 0),
        stockQuantity: Number(product.stockQuantity || 0),
      }));
    }

    if (Array.isArray(payload.selectedDates) && payload.selectedDates.length) {
      const normalizedDates = this.normalizeDateStrings(payload.selectedDates);

      if (!normalizedDates.length) {
        throw new BadRequestException('Please provide valid selectedDates');
      }

      request.selectedDates = normalizedDates;
      const startDate = new Date(normalizedDates[0]);
      startDate.setUTCHours(0, 0, 0, 0);
      const endDate = new Date(normalizedDates[normalizedDates.length - 1]);
      endDate.setUTCHours(23, 59, 59, 999);
      request.startDate = startDate;
      request.endDate = endDate;
      request.selectedDays = normalizedDates.length;
      request.totalPrice =
        request.dailyRate * request.selectedDays + request.platformFee;
    }

    if (payload.action === 'pause') {
      request.isHomepageVisible = false;
      if (request.status === BannerPromotionStatus.ACTIVE) {
        request.status = BannerPromotionStatus.APPROVED;
      }
    }

    if (payload.action === 'resume') {
      if (request.paymentStatus !== BannerPaymentStatus.PAID) {
        throw new BadRequestException('Only paid banner requests can be resumed');
      }
      request.isHomepageVisible = true;
      request.status = BannerPromotionStatus.ACTIVE;
    }

    await request.save();
    await this.invalidateBannerCache(merchantId);
    return request;
  }

  async getActiveHomepageBanners(limit = 5): Promise<BannerPromotion[]> {
    const cacheKey = this.activeBannersCacheKey(limit);
    const cached = await this.redisService.get<BannerPromotion[]>(cacheKey);
    if (cached) {
      return cached;
    }

    await this.expireBannerPromotions();

    const now = new Date();

    const rows = await this.bannerPromotionModel
      .find({
        promotionType: BannerPromotionType.BANNER,
        status: {
          $in: [BannerPromotionStatus.APPROVED, BannerPromotionStatus.ACTIVE],
        },
        isHomepageVisible: true,
        startDate: { $lte: now },
        endDate: { $gte: now },
      })
      .sort({
        status: 1,
        paidAt: -1,
        createdAt: -1,
      })
      .limit(limit)
      .lean()
      .exec();

    await this.redisService.set(cacheKey, rows, 60);
    return rows;
  }

  async deleteBannerPromotion(requestId: string): Promise<BannerPromotion> {
    const bannerPromotion = await this.bannerPromotionModel
      .findOne({ requestId })
      .exec();
    if (!bannerPromotion) {
      throw new NotFoundException(
        `Banner promotion with ID ${requestId} not found`,
      );
    }

    await this.bannerPromotionModel.deleteOne({ requestId }).exec();

    if (this.kafkaService) {
      await this.kafkaService.emit(KAFKA_TOPICS.BANNER_PROMOTION_DELETED, {
        requestId,
        merchantId: bannerPromotion.merchantId,
      });
    }

    await this.invalidateBannerCache(bannerPromotion.merchantId);

    return bannerPromotion;
  }

  async deleteMerchantBannerPromotion(
    requestId: string,
    merchantId: string,
    expectedType: BannerPromotionType = BannerPromotionType.BANNER,
  ): Promise<BannerPromotion> {
    const bannerPromotion = await this.bannerPromotionModel
      .findOne({ requestId, merchantId, promotionType: expectedType })
      .exec();
    if (!bannerPromotion) {
      throw new NotFoundException('Banner promotion request not found');
    }

    await this.bannerPromotionModel.deleteOne({ requestId, merchantId }).exec();
    await this.invalidateBannerCache(merchantId);
    return bannerPromotion;
  }

  private async expireBannerPromotions(): Promise<void> {
    const now = new Date();

    await this.bannerPromotionModel
      .updateMany(
        {
          status: BannerPromotionStatus.ACTIVE,
          endDate: { $lt: now },
        },
        {
          $set: {
            status: BannerPromotionStatus.EXPIRED,
            isHomepageVisible: false,
          },
        },
      )
      .exec();
  }

  private async enforceActiveBannerLimit(maxActive: number): Promise<void> {
    const activeRequests = await this.bannerPromotionModel
      .find({
        status: BannerPromotionStatus.ACTIVE,
        paymentStatus: BannerPaymentStatus.PAID,
        isHomepageVisible: true,
      })
      .sort({ paidAt: 1, createdAt: 1 })
      .exec();

    if (activeRequests.length <= maxActive) {
      return;
    }

    const toDelete = activeRequests.slice(0, activeRequests.length - maxActive);
    const idsToDelete = toDelete.map((item) => item.requestId);

    await this.bannerPromotionModel
      .deleteMany({ requestId: { $in: idsToDelete } })
      .exec();
  }

  async getNearbyOffers(params: {
    latitude?: number;
    longitude?: number;
    radiusKm?: number;
    location?: string;
    query?: string;
    category?: string;
    sort?: string;
    maxPrice?: number;
    page?: number;
    limit?: number;
  }) {
    const safePage = Math.max(1, Number(params.page) || 1);
    const safeLimit = Math.min(50, Math.max(1, Number(params.limit) || 20));
    const prefetchLimit = Math.min(300, Math.max(120, safeLimit * 8));
    const safeRadiusKm = Math.min(100, Math.max(1, Number(params.radiusKm) || 5));
    const locationNeedle = String(params.location || '').trim().toLowerCase();
    const queryNeedle = String(params.query || '').trim().toLowerCase();
    const categoryNeedle = String(params.category || '').trim().toLowerCase();
    const sortBy = String(params.sort || '').trim().toLowerCase();
    const maxPrice = Number(params.maxPrice);

    const hasUserCoordinates =
      typeof params.latitude === 'number' &&
      !Number.isNaN(params.latitude) &&
      typeof params.longitude === 'number' &&
      !Number.isNaN(params.longitude);

    let offerRows: any[] = [];
    try {
offerRows = await this.bannerPromotionModel
        .find({
          promotionType: BannerPromotionType.OFFER,
          status: {
            $in: [
              BannerPromotionStatus.UNDER_REVIEW,
              BannerPromotionStatus.APPROVED,
              BannerPromotionStatus.ACTIVE,
            ],
          },
        })
        .select(
          'requestId merchantId merchantName bannerTitle bannerCategory totalPrice startDate endDate status createdAt promotionType imageUrl selectedProducts',
        )
        .limit(prefetchLimit)
        .maxTimeMS(7000)
        .lean()
        .exec();

      if (!offerRows.length) {
        const legacyRows = await this.bannerPromotionModel
          .find({
            status: {
              $in: [
                BannerPromotionStatus.UNDER_REVIEW,
                BannerPromotionStatus.APPROVED,
                BannerPromotionStatus.ACTIVE,
              ],
            },
          })
          .select(
            'requestId merchantId merchantName bannerTitle bannerCategory totalPrice startDate endDate status createdAt promotionType imageUrl selectedProducts',
          )
          .limit(prefetchLimit)
          .maxTimeMS(5000)
          .lean()
          .exec();

        offerRows = legacyRows.filter((row) => this.isLikelyLegacyOffer(row));
      }
    } catch (error: any) {
      this.logger.error(`Nearby offers query failed: ${error?.message || error}`);
      return {
        data: [],
        pagination: {
          page: safePage,
          limit: safeLimit,
          total: 0,
          pages: 0,
        },
      };
    }

    if (!offerRows.length) {
      return {
        data: [],
        pagination: {
          page: safePage,
          limit: safeLimit,
          total: 0,
          pages: 0,
        },
      };
    }

// Fetch merchant data even in fast path to get store locations
    const merchantIds = Array.from(new Set(offerRows.map((row) => String(row.merchantId))));
    let merchants: any[] = [];
    try {
      merchants = await this.merchantModel
        .find({ userId: { $in: merchantIds } })
        .select(
          'userId storeName storeCategory storeSubCategory storeLocation storeLocationLatitude storeLocationLongitude profilePhoto shopPhoto',
        )
        .maxTimeMS(8000)
        .lean()
        .exec();
    } catch (error: any) {
      this.logger.error(`Nearby merchants query failed: ${error?.message || error}`);
      merchants = [];
    }

    const merchantsByUserId = new Map<string, any>(
      merchants.map((merchant) => [String(merchant.userId), merchant]),
    );

    // Fast path: no geo filtering requested.
    if (!hasUserCoordinates && !locationNeedle) {
      let normalized = offerRows.map((row) => {
        const merchant = merchantsByUserId.get(String(row.merchantId));
        return {
          offerId: String(row._id),
          requestId: row.requestId,
          title: row.bannerTitle,
          category: row.bannerCategory,
          imageUrl: row.imageUrl || '',
          totalPrice: Number(row.totalPrice || 0),
          displayPrice: Number(row.totalPrice || 0),
          discountPercent: 0,
          startsAt: row.startDate,
          endsAt: row.endDate,
          status: row.status,
          isActiveNow: false,
          distanceKm: null as number | null,
          merchant: {
            merchantId: String(row.merchantId),
            name: merchant?.storeName || row.merchantName || 'Merchant',
            category: merchant?.storeCategory || '',
            subCategory: merchant?.storeSubCategory || '',
            address: merchant?.storeLocation || '',
            latitude: merchant?.storeLocationLatitude || null,
            longitude: merchant?.storeLocationLongitude || null,
            profilePhoto: merchant?.profilePhoto || merchant?.shopPhoto || '',
          },
          selectedProducts: Array.isArray(row.selectedProducts) ? row.selectedProducts : [],
          createdAt: row.createdAt,
        };
      });

      if (queryNeedle) {
        normalized = normalized.filter((row) => {
          const blob = `${row.title || ''} ${row.category || ''} ${row.merchant.name || ''}`.toLowerCase();
          return blob.includes(queryNeedle);
        });
      }

      if (categoryNeedle) {
        normalized = normalized.filter(
          (row) => String(row.category || '').toLowerCase() === categoryNeedle,
        );
      }

      if (!Number.isNaN(maxPrice) && maxPrice > 0) {
        normalized = normalized.filter((row) => row.displayPrice <= maxPrice);
      }

      normalized.sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
      );

      const total = normalized.length;
      const pages = Math.ceil(total / safeLimit);
      const start = (safePage - 1) * safeLimit;

      return {
        data: normalized.slice(start, start + safeLimit),
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          pages,
        },
      };
}

    const now = new Date();

    let normalized = offerRows.map((row) => {
      const merchant = merchantsByUserId.get(String(row.merchantId));
      const latitude = Number(merchant?.storeLocationLatitude);
      const longitude = Number(merchant?.storeLocationLongitude);
      const hasMerchantCoordinates = this.hasValidMerchantCoordinates(
        latitude,
        longitude,
      );

      let distanceKm: number | null = null;
      if (hasUserCoordinates && hasMerchantCoordinates) {
        distanceKm = this.calculateDistanceKm(
          Number(params.latitude),
          Number(params.longitude),
          latitude,
          longitude,
        );
      }

      const selectedProducts: any[] = Array.isArray(row.selectedProducts) ? row.selectedProducts : [];

      const computedBestDiscountPercent = selectedProducts.reduce(
        (best, product) => {
          const original = Number(product?.originalPrice || 0);
          const offer = Number(product?.offerPrice || 0);
          if (original <= 0 || offer < 0 || offer >= original) {
            return best;
          }
          const discountPercent = ((original - offer) / original) * 100;
          return Math.max(best, discountPercent);
        },
        0,
      );

      const lowestOfferPrice = selectedProducts.length
        ? selectedProducts.reduce((min, product) => {
            const value = Number(product?.offerPrice || 0);
            return value > 0 ? Math.min(min, value) : min;
          }, Number.MAX_SAFE_INTEGER)
        : Number.MAX_SAFE_INTEGER;

      const startsAt = row.startDate ? new Date(row.startDate) : null;
      const endsAt = row.endDate ? new Date(row.endDate) : null;
      const isActiveNow =
        Boolean(startsAt && endsAt) && startsAt <= now && endsAt >= now;

      return {
        offerId: String(row._id),
        requestId: row.requestId,
        title: row.bannerTitle,
        category: row.bannerCategory,
        imageUrl: row.imageUrl || '',
        totalPrice: Number(row.totalPrice || 0),
        displayPrice:
          lowestOfferPrice !== Number.MAX_SAFE_INTEGER
            ? lowestOfferPrice
            : Number(row.totalPrice || 0),
        discountPercent: Math.round(computedBestDiscountPercent),
        startsAt: row.startDate,
        endsAt: row.endDate,
        status: row.status,
        isActiveNow,
        distanceKm,
        merchant: {
          merchantId: String(row.merchantId),
          name: merchant?.storeName || row.merchantName || 'Merchant',
          category: merchant?.storeCategory || '',
          subCategory: merchant?.storeSubCategory || '',
          address: merchant?.storeLocation || '',
          latitude: hasMerchantCoordinates ? latitude : null,
          longitude: hasMerchantCoordinates ? longitude : null,
          profilePhoto: merchant?.profilePhoto || merchant?.shopPhoto || '',
        },
        selectedProducts,
        createdAt: row.createdAt,
      };
    });

    if (hasUserCoordinates) {
      normalized = normalized.filter((row) => {
        if (row.distanceKm === null) {
          // Keep rows without coordinates visible instead of dropping all results.
          // When location text is provided, restrict these fallback rows by address match.
          if (locationNeedle) {
            return String(row.merchant.address || '')
              .toLowerCase()
              .includes(locationNeedle);
          }
          return true;
        }
        return row.distanceKm <= safeRadiusKm;
      });
    } else if (locationNeedle) {
      normalized = normalized.filter((row) =>
        String(row.merchant.address || '').toLowerCase().includes(locationNeedle),
      );
    }

    if (queryNeedle) {
      normalized = normalized.filter((row) => {
        const searchBlob = [
          row.title,
          row.category,
          row.merchant.name,
          row.merchant.address,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return searchBlob.includes(queryNeedle);
      });
    }

    if (categoryNeedle) {
      normalized = normalized.filter(
        (row) => String(row.category || '').toLowerCase() === categoryNeedle,
      );
    }

    if (!Number.isNaN(maxPrice) && maxPrice > 0) {
      normalized = normalized.filter((row) => {
        const hasProductPrices = Array.isArray(row.selectedProducts) && row.selectedProducts.length > 0;
        if (!hasProductPrices) {
          // Legacy offers may not have product-level prices; do not hide them by maxPrice.
          return true;
        }
        return row.displayPrice <= maxPrice;
      });
    }

    if (sortBy === 'price_asc') {
      normalized.sort((a, b) => a.displayPrice - b.displayPrice);
    } else if (sortBy === 'price_desc') {
      normalized.sort((a, b) => b.displayPrice - a.displayPrice);
    } else if (sortBy === 'newest') {
      normalized.sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
      );
    } else if (hasUserCoordinates) {
      normalized.sort((a, b) => {
        const distanceA = a.distanceKm ?? Number.MAX_SAFE_INTEGER;
        const distanceB = b.distanceKm ?? Number.MAX_SAFE_INTEGER;
        return distanceA - distanceB;
      });
    } else {
      normalized.sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
      );
    }

    const total = normalized.length;
    const pages = Math.ceil(total / safeLimit);
    const start = (safePage - 1) * safeLimit;
    const data = normalized.slice(start, start + safeLimit);

    return {
      data,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        pages,
      },
    };
  }

  async getPublicOfferDetails(offerId: string) {
    if (!isValidObjectId(offerId)) {
      throw new NotFoundException('Offer not found');
    }

    const offer = await this.bannerPromotionModel
      .findOne({ _id: offerId })
      .lean()
      .exec();

    if (!offer || !this.isLikelyLegacyOffer(offer)) {
      throw new NotFoundException('Offer not found');
    }

    const merchant = await this.merchantModel
      .findOne({ userId: String(offer.merchantId) })
      .select(
        'storeName storeCategory storeSubCategory storeLocation storeLocationLatitude storeLocationLongitude profilePhoto shopPhoto',
      )
      .lean()
      .exec();

    return {
      offerId: String(offer._id),
      requestId: offer.requestId,
      title: offer.bannerTitle,
      category: offer.bannerCategory,
      imageUrl: offer.imageUrl,
      totalPrice: Number(offer.totalPrice || 0),
      startsAt: offer.startDate,
      endsAt: offer.endDate,
      status: offer.status,
      selectedProducts: Array.isArray(offer.selectedProducts)
        ? offer.selectedProducts
        : [],
      loyaltyRewardEnabled: Boolean(offer.loyaltyRewardEnabled),
      loyaltyStarsToOffer: Number(offer.loyaltyStarsToOffer || 0),
      loyaltyStarsPerPurchase: Number(offer.loyaltyStarsPerPurchase || 0),
      loyaltyScorePerStar: Number(offer.loyaltyScorePerStar || 0),
      promotionExpiryText: offer.promotionExpiryText || '',
      termsAndConditions: offer.termsAndConditions || '',
      exampleUsage: offer.exampleUsage || '',
      merchant: {
        merchantId: String(offer.merchantId),
        name: merchant?.storeName || offer.merchantName || 'Merchant',
        category: merchant?.storeCategory || '',
        subCategory: merchant?.storeSubCategory || '',
        address: merchant?.storeLocation || '',
        latitude: Number(merchant?.storeLocationLatitude || 0) || null,
        longitude: Number(merchant?.storeLocationLongitude || 0) || null,
        profilePhoto: merchant?.profilePhoto || merchant?.shopPhoto || '',
      },
      createdAt: offer.createdAt,
    };
  }
}

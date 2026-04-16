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
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { KafkaService } from '../kafka/kafka.service';
import { KAFKA_TOPICS } from '../common/constants/kafka-topics';
import { RedisService } from '../common/services/redis.service';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  BannerPaymentStatus,
  BannerPromotion,
  BannerPromotionDocument,
  BannerPromotionStatus,
} from './schemas/banner-promotion.schema';
import { SubmitBannerPromotionDto } from './dto/submit-banner-promotion.dto';
import { UpdateBannerPromotionDto } from './dto/update-banner-promotion.dto';

@Injectable()
export class BannersService implements OnModuleInit {
  private readonly logger = new Logger(BannersService.name);

  constructor(
    @InjectModel(BannerPromotion.name)
    private readonly bannerPromotionModel: Model<BannerPromotionDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly redisService: RedisService,
    @Optional() private readonly kafkaService?: KafkaService,
  ) {}

  private merchantListCacheKey(merchantId: string): string {
    return `golo:banners:merchant:${merchantId}`;
  }

  private adminListCacheKey(status?: string): string {
    return `golo:banners:admin:${status || 'all'}`;
  }

  private activeBannersCacheKey(limit: number): string {
    return `golo:banners:active:${limit}`;
  }

  private async invalidateBannerCache(merchantId?: string): Promise<void> {
    await this.redisService.deleteByPattern('golo:banners:active:*');
    await this.redisService.deleteByPattern('golo:banners:admin:*');
    if (merchantId) {
      await this.redisService.del(this.merchantListCacheKey(merchantId));
    }
  }

  async onModuleInit() {
    if (this.kafkaService) {
      this.logger.log('Kafka service connected for BannersService');
    }
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

    const normalizedDates = Array.from(
      new Set(
        (payload.selectedDates || []).map(
          (dateStr) => new Date(dateStr).toISOString().split('T')[0],
        ),
      ),
    )
      .map((dateStr) => new Date(dateStr))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());

    if (!normalizedDates.length) {
      throw new BadRequestException(
        'Please select at least one valid visibility date',
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (normalizedDates[0] < today) {
      throw new BadRequestException('Selected dates cannot be in the past');
    }

    const selectedDays = normalizedDates.length;
    const dailyRate = Number(payload.dailyRate ?? 240);
    const platformFee = Number(payload.platformFee ?? (selectedDays > 0 ? 49 : 0));
    const computedTotal = dailyRate * selectedDays + platformFee;

    const request = await this.bannerPromotionModel.create({
      requestId: uuidv4(),
      merchantId,
      merchantName: merchant.name || 'Merchant',
      merchantEmail: merchant.email || '-',
      bannerTitle: payload.bannerTitle?.trim(),
      bannerCategory: payload.bannerCategory?.trim(),
      imageUrl: payload.imageUrl,
      recommendedSize: payload.recommendedSize || '1920 x 520 px',
      selectedDates: normalizedDates,
      startDate: normalizedDates[0],
      endDate: normalizedDates[normalizedDates.length - 1],
      selectedDays,
      dailyRate,
      platformFee,
      totalPrice: Number(payload.totalPrice || computedTotal),
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
    const cacheKey = this.merchantListCacheKey(merchantId);
    const cached = await this.redisService.get<BannerPromotion[]>(cacheKey);
    if (cached) {
      return cached;
    }

    await this.expireBannerPromotions();
    const rows = await this.bannerPromotionModel
      .find({ merchantId })
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
  ): Promise<BannerPromotion> {
    const request = await this.bannerPromotionModel
      .findOne({ requestId, merchantId })
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
    if (payload.imageUrl !== undefined) {
      request.imageUrl = payload.imageUrl;
    }
    if (payload.recommendedSize !== undefined) {
      request.recommendedSize = payload.recommendedSize;
    }

    if (Array.isArray(payload.selectedDates) && payload.selectedDates.length) {
      const normalizedDates = Array.from(
        new Set(
          payload.selectedDates.map(
            (dateStr) => new Date(dateStr).toISOString().split('T')[0],
          ),
        ),
      )
        .map((dateStr) => new Date(dateStr))
        .filter((date) => !Number.isNaN(date.getTime()))
        .sort((a, b) => a.getTime() - b.getTime());

      if (!normalizedDates.length) {
        throw new BadRequestException('Please provide valid selectedDates');
      }

      request.selectedDates = normalizedDates;
      request.startDate = normalizedDates[0];
      request.endDate = normalizedDates[normalizedDates.length - 1];
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
  ): Promise<BannerPromotion> {
    const bannerPromotion = await this.bannerPromotionModel
      .findOne({ requestId, merchantId })
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
}

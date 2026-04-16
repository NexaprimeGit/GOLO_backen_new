import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger, InternalServerErrorException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as QRCode from 'qrcode';
import { randomInt } from 'crypto';
import { Voucher, VoucherStatus, VoucherDocument } from './schemas/voucher.schema';
import { BannerPromotionDocument } from '../banners/schemas/banner-promotion.schema';
import { UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class VouchersService implements OnModuleInit {
  private readonly logger = new Logger('VouchersService');

  constructor(
    @InjectModel('Voucher') private voucherModel: Model<VoucherDocument>,
    @InjectModel('BannerPromotion')
    private bannerModel: Model<BannerPromotionDocument>,
    @InjectModel('User') private userModel: Model<UserDocument>,
  ) {}

  async onModuleInit() {
    try {
      // Clean legacy documents created while verificationCode defaulted to null.
      await this.voucherModel.updateMany(
        { verificationCode: null },
        { $unset: { verificationCode: 1 } },
      );

      // Drop stale unique index (could be non-sparse) if it exists.
      try {
        await this.voucherModel.collection.dropIndex('verificationCode_1');
      } catch (error) {
        if (error?.codeName !== 'IndexNotFound') {
          throw error;
        }
      }

      // Recreate index to enforce uniqueness only for real string codes.
      await this.voucherModel.collection.createIndex(
        { verificationCode: 1 },
        {
          unique: true,
          partialFilterExpression: { verificationCode: { $type: 'string' } },
          name: 'verificationCode_1',
        },
      );
    } catch (error) {
      this.logger.error(`Error ensuring verification code index: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate alphanumeric code with specified format
   * @param groups - Number of groups (default: 3)
   * @param charsPerGroup - Characters per group (default: 4)
   * @param separator - Separator between groups (default: '-')
   * @returns Formatted code like: XXXX-XXXX-XXXX or ABC12-DEF34-GHI56-JKL78-MNO90 etc
   */
  private generateCode(
    groups: number = 3,
    charsPerGroup: number = 4,
    separator: string = '-',
  ): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const groupsList: string[] = [];

    for (let i = 0; i < groups; i++) {
      let group = '';
      for (let j = 0; j < charsPerGroup; j++) {
        // Use crypto.randomInt for cryptographically secure random selection
        const randomIndex = randomInt(0, chars.length);
        group += chars[randomIndex];
      }
      groupsList.push(group);
    }

    return groupsList.join(separator);
  }

  /**
   * Generate a unique verification code (wrapper for default format)
   * Format: XXXX-XXXX-XXXX (customizable via generateCode method)
   */
  private generateVerificationCode(): string {
    // Default: 3 groups of 4 chars with '-' separator
    return this.generateCode(3, 4, '-');
  }

  /**
   * Claim an offer - User claims a deal and gets a voucher/QR code
   */
  async claimOffer(userId: string, offerId: string) {
    try {
      // Validate offer exists
      const offer = await this.bannerModel.findById(offerId);
      if (!offer) {
        throw new NotFoundException('Offer not found');
      }

      // Check if voucher already claimed for this offer
      const existingVoucher = await this.voucherModel.findOne({
        userId: new Types.ObjectId(userId),
        offerId: new Types.ObjectId(offerId),
        status: { $in: [VoucherStatus.ACTIVE, VoucherStatus.CLAIMED] },
      });

      if (existingVoucher) {
        throw new BadRequestException('You have already claimed this offer');
      }

      // Generate unique IDs
      const voucherId = `VOUCHER-${Date.now()}`;
      const qrCode = `voucher-${voucherId}-${offerId}`;

      // Generate QR code image with optimized settings for faster generation
      const qrImage = await QRCode.toDataURL(qrCode, {
        width: 200,  // Reduced from 300 for faster generation
        margin: 1,
        errorCorrectionLevel: 'M',  // Reduced from 'H' to 'M' for faster generation
        type: 'image/png',
        quality: 0.92,
      });

      // Calculate expiry (30 days from now)
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // Create voucher
      const voucher = await this.voucherModel.create({
        userId: new Types.ObjectId(userId),
        offerId: new Types.ObjectId(offerId),
        voucherId,
        qrCode,
        merchantId: offer.merchantId, // From banner/offer
        offerTitle: offer.bannerTitle,
        merchantName: offer.merchantName,
        discount: offer.bannerCategory || 'Special Offer', // Adjust based on your banner schema
        offerImage: offer.imageUrl,
        status: VoucherStatus.ACTIVE,
        claimedAt: new Date(),
        expiresAt,
        validityHours: 720, // 30 days
      });

      // Save QR image to a property (you can also save to file system or S3)
      // For now storing the data URL in response

      return {
        success: true,
        data: {
          _id: voucher._id,
          voucherId: voucher.voucherId,
          qrCode: voucher.qrCode,
          verificationCode: null, // Will be generated on-demand
          qrImage, // Data URL for display
          offerTitle: voucher.offerTitle,
          merchantName: voucher.merchantName,
          discount: voucher.discount,
          status: voucher.status,
          expiresAt: voucher.expiresAt,
          claimedAt: voucher.claimedAt,
        },
      };
    } catch (error) {
      this.logger.error(`Error claiming offer: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate verification code on-demand when user reaches redeem page
   * This speeds up the claim process and generates the code only when needed
   */
  async generateVerificationCodeForVoucher(voucherId: string, merchantId: string) {
    try {
      const voucher = await this.voucherModel.findOne({
        voucherId,
        merchantId: new Types.ObjectId(merchantId),
      });

      if (!voucher) {
        throw new NotFoundException('Voucher not found');
      }

      // If verification code already exists, return it
      if (voucher.verificationCode) {
        return {
          success: true,
          data: {
            voucherId: voucher.voucherId,
            verificationCode: voucher.verificationCode,
          },
        };
      }

      // Generate new verification code
      const verificationCode = this.generateVerificationCode();
      voucher.verificationCode = verificationCode;
      await voucher.save();

      return {
        success: true,
        data: {
          voucherId: voucher.voucherId,
          verificationCode: verificationCode,
        },
      };
    } catch (error) {
      this.logger.error(`Error generating verification code: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all user's claimed vouchers with filtering
   */
  async getMyVouchers(
    userId: string,
    page: number = 1,
    limit: number = 10,
    status?: string,
  ) {
    try {
      const query: any = { userId: new Types.ObjectId(userId) };
      if (status) query.status = status;

      const skip = (page - 1) * limit;

      const vouchers = await this.voucherModel
        .find(query)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec();

      const total = await this.voucherModel.countDocuments(query);

      return {
        success: true,
        data: vouchers,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error(`Error fetching user vouchers: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get single voucher details by ID
   */
  async getVoucherById(voucherId: string, userId?: string) {
    try {
      console.log(`[getVoucherById] Looking up voucher with ID: ${voucherId}`);
      
      let voucher;
      
      // Check if it's a MongoDB ObjectId (24 hex characters)
      if (/^[0-9a-fA-F]{24}$/.test(voucherId)) {
        console.log(`[getVoucherById] Searching by MongoDB _id`);
        voucher = await this.voucherModel.findById(voucherId);
      } else {
        console.log(`[getVoucherById] Searching by voucherId field`);
        voucher = await this.voucherModel.findOne({ voucherId });
      }

      if (!voucher) {
        console.log(`[getVoucherById] Voucher not found for ID: ${voucherId}`);
        throw new NotFoundException('Voucher not found');
      }

      console.log(`[getVoucherById] Found voucher: ${voucher.voucherId}`);

      // Optional: Check if user owns this voucher
      if (userId && voucher.userId.toString() !== userId) {
        throw new ForbiddenException('You do not have access to this voucher');
      }

      // Generate verification code on first voucher load so the claimed-offer page can show it immediately
      if (!voucher.verificationCode) {
        voucher.verificationCode = this.generateVerificationCode();
        await voucher.save();
      }

      // Generate fresh QR image with optimized settings
      const qrImage = await QRCode.toDataURL(voucher.qrCode, {
        width: 200,
        margin: 1,
        errorCorrectionLevel: 'M',
      });

      return {
        success: true,
        data: {
          ...voucher.toObject(),
          qrImage,
        },
      };
    } catch (error) {
      this.logger.error(`Error fetching voucher: ${error.message}`);
      throw error;
    }
  }

  /**
   * Download voucher QR code as image
   */
  async downloadVoucherQR(voucherId: string, userId?: string) {
    try {
      console.log(`[downloadVoucherQR] Downloading QR for voucher: ${voucherId}`);
      
      let voucher;
      
      // Check if it's a MongoDB ObjectId (24 hex characters)
      if (/^[0-9a-fA-F]{24}$/.test(voucherId)) {
        console.log(`[downloadVoucherQR] Searching by MongoDB _id`);
        voucher = await this.voucherModel.findById(voucherId);
      } else {
        console.log(`[downloadVoucherQR] Searching by voucherId field`);
        voucher = await this.voucherModel.findOne({ voucherId });
      }

      if (!voucher) {
        throw new NotFoundException('Voucher not found');
      }

      if (userId && voucher.userId.toString() !== userId) {
        throw new ForbiddenException('You do not have access to this voucher');
      }

      // Generate QR image with optimized settings for faster generation
      const qrImage = await QRCode.toDataURL(voucher.qrCode, {
        width: 250,
        margin: 1,
        errorCorrectionLevel: 'M',
      });

      return {
        success: true,
        data: {
          voucherId: voucher.voucherId,
          qrImage,
          offerTitle: voucher.offerTitle,
          merchantName: voucher.merchantName,
        },
      };
    } catch (error) {
      this.logger.error(`Error downloading QR: ${error.message}`);
      throw error;
    }
  }

  /**
   * Share voucher with friend via email
   */
  async shareVoucher(voucherId: string, friendEmail: string, userId: string) {
    try {
      console.log(`[shareVoucher] Sharing voucher: ${voucherId}`);
      
      let voucher;
      
      // Check if it's a MongoDB ObjectId (24 hex characters)
      if (/^[0-9a-fA-F]{24}$/.test(voucherId)) {
        console.log(`[shareVoucher] Searching by MongoDB _id`);
        voucher = await this.voucherModel.findById(voucherId);
      } else {
        console.log(`[shareVoucher] Searching by voucherId field`);
        voucher = await this.voucherModel.findOne({ voucherId });
      }

      if (!voucher) {
        throw new NotFoundException('Voucher not found');
      }

      if (voucher.userId.toString() !== userId) {
        throw new ForbiddenException('You can only share your own vouchers');
      }

      // Update voucher with share info
      voucher.shareEmail = friendEmail;
      voucher.sharedAt = new Date();
      await voucher.save();

      // TODO: Send email to friend with voucher details
      // For now just return success
      // await this.emailService.sendVoucherShareEmail(friendEmail, voucher);

      return {
        success: true,
        message: 'Voucher shared successfully',
        data: {
          sharedWith: friendEmail,
          sharedAt: voucher.sharedAt,
        },
      };
    } catch (error) {
      this.logger.error(`Error sharing voucher: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verify voucher using verification code (manual entry)
   */
  async verifyVoucherByCode(verificationCode: string, merchantId?: string) {
    try {
      console.log(`[verifyVoucherByCode] Verifying code: ${verificationCode}`);
      
      // Search by verification code
      const voucher = await this.voucherModel.findOne({ verificationCode });
      console.log(`[verifyVoucherByCode] Found voucher:`, !!voucher);

      if (!voucher) {
        throw new BadRequestException('Invalid verification code');
      }

      console.log(`[verifyVoucherByCode] Voucher: ${voucher.voucherId}`);

      // Check if already redeemed
      if (voucher.status === VoucherStatus.REDEEMED) {
        return {
          success: false,
          valid: false,
          message: 'Voucher already redeemed',
          data: null,
        };
      }

      // Check if expired
      if (new Date() > voucher.expiresAt) {
        await this.voucherModel.findOneAndUpdate(
          { verificationCode },
          { status: VoucherStatus.EXPIRED },
        );

        return {
          success: false,
          valid: false,
          message: 'Voucher has expired',
          data: null,
        };
      }

      // Get user details
      const user = await this.userModel.findById(voucher.userId).select('name email');

      return {
        success: true,
        valid: true,
        data: {
          voucherId: voucher.voucherId,
          verificationCode: voucher.verificationCode,
          userName: user?.name || 'Unknown User',
          userEmail: user?.email || 'N/A',
          offerTitle: voucher.offerTitle,
          discount: voucher.discount,
          status: voucher.status,
          expiresAt: voucher.expiresAt,
          claimedAt: voucher.claimedAt,
        },
      };
    } catch (error) {
      console.error(`[verifyVoucherByCode] Error:`, error);
      this.logger.error(`Error verifying voucher by code: ${error.message}`, error.stack);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      throw new InternalServerErrorException(`Failed to verify voucher: ${error.message}`);
    }
  }

  /**
   * Verify voucher using QR code without redeeming
   */
  async verifyVoucher(voucherId: string, qrCode: string, merchantId?: string) {
    try {
      console.log(`[verifyVoucher] Starting verification for voucherId: ${voucherId}, qrCode: ${qrCode.substring(0, 50)}...`);

      // Search by voucherId field, not by MongoDB _id
      const voucher = await this.voucherModel.findOne({ voucherId });
      console.log(`[verifyVoucher] Found voucher:`, !!voucher);

      if (!voucher) {
        console.log(`[verifyVoucher] Voucher not found with voucherId: ${voucherId}`);
        throw new BadRequestException('Voucher not found');
      }

      console.log(`[verifyVoucher] Voucher QR code in DB: ${voucher.qrCode}`);
      console.log(`[verifyVoucher] Scanned QR code: ${qrCode}`);
      console.log(`[verifyVoucher] QR codes match: ${voucher.qrCode === qrCode}`);

      if (voucher.qrCode !== qrCode) {
        throw new BadRequestException('Invalid QR code');
      }

      // Check if already redeemed
      if (voucher.status === VoucherStatus.REDEEMED) {
        return {
          success: false,
          valid: false,
          message: 'Voucher already redeemed',
          data: null,
        };
      }

      // Check if expired
      if (new Date() > voucher.expiresAt) {
        // Update status if expired
        await this.voucherModel.findOneAndUpdate(
          { voucherId },
          { status: VoucherStatus.EXPIRED },
        );

        return {
          success: false,
          valid: false,
          message: 'Voucher has expired',
          data: null,
        };
      }

      // Get user details
      console.log(`[verifyVoucher] Looking up user with ID: ${voucher.userId}`);
      const user = await this.userModel.findById(voucher.userId).select('name email');
      console.log(`[verifyVoucher] User found:`, !!user);

      const response = {
        success: true,
        valid: true,
        data: {
          voucherId: String(voucher.voucherId),
          userName: user?.name ? String(user.name) : 'Unknown User',
          userEmail: user?.email ? String(user.email) : 'N/A',
          offerTitle: String(voucher.offerTitle),
          discount: String(voucher.discount),
          status: String(voucher.status),
          expiresAt: voucher.expiresAt ? new Date(voucher.expiresAt).toISOString() : null,
          claimedAt: voucher.claimedAt ? new Date(voucher.claimedAt).toISOString() : null,
        },
      };

      console.log(`[verifyVoucher] Returning response:`, response);
      return response;
    } catch (error) {
      console.error(`[verifyVoucher] Error:`, error);
      this.logger.error(`Error verifying voucher: ${error.message}`, error.stack);

      // If it's already a BadRequestException or other NestJS exception, re-throw it
      if (error instanceof BadRequestException) {
        throw error;
      }

      // Otherwise throw as internal server error with details
      throw new InternalServerErrorException(`Failed to verify voucher: ${error.message}`);
    }
  }

  /**
   * Merchant completes the redemption
   */
  async redeemVoucher(
    voucherId: string,
    qrCode?: string,
    merchantId?: string,
    verificationCode?: string,
  ) {
    try {
      // Support for both QR code and verification code
      // If only 3 params are passed and 3rd is merchantId, handle it
      let actualMerchantId = merchantId;
      let actualQrCode = qrCode;
      let actualVerificationCode = verificationCode;

      // For backward compatibility: if merchantId looks like a qrCode (contains dashes and is long), shift parameters
      if (merchantId && merchantId.length > 30 && merchantId.includes('-') && !verificationCode) {
        actualQrCode = merchantId;
        actualMerchantId = qrCode;
      }

      // Validate that at least one verification method is provided
      if (!actualQrCode && !actualVerificationCode) {
        throw new BadRequestException('QR code or verification code is required');
      }

      // Search by voucherId field, not by MongoDB _id
      const voucher = await this.voucherModel.findOne({ voucherId });

      if (!voucher) {
        throw new BadRequestException('Voucher not found');
      }

      // Verify using the provided method
      if (actualQrCode) {
        if (voucher.qrCode !== actualQrCode) {
          throw new BadRequestException('Invalid QR code');
        }
      } else if (actualVerificationCode) {
        if (voucher.verificationCode !== actualVerificationCode) {
          throw new BadRequestException('Invalid verification code');
        }
      }

      // Check if already redeemed
      if (voucher.status === VoucherStatus.REDEEMED) {
        throw new BadRequestException('Voucher already redeemed');
      }

      // Check if expired
      if (new Date() > voucher.expiresAt) {
        voucher.status = VoucherStatus.EXPIRED;
        await voucher.save();
        throw new BadRequestException('Voucher has expired');
      }

      // Update voucher status
      const redemptionCode = `RDM-${Date.now()}`;
      voucher.status = VoucherStatus.REDEEMED;
      voucher.redeemedAt = new Date();
      voucher.redeemedByMerchantId = new Types.ObjectId(actualMerchantId);
      voucher.redemptionCode = redemptionCode;
      await voucher.save();

      // Get user details
      const user = await this.userModel.findById(voucher.userId).select('name email');

      return {
        success: true,
        message: 'Voucher redeemed successfully',
        data: {
          voucherId: voucher.voucherId,
          userName: user?.name,
          offerTitle: voucher.offerTitle,
          discount: voucher.discount,
          redeemedAt: voucher.redeemedAt,
          redemptionCode: redemptionCode,
        },
      };
    } catch (error) {
      this.logger.error(`Error redeeming voucher: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get merchant's pending redemptions (to be redeemed)
   */
  async getMerchantPendingRedemptions(
    merchantId: string,
    page: number = 1,
    limit: number = 20,
    status?: string,
  ) {
    try {
      const query: any = {
        merchantId: new Types.ObjectId(merchantId),
        status: { $in: [VoucherStatus.ACTIVE, VoucherStatus.CLAIMED] },
      };

      if (status) {
        query.status = status;
      }

      const skip = (page - 1) * limit;

      const vouchers = await this.voucherModel
        .find(query)
        .skip(skip)
        .limit(limit)
        .sort({ claimedAt: -1 })
        .exec();

      const total = await this.voucherModel.countDocuments(query);

      // Enrich with user data
      const enrichedVouchers = await Promise.all(
        vouchers.map(async (v) => {
          const user = await this.userModel
            .findById(v.userId)
            .select('name email');
          return {
            ...v.toObject(),
            userName: user?.name,
            userEmail: user?.email,
          };
        }),
      );

      return {
        success: true,
        data: enrichedVouchers,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error(
        `Error fetching merchant pending redemptions: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get merchant's redemption history (already redeemed)
   */
  async getMerchantRedemptionHistory(
    merchantId: string,
    page: number = 1,
    limit: number = 20,
  ) {
    try {
      const query = {
        merchantId: new Types.ObjectId(merchantId),
        status: VoucherStatus.REDEEMED,
      };

      const skip = (page - 1) * limit;

      const vouchers = await this.voucherModel
        .find(query)
        .skip(skip)
        .limit(limit)
        .sort({ redeemedAt: -1 })
        .exec();

      const total = await this.voucherModel.countDocuments(query);

      // Enrich with user data
      const enrichedVouchers = await Promise.all(
        vouchers.map(async (v) => {
          const user = await this.userModel
            .findById(v.userId)
            .select('name email');
          return {
            ...v.toObject(),
            userName: user?.name,
            userEmail: user?.email,
          };
        }),
      );

      return {
        success: true,
        data: enrichedVouchers,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error(
        `Error fetching merchant redemption history: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get all active offers for a merchant
   */
  async getMerchantOffers(
    merchantId: string,
    page: number = 1,
    limit: number = 20,
    status?: string,
  ) {
    try {
      // Get merchant's banners/offers from BannerPromotion
      const query: any = { merchantId };
      if (status) query.status = status;

      const skip = (page - 1) * limit;

      const offers = await this.bannerModel
        .find(query)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec();

      const total = await this.bannerModel.countDocuments(query);

      // Enrich each offer with claim and redemption counts
      const enrichedOffers = await Promise.all(
        offers.map(async (offer) => {
          const claimsCount = await this.voucherModel.countDocuments({
            offerId: offer._id,
          });

          const redeemedCount = await this.voucherModel.countDocuments({
            offerId: offer._id,
            status: VoucherStatus.REDEEMED,
          });

          return {
            offerId: offer._id,
            offerTitle: offer.bannerTitle,
            discount: offer.bannerCategory,
            status: offer.status,
            createdAt: offer.createdAt,
            claimsCount,
            redeemedCount,
          };
        }),
      );

      return {
        success: true,
        data: enrichedOffers,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error(`Error fetching merchant offers: ${error.message}`);
      throw error;
    }
  }
}

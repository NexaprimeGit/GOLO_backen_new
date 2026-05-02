import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class OfferSelectedProductDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsString()
  @IsNotEmpty()
  productName: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsNumber()
  @Min(0)
  originalPrice: number;

  @IsNumber()
  @Min(0)
  offerPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stockQuantity?: number;
}

export enum PromotionTypeDto {
  BANNER = 'banner',
  OFFER = 'offer',
}

export class SubmitOfferPromotionDto {
  @IsOptional()
  @IsString()
  bannerTitle?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  bannerCategory?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(PromotionTypeDto)
  promotionType?: PromotionTypeDto;

  @IsString()
  @IsNotEmpty()
  @Matches(/^(https?:\/\/|data:image\/[a-zA-Z0-9.+-]+;base64,)/, {
    message: 'imageUrl must be a URL address or uploaded image data',
  })
  imageUrl: string;

  @IsArray()
  @IsString({ each: true })
  selectedDates: string[];

  @IsNumber()
  @Min(0)
  totalPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  dailyRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  platformFee?: number;

  @IsOptional()
  @IsString()
  recommendedSize?: string;

  @IsOptional()
  @IsBoolean()
  loyaltyRewardEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  loyaltyStarsToOffer?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  loyaltyStarsPerPurchase?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  loyaltyScorePerStar?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  loyaltyPointsPerPurchase?: number;

  @IsOptional()
  @IsString()
  promotionExpiryText?: string;

  @IsOptional()
  @IsString()
  termsAndConditions?: string;

  @IsOptional()
  @IsString()
  exampleUsage?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OfferSelectedProductDto)
  selectedProducts?: OfferSelectedProductDto[];
}

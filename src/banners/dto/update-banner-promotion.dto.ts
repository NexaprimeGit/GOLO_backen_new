import { IsArray, IsEnum, IsOptional, IsString, Matches } from 'class-validator';

export enum BannerAction {
  PAUSE = 'pause',
  RESUME = 'resume',
}

export class UpdateBannerPromotionDto {
  @IsOptional()
  @IsString()
  bannerTitle?: string;

  @IsOptional()
  @IsString()
  bannerCategory?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(https?:\/\/|data:image\/[a-zA-Z0-9.+-]+;base64,)/, {
    message: 'imageUrl must be a URL address or uploaded image data',
  })
  imageUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedDates?: string[];

  @IsOptional()
  @IsString()
  recommendedSize?: string;

  @IsOptional()
  @IsEnum(BannerAction)
  action?: 'pause' | 'resume';
}

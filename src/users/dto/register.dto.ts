import {
  IsString,
  IsEmail,
  IsNotEmpty,
  MinLength,
  IsOptional,
  IsPhoneNumber,
  IsIn,
  IsNumber,
  Min,
  Max,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsPhoneNumber()
  @IsOptional()
  phone?: string;

  @IsOptional()
  @IsIn(['user', 'merchant'])
  accountType?: 'user' | 'merchant';

  @IsOptional()
  @IsString()
  storeName?: string;

  @IsOptional()
  @IsEmail()
  storeEmail?: string;

  @IsOptional()
  @IsString()
  gstNumber?: string;

  @IsOptional()
  @IsString()
  contactNumber?: string;

  @IsOptional()
  @IsString()
  storeCategory?: string;

  @IsOptional()
  @IsString()
  storeSubCategory?: string;

  @IsOptional()
  @IsString()
  storeLocation?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  storeLocationLatitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  storeLocationLongitude?: number;
}

// No separate Merchant DTO needed anymore

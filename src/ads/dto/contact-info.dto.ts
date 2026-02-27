import { IsString, IsNotEmpty, IsOptional, IsEmail, IsPhoneNumber, IsEnum, IsUrl } from 'class-validator';

export class ContactInfoDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsPhoneNumber()
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  whatsapp?: string;

    @IsOptional()  
    @IsUrl()
    website?: string;  // Add this field

  @IsOptional()
  @IsEnum(['phone', 'email', 'whatsapp','website'])
  preferredContactMethod?: string;
}
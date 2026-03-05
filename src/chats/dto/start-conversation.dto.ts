import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class StartConversationDto {
  @IsString()
  @IsNotEmpty()
  adId: string;

  @IsOptional()
  @IsString()
  sellerId?: string;
}

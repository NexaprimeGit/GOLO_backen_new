import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class WebRtcSignalDto {
  @IsString()
  @IsNotEmpty()
  callId: string;

  @IsObject()
  @IsNotEmpty()
  signal: Record<string, any>;

  @IsOptional()
  @IsString()
  targetUserId?: string;
}

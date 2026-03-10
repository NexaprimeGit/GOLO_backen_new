import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class CallInviteDto {
  @IsString()
  @IsNotEmpty()
  conversationId: string;

  @IsString()
  @IsNotEmpty()
  calleeId: string;

  @IsEnum(['audio', 'video'])
  type: 'audio' | 'video';
}

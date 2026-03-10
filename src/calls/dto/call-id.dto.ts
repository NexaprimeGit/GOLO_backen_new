import { IsNotEmpty, IsString } from 'class-validator';

export class CallIdDto {
  @IsString()
  @IsNotEmpty()
  callId: string;
}

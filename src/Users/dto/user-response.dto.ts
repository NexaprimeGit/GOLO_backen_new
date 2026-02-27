export class UserResponseDto {
  id: string;
  name: string;
  email: string;
  role: string;
  isEmailVerified: boolean;
  profile?: any;
  createdAt: Date;
  
  constructor(partial: Partial<UserResponseDto>) {
    Object.assign(this, partial);
  }
}
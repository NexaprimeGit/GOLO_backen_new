export class UserResponseDto {
  id: string;
  name: string;
  email: string;
  role: string;
  isBanned?: boolean;
  banReason?: string;
  isEmailVerified: boolean;
  profile?: any;
  iWantPreference?: {
    category?: string;
    title?: string;
    description?: string;
    createdAt?: Date;
    updatedAt?: Date;
  } | null;
  createdAt: Date;
  
  constructor(partial: Partial<UserResponseDto>) {
    Object.assign(this, partial);
  }
}
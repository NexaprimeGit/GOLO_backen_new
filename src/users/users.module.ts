import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User, UserSchema } from './schemas/user.schema';
import { Notification, NotificationSchema } from './schemas/notification.schema';
import { Merchant, MerchantSchema } from './schemas/merchant.schema';
import { UserReport, UserReportSchema } from './schemas/user-report.schema';
import { JwtStrategy } from './strategies/jwt.strategy';
import { KafkaModule } from '../kafka/kafka.module';
import { AdsModule } from '../ads/ads.module';
import { Payment, PaymentSchema } from '../payments/schemas/payment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: Merchant.name, schema: MerchantSchema },
      { name: 'PendingMerchantLocation', schema: require('./schemas/pending-merchant-location.schema').PendingMerchantLocationSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: UserReport.name, schema: UserReportSchema },
    ]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        const expiresIn = configService.get<string>('JWT_EXPIRATION') || '15m';
        
        if (!secret) {
          throw new Error('JWT_SECRET is not defined in environment variables');
        }

        return {
          secret: secret,
          signOptions: {
            expiresIn: expiresIn as any,
          },
        };
      },
      inject: [ConfigService],
    }),
    KafkaModule, // Keep existing forwardRef
    forwardRef(() => AdsModule), 
  ],
  controllers: [UsersController],
  providers: [UsersService, JwtStrategy],
  exports: [UsersService, JwtStrategy, PassportModule],
})
export class UsersModule {}
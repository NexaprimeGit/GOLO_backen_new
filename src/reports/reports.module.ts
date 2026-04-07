import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ReportsGateway } from './reports.gateway';
import { ReportsKafkaController } from './reports.kafka.controller';
import { KafkaModule } from '../kafka/kafka.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: { expiresIn: '24h' },
      }),
      inject: [ConfigService],
    }),
    KafkaModule,
  ],
  controllers: [ReportsKafkaController],
  providers: [ReportsGateway],
  exports: [ReportsGateway],
})
export class ReportsModule {}

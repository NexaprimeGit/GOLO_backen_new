import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import configuration from './config/configuration';
import { KafkaModule } from './kafka/kafka.module';
import { AdsModule } from './ads/ads.module';
import { UsersModule } from './Users/users.module';

@Module({
  imports: [
    // Configuration - load environment variables
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '.env',
    }),
    
    // MongoDB Connection
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const uri = configService.get('config.mongodb.uri');
        console.log('Connecting to MongoDB with URI:', uri);
        return {
          uri: uri,
          connectionFactory: (connection) => {
            connection.on('connected', () => {
              console.log('MongoDB connected successfully');
            });
            connection.on('error', (error) => {
              console.error('MongoDB connection error:', error);
            });
            return connection;
          },
        };
      },
      inject: [ConfigService],
    }),
    
    // Feature Modules - order doesn't matter with forwardRef
    KafkaModule,
    AdsModule,
    UsersModule,
  ],
})
export class AppModule {}
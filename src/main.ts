import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as dotenv from 'dotenv';

dotenv.config();

const parseBoolean = (value?: string): boolean => {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const validationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: {
    enableImplicitConversion: true,
  },
});

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const kafkaEnabled = parseBoolean(process.env.ENABLE_KAFKA);

  if (kafkaEnabled) {
    const brokers = (process.env.KAFKA_BROKERS || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    if (brokers.length === 0) {
      throw new Error(
        'ENABLE_KAFKA=true but KAFKA_BROKERS is empty. Set KAFKA_BROKERS in .env.',
      );
    }

    const microservice = await NestFactory.createMicroservice<MicroserviceOptions>(
      AppModule,
      {
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: process.env.KAFKA_CLIENT_ID || 'golo-backend',
            brokers,
          },
          consumer: {
            groupId: process.env.KAFKA_GROUP_ID || 'golo-consumer-group',
          },
          producer: {
            allowAutoTopicCreation: true,
          },
        },
      },
    );

    microservice.useGlobalPipes(validationPipe);
    await microservice.listen();
    logger.log(`Kafka mode enabled. Brokers: ${brokers.join(', ')}`);
    return;
  }

  const app = await NestFactory.create(AppModule, { rawBody: true });
  const configService = app.get(ConfigService);
  app.useGlobalPipes(validationPipe);

  const corsOrigins = configService.get<string[]>('config.cors.origins') || [];

  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const port = configService.get('config.service.port');
  await app.listen(port);
  logger.log(`HTTP mode enabled. Ads microservice is running on port ${port}`);
}
bootstrap();

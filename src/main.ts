import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  
  // Create HTTP app for health checks (optional)
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  
  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: {
      enableImplicitConversion: true
    }
  }));

  // Create Kafka microservice
  const kafkaConfig = configService.get('config.kafka');
  
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: kafkaConfig.clientId,
        brokers: kafkaConfig.brokers,
      },
      consumer: {
        groupId: kafkaConfig.groupId,
      },
      producer: {
        allowAutoTopicCreation: true,
      },
    },
  });

  // Start all microservices
  await app.startAllMicroservices();
  
  // Start HTTP server
  const port = configService.get('config.service.port');
  await app.listen(process.env.PORT || 3000);
  
  logger.log(`Ads microservice is running on port ${port}`);
  logger.log(`Kafka brokers: ${kafkaConfig.brokers.join(', ')}`);
}
bootstrap();
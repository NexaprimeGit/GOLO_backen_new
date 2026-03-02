import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { KAFKA_TOPICS } from '../common/constants/kafka-topics';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private kafkaClient: ClientKafka;

  constructor(private configService: ConfigService) {
    this.initializeKafkaClient();
  }

  // private initializeKafkaClient() {
  //   const kafkaConfig = this.configService.get('config.kafka');
    
  //   this.kafkaClient = new ClientKafka({
  //     client: {
  //       clientId: kafkaConfig.clientId,
  //       brokers: kafkaConfig.brokers,
  //       retry: {
  //         initialRetryTime: 300,
  //         retries: 8
  //       }
  //     },
  //     consumer: {
  //       groupId: kafkaConfig.groupId,
  //       allowAutoTopicCreation: true,
  //       maxBytesPerPartition: 1048576
  //     },
  //     producer: {
  //       allowAutoTopicCreation: true,
  //       transactionTimeout: 30000
  //     }
  //   });
  // }


  // src/kafka/kafka.service.ts
  private initializeKafkaClient() {
  const kafkaConfig = this.configService.get('config.kafka');
  
  const options: any = {
    client: {
      clientId: kafkaConfig.clientId,
      brokers: kafkaConfig.brokers,
    },
    consumer: {
      groupId: kafkaConfig.groupId,
    },
    producer: {},
  };

  // Add SASL authentication if configured
  if (kafkaConfig.sasl) {
    options.client.sasl = kafkaConfig.sasl;
    options.client.ssl = false;
  }

  this.kafkaClient = new ClientKafka(options);
}

  async onModuleInit() {
    // Subscribe to response topics
    const topics = [
      KAFKA_TOPICS.AD_RESPONSE,
      KAFKA_TOPICS.AD_ERROR,
      KAFKA_TOPICS.AD_CREATED,
      KAFKA_TOPICS.AD_UPDATED,
      KAFKA_TOPICS.AD_DELETED
    ];

    topics.forEach(topic => {
      this.kafkaClient.subscribeToResponseOf(topic);
    });

    await this.kafkaClient.connect();
    this.logger.log('Kafka client connected successfully');
  }

  async onModuleDestroy() {
    await this.kafkaClient.close();
    this.logger.log('Kafka client disconnected');
  }

  async emit(topic: string, data: any, correlationId?: string): Promise<void> {
    try {
      const message = {
        ...data,
        timestamp: new Date().toISOString(),
        service: this.configService.get('config.service.name'),
      };

      const headers = {
        correlationId: correlationId || this.generateCorrelationId(),
        source: this.configService.get('config.service.name'),
        timestamp: Date.now().toString()
      };

      this.logger.debug(`Emitting to topic ${topic}: ${JSON.stringify({ message, headers })}`);
      
      await this.kafkaClient.emit(topic, { value: message, headers }).toPromise();
    } catch (error) {
      this.logger.error(`Failed to emit to topic ${topic}: ${error.message}`);
      
      // Send to Dead Letter Queue
      await this.sendToDLQ(topic, data, error, correlationId);
    }
  }

  async send(topic: string, data: any, correlationId?: string): Promise<any> {
    try {
      const message = {
        ...data,
        timestamp: new Date().toISOString(),
        service: this.configService.get('config.service.name'),
      };

      const headers = {
        correlationId: correlationId || this.generateCorrelationId(),
        source: this.configService.get('config.service.name'),
        timestamp: Date.now().toString()
      };

      this.logger.debug(`Sending to topic ${topic}: ${JSON.stringify({ message, headers })}`);
      
      return await this.kafkaClient.send(topic, { value: message, headers }).toPromise();
    } catch (error) {
      this.logger.error(`Failed to send to topic ${topic}: ${error.message}`);
      
      await this.sendToDLQ(topic, data, error, correlationId);
      throw error;
    }
  }

  private async sendToDLQ(originalTopic: string, data: any, error: Error, correlationId?: string) {
    try {
      await this.kafkaClient.emit(KAFKA_TOPICS.AD_DLQ, {
        value: {
          originalTopic,
          originalMessage: data,
          error: {
            message: error.message,
            stack: error.stack
          },
          timestamp: new Date().toISOString(),
          correlationId: correlationId || this.generateCorrelationId()
        }
      }).toPromise();
    } catch (dlqError) {
      this.logger.error(`Failed to send to DLQ: ${dlqError.message}`);
    }
  }

  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${Math.random().toString(36).substr(2, 9)}`;
  }

  getClient(): ClientKafka {
    return this.kafkaClient;
  }
}
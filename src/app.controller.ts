import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { RedisService } from './common/services/redis.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly redisService: RedisService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health/redis')
  async checkRedisHealth(): Promise<any> {
    const health = await this.redisService.healthCheck();
    return {
      service: 'Upstash Redis',
      status: health.connected ? 'healthy' : 'unhealthy',
      details: health,
    };
  }
}

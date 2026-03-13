import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from '@upstash/redis';

@Injectable()
export class RedisService implements OnModuleInit {
  private readonly logger = new Logger(RedisService.name);
  private redisClient: Redis | null = null;
  private enabled: boolean = false;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const redisUrl = this.configService.get('UPSTASH_REDIS_REST_URL');
    const redisToken = this.configService.get('UPSTASH_REDIS_REST_TOKEN');

    if (!redisUrl || !redisToken || redisUrl.includes('your-redis-db')) {
      this.logger.warn(
        '⚠️ Upstash Redis not configured - caching disabled. Please add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to .env',
      );
      this.enabled = false;
      return;
    }

    try {
      this.redisClient = new Redis({
        url: redisUrl,
        token: redisToken,
      });

      // Test connection
      await this.redisClient.ping();
      this.enabled = true;
      this.logger.log('✅ Upstash Redis connected and ready');
    } catch (error: any) {
      this.logger.error(`❌ Redis connection failed: ${error.message}`);
      this.enabled = false;
    }
  }

  /**
   * Get Redis client instance
   */
  getClient(): Redis | null {
    if (!this.enabled || !this.redisClient) {
      this.logger.warn('Redis not enabled, returning null');
      return null;
    }
    return this.redisClient;
  }

  /**
   * Check if Redis is enabled and connected
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Cache a value with TTL
   */
  async set(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
    if (!this.enabled || !this.redisClient) {
      return false;
    }

    try {
      const ttl = ttlSeconds || Number(this.configService.get('REDIS_CACHE_TTL_DEFAULT')) || 300;
      await this.redisClient.setex(key, ttl, JSON.stringify(value));
      this.logger.debug(`Cache SET: ${key} (TTL: ${ttl}s)`);
      return true;
    } catch (error: any) {
      this.logger.error(`Cache SET failed for ${key}: ${error.message}`);
      return false;
    }
  }

  /**
   * Get a cached value
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.enabled || !this.redisClient) {
      return null;
    }

    try {
      const data = await this.redisClient.get(key);
      if (data === null) {
        this.logger.debug(`Cache MISS: ${key}`);
        return null;
      }
      this.logger.debug(`Cache HIT: ${key}`);
      return data as T;
    } catch (error: any) {
      this.logger.error(`Cache GET failed for ${key}: ${error.message}`);
      return null;
    }
  }

  /**
   * Delete a cached value
   */
  async del(key: string): Promise<boolean> {
    if (!this.enabled || !this.redisClient) {
      return false;
    }

    try {
      await this.redisClient.del(key);
      this.logger.debug(`Cache DEL: ${key}`);
      return true;
    } catch (error: any) {
      this.logger.error(`Cache DEL failed for ${key}: ${error.message}`);
      return false;
    }
  }

  /**
   * Delete multiple keys by pattern
   */
  async deleteByPattern(pattern: string): Promise<number> {
    if (!this.enabled || !this.redisClient) {
      return 0;
    }

    try {
      const keys = await this.redisClient.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }
      await this.redisClient.del(...keys);
      this.logger.debug(`Cache DEL pattern ${pattern}: deleted ${keys.length} keys`);
      return keys.length;
    } catch (error: any) {
      this.logger.error(`Cache DEL pattern failed for ${pattern}: ${error.message}`);
      return 0;
    }
  }

  /**
   * Increment a counter
   */
  async incr(key: string): Promise<number> {
    if (!this.enabled || !this.redisClient) {
      return 0;
    }

    try {
      const result = await this.redisClient.incr(key);
      this.logger.debug(`Cache INCR: ${key} = ${result}`);
      return result;
    } catch (error: any) {
      this.logger.error(`Cache INCR failed for ${key}: ${error.message}`);
      return 0;
    }
  }

  /**
   * Decrement a counter
   */
  async decr(key: string): Promise<number> {
    if (!this.enabled || !this.redisClient) {
      return 0;
    }

    try {
      const result = await this.redisClient.decr(key);
      this.logger.debug(`Cache DECR: ${key} = ${result}`);
      return result;
    } catch (error: any) {
      this.logger.error(`Cache DECR failed for ${key}: ${error.message}`);
      return 0;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.enabled || !this.redisClient) {
      return false;
    }

    try {
      const result = await this.redisClient.exists(key);
      return result === 1;
    } catch (error: any) {
      this.logger.error(`Cache EXISTS failed for ${key}: ${error.message}`);
      return false;
    }
  }

  /**
   * Set expiration on a key
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    if (!this.enabled || !this.redisClient) {
      return false;
    }

    try {
      await this.redisClient.expire(key, seconds);
      return true;
    } catch (error: any) {
      this.logger.error(`Cache EXPIRE failed for ${key}: ${error.message}`);
      return false;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    connected: boolean;
    latency?: number;
    error?: string;
  }> {
    if (!this.enabled || !this.redisClient) {
      return { connected: false, error: 'Redis not configured' };
    }

    try {
      const start = Date.now();
      await this.redisClient.ping();
      const latency = Date.now() - start;
      return { connected: true, latency };
    } catch (error: any) {
      return { connected: false, error: error.message };
    }
  }
}

import * as crypto from 'node:crypto';
import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { QueueService } from '../queue/queue.service.js';

export interface RateLimitOptions {
  maxAttempts: number;
  windowSeconds: number;
}

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  // Defaults: 5 attempts per minute per login identifier, 20 attempts per minute per IP
  private readonly identifierLimits: RateLimitOptions = { maxAttempts: 5, windowSeconds: 60 };
  private readonly ipLimits: RateLimitOptions = { maxAttempts: 20, windowSeconds: 60 };

  constructor(private readonly queueService: QueueService) {}

  private get redis() {
    return this.queueService.client;
  }

  private hashIdentifier(identifier: string): string {
    const normalized = identifier.trim().toLowerCase();
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Checks and enforces rate limits for a login attempt.
   * Increments both identifier-based and IP-based counters in Redis.
   */
  async checkLoginRateLimit(identifier: string, ipAddress: string): Promise<void> {
    const hashedId = this.hashIdentifier(identifier);
    const cleanIp = (ipAddress || 'unknown').replace(/[^a-zA-Z0-9_.:-]/g, '');

    const idKey = `cyris:ratelimit:id:${hashedId}`;
    const ipKey = `cyris:ratelimit:ip:${cleanIp}`;

    const [idCount, ipCount] = await Promise.all([
      this.incrementKey(idKey, this.identifierLimits.windowSeconds),
      this.incrementKey(ipKey, this.ipLimits.windowSeconds),
    ]);

    if (idCount > this.identifierLimits.maxAttempts) {
      this.logger.warn(`Rate limit exceeded for login identifier (hash: ${hashedId.slice(0, 10)}...) (${idCount}/${this.identifierLimits.maxAttempts})`);
      throw new HttpException(
        'Too many login attempts. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    if (ipCount > this.ipLimits.maxAttempts) {
      this.logger.warn(`Rate limit exceeded for source IP '${cleanIp}' (${ipCount}/${this.ipLimits.maxAttempts})`);
      throw new HttpException(
        'Too many requests from this network. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
  }

  /**
   * Atomically increments a Redis key and ensures TTL expiration is set.
   */
  private async incrementKey(key: string, ttlSeconds: number): Promise<number> {
    try {
      const pipeline = this.redis.pipeline();
      pipeline.incr(key);
      pipeline.expire(key, ttlSeconds);
      const results = await pipeline.exec();
      if (!results || !results[0] || results[0][0]) {
        return 1;
      }
      return results[0][1] as number;
    } catch (err) {
      this.logger.error(`Redis rate limit error on key '${key}': ${(err as Error).message}`);
      // Fail open if Redis is down so service is not blocked, but log error
      return 1;
    }
  }

  /**
   * Resets rate limit counters upon successful login.
   */
  async resetLoginRateLimit(identifier: string): Promise<void> {
    const hashedId = this.hashIdentifier(identifier);
    const idKey = `cyris:ratelimit:id:${hashedId}`;
    try {
      await this.redis.del(idKey);
    } catch (err) {
      this.logger.error(`Failed to reset rate limit for hash '${hashedId.slice(0, 10)}...': ${(err as Error).message}`);
    }
  }
}

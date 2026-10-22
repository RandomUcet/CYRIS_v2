import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { Redis, type RedisOptions } from 'ioredis';
import { Queue, type QueueOptions } from 'bullmq';
import { ConfigService } from '../config/config.service.js';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly redisClient: Redis;
  private readonly redisOptions: RedisOptions;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.values.REDIS_URL;
    const url = new URL(redisUrl);

    this.redisOptions = {
      host: url.hostname,
      port: Number(url.port) || 6379,
      password: url.password || undefined,
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,
    };

    this.redisClient = new Redis(this.redisOptions);
  }

  get client(): Redis {
    return this.redisClient;
  }

  get connectionOptions(): RedisOptions {
    return this.redisOptions;
  }

  /**
   * Factory to create typed BullMQ Queue instances configured for CYRIS infrastructure.
   */
  createQueue<DataType = unknown, ResultType = unknown>(
    name: string,
    options?: Partial<QueueOptions>
  ): Queue<DataType, ResultType> {
    return new Queue<DataType, ResultType>(name, {
      connection: this.redisOptions,
      ...options,
    });
  }

  /**
   * Pings the Redis server and measures round-trip latency.
   */
  async verifyConnection(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now();
    const result = await this.redisClient.ping();
    const latencyMs = Date.now() - start;
    return { ok: result === 'PONG', latencyMs };
  }

  /**
   * Healthcheck helper for readiness endpoints.
   */
  async checkHealth(): Promise<{ status: 'up' | 'down'; latencyMs?: number; error?: string }> {
    try {
      const result = await this.verifyConnection();
      return result.ok ? { status: 'up', latencyMs: result.latencyMs } : { status: 'down', error: 'Unexpected ping response' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Redis ping failed';
      this.logger.error(`Redis health check failed: ${message}`);
      return { status: 'down', error: 'Redis broker inaccessible' };
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Disconnecting Redis client...');
    await this.redisClient.quit();
  }
}

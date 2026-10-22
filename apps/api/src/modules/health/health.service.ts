import { Injectable } from '@nestjs/common';
import type { HealthResponse, ReadinessResponse } from '@cyris/contracts';
import { DatabaseService } from '../database/database.service.js';
import { QueueService } from '../queue/queue.service.js';
import { SearchService } from '../search/search.service.js';
import { StorageService } from '../storage/storage.service.js';
import { MailService } from '../mail/mail.service.js';

@Injectable()
export class HealthService {
  private readonly startTime = Date.now();

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly queueService: QueueService,
    private readonly searchService: SearchService,
    private readonly storageService: StorageService,
    private readonly mailService: MailService
  ) {}

  getLiveness(): HealthResponse {
    return {
      status: 'ok',
      service: 'cyris-api',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  async getReadiness(): Promise<{ response: ReadinessResponse; isHealthy: boolean }> {
    const [postgres, redis, typesense, storage, mail] = await Promise.all([
      this.databaseService.checkHealth(),
      this.queueService.checkHealth(),
      this.searchService.checkHealth(),
      this.storageService.checkHealth(),
      this.mailService.checkHealth(),
    ]);

    // Core critical services: postgres, redis, typesense, storage
    const isHealthy =
      postgres.status === 'up' &&
      redis.status === 'up' &&
      typesense.status === 'up' &&
      storage.status === 'up';

    const response: ReadinessResponse = {
      status: isHealthy ? 'ok' : 'down',
      timestamp: new Date().toISOString(),
      dependencies: {
        postgres,
        redis,
        typesense,
        storage,
        mail,
      },
    };

    return { response, isHealthy };
  }
}


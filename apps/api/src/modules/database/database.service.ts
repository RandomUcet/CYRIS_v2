import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { getDbClient, checkDatabaseConnection, closeDatabaseConnection, type CyrisDatabase } from '@cyris/db';
import { ConfigService } from '../config/config.service.js';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly db: CyrisDatabase;

  constructor(private readonly configService: ConfigService) {
    this.db = getDbClient({ url: this.configService.values.DATABASE_URL });
  }

  get client(): CyrisDatabase {
    return this.db;
  }

  async checkHealth(): Promise<{ status: 'up' | 'down'; latencyMs?: number; error?: string }> {
    try {
      const result = await checkDatabaseConnection(this.db);
      return { status: 'up', latencyMs: result.latencyMs };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown database error';
      this.logger.error(`Database healthcheck failed: ${message}`);
      return { status: 'down', error: 'Database connection failed' };
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Closing database connection pool...');
    await closeDatabaseConnection();
  }
}

import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { identifierCounters } from '@cyris/db';

@Injectable()
export class IdentifierAllocatorService {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Concurrency-safe atomic counter allocator in PostgreSQL.
   * Allocates the next sequential integer for (eventId, entityType) and formats
   * as `${prefix}-${String(num).padStart(width, '0')}`.
   */
  async allocate(
    eventId: string,
    entityType: string,
    prefix: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    txClient?: any,
    width = 4
  ): Promise<string> {
    const db = txClient || this.databaseService.client;

    const [row] = await db
      .insert(identifierCounters)
      .values({
        eventId,
        entityType,
        lastValue: 1,
      })
      .onConflictDoUpdate({
        target: [identifierCounters.eventId, identifierCounters.entityType],
        set: {
          lastValue: sql`${identifierCounters.lastValue} + 1`,
        },
      })
      .returning({ lastValue: identifierCounters.lastValue });

    const allocatedNum = row?.lastValue ?? 1;
    return `${prefix}-${String(allocatedNum).padStart(width, '0')}`;
  }
}

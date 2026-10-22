import { Injectable, Logger } from '@nestjs/common';
import { Client as TypesenseClient } from 'typesense';
import {
  GLOBAL_SEARCH_COLLECTION,
  cyrisGlobalCollectionSchema,
  defaultSearchProjectionRegistry,
  outboxEvents,
  OutboxStatus,
} from '@cyris/db';
import { generateId } from '@cyris/shared';
import type { SearchDocument } from '@cyris/contracts';
import { DatabaseService } from '../database/database.service.js';
import { SearchService } from './search.service.js';

@Injectable()
export class SearchIndexerService {
  private readonly logger = new Logger(SearchIndexerService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly searchService: SearchService
  ) {}

  private get client(): TypesenseClient {
    return this.searchService.typesenseClient;
  }

  /**
   * Ensures the global Typesense search collection exists with correct schema.
   * Safe to call multiple times (idempotent).
   */
  async ensureCollection(): Promise<void> {
    try {
      await this.client.collections(GLOBAL_SEARCH_COLLECTION).retrieve();
      this.logger.log(`Typesense collection '${GLOBAL_SEARCH_COLLECTION}' is verified.`);
    } catch {
      this.logger.log(`Creating Typesense collection '${GLOBAL_SEARCH_COLLECTION}'...`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await this.client.collections().create(cyrisGlobalCollectionSchema as any);
      this.logger.log(`Created Typesense collection '${GLOBAL_SEARCH_COLLECTION}'.`);
    }
  }

  /**
   * Directly indexes/upserts a single SearchDocument into Typesense.
   */
  async upsertDocument(doc: SearchDocument): Promise<void> {
    await this.client
      .collections(GLOBAL_SEARCH_COLLECTION)
      .documents()
      .upsert(doc);
  }

  /**
   * Deletes a document from the search index.
   */
  async deleteDocument(type: string, id: string): Promise<void> {
    const docId = `${type}:${id}`;
    try {
      await this.client
        .collections(GLOBAL_SEARCH_COLLECTION)
        .documents(docId)
        .delete();
    } catch (err) {
      // Ignore 404 Not Found
      const message = (err as Error).message || '';
      if (!message.includes('404') && !message.includes('not found')) {
        this.logger.warn(`Failed to delete document '${docId}': ${message}`);
      }
    }
  }

  /**
   * Full or event-scoped rebuild of the search index from canonical PostgreSQL state.
   */
  async reindexAll(eventId?: string): Promise<{ indexed: number; failed: number }> {
    await this.ensureCollection();

    const db = this.databaseService.client;
    this.logger.log(
      `Reindexing canonical entities into '${GLOBAL_SEARCH_COLLECTION}'${
        eventId ? ` for event '${eventId}'` : ''
      }...`
    );

    const docs = await defaultSearchProjectionRegistry.listAllDocuments(db, eventId);
    this.logger.log(`Collected ${docs.length} search projections from registered providers.`);

    if (docs.length === 0) {
      return { indexed: 0, failed: 0 };
    }

    try {
      // Import documents in batch
      const response = await this.client
        .collections(GLOBAL_SEARCH_COLLECTION)
        .documents()
        .import(docs, { action: 'upsert' });

      // Typesense import returns an array of { success: boolean, error?: string }
      let successCount = 0;
      let failCount = 0;

      for (const res of response as { success: boolean; error?: string }[]) {
        if (res.success) {
          successCount++;
        } else {
          failCount++;
          this.logger.warn(`Failed to index document item: ${res.error}`);
        }
      }

      this.logger.log(
        `Reindex complete. Indexed: ${successCount}, Failed: ${failCount}`
      );
      return { indexed: successCount, failed: failCount };
    } catch (err) {
      this.logger.error(`Reindex batch failed: ${(err as Error).message}`);
      throw err;
    }
  }

  /**
   * Emits an atomic outbox event for indexing a canonical entity.
   */
  async emitSearchUpsert(
    type: string,
    id: string,
    txClient?: Parameters<Parameters<DatabaseService['client']['transaction']>[0]>[0]
  ): Promise<void> {
    const db = txClient || this.databaseService.client;
    await db.insert(outboxEvents).values({
      id: generateId(),
      eventType: 'search.upsert',
      payload: { type, id },
      status: OutboxStatus.PENDING,
      retryCount: 0,
    });
  }

  /**
   * Emits an atomic outbox event for removing an entity from search.
   */
  async emitSearchDelete(
    type: string,
    id: string,
    txClient?: Parameters<Parameters<DatabaseService['client']['transaction']>[0]>[0]
  ): Promise<void> {
    const db = txClient || this.databaseService.client;
    await db.insert(outboxEvents).values({
      id: generateId(),
      eventType: 'search.delete',
      payload: { type, id },
      status: OutboxStatus.PENDING,
      retryCount: 0,
    });
  }

  /**
   * Prepares relationship-driven reindexing for two related resources.
   * Guarantees both resources are scheduled for reindexing without deep crawling.
   */
  async requestRelationshipReindex(
    source: { type: string; id: string },
    target: { type: string; id: string },
    txClient?: Parameters<Parameters<DatabaseService['client']['transaction']>[0]>[0]
  ): Promise<void> {
    await this.emitSearchUpsert(source.type, source.id, txClient);
    await this.emitSearchUpsert(target.type, target.id, txClient);
  }
}

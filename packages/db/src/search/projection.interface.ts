import type { SearchDocument } from '@cyris/contracts';
import type { getDbClient } from '../client.js';

export type CyrisDb = ReturnType<typeof getDbClient>;

/**
 * Standard projection provider interface for search indexing.
 * Modules register their projection builder to project database entities into search documents.
 */
export interface SearchProjectionProvider {
  /**
   * Returns the list of entity types supported by this projection provider.
   * e.g. ['event'], ['unit'], ['role'], and future ['case', 'evidence', 'person'].
   */
  getSupportedTypes(): string[];

  /**
   * Projects a single entity identified by id into a SearchDocument.
   * Returns null if the entity does not exist or should not be indexed.
   */
  buildDocument(db: CyrisDb, type: string, id: string): Promise<SearchDocument | null>;

  /**
   * Lists all search documents for bulk indexing / reindexing.
   * Optionally filtered by eventId.
   */
  listAllDocuments(db: CyrisDb, type: string, eventId?: string): Promise<SearchDocument[]>;
}

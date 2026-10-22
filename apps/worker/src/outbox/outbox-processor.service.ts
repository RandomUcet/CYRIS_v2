import { Injectable, Logger } from '@nestjs/common';
import * as zlib from 'node:zlib';
import * as crypto from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import { Client as TypesenseClient } from 'typesense';
import { eq, inArray, sql } from 'drizzle-orm';
import {
  getDbClient,
  type CyrisDb,
  outboxEvents,
  OutboxStatus,
  documents,
  GLOBAL_SEARCH_COLLECTION,
  cyrisGlobalCollectionSchema,
  defaultSearchProjectionRegistry,
} from '@cyris/db';
import { loadConfig, type EnvConfig } from '@cyris/config';
import { generateId } from '@cyris/shared';
// @ts-ignore
import { PDFParse } from 'pdf-parse';

@Injectable()
export class OutboxProcessorService {
  private readonly logger = new Logger(OutboxProcessorService.name);
  private readonly config: EnvConfig;
  private readonly s3Client: S3Client;
  private readonly typesenseClient: TypesenseClient;
  private readonly targetBucket: string;
  private readonly storageBucket: string;
  private collectionVerified = false;

  constructor() {
    this.config = loadConfig();
    this.targetBucket = this.config.S3_AUDIT_BUCKET || 'cyris-audit';
    this.storageBucket = this.config.S3_BUCKET || 'cyris-storage';

    this.s3Client = new S3Client({
      endpoint: this.config.S3_ENDPOINT,
      region: this.config.S3_REGION,
      credentials: {
        accessKeyId: this.config.S3_ACCESS_KEY,
        secretAccessKey: this.config.S3_SECRET_KEY,
      },
      forcePathStyle: true,
    });

    this.typesenseClient = new TypesenseClient({
      nodes: [
        {
          host: this.config.TYPESENSE_HOST,
          port: this.config.TYPESENSE_PORT,
          protocol: 'http',
        },
      ],
      apiKey: this.config.TYPESENSE_API_KEY,
      connectionTimeoutSeconds: 5,
    });
  }

  /**
   * Ensures the audit and storage destination buckets exist in S3 / MinIO.
   */
  async ensureAuditBucket(): Promise<void> {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.targetBucket }));
    } catch {
      try {
        await this.s3Client.send(new CreateBucketCommand({ Bucket: this.targetBucket }));
        this.logger.log(`Created audit bucket '${this.targetBucket}' in S3 storage.`);
      } catch (createErr) {
        this.logger.warn(`Could not create bucket '${this.targetBucket}': ${(createErr as Error).message}`);
      }
    }

    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.storageBucket }));
    } catch {
      try {
        await this.s3Client.send(new CreateBucketCommand({ Bucket: this.storageBucket }));
        this.logger.log(`Created storage bucket '${this.storageBucket}' in S3 storage.`);
      } catch (createErr) {
        this.logger.warn(`Could not create bucket '${this.storageBucket}': ${(createErr as Error).message}`);
      }
    }
  }

  /**
   * Ensures Typesense collection exists.
   */
  async ensureSearchCollection(): Promise<void> {
    if (this.collectionVerified) return;
    try {
      await this.typesenseClient.collections(GLOBAL_SEARCH_COLLECTION).retrieve();
      this.collectionVerified = true;
    } catch {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await this.typesenseClient.collections().create(cyrisGlobalCollectionSchema as any);
        this.collectionVerified = true;
        this.logger.log(`Worker verified/created Typesense collection '${GLOBAL_SEARCH_COLLECTION}'.`);
      } catch (err) {
        this.logger.warn(`Could not verify Typesense collection: ${(err as Error).message}`);
      }
    }
  }

  /**
   * Processes pending outbox events (audit archival + search indexing).
   * Returns the count of successfully processed outbox events.
   */
  async processPendingOutbox(batchSize: number = 50): Promise<number> {
    const db = getDbClient({ url: this.config.DATABASE_URL });

    // 1. Fetch pending outbox rows
    const pendingRows = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.status, OutboxStatus.PENDING))
      .limit(batchSize);

    if (pendingRows.length === 0) {
      return 0;
    }

    this.logger.log(`Found ${pendingRows.length} pending outbox events to process.`);
    const successfullyProcessedIds: string[] = [];

    // 2. Process audit.archival events
    const auditRows = pendingRows.filter((r) => r.eventType === 'audit.archival');
    if (auditRows.length > 0) {
      try {
        await this.archiveAuditBatch(auditRows);
        successfullyProcessedIds.push(...auditRows.map((r) => r.id));
      } catch (err) {
        this.logger.error(`Failed to archive audit batch: ${(err as Error).message}`);
      }
    }

    // 3. Process search.upsert and search.delete events
    const searchRows = pendingRows.filter(
      (r) => r.eventType === 'search.upsert' || r.eventType === 'search.delete'
    );

    if (searchRows.length > 0) {
      await this.ensureSearchCollection();

      for (const row of searchRows) {
        const payload = row.payload as { type?: string; id?: string };
        const type = payload?.type;
        const id = payload?.id;

        if (!type || !id) {
          // Malformed payload, mark processed to avoid infinite loop
          successfullyProcessedIds.push(row.id);
          continue;
        }

        try {
          if (row.eventType === 'search.upsert') {
            const doc = await defaultSearchProjectionRegistry.buildDocument(db, type, id);
            if (doc) {
              await this.typesenseClient
                .collections(GLOBAL_SEARCH_COLLECTION)
                .documents()
                .upsert(doc);
              this.logger.log(`Indexed document '${doc.id}' into '${GLOBAL_SEARCH_COLLECTION}'.`);
            } else {
              // Document was deleted or should not be indexed, delete from Typesense
              try {
                await this.typesenseClient
                  .collections(GLOBAL_SEARCH_COLLECTION)
                  .documents(`${type}:${id}`)
                  .delete();
              } catch {
                // Ignore not found
              }
            }
          } else if (row.eventType === 'search.delete') {
            try {
              await this.typesenseClient
                .collections(GLOBAL_SEARCH_COLLECTION)
                .documents(`${type}:${id}`)
                .delete();
              this.logger.log(`Deleted document '${type}:${id}' from '${GLOBAL_SEARCH_COLLECTION}'.`);
            } catch {
              // Ignore not found
            }
          }

          successfullyProcessedIds.push(row.id);
        } catch (err) {
          this.logger.warn(
            `Failed search outbox indexing for event '${row.id}' (${type}:${id}): ${(err as Error).message}. Will retry.`
          );
          // Increment retryCount in DB so it can be retried or inspected
          await db
            .update(outboxEvents)
            .set({
              retryCount: sql`${outboxEvents.retryCount} + 1`,
            })
            .where(eq(outboxEvents.id, row.id));
        }
      }
    }

    // 4. Process document.extract_text events
    const docRows = pendingRows.filter((r) => r.eventType === 'document.extract_text');
    for (const row of docRows) {
      try {
        await this.processDocumentTextExtraction(row, db);
        successfullyProcessedIds.push(row.id);
      } catch (err) {
        this.logger.error(`Error extracting text for document event '${row.id}': ${(err as Error).message}`);
        await db
          .update(outboxEvents)
          .set({ retryCount: sql`${outboxEvents.retryCount} + 1` })
          .where(eq(outboxEvents.id, row.id));
      }
    }

    // 5. Process and acknowledge other domain/scenario events
    const otherRows = pendingRows.filter(
      (r) =>
        r.eventType !== 'audit.archival' &&
        r.eventType !== 'search.upsert' &&
        r.eventType !== 'search.delete' &&
        r.eventType !== 'document.extract_text'
    );
    for (const r of otherRows) {
      successfullyProcessedIds.push(r.id);
    }

    // 5. Mark successful rows as PROCESSED
    if (successfullyProcessedIds.length > 0) {
      await db
        .update(outboxEvents)
        .set({
          status: OutboxStatus.PROCESSED,
          processedAt: new Date(),
        })
        .where(inArray(outboxEvents.id, successfullyProcessedIds));

      this.logger.log(`Successfully processed ${successfullyProcessedIds.length} outbox events.`);
    }

    return successfullyProcessedIds.length;
  }

  /**
   * Compiles an NDJSON batch, compresses with gzip, computes SHA-256, and uploads to S3.
   */
  private async archiveAuditBatch(rows: (typeof outboxEvents.$inferSelect)[]): Promise<void> {
    await this.ensureAuditBucket();

    const batchId = generateId();
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');

    // NDJSON format: each line represents one audit event
    const ndjsonLines = rows
      .map((r) => JSON.stringify(r.payload))
      .join('\n') + '\n';

    // Compress with Gzip
    const uncompressedBuffer = Buffer.from(ndjsonLines, 'utf-8');
    const compressedBuffer = zlib.gzipSync(uncompressedBuffer);

    // Compute SHA-256 hash of the archive object
    const sha256Hash = crypto.createHash('sha256').update(compressedBuffer).digest('hex');

    // Key format: audit/YYYY/MM/DD/<batch-id>.ndjson.gz
    const s3Key = `audit/${year}/${month}/${day}/${batchId}.ndjson.gz`;

    this.logger.log(`Archiving ${rows.length} audit events to S3 '${this.targetBucket}/${s3Key}' (SHA-256: ${sha256Hash})...`);

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.targetBucket,
        Key: s3Key,
        Body: compressedBuffer,
        ContentType: 'application/gzip',
        Metadata: {
          sha256: sha256Hash,
          batchId,
          eventCount: String(rows.length),
          archivedAt: now.toISOString(),
        },
      })
    );
  }

  /**
   * Processes asynchronous text extraction for an uploaded document.
   */
  private async processDocumentTextExtraction(
    row: typeof outboxEvents.$inferSelect,
    db: CyrisDb
  ): Promise<void> {
    const payload = row.payload as {
      documentId?: string;
      objectKey?: string;
      mimeType?: string;
    };

    if (!payload?.documentId || !payload?.objectKey) {
      return;
    }

    const { documentId, objectKey, mimeType = 'text/plain' } = payload;
    this.logger.log(`Worker extracting text for document '${documentId}' (${mimeType})...`);

    let extractedText: string | null = null;
    let extractionStatus = 'COMPLETED';

    try {
      // 1. Fetch object from S3
      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.storageBucket,
          Key: objectKey,
        })
      );

      const byteArray = await response.Body?.transformToByteArray();
      const buffer = Buffer.from(byteArray || []);

      // 2. Extract text based on MIME type
      if (
        mimeType.startsWith('text/') ||
        mimeType === 'application/json' ||
        mimeType === 'application/xml'
      ) {
        extractedText = buffer.toString('utf-8');
      } else if (mimeType === 'application/pdf') {
        try {
          const parser = new PDFParse(buffer);
          const pdfData = await parser.getText();
          extractedText = typeof pdfData === 'string' ? pdfData : (pdfData?.text || null);
        } catch (pdfErr) {
          this.logger.warn(`PDF parse error for document '${documentId}': ${(pdfErr as Error).message}`);
          extractionStatus = 'FAILED';
        }
      } else {
        extractionStatus = 'NO_TEXT';
      }

      if (extractionStatus === 'COMPLETED' && (!extractedText || extractedText.trim().length === 0)) {
        extractionStatus = 'NO_TEXT';
      }

      // 3. Update PostgreSQL metadata
      await db
        .update(documents)
        .set({
          extractedText: extractedText ? extractedText.slice(0, 100000) : null,
          textExtractionStatus: extractionStatus,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));

      // 4. Enqueue Search Indexing for the document
      await db.insert(outboxEvents).values({
        id: generateId(),
        eventType: 'search.upsert',
        status: OutboxStatus.PENDING,
        payload: {
          type: 'document',
          id: documentId,
        },
      });

      this.logger.log(`Document '${documentId}' text extraction finished with status '${extractionStatus}'.`);
    } catch (err) {
      this.logger.error(`Failed to extract text for document '${documentId}': ${(err as Error).message}`);
      await db
        .update(documents)
        .set({
          textExtractionStatus: 'FAILED',
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));
    }
  }
}

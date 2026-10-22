import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { eq, and, desc, sql } from 'drizzle-orm';
import * as crypto from 'node:crypto';
import { DatabaseService } from '../database/database.service.js';
import { StorageService } from '../storage/storage.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ActivityService } from '../resources/activity.service.js';
import { ResourceService } from '../resources/resource.service.js';
import { ResourceAccessService } from '../resources/resource-access.service.js';
import { IdentifierAllocatorService } from '../resources/identifier-allocator.service.js';
import {
  documents,
  documentVersions,
  resources,
  outboxEvents,
  OutboxStatus,
  ResourceVisibility,
  type ResourceVisibilityValue,
} from '@cyris/db';
import { Permissions, generateId } from '@cyris/shared';
import type { AuthenticatedUser } from '../auth/session.service.js';
import type {
  DocumentItem,
  DocumentDetail,
  DocumentVersionItem,
  DocumentQueryFilters,
  CreateDocumentMetadata,
  UpdateDocumentMetadata,
  CreateDocumentVersionMetadata,
} from '@cyris/contracts';

export interface FileUploadPayload {
  filename: string;
  mimeType: string;
  data: Buffer;
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly storageService: StorageService,
    private readonly auditService: AuditService,
    private readonly activityService: ActivityService,
    private readonly resourceService: ResourceService,
    private readonly resourceAccessService: ResourceAccessService,
    private readonly identifierAllocator: IdentifierAllocatorService
  ) {}

  private get db() {
    return this.databaseService.client;
  }

  /**
   * Cleans filename to safe alphanumeric ASCII string.
   */
  private sanitizeFilename(filename: string): string {
    const cleaned = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return cleaned.slice(0, 128) || 'document.bin';
  }

  /**
   * Uploads a new document:
   * 1. Hashes data with SHA-256
   * 2. Uploads binary to S3
   * 3. Creates resource and documents metadata transactionally
   * 4. Creates document_versions (v1)
   * 5. Audits and creates activity
   * 6. Enqueues text extraction outbox event
   */
  async uploadDocument(
    eventId: string,
    file: FileUploadPayload,
    meta: CreateDocumentMetadata,
    user: AuthenticatedUser
  ): Promise<DocumentItem> {
    await this.storageService.ensureBucketExists();

    const documentId = generateId();
    const versionId = generateId();
    const now = new Date();
    const versionNumber = 1;

    // 1. Calculate SHA-256
    const sha256 = crypto.createHash('sha256').update(file.data).digest('hex');
    const safeFilename = this.sanitizeFilename(file.filename);
    const objectKey = `documents/${eventId}/${documentId}/v1/${safeFilename}`;

    // 2. Upload to S3
    await this.storageService.putObject(objectKey, file.data, file.mimeType);

    // 3. Allocate document number if not provided
    const documentNumber =
      meta.documentNumber ||
      (await this.identifierAllocator.allocate(eventId, 'DOCUMENT', 'DOC'));

    // 4. Save metadata transactionally
    await this.db.transaction(async (tx) => {
      // Create resource in common registry
      await this.resourceService.registerResource(eventId, 'document', {
        id: documentId,
        visibility: (meta.visibility as ResourceVisibilityValue) || ResourceVisibility.EVENT,
        owningUnitId: meta.owningUnitId || null,
        ownerUserId: user.id,
        txClient: tx,
      });

      // Insert document row
      await tx.insert(documents).values({
        id: documentId,
        eventId,
        documentNumber,
        title: meta.title,
        description: meta.description || null,
        documentType: meta.documentType || 'REPORT',
        status: 'DRAFT',
        originalFilename: file.filename,
        mimeType: file.mimeType || 'application/octet-stream',
        byteSize: file.data.length,
        objectKey,
        sha256,
        uploadedByUserId: user.id,
        uploadedAt: now,
        textExtractionStatus: 'PENDING',
        extractedText: null,
        createdAt: now,
        updatedAt: now,
      });

      // Insert version 1 row
      await tx.insert(documentVersions).values({
        id: versionId,
        documentId,
        versionNumber,
        objectKey,
        filename: file.filename,
        mimeType: file.mimeType || 'application/octet-stream',
        byteSize: file.data.length,
        sha256,
        uploadedByUserId: user.id,
        uploadedAt: now,
        changeNote: 'Initial upload',
      });

      // Enqueue text extraction outbox event
      await tx.insert(outboxEvents).values({
        id: generateId(),
        eventType: 'document.extract_text',
        status: OutboxStatus.PENDING,
        payload: {
          documentId,
          objectKey,
          mimeType: file.mimeType || 'application/octet-stream',
        },
      });
    });

    // 5. Audit
    await this.auditService.record({
      action: 'document.created',
      category: 'documents',
      eventId,
      resourceType: 'document',
      resourceId: documentId,
      actorUserId: user.id,
      metadata: {
        documentNumber,
        title: meta.title,
        originalFilename: file.filename,
        byteSize: file.data.length,
        sha256,
      },
    });

    // 6. Activity
    await this.activityService.recordActivity({
      eventId,
      resourceId: documentId,
      activityType: 'document.created',
      actorUserId: user.id,
      title: `Document Uploaded: ${documentNumber} — ${meta.title}`,
      summary: `${file.filename} (${file.data.length} bytes)`,
    });

    return (await this.getDocument(documentId, user)) as DocumentItem;
  }

  /**
   * Uploads a new version for an existing document.
   */
  async uploadVersion(
    documentId: string,
    file: FileUploadPayload,
    meta: CreateDocumentVersionMetadata,
    user: AuthenticatedUser
  ): Promise<DocumentDetail> {
    await this.storageService.ensureBucketExists();

    // Authorize
    await this.resourceAccessService.assertCanAccessResource(
      user,
      documentId,
      Permissions.DOCUMENT_VERSION
    );

    const [doc] = await this.db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    if (!doc) {
      throw new NotFoundException(`Document '${documentId}' not found`);
    }

    // Determine next version number
    const [latestVersion] = await this.db
      .select({ versionNumber: documentVersions.versionNumber })
      .from(documentVersions)
      .where(eq(documentVersions.documentId, documentId))
      .orderBy(desc(documentVersions.versionNumber))
      .limit(1);

    const nextVersionNumber = (latestVersion?.versionNumber ?? 1) + 1;
    const now = new Date();
    const sha256 = crypto.createHash('sha256').update(file.data).digest('hex');
    const safeFilename = this.sanitizeFilename(file.filename);
    const objectKey = `documents/${doc.eventId}/${documentId}/v${nextVersionNumber}/${safeFilename}`;

    // Upload object to S3
    await this.storageService.putObject(objectKey, file.data, file.mimeType);

    // Update DB
    await this.db.transaction(async (tx) => {
      await tx.insert(documentVersions).values({
        id: generateId(),
        documentId,
        versionNumber: nextVersionNumber,
        objectKey,
        filename: file.filename,
        mimeType: file.mimeType || 'application/octet-stream',
        byteSize: file.data.length,
        sha256,
        uploadedByUserId: user.id,
        uploadedAt: now,
        changeNote: meta.changeNote || null,
      });

      await tx
        .update(documents)
        .set({
          originalFilename: file.filename,
          mimeType: file.mimeType || 'application/octet-stream',
          byteSize: file.data.length,
          objectKey,
          sha256,
          uploadedByUserId: user.id,
          uploadedAt: now,
          textExtractionStatus: 'PENDING',
          updatedAt: now,
        })
        .where(eq(documents.id, documentId));

      // Enqueue text extraction for new version
      await tx.insert(outboxEvents).values({
        id: generateId(),
        eventType: 'document.extract_text',
        status: OutboxStatus.PENDING,
        payload: {
          documentId,
          objectKey,
          mimeType: file.mimeType || 'application/octet-stream',
        },
      });
    });

    // Audit
    await this.auditService.record({
      action: 'document.versioned',
      category: 'documents',
      eventId: doc.eventId,
      resourceType: 'document',
      resourceId: documentId,
      actorUserId: user.id,
      metadata: {
        versionNumber: nextVersionNumber,
        filename: file.filename,
        sha256,
        changeNote: meta.changeNote || null,
      },
    });

    // Activity
    await this.activityService.recordActivity({
      eventId: doc.eventId,
      resourceId: documentId,
      activityType: 'document.versioned',
      actorUserId: user.id,
      title: `Document Updated: ${doc.documentNumber || doc.title} (v${nextVersionNumber})`,
      summary: meta.changeNote || `New version uploaded: ${file.filename}`,
    });

    return this.getDocumentDetail(documentId, user);
  }

  /**
   * Retrieves single document item with access authorization.
   */
  async getDocument(documentId: string, user: AuthenticatedUser): Promise<DocumentItem> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      documentId,
      Permissions.DOCUMENT_READ
    );

    const [row] = await this.db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    if (!row) {
      throw new NotFoundException(`Document '${documentId}' not found`);
    }

    const [latestVersion] = await this.db
      .select({ versionNumber: documentVersions.versionNumber })
      .from(documentVersions)
      .where(eq(documentVersions.documentId, documentId))
      .orderBy(desc(documentVersions.versionNumber))
      .limit(1);

    return {
      id: row.id,
      eventId: row.eventId,
      documentNumber: row.documentNumber,
      title: row.title,
      description: row.description,
      documentType: row.documentType,
      status: row.status,
      originalFilename: row.originalFilename,
      mimeType: row.mimeType,
      byteSize: row.byteSize,
      sha256: row.sha256,
      uploadedByUserId: row.uploadedByUserId,
      uploadedAt: row.uploadedAt.toISOString(),
      textExtractionStatus: row.textExtractionStatus,
      extractedText: row.extractedText,
      currentVersionNumber: latestVersion?.versionNumber ?? 1,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /**
   * Retrieves document detail including version history.
   */
  async getDocumentDetail(documentId: string, user: AuthenticatedUser): Promise<DocumentDetail> {
    const doc = await this.getDocument(documentId, user);

    const versionRows = await this.db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, documentId))
      .orderBy(desc(documentVersions.versionNumber));

    const versions: DocumentVersionItem[] = versionRows.map((v) => ({
      id: v.id,
      documentId: v.documentId,
      versionNumber: v.versionNumber,
      objectKey: v.objectKey,
      filename: v.filename,
      mimeType: v.mimeType,
      byteSize: v.byteSize,
      sha256: v.sha256,
      uploadedByUserId: v.uploadedByUserId,
      uploadedAt: v.uploadedAt.toISOString(),
      changeNote: v.changeNote,
    }));

    return {
      ...doc,
      versions,
    };
  }

  /**
   * Downloads document object bytes.
   * STRICT SECURITY: Authorizes document access BEFORE retrieving object from S3.
   */
  async downloadDocument(
    documentId: string,
    versionNumber: number | undefined,
    user: AuthenticatedUser
  ): Promise<{ data: Uint8Array; filename: string; mimeType: string; byteSize: number }> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      documentId,
      Permissions.DOCUMENT_READ
    );

    let objectKey: string;
    let filename: string;
    let mimeType: string;

    if (versionNumber) {
      const [ver] = await this.db
        .select()
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.documentId, documentId),
            eq(documentVersions.versionNumber, versionNumber)
          )
        )
        .limit(1);

      if (!ver) {
        throw new NotFoundException(`Version ${versionNumber} of document '${documentId}' not found`);
      }
      objectKey = ver.objectKey;
      filename = ver.filename;
      mimeType = ver.mimeType;
    } else {
      const [doc] = await this.db
        .select()
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);

      if (!doc) {
        throw new NotFoundException(`Document '${documentId}' not found`);
      }
      objectKey = doc.objectKey;
      filename = doc.originalFilename;
      mimeType = doc.mimeType;
    }

    const s3Result = await this.storageService.getObject(objectKey);

    return {
      data: s3Result.body,
      filename,
      mimeType: s3Result.contentType || mimeType,
      byteSize: s3Result.contentLength || s3Result.body.length,
    };
  }

  /**
   * Lists documents in an event with access filtering.
   */
  async listDocuments(
    eventId: string,
    filters: DocumentQueryFilters,
    user: AuthenticatedUser
  ): Promise<{ items: DocumentItem[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const offset = (page - 1) * limit;

    const conditions = [eq(documents.eventId, eventId)];
    if (filters.documentType) {
      conditions.push(eq(documents.documentType, filters.documentType));
    }
    if (filters.status) {
      conditions.push(eq(documents.status, filters.status));
    }

    const rows = await this.db
      .select({ doc: documents })
      .from(documents)
      .innerJoin(resources, eq(documents.id, resources.id))
      .where(and(...conditions))
      .orderBy(desc(documents.createdAt))
      .limit(limit)
      .offset(offset);

    // Filter by user resource access
    const accessibleItems: DocumentItem[] = [];
    for (const { doc } of rows) {
      const canAccess = await this.resourceAccessService.canAccessResource(
        user,
        doc.id,
        Permissions.DOCUMENT_READ
      );
      if (canAccess) {
        accessibleItems.push({
          id: doc.id,
          eventId: doc.eventId,
          documentNumber: doc.documentNumber,
          title: doc.title,
          description: doc.description,
          documentType: doc.documentType,
          status: doc.status,
          originalFilename: doc.originalFilename,
          mimeType: doc.mimeType,
          byteSize: doc.byteSize,
          sha256: doc.sha256,
          uploadedByUserId: doc.uploadedByUserId,
          uploadedAt: doc.uploadedAt.toISOString(),
          textExtractionStatus: doc.textExtractionStatus,
          extractedText: doc.extractedText,
          currentVersionNumber: 1,
          createdAt: doc.createdAt.toISOString(),
          updatedAt: doc.updatedAt.toISOString(),
        });
      }
    }

    return {
      items: accessibleItems,
      total: accessibleItems.length,
      page,
      limit,
    };
  }
}

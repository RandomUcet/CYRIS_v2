import { Injectable, Logger } from '@nestjs/common';
import { eq, and, gte, lte, desc, sql, count } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import {
  auditEvents,
  outboxEvents,
  AuditActorType,
  AuditOutcome,
  OutboxStatus,
  type AuditActorTypeValue,
  type AuditOutcomeValue,
} from '@cyris/db';
import { generateId } from '@cyris/shared';
import { redactSensitiveData } from '../../common/redaction.js';
import type { AuditQueryFilters, AuditListResponse, AuditEventItem } from '@cyris/contracts';

export interface RecordAuditParams {
  action: string;
  category: string;
  actorUserId?: string | null;
  actorType?: AuditActorTypeValue;
  eventId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  outcome?: AuditOutcomeValue;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
  changes?: Record<string, unknown> | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Records an immutable audit event and creates an atomic outbox entry for archival.
   * Central structured redaction is guaranteed on all metadata and change payloads.
   */
  async record(params: RecordAuditParams): Promise<string> {
    const db = this.databaseService.client;
    const auditId = generateId();
    const occurredAt = new Date();

    const cleanMetadata = redactSensitiveData(params.metadata || {});
    const cleanChanges = params.changes ? redactSensitiveData(params.changes) : null;

    const auditRow = {
      id: auditId,
      occurredAt,
      actorUserId: params.actorUserId ?? null,
      actorType: params.actorType ?? AuditActorType.USER,
      eventId: params.eventId ?? null,
      action: params.action,
      category: params.category,
      resourceType: params.resourceType ?? null,
      resourceId: params.resourceId ?? null,
      outcome: params.outcome ?? AuditOutcome.SUCCESS,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      requestId: params.requestId ?? null,
      metadata: cleanMetadata,
      changes: cleanChanges,
    };

    const outboxRow = {
      id: generateId(),
      eventType: 'audit.archival',
      payload: {
        ...auditRow,
        occurredAt: occurredAt.toISOString(),
      },
      status: OutboxStatus.PENDING,
      retryCount: 0,
      createdAt: occurredAt,
    };

    try {
      await db.transaction(async (tx) => {
        await tx.insert(auditEvents).values(auditRow);
        await tx.insert(outboxEvents).values(outboxRow);
      });
    } catch (err) {
      // If transaction fails, log error so that audit failures are traceable
      this.logger.error(`Failed to record audit event '${params.action}': ${(err as Error).message}`);
      throw err;
    }

    return auditId;
  }

  /**
   * Read-only query method for the Admin Audit API.
   * Paginated, structured filtering.
   */
  async list(filters: AuditQueryFilters): Promise<AuditListResponse> {
    const db = this.databaseService.client;
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const offset = (page - 1) * limit;

    const conditions = [];

    if (filters.eventId) {
      conditions.push(eq(auditEvents.eventId, filters.eventId));
    }
    if (filters.actorUserId) {
      conditions.push(eq(auditEvents.actorUserId, filters.actorUserId));
    }
    if (filters.action) {
      conditions.push(eq(auditEvents.action, filters.action));
    }
    if (filters.category) {
      conditions.push(eq(auditEvents.category, filters.category));
    }
    if (filters.resourceType) {
      conditions.push(eq(auditEvents.resourceType, filters.resourceType));
    }
    if (filters.resourceId) {
      conditions.push(eq(auditEvents.resourceId, filters.resourceId));
    }
    if (filters.outcome) {
      conditions.push(eq(auditEvents.outcome, filters.outcome));
    }
    if (filters.from) {
      conditions.push(gte(auditEvents.occurredAt, new Date(filters.from)));
    }
    if (filters.to) {
      conditions.push(lte(auditEvents.occurredAt, new Date(filters.to)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await db
      .select({ count: count() })
      .from(auditEvents)
      .where(whereClause);

    const total = totalResult ? Number(totalResult.count) : 0;

    const rows = await db
      .select()
      .from(auditEvents)
      .where(whereClause)
      .orderBy(desc(auditEvents.occurredAt))
      .limit(limit)
      .offset(offset);

    const items: AuditEventItem[] = rows.map((r) => ({
      id: r.id,
      occurredAt: r.occurredAt.toISOString(),
      actorUserId: r.actorUserId,
      actorType: r.actorType,
      eventId: r.eventId,
      action: r.action,
      category: r.category,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      outcome: r.outcome,
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      requestId: r.requestId,
      metadata: (r.metadata as Record<string, unknown>) || {},
      changes: (r.changes as Record<string, unknown>) || null,
    }));

    return {
      items,
      total,
      page,
      limit,
    };
  }

  /**
   * Retrieves a single audit event by ID.
   */
  async getById(id: string): Promise<AuditEventItem | null> {
    const db = this.databaseService.client;
    const [row] = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.id, id))
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      occurredAt: row.occurredAt.toISOString(),
      actorUserId: row.actorUserId,
      actorType: row.actorType,
      eventId: row.eventId,
      action: row.action,
      category: row.category,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      outcome: row.outcome,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      requestId: row.requestId,
      metadata: (row.metadata as Record<string, unknown>) || {},
      changes: (row.changes as Record<string, unknown>) || null,
    };
  }
}

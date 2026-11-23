import { Injectable, Logger } from '@nestjs/common';
import { eq, and, gte, lte, desc, isNull, notInArray, notLike, or, count, sql } from 'drizzle-orm';
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
import { privateControlTypes } from '../disruptions/module-resources.js';
import { redactSensitiveData } from '../../common/redaction.js';
import type { AuditQueryFilters, AuditListResponse, AuditEventItem } from '@cyris/contracts';

function visibleAuditActions(isPlatformAdmin: boolean) {
  if (isPlatformAdmin) return undefined;
  return and(
    notLike(auditEvents.action, 'exercise.disruption.%'),
    notLike(auditEvents.action, 'exercise.recovery%'),
    or(isNull(auditEvents.resourceType), notInArray(auditEvents.resourceType, privateControlTypes)),
  );
}

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  txClient?: any;
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
    const db = params.txClient || this.databaseService.client;
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
      if (params.txClient) {
        await db.insert(auditEvents).values(auditRow);
        await db.insert(outboxEvents).values(outboxRow);
      } else {
        await db.transaction(async (tx: any) => {
          await tx.insert(auditEvents).values(auditRow);
          await tx.insert(outboxEvents).values(outboxRow);
        });
      }
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
  async list(filters: AuditQueryFilters, isPlatformAdmin = false): Promise<AuditListResponse> {
    const db = this.databaseService.client;
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const offset = (page - 1) * limit;

    const conditions = [visibleAuditActions(isPlatformAdmin)];

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
    if (filters.q?.trim()) {
      const term=filters.q.trim();
      // Literal substring matching: parameterized, no user-controlled ILIKE wildcards.
      // Applied before paging, to the full authorized audit history.
      conditions.push(or(
        sql`strpos(lower(${auditEvents.action}), lower(${term})) > 0`,
        sql`strpos(lower(${auditEvents.category}), lower(${term})) > 0`,
        sql`strpos(lower(coalesce(${auditEvents.resourceId}, '')), lower(${term})) > 0`,
        sql`strpos(lower(coalesce(${auditEvents.actorUserId}::text, '')), lower(${term})) > 0`,
        sql`strpos(lower(coalesce(${auditEvents.ipAddress}, '')), lower(${term})) > 0`,
      )!);
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
  async getById(id: string, isPlatformAdmin = false): Promise<AuditEventItem | null> {
    const db = this.databaseService.client;
    const [row] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.id, id), visibleAuditActions(isPlatformAdmin)))
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

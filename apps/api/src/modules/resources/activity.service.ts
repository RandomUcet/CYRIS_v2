import { Injectable } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { activityEvents, ActivityVisibility, type ActivityVisibilityValue } from '@cyris/db';
import { generateId } from '@cyris/shared';
import type { ActivityEventItem } from '@cyris/contracts';

export interface RecordActivityParams {
  eventId: string;
  resourceId?: string | null;
  activityType: string;
  actorUserId?: string | null;
  title: string;
  summary?: string | null;
  reason?: string | null;
  source?: string | null;
  causationId?: string | null;
  requestId?: string | null;
  relatedResourceIds?: string[] | null;
  metadata?: Record<string, unknown>;
  visibility?: ActivityVisibilityValue;
}

export interface ActivityFeedFilter {
  eventId: string;
  resourceId?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class ActivityService {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Records an operational activity event for event timelines.
   * Can run either standalone or inside a caller's transaction.
   */
  async recordActivity(
    params: RecordActivityParams,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    txClient?: any
  ): Promise<ActivityEventItem> {
    const db = txClient || this.databaseService.client;

    const [created] = await db
      .insert(activityEvents)
      .values({
        id: generateId(),
        eventId: params.eventId,
        resourceId: params.resourceId ?? null,
        activityType: params.activityType,
        actorUserId: params.actorUserId ?? null,
        title: params.title,
        summary: params.summary ?? null,
        reason: params.reason ?? null,
        source: params.source ?? null,
        causationId: params.causationId ?? null,
        requestId: params.requestId ?? null,
        relatedResourceIds: params.relatedResourceIds ?? null,
        metadata: params.metadata ?? null,
        visibility: params.visibility ?? ActivityVisibility.EVENT,
      })
      .returning();

    return {
      id: created!.id,
      eventId: created!.eventId,
      resourceId: created!.resourceId,
      activityType: created!.activityType,
      actorUserId: created!.actorUserId,
      occurredAt: created!.occurredAt.toISOString(),
      title: created!.title,
      summary: created!.summary,
      reason: created!.reason,
      source: created!.source,
      causationId: created!.causationId,
      requestId: created!.requestId,
      relatedResourceIds: (created!.relatedResourceIds as string[]) || null,
      metadata: (created!.metadata as Record<string, unknown>) || null,
      visibility: created!.visibility as 'EVENT' | 'UNIT' | 'RESTRICTED',
    };
  }

  /**
   * Retrieves an operational activity feed for an event or specific resource.
   */
  async getActivityFeed(filter: ActivityFeedFilter): Promise<ActivityEventItem[]> {
    const limit = Math.min(100, Math.max(1, filter.limit ?? 25));
    const offset = Math.max(0, filter.offset ?? 0);

    const conditions = [eq(activityEvents.eventId, filter.eventId)];
    if (filter.resourceId) {
      conditions.push(eq(activityEvents.resourceId, filter.resourceId));
    }

    const rows = await this.databaseService.client
      .select()
      .from(activityEvents)
      .where(and(...conditions))
      .orderBy(desc(activityEvents.occurredAt))
      .limit(limit)
      .offset(offset);

    return rows.map((r) => ({
      id: r.id,
      eventId: r.eventId,
      resourceId: r.resourceId,
      activityType: r.activityType,
      actorUserId: r.actorUserId,
      occurredAt: r.occurredAt.toISOString(),
      title: r.title,
      summary: r.summary,
      reason: r.reason,
      source: r.source,
      causationId: r.causationId,
      requestId: r.requestId,
      relatedResourceIds: (r.relatedResourceIds as string[]) || null,
      metadata: (r.metadata as Record<string, unknown>) || null,
      visibility: r.visibility as 'EVENT' | 'UNIT' | 'RESTRICTED',
    }));
  }
}

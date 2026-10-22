import { Injectable, NotFoundException } from '@nestjs/common';
import { eq, and, desc, gte, lte, inArray, or, sql, isNull } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { ResourceAccessService } from '../resources/resource-access.service.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import {
  activityEvents,
  resources,
  resourceRelationships,
  labAnalysisEvidence,
  cases,
  evidence,
  ActivityVisibility,
} from '@cyris/db';
import { Permissions } from '@cyris/shared';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type {
  TimelineQueryFilters,
  TimelineResponse,
  ActivityEventItem,
} from '@cyris/contracts';

@Injectable()
export class TimelineService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly resourceAccessService: ResourceAccessService,
    private readonly authzService?: AuthorizationService
  ) {}

  private get db() {
    return this.databaseService.client;
  }

  /**
   * Event-wide operational timeline, filtered by permissions and criteria.
   */
  async getEventTimeline(
    eventId: string,
    filters: TimelineQueryFilters,
    user: AuthenticatedUser
  ): Promise<TimelineResponse> {
    const limit = Math.min(100, Math.max(1, filters.limit ?? 50));

    const conditions = [eq(activityEvents.eventId, eventId)];

    if (filters.type) {
      conditions.push(eq(activityEvents.activityType, filters.type));
    }
    if (filters.from) {
      conditions.push(gte(activityEvents.occurredAt, new Date(filters.from)));
    }
    if (filters.to) {
      conditions.push(lte(activityEvents.occurredAt, new Date(filters.to)));
    }
    if (filters.cursor) {
      conditions.push(sql`${activityEvents.occurredAt} < ${new Date(filters.cursor)}`);
    }

    const rows = await this.db
      .select()
      .from(activityEvents)
      .where(and(...conditions))
      .orderBy(desc(activityEvents.occurredAt))
      .limit(limit * 2); // Fetch extra buffer for permission filtering

    const accessibleItems: ActivityEventItem[] = [];
    for (const row of rows) {
      if (accessibleItems.length >= limit) break;

      // Hide scenario-only activities from participants lacking scenario authorization
      if (row.visibility === ActivityVisibility.SCENARIO) {
        const canViewScenario = this.authzService
          ? await this.authzService.authorize({
              user,
              permission: Permissions.SCENARIO_READ,
            })
          : false;
        if (!canViewScenario) {
          continue;
        }
      }

      // Check permission if event concerns a resource
      if (row.resourceId) {
        const canAccess = await this.resourceAccessService.canAccessResource(
          user,
          row.resourceId,
          Permissions.TIMELINE_READ
        );
        if (!canAccess) {
          continue; // Skip restricted resource activities to prevent leakage
        }
      }

      accessibleItems.push(this.mapActivityRow(row));
    }

    const nextCursor =
      accessibleItems.length === limit
        ? accessibleItems[accessibleItems.length - 1]?.occurredAt ?? null
        : null;

    return {
      items: accessibleItems,
      total: accessibleItems.length,
      nextCursor,
    };
  }

  /**
   * Resource timeline: activities directly concerning that resource plus explicitly linked activities.
   */
  async getResourceTimeline(
    resourceId: string,
    filters: TimelineQueryFilters,
    user: AuthenticatedUser
  ): Promise<TimelineResponse> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      resourceId,
      Permissions.TIMELINE_READ
    );

    const limit = Math.min(100, Math.max(1, filters.limit ?? 50));

    const conditions = [
      or(
        eq(activityEvents.resourceId, resourceId),
        sql`${activityEvents.relatedResourceIds} @> ${JSON.stringify([resourceId])}::jsonb`
      )!,
    ];

    if (filters.type) {
      conditions.push(eq(activityEvents.activityType, filters.type));
    }
    if (filters.from) {
      conditions.push(gte(activityEvents.occurredAt, new Date(filters.from)));
    }
    if (filters.to) {
      conditions.push(lte(activityEvents.occurredAt, new Date(filters.to)));
    }
    if (filters.cursor) {
      conditions.push(sql`${activityEvents.occurredAt} < ${new Date(filters.cursor)}`);
    }

    const rows = await this.db
      .select()
      .from(activityEvents)
      .where(and(...conditions))
      .orderBy(desc(activityEvents.occurredAt))
      .limit(limit);

    const items = rows.map((r) => this.mapActivityRow(r));
    const nextCursor =
      items.length === limit ? items[items.length - 1]?.occurredAt ?? null : null;

    return {
      items,
      total: items.length,
      nextCursor,
    };
  }

  /**
   * Case timeline: Bounded aggregation traversing:
   * 1. The Case itself
   * 2. Resources directly related to the Case (from active relationships)
   * 3. Evidence attached to the Case
   * 4. Lab analyses related to that Evidence
   *
   * Ordered by occurredAt DESC and permission-filtered.
   */
  async getCaseTimeline(
    caseId: string,
    filters: TimelineQueryFilters,
    user: AuthenticatedUser
  ): Promise<TimelineResponse> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      caseId,
      Permissions.CASE_READ
    );

    // 1. Verify case exists
    const [caseRow] = await this.db
      .select()
      .from(cases)
      .where(eq(cases.id, caseId))
      .limit(1);

    if (!caseRow) {
      throw new NotFoundException(`Case '${caseId}' not found`);
    }

    // 2. Collect directly related resources from active relationships
    const relRows = await this.db
      .select()
      .from(resourceRelationships)
      .where(
        and(
          isNull(resourceRelationships.removedAt),
          or(
            eq(resourceRelationships.sourceResourceId, caseId),
            eq(resourceRelationships.targetResourceId, caseId)
          )
        )
      );

    const directlyRelatedIds = new Set<string>();
    for (const rel of relRows) {
      if (rel.sourceResourceId !== caseId) directlyRelatedIds.add(rel.sourceResourceId);
      if (rel.targetResourceId !== caseId) directlyRelatedIds.add(rel.targetResourceId);
    }

    // 3. Find Evidence items linked to the case
    const directlyRelatedArr = Array.from(directlyRelatedIds);
    let evidenceIds: string[] = [];
    if (directlyRelatedArr.length > 0) {
      const evRows = await this.db
        .select({ id: evidence.id })
        .from(evidence)
        .where(inArray(evidence.id, directlyRelatedArr));
      evidenceIds = evRows.map((r) => r.id);
    }

    // 4. Find Lab Analyses related to that Evidence
    let labAnalysisIds: string[] = [];
    if (evidenceIds.length > 0) {
      const labRows = await this.db
        .select({ analysisId: labAnalysisEvidence.analysisId })
        .from(labAnalysisEvidence)
        .where(inArray(labAnalysisEvidence.evidenceId, evidenceIds));
      labAnalysisIds = labRows.map((r) => r.analysisId);
    }

    // Combine all bounded case resource IDs
    const allInvolvedResourceIds = Array.from(
      new Set([caseId, ...directlyRelatedArr, ...labAnalysisIds])
    );

    // 5. Query activity events
    const limit = Math.min(100, Math.max(1, filters.limit ?? 50));
    const conditions = [
      or(
        inArray(activityEvents.resourceId, allInvolvedResourceIds),
        eq(activityEvents.causationId, caseId)
      )!,
    ];

    if (filters.type) {
      conditions.push(eq(activityEvents.activityType, filters.type));
    }
    if (filters.from) {
      conditions.push(gte(activityEvents.occurredAt, new Date(filters.from)));
    }
    if (filters.to) {
      conditions.push(lte(activityEvents.occurredAt, new Date(filters.to)));
    }
    if (filters.cursor) {
      conditions.push(sql`${activityEvents.occurredAt} < ${new Date(filters.cursor)}`);
    }

    const rows = await this.db
      .select()
      .from(activityEvents)
      .where(and(...conditions))
      .orderBy(desc(activityEvents.occurredAt))
      .limit(limit * 2);

    const accessibleItems: ActivityEventItem[] = [];
    for (const row of rows) {
      if (accessibleItems.length >= limit) break;

      if (row.resourceId) {
        const canAccess = await this.resourceAccessService.canAccessResource(
          user,
          row.resourceId,
          Permissions.TIMELINE_READ
        );
        if (!canAccess) {
          continue; // Skip restricted resource activities to prevent leakage
        }
      }

      accessibleItems.push(this.mapActivityRow(row));
    }

    const nextCursor =
      accessibleItems.length === limit
        ? accessibleItems[accessibleItems.length - 1]?.occurredAt ?? null
        : null;

    return {
      items: accessibleItems,
      total: accessibleItems.length,
      nextCursor,
    };
  }

  private mapActivityRow(row: typeof activityEvents.$inferSelect): ActivityEventItem {
    return {
      id: row.id,
      eventId: row.eventId,
      resourceId: row.resourceId,
      activityType: row.activityType,
      actorUserId: row.actorUserId,
      occurredAt: row.occurredAt.toISOString(),
      title: row.title,
      summary: row.summary,
      reason: row.reason,
      source: row.source,
      causationId: row.causationId,
      requestId: row.requestId,
      relatedResourceIds: (row.relatedResourceIds as string[]) || null,
      metadata: (row.metadata as Record<string, unknown>) || null,
      visibility: row.visibility as 'EVENT' | 'UNIT' | 'RESTRICTED',
    };
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { eq, and, inArray, or, isNull } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { ResourceAccessService } from '../resources/resource-access.service.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import {
  resources,
  resourceRelationships,
  labAnalysisEvidence,
  cases,
  evidence,
} from '@cyris/db';
import { Permissions } from '@cyris/shared';
import { ActivityService } from '../resources/activity.service.js';
import type {
  TimelineQueryFilters,
  TimelineResponse,
} from '@cyris/contracts';

@Injectable()
export class TimelineService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly resourceAccessService: ResourceAccessService,
    private readonly activityService: ActivityService
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
    return this.activityService.getTimeline({ eventId, ...filters }, user);
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

    const [resource] = await this.db.select({ eventId: resources.eventId }).from(resources)
      .where(eq(resources.id, resourceId)).limit(1);
    if (!resource) throw new NotFoundException(`Resource '${resourceId}' not found`);
    return this.activityService.getTimeline({ eventId: resource.eventId, relatedToResourceId: resourceId, ...filters }, user);
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

    const [resource] = await this.db.select({ eventId: resources.eventId }).from(resources)
      .where(eq(resources.id, caseId)).limit(1);
    if (!resource) throw new NotFoundException(`Case '${caseId}' not found`);
    const eventId = resource.eventId;

    // 2. Collect directly related resources from active relationships
    const relRows = await this.db
      .select()
      .from(resourceRelationships)
      .where(
        and(
          isNull(resourceRelationships.removedAt),
          eq(resourceRelationships.eventId, eventId),
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

    return this.activityService.getTimeline({
      eventId, resourceIds: allInvolvedResourceIds, causationId: caseId, ...filters,
    }, user);
  }
}

import { Injectable, Logger, ForbiddenException, NotFoundException } from '@nestjs/common';
import { eq, and, desc, gte, or, isNull } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { ResourceAccessService } from '../resources/resource-access.service.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import {
  cases,
  evidence,
  labAnalyses,
  activityEvents,
  resourceRelationships,
  resources,
} from '@cyris/db';
import { Permissions } from '@cyris/shared';
import { ActivityService } from '../resources/activity.service.js';

export interface PermittedCaseContext {
  caseId: string;
  caseNumber: string;
  title: string;
  status: string;
  priority: string;
  summary?: string | null;
  relationships: Array<{
    targetCode: string;
    targetTitle: string;
    relationshipType: string;
    targetId: string;
  }>;
  evidenceItems: Array<{
    id: string;
    evidenceNumber: string;
    title: string;
    evidenceType: string;
    status: string;
    notes?: string | null;
  }>;
  labAnalyses: Array<{
    id: string;
    analysisNumber: string;
    analysisType: string;
    status: string;
    findings?: string | null;
    conclusion?: string | null;
  }>;
  timelineHighlights: Array<{
    id: string;
    activityType: string;
    title: string;
    summary: string;
    occurredAt: string;
  }>;
  accessibleResourceIds: string[];
}

export interface PermittedOperationalItem {
  id: string;
  category: 'INCIDENT' | 'CASE' | 'EVIDENCE' | 'LAB' | 'TIMELINE' | 'TASK' | 'MEDICAL' | 'EVALUATION';
  title: string;
  description: string;
  code?: string;
  resourceId?: string;
  occurredAt: string;
}

export interface PermittedTimelineExplainContext {
  targetActivity?: {
    id: string;
    activityType: string;
    title: string;
    summary?: string | null;
    occurredAt: string;
    causationId?: string | null;
    resourceId?: string | null;
  };
  causalChain: Array<{
    step: number;
    id: string;
    type: string;
    title: string;
    summary?: string | null;
    occurredAt: string;
    resourceId?: string;
  }>;
  relatedActivities: Array<{
    id: string;
    activityType: string;
    title: string;
    occurredAt: string;
  }>;
  accessibleResourceIds: string[];
}

@Injectable()
export class AIContextService {
  private readonly logger = new Logger(AIContextService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly resourceAccessService: ResourceAccessService,
    private readonly activityService: ActivityService
  ) {}

  /**
   * Builds strict permission-filtered context for Case Summarization.
   * Ensures AI only receives records that the operator is authorized to read.
   */
  async buildCaseContext(
    user: AuthenticatedUser,
    caseId: string
  ): Promise<PermittedCaseContext> {
    const db = this.databaseService.client;

    // 1. Verify access to Case
    await this.resourceAccessService.assertCanAccessResource(
      user,
      caseId,
      Permissions.CASE_READ
    );

    const [caseRow] = await db
      .select({
        id: cases.id,
        caseNumber: cases.caseNumber,
        title: cases.title,
        status: cases.status,
        priority: cases.priority,
        summary: cases.summary,
      })
      .from(cases)
      .where(eq(cases.id, caseId))
      .limit(1);

    if (!caseRow) {
      throw new NotFoundException(`Case '${caseId}' not found`);
    }

    const [caseResource] = await db.select({ eventId: resources.eventId }).from(resources)
      .where(eq(resources.id, caseId)).limit(1);
    if (!caseResource) throw new NotFoundException(`Case '${caseId}' not found`);
    const eventId = caseResource.eventId;

    const accessibleResourceIds: string[] = [caseId];

    // 2. Fetch relationships connected to this case
    const rawRelationships = await db
      .select({
        relationshipType: resourceRelationships.relationshipType,
        targetId: resourceRelationships.targetResourceId,
        sourceId: resourceRelationships.sourceResourceId,
      })
      .from(resourceRelationships)
      .where(
        and(
          or(
            eq(resourceRelationships.sourceResourceId, caseId),
            eq(resourceRelationships.targetResourceId, caseId)
          ),
          isNull(resourceRelationships.removedAt),
          eq(resourceRelationships.eventId, eventId)
        )
      );

    const permittedRelationships: PermittedCaseContext['relationships'] = [];
    const relatedEvidenceIds: string[] = [];
    const relatedLabIds: string[] = [];

    for (const rel of rawRelationships) {
      const otherId = rel.sourceId === caseId ? rel.targetId : rel.sourceId;
      const allowed = await this.resourceAccessService.canAccessResource(
        user,
        otherId,
        Permissions.REGISTRY_READ
      );

      if (allowed) {
        // Find resource type and retain the case's event boundary.
        const [res] = await db
          .select({ resourceType: resources.resourceType, eventId: resources.eventId })
          .from(resources)
          .where(eq(resources.id, otherId))
          .limit(1);

        if (!res || res.eventId !== eventId) continue;
        accessibleResourceIds.push(otherId);
        if (res.resourceType === 'evidence') {
          relatedEvidenceIds.push(otherId);
        } else if (res?.resourceType === 'lab_analysis') {
          relatedLabIds.push(otherId);
        }

        permittedRelationships.push({
          targetId: otherId,
          targetCode: otherId.substring(0, 8),
          targetTitle: `${res?.resourceType || 'Resource'} (${otherId.substring(0, 8)})`,
          relationshipType: rel.relationshipType,
        });
      }
    }

    // 3. Fetch associated evidence and filter by EVIDENCE_READ
    const permittedEvidence: PermittedCaseContext['evidenceItems'] = [];
    if (relatedEvidenceIds.length > 0) {
      const rawEvidence = await db
        .select({
          id: evidence.id,
          evidenceNumber: evidence.evidenceNumber,
          title: evidence.title,
          evidenceType: evidence.evidenceType,
          status: evidence.status,
          description: evidence.description,
        })
        .from(evidence);

      for (const item of rawEvidence) {
        if (relatedEvidenceIds.includes(item.id)) {
          const allowed = await this.resourceAccessService.canAccessResource(
            user,
            item.id,
            Permissions.EVIDENCE_READ
          );
          if (allowed) {
            permittedEvidence.push({
              id: item.id,
              evidenceNumber: item.evidenceNumber,
              title: item.title,
              evidenceType: item.evidenceType,
              status: item.status,
              notes: item.description,
            });
          }
        }
      }
    }

    // 4. Fetch associated lab analyses and filter by LAB_READ
    const permittedLab: PermittedCaseContext['labAnalyses'] = [];
    if (relatedLabIds.length > 0) {
      const rawLab = await db
        .select({
          id: labAnalyses.id,
          analysisNumber: labAnalyses.analysisNumber,
          analysisType: labAnalyses.analysisType,
          status: labAnalyses.status,
          findings: labAnalyses.findings,
          conclusion: labAnalyses.conclusion,
        })
        .from(labAnalyses);

      for (const lab of rawLab) {
        if (relatedLabIds.includes(lab.id)) {
          const allowed = await this.resourceAccessService.canAccessResource(
            user,
            lab.id,
            Permissions.LAB_READ
          );
          if (allowed) {
            permittedLab.push({
              id: lab.id,
              analysisNumber: lab.analysisNumber,
              analysisType: lab.analysisType,
              status: lab.status,
              findings: lab.findings,
              conclusion: lab.conclusion,
            });
          }
        }
      }
    }

    // Optional timeline context must obey exactly the same boundary as its UI.
    let timelineHighlights: PermittedCaseContext['timelineHighlights'] = [];
    try {
      const activities = await this.activityService.getActivityFeed({ eventId, resourceId: caseId, limit: 15 }, user);
      timelineHighlights = activities.map((activity) => ({
        id: activity.id, activityType: activity.activityType, title: activity.title,
        summary: activity.summary ?? '', occurredAt: activity.occurredAt,
      }));
    } catch (error) {
      if (!(error instanceof ForbiddenException)) throw error;
    }

    return {
      caseId: caseRow.id,
      caseNumber: caseRow.caseNumber,
      title: caseRow.title,
      status: caseRow.status,
      priority: caseRow.priority,
      summary: caseRow.summary,
      relationships: permittedRelationships,
      evidenceItems: permittedEvidence,
      labAnalyses: permittedLab,
      timelineHighlights,
      accessibleResourceIds: Array.from(new Set(accessibleResourceIds)),
    };
  }

  /**
   * Builds strict permission-filtered operational items for Catch Me Up briefing.
   */
  async buildCatchMeUpContext(
    user: AuthenticatedUser,
    eventId: string,
    period: 'LAST_LOGIN' | 'LAST_2_HOURS' | 'TODAY'
  ): Promise<{ items: PermittedOperationalItem[]; accessibleResourceIds: string[] }> {
    const db = this.databaseService.client;
    const now = Date.now();
    let threshold: Date;

    if (period === 'LAST_2_HOURS') {
      threshold = new Date(now - 2 * 60 * 60 * 1000);
    } else if (period === 'TODAY') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      threshold = today;
    } else {
      // LAST_LOGIN default fallback
      threshold = new Date(now - 4 * 60 * 60 * 1000);
    }

    const rawActivities = await this.activityService.getActivityFeed({
      eventId, from: threshold.toISOString(), limit: 30,
    }, user);

    const items: PermittedOperationalItem[] = [];
    const accessibleResourceIds: string[] = [];

    for (const act of rawActivities) {
      if (act.resourceId) accessibleResourceIds.push(act.resourceId);

      let category: PermittedOperationalItem['category'] = 'TIMELINE';
      if (act.activityType.startsWith('case.')) category = 'CASE';
      else if (act.activityType.startsWith('incident.')) category = 'INCIDENT';
      else if (act.activityType.startsWith('evidence.')) category = 'EVIDENCE';
      else if (act.activityType.startsWith('lab.')) category = 'LAB';
      else if (act.activityType.startsWith('task.')) category = 'TASK';
      else if (act.activityType.startsWith('medical.')) category = 'MEDICAL';
      else if (act.activityType.startsWith('evaluation.')) category = 'EVALUATION';

      items.push({
        id: act.id,
        category,
        title: act.title,
        description: act.summary || act.title,
        resourceId: act.resourceId ?? undefined,
        occurredAt: act.occurredAt,
      });
    }

    return {
      items,
      accessibleResourceIds: Array.from(new Set(accessibleResourceIds)),
    };
  }

  /**
   * Builds strict causal timeline context for Explain / Why.
   */
  async buildTimelineExplainContext(
    user: AuthenticatedUser,
    eventId: string,
    params: { activityId?: string; resourceId?: string }
  ): Promise<PermittedTimelineExplainContext> {
    const db = this.databaseService.client;
    const accessibleResourceIds: string[] = [];

    const canRead = await this.activityService.createAccessReader(eventId, user);
    let targetActivityRow: typeof activityEvents.$inferSelect | null = null;
    if (params.activityId) {
      const [activity] = await db.select().from(activityEvents)
        .where(and(eq(activityEvents.id, params.activityId), eq(activityEvents.eventId, eventId))).limit(1);
      if (activity && await canRead(activity)) targetActivityRow = activity;
    } else if (params.resourceId) {
      const [visible] = await this.activityService.getActivityFeed({ eventId, resourceId: params.resourceId, limit: 1 }, user);
      if (visible) {
        const [activity] = await db.select().from(activityEvents)
          .where(and(eq(activityEvents.id, visible.id), eq(activityEvents.eventId, eventId))).limit(1);
        if (activity && await canRead(activity)) targetActivityRow = activity;
      }
    }

    if (!targetActivityRow) {
      throw new NotFoundException('Specified activity or resource timeline could not be resolved');
    }

    if (targetActivityRow.resourceId) accessibleResourceIds.push(targetActivityRow.resourceId);
    const causalChain: PermittedTimelineExplainContext['causalChain'] = [];
    const visited = new Set([targetActivityRow.id]);
    let currentCausalId = targetActivityRow.causationId;
    let step = 1;

    // Follow explicit activity causation backwards up to 5 steps
    while (currentCausalId && step <= 5 && !visited.has(currentCausalId)) {
      visited.add(currentCausalId);
      const [cause] = await db
        .select()
        .from(activityEvents)
        .where(and(eq(activityEvents.id, currentCausalId), eq(activityEvents.eventId, eventId)))
        .limit(1);

      if (!cause || !(await canRead(cause))) break;

      if (cause.resourceId) accessibleResourceIds.push(cause.resourceId);

      causalChain.push({
        step,
        id: cause.id,
        type: cause.activityType,
        title: cause.title,
        summary: cause.summary,
        occurredAt: cause.occurredAt.toISOString(),
        resourceId: cause.resourceId ?? undefined,
      });

      currentCausalId = cause.causationId;
      step++;
    }

    return {
      targetActivity: {
        id: targetActivityRow.id,
        activityType: targetActivityRow.activityType,
        title: targetActivityRow.title,
        summary: targetActivityRow.summary,
        occurredAt: targetActivityRow.occurredAt.toISOString(),
        causationId: causalChain[0]?.id ?? null,
        resourceId: targetActivityRow.resourceId,
      },
      causalChain,
      relatedActivities: [],
      accessibleResourceIds: Array.from(new Set(accessibleResourceIds)),
    };
  }
}

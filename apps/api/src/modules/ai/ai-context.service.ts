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
import { AuthorizationService } from '../authorization/authorization.service.js';

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
    private readonly authzService: AuthorizationService
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
          isNull(resourceRelationships.removedAt)
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
        accessibleResourceIds.push(otherId);
        // Find resource type
        const [res] = await db
          .select({ resourceType: resources.resourceType })
          .from(resources)
          .where(eq(resources.id, otherId))
          .limit(1);

        if (res?.resourceType === 'evidence') {
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

    // 5. Fetch bounded timeline events for this case
    const rawActivities = await db
      .select({
        id: activityEvents.id,
        activityType: activityEvents.activityType,
        title: activityEvents.title,
        summary: activityEvents.summary,
        occurredAt: activityEvents.occurredAt,
        resourceId: activityEvents.resourceId,
      })
      .from(activityEvents)
      .where(eq(activityEvents.resourceId, caseId))
      .orderBy(desc(activityEvents.occurredAt))
      .limit(15);

    const timelineHighlights: PermittedCaseContext['timelineHighlights'] = [];
    for (const act of rawActivities) {
      timelineHighlights.push({
        id: act.id,
        activityType: act.activityType,
        title: act.title,
        summary: act.summary || '',
        occurredAt: act.occurredAt.toISOString(),
      });
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

    const rawActivities = await db
      .select({
        id: activityEvents.id,
        activityType: activityEvents.activityType,
        title: activityEvents.title,
        summary: activityEvents.summary,
        resourceId: activityEvents.resourceId,
        occurredAt: activityEvents.occurredAt,
      })
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.eventId, eventId),
          gte(activityEvents.occurredAt, threshold)
        )
      )
      .orderBy(desc(activityEvents.occurredAt))
      .limit(30);

    const items: PermittedOperationalItem[] = [];
    const accessibleResourceIds: string[] = [];

    for (const act of rawActivities) {
      // Evaluation Quarantine: NEVER expose evaluation activity unless user has explicit EVALUATION_READ
      if (act.activityType.startsWith('evaluation.')) {
        const canReadEval = await this.authzService.authorize({
          user,
          permission: Permissions.EVALUATION_READ,
          context: { eventId },
        });
        if (!canReadEval) continue;
      }

      // Medical Confidentiality: NEVER expose clinical/encounter activity unless user has MEDICAL_READ and resource access
      if (act.activityType.startsWith('medical.')) {
        const canReadMed = await this.authzService.authorize({
          user,
          permission: Permissions.MEDICAL_READ,
          context: { eventId },
        });
        if (!canReadMed) continue;
        if (act.resourceId) {
          const canAccess = await this.resourceAccessService.canAccessResource(
            user,
            act.resourceId,
            Permissions.MEDICAL_READ
          );
          if (!canAccess) continue;
        }
      }

      // Task Confidentiality: verify TASK_READ and resource access
      if (act.activityType.startsWith('task.')) {
        const canReadTask = await this.authzService.authorize({
          user,
          permission: Permissions.TASK_READ,
          context: { eventId },
        });
        if (!canReadTask) continue;
        if (act.resourceId) {
          const canAccess = await this.resourceAccessService.canAccessResource(
            user,
            act.resourceId,
            Permissions.TASK_READ
          );
          if (!canAccess) continue;
        }
      }

      if (act.resourceId && !act.activityType.startsWith('medical.') && !act.activityType.startsWith('task.')) {
        const canAccess = await this.resourceAccessService.canAccessResource(
          user,
          act.resourceId,
          Permissions.REGISTRY_READ
        );
        if (!canAccess) {
          continue;
        }
        accessibleResourceIds.push(act.resourceId);
      } else if (act.resourceId) {
        accessibleResourceIds.push(act.resourceId);
      }

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
        occurredAt: act.occurredAt.toISOString(),
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

    let targetActivityRow: typeof activityEvents.$inferSelect | null = null;

    if (params.activityId) {
      const [act] = await db
        .select()
        .from(activityEvents)
        .where(
          and(
            eq(activityEvents.id, params.activityId),
            eq(activityEvents.eventId, eventId)
          )
        )
        .limit(1);

      if (act) {
        targetActivityRow = act;

        // Verify domain permissions for specialized activity types
        if (act.activityType.startsWith('evaluation.')) {
          await this.authzService.assertAuthorized({
            user,
            permission: Permissions.EVALUATION_READ,
            context: { eventId },
          });
        }
        if (act.activityType.startsWith('medical.')) {
          await this.authzService.assertAuthorized({
            user,
            permission: Permissions.MEDICAL_READ,
            context: { eventId },
          });
          if (act.resourceId) {
            await this.resourceAccessService.assertCanAccessResource(
              user,
              act.resourceId,
              Permissions.MEDICAL_READ
            );
          }
        }
        if (act.activityType.startsWith('task.')) {
          await this.authzService.assertAuthorized({
            user,
            permission: Permissions.TASK_READ,
            context: { eventId },
          });
          if (act.resourceId) {
            await this.resourceAccessService.assertCanAccessResource(
              user,
              act.resourceId,
              Permissions.TASK_READ
            );
          }
        }

        if (act.resourceId) {
          accessibleResourceIds.push(act.resourceId);
        }
      }
    } else if (params.resourceId) {
      await this.resourceAccessService.assertCanAccessResource(
        user,
        params.resourceId,
        Permissions.REGISTRY_READ
      );
      accessibleResourceIds.push(params.resourceId);

      const [latest] = await db
        .select()
        .from(activityEvents)
        .where(
          and(
            eq(activityEvents.eventId, eventId),
            eq(activityEvents.resourceId, params.resourceId)
          )
        )
        .orderBy(desc(activityEvents.occurredAt))
        .limit(1);

      if (latest) {
        targetActivityRow = latest;
      }
    }

    if (!targetActivityRow) {
      throw new NotFoundException('Specified activity or resource timeline could not be resolved');
    }

    const causalChain: PermittedTimelineExplainContext['causalChain'] = [];
    let currentCausalId = targetActivityRow.causationId;
    let step = 1;

    // Follow explicit activity causation backwards up to 5 steps
    while (currentCausalId && step <= 5) {
      const [cause] = await db
        .select()
        .from(activityEvents)
        .where(eq(activityEvents.id, currentCausalId))
        .limit(1);

      if (!cause) break;

      if (cause.resourceId) {
        const canAccess = await this.resourceAccessService.canAccessResource(
          user,
          cause.resourceId,
          Permissions.REGISTRY_READ
        );
        if (!canAccess) {
          // Break chain immediately if user cannot access parent resource
          break;
        }
        accessibleResourceIds.push(cause.resourceId);
      }

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
        causationId: targetActivityRow.causationId,
        resourceId: targetActivityRow.resourceId,
      },
      causalChain,
      relatedActivities: [],
      accessibleResourceIds: Array.from(new Set(accessibleResourceIds)),
    };
  }
}

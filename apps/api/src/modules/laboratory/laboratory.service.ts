import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { eq, desc, inArray } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { ResourceService } from '../resources/resource.service.js';
import { ResourceAccessService } from '../resources/resource-access.service.js';
import { IdentifierAllocatorService } from '../resources/identifier-allocator.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ActivityService } from '../resources/activity.service.js';
import { SearchIndexerService } from '../search/search-indexer.service.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import {
  labAnalyses,
  labAnalysisEvidence,
  resources,
  type ResourceVisibilityValue,
  type LabAnalysisStatusValue,
} from '@cyris/db';
import { generateId, Permissions } from '@cyris/shared';
import type {
  CreateLabAnalysisRequest,
  UpdateLabAnalysisRequest,
  LabAnalysisResponse,
} from '@cyris/contracts';

const VALID_TRANSITIONS: Record<LabAnalysisStatusValue, LabAnalysisStatusValue[]> = {
  REQUESTED: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['APPROVED', 'IN_PROGRESS'],
  APPROVED: [],
  REJECTED: [],
  CANCELLED: [],
};

@Injectable()
export class LaboratoryService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly resourceService: ResourceService,
    private readonly resourceAccessService: ResourceAccessService,
    private readonly identifierAllocatorService: IdentifierAllocatorService,
    private readonly auditService: AuditService,
    private readonly activityService: ActivityService,
    private readonly searchIndexerService: SearchIndexerService
  ) {}

  private get db() {
    return this.databaseService.client;
  }

  async listAnalyses(eventId: string, user: AuthenticatedUser): Promise<LabAnalysisResponse[]> {
    const rows = await this.db
      .select({ analysis: labAnalyses, resource: resources })
      .from(labAnalyses)
      .innerJoin(resources, eq(labAnalyses.id, resources.id))
      .where(eq(resources.eventId, eventId))
      .orderBy(desc(labAnalyses.createdAt));

    const accessible: LabAnalysisResponse[] = [];
    for (const r of rows) {
      if (await this.resourceAccessService.canAccessResource(user, r.analysis.id, Permissions.LAB_READ)) {
        const evidenceLinks = await this.db
          .select({ evidenceId: labAnalysisEvidence.evidenceId })
          .from(labAnalysisEvidence)
          .where(eq(labAnalysisEvidence.analysisId, r.analysis.id));

        accessible.push({
          id: r.analysis.id,
          eventId: r.resource.eventId,
          analysisNumber: r.analysis.analysisNumber,
          status: r.analysis.status,
          requestedByUserId: r.analysis.requestedByUserId,
          requestedFromUnitId: r.analysis.requestedFromUnitId,
          assignedToUserId: r.analysis.assignedToUserId,
          assignedUnitId: r.analysis.assignedUnitId,
          requestedAt: r.analysis.requestedAt.toISOString(),
          acceptedAt: r.analysis.acceptedAt ? r.analysis.acceptedAt.toISOString() : null,
          startedAt: r.analysis.startedAt ? r.analysis.startedAt.toISOString() : null,
          completedAt: r.analysis.completedAt ? r.analysis.completedAt.toISOString() : null,
          approvedAt: r.analysis.approvedAt ? r.analysis.approvedAt.toISOString() : null,
          analysisType: r.analysis.analysisType,
          purpose: r.analysis.purpose,
          method: r.analysis.method,
          findings: r.analysis.findings,
          conclusion: r.analysis.conclusion,
          visibility: r.resource.visibility,
          createdAt: r.analysis.createdAt.toISOString(),
          updatedAt: r.analysis.updatedAt.toISOString(),
          evidenceIds: evidenceLinks.map((l) => l.evidenceId),
        });
      }
    }

    return accessible;
  }

  async getAnalysis(
    eventId: string,
    analysisId: string,
    user: AuthenticatedUser
  ): Promise<LabAnalysisResponse> {
    await this.resourceAccessService.assertCanAccessResource(user, analysisId, Permissions.LAB_READ);

    const [row] = await this.db
      .select({ analysis: labAnalyses, resource: resources })
      .from(labAnalyses)
      .innerJoin(resources, eq(labAnalyses.id, resources.id))
      .where(eq(labAnalyses.id, analysisId))
      .limit(1);

    if (!row || row.resource.eventId !== eventId) {
      throw new NotFoundException(`Laboratory analysis '${analysisId}' not found`);
    }

    const evidenceLinks = await this.db
      .select({ evidenceId: labAnalysisEvidence.evidenceId })
      .from(labAnalysisEvidence)
      .where(eq(labAnalysisEvidence.analysisId, analysisId));

    return {
      id: row.analysis.id,
      eventId: row.resource.eventId,
      analysisNumber: row.analysis.analysisNumber,
      status: row.analysis.status,
      requestedByUserId: row.analysis.requestedByUserId,
      requestedFromUnitId: row.analysis.requestedFromUnitId,
      assignedToUserId: row.analysis.assignedToUserId,
      assignedUnitId: row.analysis.assignedUnitId,
      requestedAt: row.analysis.requestedAt.toISOString(),
      acceptedAt: row.analysis.acceptedAt ? row.analysis.acceptedAt.toISOString() : null,
      startedAt: row.analysis.startedAt ? row.analysis.startedAt.toISOString() : null,
      completedAt: row.analysis.completedAt ? row.analysis.completedAt.toISOString() : null,
      approvedAt: row.analysis.approvedAt ? row.analysis.approvedAt.toISOString() : null,
      analysisType: row.analysis.analysisType,
      purpose: row.analysis.purpose,
      method: row.analysis.method,
      findings: row.analysis.findings,
      conclusion: row.analysis.conclusion,
      visibility: row.resource.visibility,
      createdAt: row.analysis.createdAt.toISOString(),
      updatedAt: row.analysis.updatedAt.toISOString(),
      evidenceIds: evidenceLinks.map((l) => l.evidenceId),
    };
  }

  async createAnalysis(
    eventId: string,
    data: CreateLabAnalysisRequest,
    user: AuthenticatedUser
  ): Promise<LabAnalysisResponse> {
    // 1. Verify access to all evidence items
    for (const evId of data.evidenceIds) {
      await this.resourceAccessService.assertCanAccessResource(user, evId, Permissions.EVIDENCE_READ);
    }

    const analysisId = generateId();

    return this.db.transaction(async (tx) => {
      // 2. Allocate sequential identifier (e.g. LAB-0001)
      const analysisNumber = await this.identifierAllocatorService.allocate(
        eventId,
        'LAB',
        'LAB',
        tx
      );

      // 3. Register base resource
      await this.resourceService.registerResource(eventId, 'lab_analysis', {
        id: analysisId,
        visibility: data.visibility as ResourceVisibilityValue,
        owningUnitId: data.requestedFromUnitId,
        ownerUserId: user.id,
        txClient: tx,
      });

      // 4. Create lab analysis domain record
      const [created] = await tx
        .insert(labAnalyses)
        .values({
          id: analysisId,
          analysisNumber,
          status: 'REQUESTED',
          requestedByUserId: user.id,
          requestedFromUnitId: data.requestedFromUnitId ?? null,
          analysisType: data.analysisType,
          purpose: data.purpose ?? null,
          method: data.method ?? null,
        })
        .returning();

      // 5. Link evidence items
      for (const evId of data.evidenceIds) {
        await tx.insert(labAnalysisEvidence).values({
          analysisId,
          evidenceId: evId,
        });
      }

      // 6. Audit
      await this.auditService.record({
        action: 'lab.requested',
        category: 'laboratory',
        eventId,
        resourceType: 'lab_analysis',
        resourceId: analysisId,
        actorUserId: user.id,
        metadata: {
          analysisNumber,
          analysisType: data.analysisType,
          evidenceIds: data.evidenceIds,
        },
      });

      // 7. Activity
      await this.activityService.recordActivity(
        {
          eventId,
          resourceId: analysisId,
          activityType: 'lab.requested',
          actorUserId: user.id,
          title: `Requested lab analysis ${analysisNumber} (${data.analysisType})`,
          summary: data.purpose ?? undefined,
          causationId: data.causationId,
          relatedResourceIds: data.evidenceIds,
          visibility: data.visibility,
        },
        tx
      );

      // 8. Search outbox
      await this.searchIndexerService.emitSearchUpsert('lab_analysis', analysisId, tx);

      return {
        id: created!.id,
        eventId,
        analysisNumber: created!.analysisNumber,
        status: created!.status,
        requestedByUserId: created!.requestedByUserId,
        requestedFromUnitId: created!.requestedFromUnitId,
        assignedToUserId: created!.assignedToUserId,
        assignedUnitId: created!.assignedUnitId,
        requestedAt: created!.requestedAt.toISOString(),
        acceptedAt: null,
        startedAt: null,
        completedAt: null,
        approvedAt: null,
        analysisType: created!.analysisType,
        purpose: created!.purpose,
        method: created!.method,
        findings: created!.findings,
        conclusion: created!.conclusion,
        visibility: data.visibility || 'EVENT',
        createdAt: created!.createdAt.toISOString(),
        updatedAt: created!.updatedAt.toISOString(),
        evidenceIds: data.evidenceIds,
      };
    });
  }

  async updateAnalysis(
    eventId: string,
    analysisId: string,
    data: UpdateLabAnalysisRequest,
    user: AuthenticatedUser
  ): Promise<LabAnalysisResponse> {
    const existing = await this.getAnalysis(eventId, analysisId, user);
    const currentStatus = existing.status as LabAnalysisStatusValue;

    // Validate required permission based on status change or content update
    if (data.status && data.status !== currentStatus) {
      const allowed = VALID_TRANSITIONS[currentStatus];
      if (!allowed.includes(data.status as LabAnalysisStatusValue)) {
        throw new BadRequestException(
          `Invalid status transition from '${currentStatus}' to '${data.status}'`
        );
      }

      switch (data.status) {
        case 'ACCEPTED':
        case 'REJECTED':
          await this.resourceAccessService.assertCanAccessResource(user, analysisId, Permissions.LAB_ACCEPT);
          break;
        case 'IN_PROGRESS':
          await this.resourceAccessService.assertCanAccessResource(user, analysisId, Permissions.LAB_WORK);
          break;
        case 'COMPLETED':
          await this.resourceAccessService.assertCanAccessResource(user, analysisId, Permissions.LAB_COMPLETE);
          break;
        case 'APPROVED':
          await this.resourceAccessService.assertCanAccessResource(user, analysisId, Permissions.LAB_APPROVE);
          break;
        default:
          await this.resourceAccessService.assertCanAccessResource(user, analysisId, Permissions.LAB_WORK);
      }
    } else {
      await this.resourceAccessService.assertCanAccessResource(user, analysisId, Permissions.LAB_WORK);
    }

    const now = new Date();
    const updatePayload: Record<string, unknown> = { updatedAt: now };

    if (data.assignedToUserId !== undefined) updatePayload.assignedToUserId = data.assignedToUserId;
    if (data.assignedUnitId !== undefined) updatePayload.assignedUnitId = data.assignedUnitId;
    if (data.method !== undefined) updatePayload.method = data.method;
    if (data.findings !== undefined) updatePayload.findings = data.findings;
    if (data.conclusion !== undefined) updatePayload.conclusion = data.conclusion;

    if (data.status && data.status !== currentStatus) {
      updatePayload.status = data.status;
      if (data.status === 'ACCEPTED') updatePayload.acceptedAt = now;
      if (data.status === 'IN_PROGRESS' && !existing.startedAt) updatePayload.startedAt = now;
      if (data.status === 'COMPLETED') updatePayload.completedAt = now;
      if (data.status === 'APPROVED') updatePayload.approvedAt = now;
    }

    const [updated] = await this.db
      .update(labAnalyses)
      .set(updatePayload)
      .where(eq(labAnalyses.id, analysisId))
      .returning();

    // Audit
    const auditAction = data.status && data.status !== currentStatus
      ? data.status === 'COMPLETED'
        ? 'lab.completed'
        : data.status === 'APPROVED'
          ? 'lab.approved'
          : 'lab.status.changed'
      : 'lab.updated';

    await this.auditService.record({
      action: auditAction,
      category: 'laboratory',
      eventId,
      resourceType: 'lab_analysis',
      resourceId: analysisId,
      actorUserId: user.id,
      metadata: {
        analysisNumber: updated!.analysisNumber,
        previousStatus: currentStatus,
        newStatus: data.status,
      },
    });

    // Activity
    if (data.status && data.status !== currentStatus) {
      let activityType = 'lab.status_changed';
      let title = `Lab analysis ${updated!.analysisNumber} status changed to ${data.status}`;

      if (data.status === 'ACCEPTED') {
        activityType = 'lab.accepted';
        title = `Lab analysis ${updated!.analysisNumber} accepted`;
      } else if (data.status === 'IN_PROGRESS') {
        activityType = 'lab.started';
        title = `Work started on lab analysis ${updated!.analysisNumber}`;
      } else if (data.status === 'COMPLETED') {
        activityType = 'lab.completed';
        title = `Lab analysis ${updated!.analysisNumber} completed: ${data.conclusion ?? 'Findings documented'}`;
      } else if (data.status === 'APPROVED') {
        activityType = 'lab.approved';
        title = `Lab analysis ${updated!.analysisNumber} approved`;
      } else if (data.status === 'REJECTED') {
        activityType = 'lab.rejected';
        title = `Lab analysis ${updated!.analysisNumber} rejected`;
      }

      await this.activityService.recordActivity({
        eventId,
        resourceId: analysisId,
        activityType,
        actorUserId: user.id,
        title,
        summary: data.conclusion ?? data.notes ?? undefined,
        causationId: data.causationId,
        relatedResourceIds: existing.evidenceIds,
        metadata: { from: currentStatus, to: data.status },
      });
    }

    // Search outbox
    await this.searchIndexerService.emitSearchUpsert('lab_analysis', analysisId);

    return {
      ...existing,
      ...updated!,
      requestedAt: updated!.requestedAt.toISOString(),
      acceptedAt: updated!.acceptedAt ? updated!.acceptedAt.toISOString() : null,
      startedAt: updated!.startedAt ? updated!.startedAt.toISOString() : null,
      completedAt: updated!.completedAt ? updated!.completedAt.toISOString() : null,
      approvedAt: updated!.approvedAt ? updated!.approvedAt.toISOString() : null,
      createdAt: updated!.createdAt.toISOString(),
      updatedAt: updated!.updatedAt.toISOString(),
    };
  }
}

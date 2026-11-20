import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { eq, desc, and, inArray, isNull } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { ResourceService } from '../resources/resource.service.js';
import { ResourceAccessService } from '../resources/resource-access.service.js';
import { ResourceAssignmentService } from '../resources/resource-assignment.service.js';
import { IdentifierAllocatorService } from '../resources/identifier-allocator.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ActivityService } from '../resources/activity.service.js';
import { SearchIndexerService } from '../search/search-indexer.service.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import {
  incidents,
  cases,
  resources,
  resourceRelationships,
  evidence,
  operationalTasks,
  persons,
  organisations,
  locations,
  vehicles,
  devices,
  type ResourceVisibilityValue,
} from '@cyris/db';
import { generateId, Permissions } from '@cyris/shared';
import type {
  CreateIncidentRequest,
  UpdateIncidentRequest,
  IncidentResponse,
  CreateCaseRequest,
  UpdateCaseRequest,
  CaseResponse,
  AssignResourceRequest,
  ResourceAssignmentItem,
} from '@cyris/contracts';
import { CASE_STATUS_TRANSITIONS, type CaseWorkspaceResponse } from '@cyris/contracts';

@Injectable()
export class InvestigationService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly resourceService: ResourceService,
    private readonly resourceAccessService: ResourceAccessService,
    private readonly resourceAssignmentService: ResourceAssignmentService,
    private readonly identifierAllocatorService: IdentifierAllocatorService,
    private readonly auditService: AuditService,
    private readonly activityService: ActivityService,
    private readonly searchIndexerService: SearchIndexerService
  ) {}

  private get db() {
    return this.databaseService.client;
  }

  // ============================================================================
  // Incidents
  // ============================================================================

  async listIncidents(eventId: string, user: AuthenticatedUser): Promise<IncidentResponse[]> {
    const rows = await this.db
      .select({ inc: incidents, resource: resources })
      .from(incidents)
      .innerJoin(resources, eq(incidents.id, resources.id))
      .where(eq(resources.eventId, eventId))
      .orderBy(desc(incidents.createdAt));

    const accessible: IncidentResponse[] = [];
    for (const r of rows) {
      if (await this.resourceAccessService.canAccessResource(user, r.inc.id, Permissions.INCIDENT_READ)) {
        accessible.push({
          id: r.inc.id,
          eventId: r.resource.eventId,
          incidentNumber: r.inc.incidentNumber,
          title: r.inc.title,
          description: r.inc.description,
          status: r.inc.status,
          priority: r.inc.priority,
          occurredAt: r.inc.occurredAt ? r.inc.occurredAt.toISOString() : null,
          detectedAt: r.inc.detectedAt ? r.inc.detectedAt.toISOString() : null,
          owningUnitId: r.inc.owningUnitId,
          leadUserId: r.inc.leadUserId,
          closedAt: r.inc.closedAt ? r.inc.closedAt.toISOString() : null,
          visibility: r.resource.visibility,
          createdAt: r.inc.createdAt.toISOString(),
          updatedAt: r.inc.updatedAt.toISOString(),
        });
      }
    }
    return accessible;
  }

  async createIncident(
    eventId: string,
    data: CreateIncidentRequest,
    user: AuthenticatedUser
  ): Promise<IncidentResponse> {
    const incidentId = generateId();

    return this.db.transaction(async (tx) => {
      // 1. Allocate sequential identifier (e.g. INC-0001)
      const incidentNumber = await this.identifierAllocatorService.allocate(
        eventId,
        'INC',
        'INC',
        tx
      );

      // 2. Create base resource
      await this.resourceService.registerResource(eventId, 'incident', {
        id: incidentId,
        visibility: data.visibility as ResourceVisibilityValue,
        owningUnitId: data.owningUnitId,
        ownerUserId: user.id,
        txClient: tx,
      });

      // 3. Create incident domain row with identical ID
      const [created] = await tx
        .insert(incidents)
        .values({
          id: incidentId,
          incidentNumber,
          title: data.title,
          description: data.description ?? null,
          status: data.status,
          priority: data.priority,
          occurredAt: data.occurredAt ? new Date(data.occurredAt) : null,
          detectedAt: data.detectedAt ? new Date(data.detectedAt) : null,
          owningUnitId: data.owningUnitId ?? null,
          leadUserId: data.leadUserId ?? null,
        })
        .returning();

      // 4. Audit
      await this.auditService.record({
        action: 'incident.created',
        category: 'incident',
        eventId,
        resourceType: 'incident',
        resourceId: incidentId,
        actorUserId: user.id,
        metadata: { incidentNumber, title: data.title, priority: data.priority },
      });

      // 5. Activity
      await this.activityService.recordActivity(
        {
          eventId,
          resourceId: incidentId,
          activityType: 'incident.created',
          actorUserId: user.id,
          title: `Created incident ${incidentNumber}: ${data.title}`,
          summary: data.description ?? undefined,
          visibility: data.visibility,
        },
        tx
      );

      // 6. Search outbox
      await this.searchIndexerService.emitSearchUpsert('incident', incidentId, tx);

      return {
        id: created!.id,
        eventId,
        incidentNumber: created!.incidentNumber,
        title: created!.title,
        description: created!.description,
        status: created!.status,
        priority: created!.priority,
        occurredAt: created!.occurredAt ? created!.occurredAt.toISOString() : null,
        detectedAt: created!.detectedAt ? created!.detectedAt.toISOString() : null,
        owningUnitId: created!.owningUnitId,
        leadUserId: created!.leadUserId,
        closedAt: created!.closedAt ? created!.closedAt.toISOString() : null,
        visibility: data.visibility || 'EVENT',
        createdAt: created!.createdAt.toISOString(),
        updatedAt: created!.updatedAt.toISOString(),
      };
    });
  }

  async getIncident(
    eventId: string,
    incidentId: string,
    user: AuthenticatedUser
  ): Promise<IncidentResponse> {
    await this.resourceAccessService.assertCanAccessResource(user, incidentId, Permissions.INCIDENT_READ);

    const [row] = await this.db
      .select({ inc: incidents, resource: resources })
      .from(incidents)
      .innerJoin(resources, eq(incidents.id, resources.id))
      .where(eq(incidents.id, incidentId))
      .limit(1);

    if (!row || row.resource.eventId !== eventId) {
      throw new NotFoundException(`Incident '${incidentId}' not found`);
    }

    return {
      id: row.inc.id,
      eventId: row.resource.eventId,
      incidentNumber: row.inc.incidentNumber,
      title: row.inc.title,
      description: row.inc.description,
      status: row.inc.status,
      priority: row.inc.priority,
      occurredAt: row.inc.occurredAt ? row.inc.occurredAt.toISOString() : null,
      detectedAt: row.inc.detectedAt ? row.inc.detectedAt.toISOString() : null,
      owningUnitId: row.inc.owningUnitId,
      leadUserId: row.inc.leadUserId,
      closedAt: row.inc.closedAt ? row.inc.closedAt.toISOString() : null,
      visibility: row.resource.visibility,
      createdAt: row.inc.createdAt.toISOString(),
      updatedAt: row.inc.updatedAt.toISOString(),
    };
  }

  async updateIncident(
    eventId: string,
    incidentId: string,
    data: UpdateIncidentRequest,
    user: AuthenticatedUser
  ): Promise<IncidentResponse> {
    await this.resourceAccessService.assertCanAccessResource(user, incidentId, Permissions.INCIDENT_UPDATE);

    const existing = await this.getIncident(eventId, incidentId, user);

    const updatePayload: Record<string, unknown> = { updatedAt: new Date() };
    if (data.title !== undefined) updatePayload.title = data.title;
    if (data.description !== undefined) updatePayload.description = data.description;
    if (data.status !== undefined) updatePayload.status = data.status;
    if (data.priority !== undefined) updatePayload.priority = data.priority;
    if (data.owningUnitId !== undefined) updatePayload.owningUnitId = data.owningUnitId;
    if (data.leadUserId !== undefined) updatePayload.leadUserId = data.leadUserId;
    if (data.closedAt !== undefined) {
      updatePayload.closedAt = data.closedAt ? new Date(data.closedAt) : null;
    }

    const [updated] = await this.db
      .update(incidents)
      .set(updatePayload)
      .where(eq(incidents.id, incidentId))
      .returning();

    // Audit
    await this.auditService.record({
      action: 'incident.updated',
      category: 'incident',
      eventId,
      resourceType: 'incident',
      resourceId: incidentId,
      actorUserId: user.id,
      metadata: { incidentNumber: updated!.incidentNumber, status: updated!.status },
    });

    // If status changed, emit explicit activity
    if (data.status && data.status !== existing.status) {
      await this.activityService.recordActivity({
        eventId,
        resourceId: incidentId,
        activityType: 'incident.status_changed',
        actorUserId: user.id,
        title: `Incident ${updated!.incidentNumber} transitioned to ${data.status}`,
        metadata: { from: existing.status, to: data.status },
      });
    }

    await this.searchIndexerService.emitSearchUpsert('incident', incidentId);

    return {
      ...existing,
      ...updated!,
      occurredAt: updated!.occurredAt ? updated!.occurredAt.toISOString() : null,
      detectedAt: updated!.detectedAt ? updated!.detectedAt.toISOString() : null,
      closedAt: updated!.closedAt ? updated!.closedAt.toISOString() : null,
      createdAt: updated!.createdAt.toISOString(),
      updatedAt: updated!.updatedAt.toISOString(),
    };
  }

  async assignIncident(
    eventId: string,
    incidentId: string,
    data: AssignResourceRequest,
    user: AuthenticatedUser
  ): Promise<ResourceAssignmentItem> {
    await this.resourceAccessService.assertCanAccessResource(user, incidentId, Permissions.INCIDENT_ASSIGN);
    return this.resourceAssignmentService.assignResource(
      eventId,
      incidentId,
      data,
      user.id,
      { activityType: 'incident.assigned', activityTitle: 'Incident assigned' }
    );
  }

  // ============================================================================
  // Cases
  // ============================================================================

  async listCases(eventId: string, user: AuthenticatedUser): Promise<CaseResponse[]> {
    const rows = await this.db
      .select({ cs: cases, resource: resources })
      .from(cases)
      .innerJoin(resources, eq(cases.id, resources.id))
      .where(eq(resources.eventId, eventId))
      .orderBy(desc(cases.createdAt));

    const accessible: CaseResponse[] = [];
    for (const r of rows) {
      if (await this.resourceAccessService.canAccessResource(user, r.cs.id, Permissions.CASE_READ)) {
        accessible.push({
          id: r.cs.id,
          eventId: r.resource.eventId,
          caseNumber: r.cs.caseNumber,
          title: r.cs.title,
          summary: r.cs.summary,
          status: r.cs.status,
          priority: r.cs.priority,
          owningUnitId: r.cs.owningUnitId,
          leadUserId: r.cs.leadUserId,
          openedAt: r.cs.openedAt.toISOString(),
          closedAt: r.cs.closedAt ? r.cs.closedAt.toISOString() : null,
          visibility: r.resource.visibility,
          createdAt: r.cs.createdAt.toISOString(),
          updatedAt: r.cs.updatedAt.toISOString(),
        });
      }
    }
    return accessible;
  }

  async createCase(
    eventId: string,
    data: CreateCaseRequest,
    user: AuthenticatedUser
  ): Promise<CaseResponse> {
    const caseId = generateId();

    return this.db.transaction(async (tx) => {
      // 1. Allocate caseNumber (e.g. CASE-0001)
      const caseNumber = await this.identifierAllocatorService.allocate(eventId, 'CASE', 'CASE', tx);

      // 2. Create base resource
      await this.resourceService.registerResource(eventId, 'case', {
        id: caseId,
        visibility: data.visibility as ResourceVisibilityValue,
        owningUnitId: data.owningUnitId,
        ownerUserId: user.id,
        txClient: tx,
      });

      // 3. Create case domain row with identical ID
      const [created] = await tx
        .insert(cases)
        .values({
          id: caseId,
          caseNumber,
          title: data.title,
          summary: data.summary ?? null,
          status: data.status,
          priority: data.priority,
          owningUnitId: data.owningUnitId ?? null,
          leadUserId: data.leadUserId ?? null,
          openedAt: data.openedAt ? new Date(data.openedAt) : new Date(),
        })
        .returning();

      // 4. Audit
      await this.auditService.record({
        action: 'case.created',
        category: 'case',
        eventId,
        resourceType: 'case',
        resourceId: caseId,
        actorUserId: user.id,
        metadata: { caseNumber, title: data.title, priority: data.priority },
      });

      // 5. Activity
      await this.activityService.recordActivity(
        {
          eventId,
          resourceId: caseId,
          activityType: 'case.created',
          actorUserId: user.id,
          title: `Opened Case ${caseNumber}: ${data.title}`,
          summary: data.summary ?? undefined,
          visibility: data.visibility,
        },
        tx
      );

      // 6. Search outbox
      await this.searchIndexerService.emitSearchUpsert('case', caseId, tx);

      return {
        id: created!.id,
        eventId,
        caseNumber: created!.caseNumber,
        title: created!.title,
        summary: created!.summary,
        status: created!.status,
        priority: created!.priority,
        owningUnitId: created!.owningUnitId,
        leadUserId: created!.leadUserId,
        openedAt: created!.openedAt.toISOString(),
        closedAt: created!.closedAt ? created!.closedAt.toISOString() : null,
        visibility: data.visibility || 'EVENT',
        createdAt: created!.createdAt.toISOString(),
        updatedAt: created!.updatedAt.toISOString(),
      };
    });
  }

  async getCase(eventId: string, caseId: string, user: AuthenticatedUser): Promise<CaseResponse> {
    await this.resourceAccessService.assertCanAccessResource(user, caseId, Permissions.CASE_READ);

    const [row] = await this.db
      .select({ cs: cases, resource: resources })
      .from(cases)
      .innerJoin(resources, eq(cases.id, resources.id))
      .where(eq(cases.id, caseId))
      .limit(1);

    if (!row || row.resource.eventId !== eventId) {
      throw new NotFoundException(`Case '${caseId}' not found`);
    }

    return {
      id: row.cs.id,
      eventId: row.resource.eventId,
      caseNumber: row.cs.caseNumber,
      title: row.cs.title,
      summary: row.cs.summary,
      status: row.cs.status,
      priority: row.cs.priority,
      owningUnitId: row.cs.owningUnitId,
      leadUserId: row.cs.leadUserId,
      openedAt: row.cs.openedAt.toISOString(),
      closedAt: row.cs.closedAt ? row.cs.closedAt.toISOString() : null,
      visibility: row.resource.visibility,
      createdAt: row.cs.createdAt.toISOString(),
      updatedAt: row.cs.updatedAt.toISOString(),
    };
  }

  async getCaseWorkspace(
      eventId: string,
      caseId: string,
      user: AuthenticatedUser
    ): Promise<CaseWorkspaceResponse> {
      const caseData = await this.getCase(eventId, caseId, user);
      const relationships = await this.db
        .select()
        .from(resourceRelationships)
        .where(
          and(
            eq(resourceRelationships.eventId, eventId),
            isNull(resourceRelationships.removedAt),
            eq(resourceRelationships.sourceResourceId, caseId)
          )
        )
        .limit(100);

      const relatedIds = relationships.map((relationship) => relationship.targetResourceId);
      const visibleRelationships: typeof relationships = [];
      for (const relationship of relationships) {
        if (
          await this.resourceAccessService.canAccessResource(
            user,
            relationship.targetResourceId,
            Permissions.EVENT_READ
          )
        ) {
          visibleRelationships.push(relationship);
        }
      }

      const ids = visibleRelationships.map((relationship) => relationship.targetResourceId);
      const relatedResources = ids.length
        ? await this.db.select().from(resources).where(inArray(resources.id, ids))
        : [];
      const resourceById = new Map(relatedResources.map((resource) => [resource.id, resource]));
      const typeIds = (type: string) =>
        visibleRelationships
          .filter((relationship) => resourceById.get(relationship.targetResourceId)?.resourceType === type)
          .map((relationship) => relationship.targetResourceId);

      const [incidentRows, evidenceRows, personRows, organisationRows, locationRows, vehicleRows, deviceRows, taskRows] =
        await Promise.all([
          this.db.select().from(incidents).where(inArray(incidents.id, typeIds('incident'))),
          this.db.select().from(evidence).where(inArray(evidence.id, typeIds('evidence'))),
          this.db.select().from(persons).where(inArray(persons.id, typeIds('person'))),
          this.db.select().from(organisations).where(inArray(organisations.id, typeIds('organisation'))),
          this.db.select().from(locations).where(inArray(locations.id, typeIds('location'))),
          this.db.select().from(vehicles).where(inArray(vehicles.id, typeIds('vehicle'))),
          this.db.select().from(devices).where(inArray(devices.id, typeIds('device'))),
          this.db.select().from(operationalTasks).where(eq(operationalTasks.sourceResourceId, caseId)).limit(100),
        ]);

      const entities = [
        ...personRows.map((row) => ({ id: row.id, resourceType: 'person', title: row.displayName })),
        ...organisationRows.map((row) => ({ id: row.id, resourceType: 'organisation', title: row.name })),
        ...locationRows.map((row) => ({ id: row.id, resourceType: 'location', title: row.name })),
        ...vehicleRows.map((row) => ({ id: row.id, resourceType: 'vehicle', title: row.label })),
        ...deviceRows.map((row) => ({ id: row.id, resourceType: 'device', title: row.label })),
      ];

      const recentActivity = await this.activityService.getActivityFeed({
        eventId,
        resourceId: caseId,
        limit: 25,
      }, user);

      return {
        case: caseData,
        allowedActions: {
          update: await this.resourceAccessService.canAccessResource(user, caseId, Permissions.CASE_UPDATE),
          assign: await this.resourceAccessService.canAccessResource(user, caseId, Permissions.CASE_ASSIGN),
          close: await this.resourceAccessService.canAccessResource(user, caseId, Permissions.CASE_CLOSE),
          createEvidence: await this.resourceAccessService.canAccessResource(user, caseId, Permissions.EVIDENCE_CREATE),
          createTask: await this.resourceAccessService.canAccessResource(user, caseId, Permissions.TASK_CREATE),
        },
        allowedTransitions: [...(CASE_STATUS_TRANSITIONS[caseData.status as keyof typeof CASE_STATUS_TRANSITIONS] ?? [])],
        related: {
          incidents: incidentRows.map((row) => ({
            id: row.id,
            incidentNumber: row.incidentNumber,
            title: row.title,
            status: row.status,
            priority: row.priority,
          })),
          evidence: evidenceRows.map((row) => ({
            id: row.id,
            evidenceNumber: row.evidenceNumber,
            title: row.title,
            evidenceType: row.evidenceType,
            status: row.status,
            currentHolderType: row.currentHolderType,
            currentHolderId: row.currentHolderId,
          })),
          entities,
          tasks: taskRows.map((row) => ({
            id: row.id,
            taskNumber: row.taskNumber,
            title: row.title,
            status: row.status,
            priority: row.priority,
            assignedUnitId: row.assignedUnitId,
            assignedUserId: row.assignedUserId,
            dueAt: row.dueAt?.toISOString() ?? null,
          })),
        },
        counts: {
          incidents: incidentRows.length,
          evidence: evidenceRows.length,
          entities: entities.length,
          tasks: taskRows.length,
        },
        recentActivity,
      };
    }

  async updateCase(
    eventId: string,
    caseId: string,
    data: UpdateCaseRequest,
    user: AuthenticatedUser
  ): Promise<CaseResponse> {
    await this.resourceAccessService.assertCanAccessResource(user, caseId, Permissions.CASE_UPDATE);

    const existing = await this.getCase(eventId, caseId, user);

    if (data.status && !CASE_STATUS_TRANSITIONS[existing.status as keyof typeof CASE_STATUS_TRANSITIONS]?.includes(data.status)) {
      throw new BadRequestException(`Case cannot transition from ${existing.status} to ${data.status}`);
    }

    const updatePayload: Record<string, unknown> = { updatedAt: new Date() };
    if (data.title !== undefined) updatePayload.title = data.title;
    if (data.summary !== undefined) updatePayload.summary = data.summary;
    if (data.status !== undefined) updatePayload.status = data.status;
    if (data.priority !== undefined) updatePayload.priority = data.priority;
    if (data.owningUnitId !== undefined) updatePayload.owningUnitId = data.owningUnitId;
    if (data.leadUserId !== undefined) updatePayload.leadUserId = data.leadUserId;
    if (data.closedAt !== undefined) {
      updatePayload.closedAt = data.closedAt ? new Date(data.closedAt) : null;
    } else if (data.status === 'CLOSED') {
      updatePayload.closedAt = new Date();
    } else if (data.status && existing.status === 'CLOSED') {
      updatePayload.closedAt = null;
    }

    const [updated] = await this.db
      .update(cases)
      .set(updatePayload)
      .where(eq(cases.id, caseId))
      .returning();

    // Audit
    await this.auditService.record({
      action: 'case.updated',
      category: 'case',
      eventId,
      resourceType: 'case',
      resourceId: caseId,
      actorUserId: user.id,
      metadata: { caseNumber: updated!.caseNumber, status: updated!.status },
    });

    // Activity on status change
    if (data.status && data.status !== existing.status) {
      await this.activityService.recordActivity({
        eventId,
        resourceId: caseId,
        activityType: 'case.status_changed',
        actorUserId: user.id,
        title: `Case ${updated!.caseNumber} transitioned to ${data.status}`,
        metadata: { from: existing.status, to: data.status },
      });
    }

    await this.searchIndexerService.emitSearchUpsert('case', caseId);

    return {
      ...existing,
      ...updated!,
      openedAt: updated!.openedAt.toISOString(),
      closedAt: updated!.closedAt ? updated!.closedAt.toISOString() : null,
      createdAt: updated!.createdAt.toISOString(),
      updatedAt: updated!.updatedAt.toISOString(),
    };
  }

  async assignCase(
    eventId: string,
    caseId: string,
    data: AssignResourceRequest,
    user: AuthenticatedUser
  ): Promise<ResourceAssignmentItem> {
    await this.resourceAccessService.assertCanAccessResource(user, caseId, Permissions.CASE_ASSIGN);
    return this.resourceAssignmentService.assignResource(
      eventId,
      caseId,
      data,
      user.id,
      { activityType: 'case.assigned', activityTitle: 'Case assigned' }
    );
  }

  async closeCase(
    eventId: string,
    caseId: string,
    reason?: string,
    user?: AuthenticatedUser
  ): Promise<CaseResponse> {
    if (user) {
      await this.resourceAccessService.assertCanAccessResource(user, caseId, Permissions.CASE_CLOSE);
    }

    const existing = await this.getCase(eventId, caseId, user!);

    const [updated] = await this.db
      .update(cases)
      .set({
        status: 'CLOSED',
        closedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(cases.id, caseId))
      .returning();

    await this.auditService.record({
      action: 'case.closed',
      category: 'case',
      eventId,
      resourceType: 'case',
      resourceId: caseId,
      actorUserId: user?.id,
      metadata: { reason },
    });

    await this.activityService.recordActivity({
      eventId,
      resourceId: caseId,
      activityType: 'case.status_changed',
      actorUserId: user?.id,
      title: `Case ${updated!.caseNumber} closed`,
      reason,
      metadata: { from: existing.status, to: 'CLOSED' },
    });

    await this.searchIndexerService.emitSearchUpsert('case', caseId);

    return {
      ...existing,
      ...updated!,
      openedAt: updated!.openedAt.toISOString(),
      closedAt: updated!.closedAt ? updated!.closedAt.toISOString() : null,
      createdAt: updated!.createdAt.toISOString(),
      updatedAt: updated!.updatedAt.toISOString(),
    };
  }
}

import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { eq, desc, inArray, and, ne, sql, isNull } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { ResourceService } from '../resources/resource.service.js';
import { ResourceAccessService } from '../resources/resource-access.service.js';
import { IdentifierAllocatorService } from '../resources/identifier-allocator.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ActivityService } from '../resources/activity.service.js';
import { SearchIndexerService } from '../search/search-indexer.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import {
  evidence,
  labAnalyses,
  labAnalysisEvidence,notifications,
  resources,
  organizationalUnits,
  unitCapabilities,
  eventMemberships,
  membershipUnitAssignments,
  resourceAssignments,
  users,
  MembershipStatus,
  UserStatus,
  type ResourceVisibilityValue,
  type LabAnalysisStatusValue,
} from '@cyris/db';
import { generateId, Permissions } from '@cyris/shared';
import type {
  CreateLabAnalysisRequest,
  UpdateLabAnalysisRequest,
  LabAnalysisResponse,
  LabAnalysisDetail,
  ReassignLabAnalysisRequest,
  CorrectLabAnalysisRequest,
} from '@cyris/contracts';
import { selectLowestWorkloadCandidate } from './laboratory-assignment.js';

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
    private readonly searchIndexerService: SearchIndexerService,
    private readonly notificationsService: NotificationsService,
    private readonly authorizationService: AuthorizationService
  ) {}

  private get db() {
    return this.databaseService.client;
  }

  async listEligibleWorkers(
    eventId: string,
    unitId: string,
    user: AuthenticatedUser
  ): Promise<Array<{ id: string; displayName: string }>> {
    await this.assertLaboratoryUnit(eventId, unitId);
    await this.authorizationService.assertAuthorized({
      user,
      permission: Permissions.LAB_REASSIGN,
      context: { eventId, unitId },
    });
    const members = await this.db
      .select({ id: users.id, displayName: users.displayName })
      .from(eventMemberships)
      .innerJoin(membershipUnitAssignments, eq(membershipUnitAssignments.membershipId, eventMemberships.id))
      .innerJoin(users, eq(users.id, eventMemberships.userId))
      .where(and(
        eq(eventMemberships.eventId, eventId),
        eq(eventMemberships.status, MembershipStatus.ACTIVE),
        eq(membershipUnitAssignments.unitId, unitId),
        eq(users.status, UserStatus.ACTIVE)
      ));
    const eligible: Array<{ id: string; displayName: string }> = [];
    for (const member of members) {
      if (await this.isEligibleLaboratoryWorker(eventId, unitId, member.id, member.displayName)) {
        eligible.push(member);
      }
    }
    return eligible.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  private async resolveLaboratoryUnit(
    eventId: string,
    requestedUnitId?: string | null
  ): Promise<{ unitId: string | null; ambiguous: boolean }> {
    if (requestedUnitId) {
      const [unit] = await this.db
        .select({ id: organizationalUnits.id, eventId: organizationalUnits.eventId })
        .from(organizationalUnits)
        .where(
          and(
            eq(organizationalUnits.id, requestedUnitId),
            eq(organizationalUnits.eventId, eventId),isNull(organizationalUnits.archivedAt)
          )
        )
        .limit(1);

      if (!unit) {
        throw new BadRequestException('The requested laboratory unit is not valid for this exercise');
      }
      const [capability] = await this.db
        .select({ unitId: unitCapabilities.unitId })
        .from(unitCapabilities)
        .where(and(
          eq(unitCapabilities.unitId, unit.id),
          eq(unitCapabilities.capabilityKey, 'chemical_analysis')
        ))
        .limit(1);
      if (!capability) {
        throw new BadRequestException('The requested unit is not enabled for laboratory work');
      }
      return { unitId: unit.id, ambiguous: false };
    }

    const candidates = await this.db
      .select({ unitId: unitCapabilities.unitId })
      .from(unitCapabilities)
      .innerJoin(
        organizationalUnits,
        eq(unitCapabilities.unitId, organizationalUnits.id)
      )
      .where(
        and(
          eq(organizationalUnits.eventId, eventId),isNull(organizationalUnits.archivedAt),
          eq(unitCapabilities.capabilityKey, 'chemical_analysis')
        )
      );

    if (candidates.length === 1) return { unitId: candidates[0]!.unitId, ambiguous: false };
    return { unitId: null, ambiguous: candidates.length > 1 };
  }

  private async assertLaboratoryUnit(eventId: string, unitId: string): Promise<void> {
    const [unit] = await this.db
      .select({ id: organizationalUnits.id })
      .from(organizationalUnits)
      .innerJoin(unitCapabilities, eq(unitCapabilities.unitId, organizationalUnits.id))
      .where(and(
        eq(organizationalUnits.id, unitId),
        eq(organizationalUnits.eventId, eventId),isNull(organizationalUnits.archivedAt),
        eq(unitCapabilities.capabilityKey, 'chemical_analysis')
      ))
      .limit(1);
    if (!unit) {
      throw new BadRequestException('The destination unit is not enabled for laboratory work in this exercise');
    }
  }

  private async assertEligibleLaboratoryWorker(
    eventId: string,
    unitId: string,
    userId: string
  ): Promise<void> {
    await this.assertLaboratoryUnit(eventId, unitId);
    const [targetUser] = await this.db
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!targetUser || targetUser.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('The laboratory worker is inactive or does not exist');
    }
    const [membership] = await this.db
      .select({ id: eventMemberships.id })
      .from(eventMemberships)
      .innerJoin(
        membershipUnitAssignments,
        eq(membershipUnitAssignments.membershipId, eventMemberships.id)
      )
      .where(and(
        eq(eventMemberships.eventId, eventId),
        eq(eventMemberships.userId, userId),
        eq(eventMemberships.status, MembershipStatus.ACTIVE),
        eq(membershipUnitAssignments.unitId, unitId)
      ))
      .limit(1);
    if (!membership) {
      throw new BadRequestException('The laboratory worker is not an active member of the destination unit');
    }
    if (!(await this.isEligibleLaboratoryWorker(eventId, unitId, userId))) {
      throw new BadRequestException('The destination user is not permitted to perform laboratory work');
    }
  }

  private async isEligibleLaboratoryWorker(
    eventId: string,
    unitId: string,
    userId: string,
    displayName = ''
  ): Promise<boolean> {
    const allowed = await this.authorizationService.hasEventCapability({
      user: {
        id: userId,
        email: '',
        displayName,
        status: 'ACTIVE',
      },
      permission: Permissions.LAB_WORK,
      eventId,
      unitId,
      resourceScopes: ['ASSIGNED'],
      requireUnitMembership: true,
    });
    return allowed;
  }

  async listLaboratoryUnits(eventId: string, user: AuthenticatedUser): Promise<Array<{ id: string; name: string }>> {
    const units = await this.db
      .select({ id: organizationalUnits.id, name: organizationalUnits.name })
      .from(organizationalUnits)
      .innerJoin(unitCapabilities, eq(unitCapabilities.unitId, organizationalUnits.id))
      .where(
        and(
          eq(organizationalUnits.eventId, eventId),isNull(organizationalUnits.archivedAt),
          eq(unitCapabilities.capabilityKey, 'chemical_analysis')
        )
      )
      .orderBy(organizationalUnits.name);
    const visible: Array<{ id: string; name: string }> = [];
    for (const unit of units) {
      const canRequest = await this.authorizationService.authorize({
        user, permission: Permissions.LAB_REQUEST, context: { eventId, unitId: unit.id },
      });
      const canReassign = await this.authorizationService.authorize({
        user, permission: Permissions.LAB_REASSIGN, context: { eventId, unitId: unit.id },
      });
      if (canRequest || canReassign) visible.push(unit);
    }
    return visible;
  }

  private async selectEligibleAnalyst(
    eventId: string,
    unitId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    txClient?: any
  ): Promise<string | null> {
    const db = txClient || this.db;
    const memberships = await db
      .select({
        membershipId: eventMemberships.id,
        userId: eventMemberships.userId,
      })
      .from(eventMemberships)
      .innerJoin(
        membershipUnitAssignments,
        eq(membershipUnitAssignments.membershipId, eventMemberships.id)
      )
      .innerJoin(users, eq(users.id, eventMemberships.userId))
      .where(
        and(
          eq(eventMemberships.eventId, eventId),
          eq(eventMemberships.status, MembershipStatus.ACTIVE),
          eq(users.status, UserStatus.ACTIVE),
          eq(membershipUnitAssignments.unitId, unitId)
        )
      );

    const eligible: Array<{ userId: string }> = [];
    for (const member of memberships) {
      const allowed = await this.isEligibleLaboratoryWorker(eventId, unitId, member.userId);
      if (allowed) eligible.push({ userId: member.userId });
    }

    if (eligible.length === 0) return null;

    const workloadRows = await db
      .select({ assignedToUserId: labAnalyses.assignedToUserId })
      .from(labAnalyses)
      .where(
        and(
          eq(labAnalyses.assignedUnitId, unitId),
          inArray(labAnalyses.status, ['REQUESTED', 'ACCEPTED', 'IN_PROGRESS'])
        )
      );

    const workload = new Map<string, number>();
    for (const row of workloadRows) {
      if (!row.assignedToUserId) continue;
      workload.set(row.assignedToUserId, (workload.get(row.assignedToUserId) ?? 0) + 1);
    }

    const selected = selectLowestWorkloadCandidate(
      eligible.map((candidate) => ({
        userId: candidate.userId,
        workload: workload.get(candidate.userId) ?? 0,
      }))
    );
    return selected?.userId ?? null;
  }

  async listAnalyses(eventId: string, user: AuthenticatedUser,evidenceId?:string): Promise<LabAnalysisResponse[]> {
    if(evidenceId){
      const [item]=await this.db.select({id:evidence.id}).from(evidence).innerJoin(resources,eq(resources.id,evidence.id)).where(and(eq(evidence.id,evidenceId),eq(resources.eventId,eventId))).limit(1);
      if(!item)throw new NotFoundException('Evidence not found');
      await this.resourceAccessService.assertCanAccessResource(user,evidenceId,Permissions.EVIDENCE_READ);
    }
    const rows = await this.db
      .select({ analysis: labAnalyses, resource: resources })
      .from(labAnalyses)
      .innerJoin(resources, eq(labAnalyses.id, resources.id))
      .where(and(eq(resources.eventId, eventId),evidenceId?inArray(labAnalyses.id,this.db.select({id:labAnalysisEvidence.analysisId}).from(labAnalysisEvidence).where(eq(labAnalysisEvidence.evidenceId,evidenceId))):undefined))
      .orderBy(desc(labAnalyses.createdAt));

    const accessible: LabAnalysisResponse[] = [];
    for (const r of rows) {
      if (await this.resourceAccessService.canAccessResource(user, r.analysis.id, Permissions.LAB_READ)) {
        const evidenceLinks = await this.db
          .select({ evidenceId: labAnalysisEvidence.evidenceId })
          .from(labAnalysisEvidence)
          .where(eq(labAnalysisEvidence.analysisId, r.analysis.id));

        accessible.push(await this.viewerReport({
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
        },user));
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

    return this.viewerReport({
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
    },user);
  }

  private async viewerReport(record:LabAnalysisResponse,user:AuthenticatedUser):Promise<LabAnalysisResponse>{
    const reportAvailable=record.status==='APPROVED'&&!!record.approvedAt;
    const internal=reportAvailable||(await Promise.all([Permissions.LAB_WORK,Permissions.LAB_COMPLETE,Permissions.LAB_APPROVE,Permissions.LAB_CORRECT].map(p=>this.resourceAccessService.canAccessResource(user,record.id,p)))).some(Boolean);
    const evidenceIds:string[]=[];
    for(const id of record.evidenceIds??[])if(await this.resourceAccessService.canAccessResource(user,id,Permissions.EVIDENCE_READ))evidenceIds.push(id);
    const [requester]=await this.db.select({name:users.displayName}).from(users).where(eq(users.id,record.requestedByUserId)).limit(1);
    const [unit]=record.assignedUnitId?await this.db.select({name:organizationalUnits.name}).from(organizationalUnits).where(and(eq(organizationalUnits.id,record.assignedUnitId),eq(organizationalUnits.eventId,record.eventId))).limit(1):[];
    return {...record,evidenceIds,reportAvailable,requesterName:requester?.name??null,unitName:unit?.name??null,...(!internal&&{method:null,findings:null,conclusion:null})};
  }

  private async notifyRequester(tx:any,eventId:string,row:typeof labAnalyses.$inferSelect){
    // Mandatory, transactionally persisted in-app lifecycle receipt. No draft content or findings.
    await tx.insert(notifications).values({id:generateId(),userId:row.requestedByUserId,eventId,type:'LAB_STATUS',severity:row.status==='APPROVED'||row.status==='REJECTED'||row.status==='CANCELLED'?'ACTION':'INFO',templateKey:'lab.request.status',templateParams:{analysisNumber:row.analysisNumber,status:row.status},resourceId:row.id,actionUrl:`/events/${eventId}/lab/${row.id}`,sourceEventId:generateId()});
  }

  async getAnalysisDetail(eventId: string, analysisId: string, user: AuthenticatedUser): Promise<LabAnalysisDetail> {
    const record = await this.getAnalysis(eventId, analysisId, user);
    const [accept, work, complete, approve] = await Promise.all([
      Permissions.LAB_ACCEPT, Permissions.LAB_WORK, Permissions.LAB_COMPLETE, Permissions.LAB_APPROVE,
    ].map(permission => this.resourceAccessService.canAccessResource(user, analysisId, permission)));
    const visibleIds: string[] = [];
    for (const id of record.evidenceIds ?? []) {
      if (await this.resourceAccessService.canAccessResource(user, id, Permissions.EVIDENCE_READ)) visibleIds.push(id);
    }
    const [items, analysts, units] = await Promise.all([
      visibleIds.length ? this.db.select({ id: evidence.id, title: evidence.title, evidenceNumber: evidence.evidenceNumber, status: evidence.status })
        .from(evidence).innerJoin(resources, eq(evidence.id, resources.id)).where(and(inArray(evidence.id, visibleIds), eq(resources.eventId, eventId))) : [],
      record.assignedToUserId ? this.db.select({ name: users.displayName }).from(users).where(eq(users.id, record.assignedToUserId)) : [],
      record.assignedUnitId ? this.db.select({ name: organizationalUnits.name }).from(organizationalUnits)
        .where(and(eq(organizationalUnits.eventId, eventId), eq(organizationalUnits.id, record.assignedUnitId))) : [],
    ]);
    return { ...record, evidenceIds: items.map(item => item.id), evidenceItems: items,
      analystName: analysts[0]?.name ?? null, unitName: units[0]?.name ?? null,
      actions: { accept: !!accept, work: !!work, complete: !!complete, approve: !!approve } };
  }

  async createAnalysis(
    eventId: string,
    data: CreateLabAnalysisRequest,
    user: AuthenticatedUser
  ): Promise<LabAnalysisResponse> {
    // 1. Verify access to all evidence items
    for (const evId of data.evidenceIds) {
      const evidenceResource = await this.resourceService.getResource(evId);
      if (!evidenceResource || evidenceResource.eventId !== eventId || evidenceResource.resourceType!=='evidence') {
        throw new BadRequestException('All evidence references must belong to this exercise');
      }
      await this.resourceAccessService.assertCanAccessResource(user, evId, Permissions.EVIDENCE_READ);
    }

    const resolved = await this.resolveLaboratoryUnit(eventId, data.requestedFromUnitId);
    if (!resolved.unitId) {
      throw new BadRequestException(
        resolved.ambiguous
          ? 'Multiple laboratory units are available; select a responsible laboratory unit'
          : 'No laboratory unit is configured for this exercise'
      );
    }
    await this.authorizationService.assertAuthorized({
      user,
      permission: Permissions.LAB_REQUEST,
      context: { eventId, unitId: resolved.unitId },
    });
    const analysisId = generateId();
    let assignedToUserId: string | null = null;

    const result = await this.db.transaction(async (tx) => {
      // Serialize assignment decisions for this exercise/unit so concurrent
      // requests observe the same committed workload.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${eventId}:${resolved.unitId}`}))`);
      assignedToUserId = await this.selectEligibleAnalyst(eventId, resolved.unitId!, tx);

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
        owningUnitId: resolved.unitId,
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
          requestedFromUnitId: resolved.unitId,
          assignedUnitId: resolved.unitId,
          assignedToUserId,
          analysisType: data.analysisType,
          purpose: data.purpose ?? null,
          method: data.method ?? null,
        })
        .returning();

      await tx.delete(resourceAssignments).where(eq(resourceAssignments.resourceId, analysisId));
      if (assignedToUserId) {
        await tx.insert(resourceAssignments).values({
          id: generateId(),
          eventId,
          resourceId: analysisId,
          userId: assignedToUserId,
          unitId: null,
          assignedByUserId: user.id,
        });
      }

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
        txClient: tx,
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

      // 8. Search outbox and receipt to requester.
      await this.notifyRequester(tx,eventId,created!);
      await this.searchIndexerService.emitSearchUpsert('lab_analysis', analysisId, tx);

      await this.auditService.record({
        action: assignedToUserId ? 'lab.assignment.auto' : 'lab.assignment.unassigned',
        category: 'laboratory',
        eventId,
        resourceType: 'lab_analysis',
        resourceId: analysisId,
        actorUserId: user.id,
        metadata: {
          assignedUnitId: resolved.unitId,
          assignedToUserId,
          policy: 'lowest_workload_stable_user_id',
        },
        txClient: tx,
      });

      return {
        reportAvailable:false,
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

    if (assignedToUserId) {
      await this.notificationsService.emit({
        userId: assignedToUserId,
        eventId,
        type: 'LAB_ASSIGNED',
        severity: 'ACTION',
        templateKey: 'lab.assigned',
        templateParams: {
          analysisNumber: result.analysisNumber,
          analysisType: result.analysisType,
        },
        resourceId: result.id,
        actionUrl: `/events/${eventId}/lab/${result.id}`,
        sourceEventId: `lab-assigned-${result.id}-${assignedToUserId}`,
      });
    }

    return result;
  }

  async updateAnalysis(
    eventId: string,
    analysisId: string,
    data: UpdateLabAnalysisRequest,
    user: AuthenticatedUser
  ): Promise<LabAnalysisResponse> {
    if (data.assignedToUserId !== undefined || data.assignedUnitId !== undefined) {
      throw new BadRequestException('Laboratory assignments must be changed through the reassignment workflow');
    }
    const existing = await this.getAnalysis(eventId, analysisId, user);
    const currentStatus = existing.status as LabAnalysisStatusValue;
    const writesReport=data.method!==undefined||data.findings!==undefined||data.conclusion!==undefined;
    if(writesReport){
      if(!['REQUESTED','ACCEPTED','IN_PROGRESS'].includes(currentStatus))throw new BadRequestException('Report is locked; reopen for revision first');
      await this.resourceAccessService.assertCanAccessResource(user,analysisId,Permissions.LAB_WORK);
    }
    if(data.status==='COMPLETED'&&!(data.conclusion??existing.conclusion)?.trim())throw new BadRequestException('A conclusion is required before completion');
    if(data.status==='APPROVED'&&!existing.conclusion?.trim())throw new BadRequestException('A completed report must contain a conclusion');

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
      if(data.status==='IN_PROGRESS'&&currentStatus==='COMPLETED'){updatePayload.completedAt=null;updatePayload.approvedAt=null;}
      if (data.status === 'COMPLETED') updatePayload.completedAt = now;
      if (data.status === 'APPROVED') updatePayload.approvedAt = now;
    }

    const updated = await this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${eventId}:${analysisId}`}))`);
      const [locked]=await tx.select().from(labAnalyses).where(eq(labAnalyses.id,analysisId)).for('update').limit(1);
      if(!locked||locked.status!==currentStatus||locked.updatedAt.toISOString()!==existing.updatedAt)throw new ConflictException('Laboratory analysis changed while this update was being processed');
      if(writesReport)await this.resourceAccessService.assertCanAccessResource(user,analysisId,Permissions.LAB_WORK,tx);
      const permission=data.status&&data.status!==currentStatus?data.status==='ACCEPTED'||data.status==='REJECTED'?Permissions.LAB_ACCEPT:data.status==='COMPLETED'?Permissions.LAB_COMPLETE:data.status==='APPROVED'?Permissions.LAB_APPROVE:Permissions.LAB_WORK:Permissions.LAB_WORK;
      await this.resourceAccessService.assertCanAccessResource(user,analysisId,permission,tx);
      const [row] = await tx
        .update(labAnalyses)
        .set(updatePayload)
        .where(and(eq(labAnalyses.id, analysisId), eq(labAnalyses.status, currentStatus)))
        .returning();
      if (!row) {
        throw new ConflictException('Laboratory analysis changed while this update was being processed');
      }

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
          analysisNumber: row.analysisNumber,
          previousStatus: currentStatus,
          newStatus: data.status,
        },
        txClient: tx,
      });

      if (data.status && data.status !== currentStatus) {
        let activityType = 'lab.status_changed';
        let title = `Lab analysis ${row.analysisNumber} status changed to ${data.status}`;

        if (data.status === 'ACCEPTED') {
          activityType = 'lab.accepted';
          title = `Lab analysis ${row.analysisNumber} accepted`;
        } else if (data.status === 'IN_PROGRESS') {
          activityType = 'lab.started';
          title = `Work started on lab analysis ${row.analysisNumber}`;
        } else if (data.status === 'COMPLETED') {
          activityType = 'lab.completed';
          title = `Lab analysis ${row.analysisNumber} completed; awaiting approval`;
        } else if (data.status === 'APPROVED') {
          activityType = 'lab.approved';
          title = `Lab analysis ${row.analysisNumber} approved`;
        } else if (data.status === 'REJECTED') {
          activityType = 'lab.rejected';
          title = `Lab analysis ${row.analysisNumber} rejected`;
        }

        await this.activityService.recordActivity({
          eventId,
          resourceId: analysisId,
          activityType,
          actorUserId: user.id,
          title,
          visibility:existing.visibility as ResourceVisibilityValue,
          summary:undefined,
          causationId: data.causationId,
          relatedResourceIds: existing.evidenceIds,
          metadata: { from: currentStatus, to: data.status },
        }, tx);
      }

      if(data.status&&data.status!==currentStatus)await this.notifyRequester(tx,eventId,row);
      await this.searchIndexerService.emitSearchUpsert('lab_analysis', analysisId, tx);
      return row;
    });

    return this.viewerReport({
      ...existing,
      ...updated,
      requestedAt: updated.requestedAt.toISOString(),
      acceptedAt: updated.acceptedAt ? updated.acceptedAt.toISOString() : null,
      startedAt: updated.startedAt ? updated.startedAt.toISOString() : null,
      completedAt: updated.completedAt ? updated.completedAt.toISOString() : null,
      approvedAt: updated.approvedAt ? updated.approvedAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },user);
  }

  async reassignAnalysis(
    eventId: string,
    analysisId: string,
    data: ReassignLabAnalysisRequest,
    user: AuthenticatedUser
  ): Promise<LabAnalysisResponse> {
    const existing = await this.getAnalysis(eventId, analysisId, user);
    const destinationUnitId = data.assignedUnitId ?? existing.assignedUnitId ?? existing.requestedFromUnitId;
    if (!destinationUnitId) {
      throw new BadRequestException('A destination laboratory unit is required');
    }
    // Coordinating the destination does not authorize taking another laboratory's work.
    await this.authorizationService.assertAuthorized({
      user,
      permission: Permissions.LAB_REASSIGN,
      context: { eventId, unitId: existing.assignedUnitId ?? existing.requestedFromUnitId ?? undefined },
    });
    await this.authorizationService.assertAuthorized({
      user,
      permission: Permissions.LAB_REASSIGN,
      context: { eventId, unitId: destinationUnitId },
    });

    await this.assertLaboratoryUnit(eventId, destinationUnitId);

    if (data.assignedToUserId) {
      await this.assertEligibleLaboratoryWorker(eventId, destinationUnitId, data.assignedToUserId);
    }

    const now = new Date();
    const updated = await this.db.transaction(async (tx) => {
      const [row] = await tx.update(labAnalyses)
        .set({ assignedUnitId: destinationUnitId, assignedToUserId: data.assignedToUserId ?? null, updatedAt: now })
        .where(eq(labAnalyses.id, analysisId))
        .returning();
      if (!row) return row;
      await tx.update(resources).set({ owningUnitId: destinationUnitId, updatedAt: now }).where(eq(resources.id, analysisId));
      await tx.delete(resourceAssignments).where(eq(resourceAssignments.resourceId, analysisId));
      if (data.assignedToUserId) {
        await tx.insert(resourceAssignments).values({
          id: generateId(), eventId, resourceId: analysisId, userId: data.assignedToUserId,
          unitId: null, assignedByUserId: user.id,
        });
      }
      await this.auditService.record({
        action: 'lab.reassigned', category: 'laboratory', eventId, resourceType: 'lab_analysis',
        resourceId: analysisId, actorUserId: user.id,
        metadata: {
          previousAssignedUnitId: existing.assignedUnitId,
          previousAssignedToUserId: existing.assignedToUserId,
          assignedUnitId: destinationUnitId,
          assignedToUserId: data.assignedToUserId ?? null,
          reason: data.reason,
        },
        txClient: tx,
      });
      await this.activityService.recordActivity({
        eventId, resourceId: analysisId, activityType: 'lab.reassigned',
        actorUserId: user.id, title: `Lab analysis reassigned: ${existing.analysisNumber}`,
        summary: data.reason, relatedResourceIds: existing.evidenceIds,
      }, tx);
      await this.searchIndexerService.emitSearchUpsert('lab_analysis', analysisId, tx);
      return row;
    });
    if (!updated) throw new NotFoundException(`Laboratory analysis '${analysisId}' not found`);

    if (data.assignedToUserId) {
      await this.notificationsService.emit({
        userId: data.assignedToUserId,
        eventId,
        type: 'LAB_ASSIGNED',
        severity: 'ACTION',
        templateKey: 'lab.assigned',
        templateParams: { analysisNumber: existing.analysisNumber, reason: data.reason },
        resourceId: analysisId,
        actionUrl: `/events/${eventId}/lab/${analysisId}`,
        sourceEventId: `lab-reassign-${analysisId}-${data.assignedToUserId}`,
      });
    }

    return this.getAnalysis(eventId, analysisId, user);
  }

  async correctAnalysis(
    eventId: string,
    analysisId: string,
    data: CorrectLabAnalysisRequest,
    user: AuthenticatedUser
  ): Promise<LabAnalysisResponse> {
    await this.authorizationService.assertAuthorized({
      user,
      permission: Permissions.LAB_CORRECT,
      context: { eventId, unitId: data.assignedUnitId ?? undefined },
    });

    const existing = await this.getAnalysis(eventId, analysisId, user);
    if (data.status) {
      if (data.status === 'APPROVED' && (existing.status !== 'COMPLETED'||!existing.conclusion?.trim())) {
        throw new BadRequestException('Organizer correction cannot approve an analysis that is not completed');
      }
    }

    const now = new Date();
    const updates: Record<string, unknown> = { updatedAt: now };
    if (data.status) {
      updates.status = data.status;
      if (data.status === 'REQUESTED') {
        updates.acceptedAt = null;
        updates.startedAt = null;
        updates.completedAt = null;
        updates.approvedAt = null;
      } else if (data.status === 'APPROVED') {
        updates.approvedAt = now;
      } else if (existing.status === 'APPROVED') {
        updates.approvedAt = null;
      }
    }
    const effectiveUnitId = data.assignedUnitId === undefined
      ? existing.assignedUnitId
      : data.assignedUnitId;
    const effectiveUserId = data.assignedToUserId === undefined
      ? existing.assignedToUserId
      : data.assignedToUserId;
    if (data.assignedUnitId !== undefined) {
      if (data.assignedUnitId) await this.assertLaboratoryUnit(eventId, data.assignedUnitId);
      updates.assignedUnitId = data.assignedUnitId;
    }
    if (effectiveUserId) {
      if (!effectiveUnitId) throw new BadRequestException('A destination laboratory unit is required');
      await this.assertEligibleLaboratoryWorker(eventId, effectiveUnitId, effectiveUserId);
    }
    if (data.assignedToUserId !== undefined) {
      updates.assignedToUserId = data.assignedToUserId;
    }

    await this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${eventId}:${analysisId}`}))`);
      const [row]=await tx.update(labAnalyses).set(updates).where(and(eq(labAnalyses.id, analysisId),eq(labAnalyses.status,existing.status))).returning();
      if(!row)throw new ConflictException('Laboratory analysis changed');
      if(data.status&&data.status!==existing.status)await this.notifyRequester(tx,eventId,row);
      await tx.update(resources).set({
        owningUnitId: effectiveUnitId,
        updatedAt: now,
      }).where(eq(resources.id, analysisId));
      await tx.delete(resourceAssignments).where(eq(resourceAssignments.resourceId, analysisId));
      if (effectiveUserId && effectiveUnitId) {
        await tx.insert(resourceAssignments).values({
          id: generateId(), eventId, resourceId: analysisId, userId: effectiveUserId,
          unitId: null, assignedByUserId: user.id,
        });
      }
      await this.auditService.record({
      action: 'lab.corrected',
      category: 'laboratory',
      eventId,
      resourceType: 'lab_analysis',
      resourceId: analysisId,
      actorUserId: user.id,
      metadata: {
        previousStatus: existing.status,
        previousAssignedUnitId: existing.assignedUnitId,
        previousAssignedToUserId: existing.assignedToUserId,
        newStatus: data.status ?? existing.status,
        assignedUnitId: data.assignedUnitId,
        assignedToUserId: data.assignedToUserId,
        reason: data.reason,
        },
        txClient: tx,
      });
      await this.activityService.recordActivity({
        eventId, resourceId: analysisId, activityType: 'lab.corrected', actorUserId: user.id,
        title: `Lab analysis corrected: ${existing.analysisNumber}`, summary: data.reason,
        relatedResourceIds: existing.evidenceIds,
      }, tx);
      await this.searchIndexerService.emitSearchUpsert('lab_analysis', analysisId, tx);
    });
    return this.getAnalysis(eventId, analysisId, user);
  }
}

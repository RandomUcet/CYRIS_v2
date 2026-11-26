import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { eq, desc, and, or, isNull, gt, asc, sql, inArray } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { ResourceService } from '../resources/resource.service.js';
import { ResourceAccessService } from '../resources/resource-access.service.js';
import { IdentifierAllocatorService } from '../resources/identifier-allocator.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ActivityService } from '../resources/activity.service.js';
import { SearchIndexerService } from '../search/search-indexer.service.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import {
  evidence,
  evidenceCustodyTransfers,
  resources,users,eventMemberships,organizationalUnits,previewTeamAccounts,events,
  type ResourceVisibilityValue,
  type EvidenceStatusValue,
  type CustodyHolderTypeValue,
} from '@cyris/db';
import { generateId, Permissions } from '@cyris/shared';
import type {
  CreateEvidenceRequest,
  UpdateEvidenceRequest,
  TransferEvidenceRequest,
  EvidenceResponse,
  EvidenceCustodyTransferResponse,CustodyRecipientQuery,CustodyRecipient,
} from '@cyris/contracts';

@Injectable()
export class EvidenceService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly resourceService: ResourceService,
    private readonly resourceAccessService: ResourceAccessService,
    private readonly identifierAllocatorService: IdentifierAllocatorService,
    private readonly auditService: AuditService,
    private readonly activityService: ActivityService,
    private readonly searchIndexerService: SearchIndexerService,
    private readonly authorizationService: AuthorizationService
  ) {}

  private get db() {
    return this.databaseService.client;
  }

  async listEvidence(eventId: string, user: AuthenticatedUser): Promise<EvidenceResponse[]> {
    const rows = await this.db
      .select({ ev: evidence, resource: resources })
      .from(evidence)
      .innerJoin(resources, eq(evidence.id, resources.id))
      .where(eq(resources.eventId, eventId))
      .orderBy(desc(evidence.createdAt));

    const accessible: EvidenceResponse[] = [];
    for (const r of rows) {
      if (await this.resourceAccessService.canAccessResource(user, r.ev.id, Permissions.EVIDENCE_READ)) {
        accessible.push({
          id: r.ev.id,
          eventId: r.resource.eventId,
          evidenceNumber: r.ev.evidenceNumber,
          title: r.ev.title,
          description: r.ev.description,
          evidenceType: r.ev.evidenceType,
          status: r.ev.status,
          condition: r.ev.condition,
          securedAt: r.ev.securedAt ? r.ev.securedAt.toISOString() : null,
          securedByUserId: r.ev.securedByUserId,
          owningUnitId: r.ev.owningUnitId,
          currentHolderType: r.ev.currentHolderType,
          currentHolderId: r.ev.currentHolderId,
          visibility: r.resource.visibility,
          createdAt: r.ev.createdAt.toISOString(),
          updatedAt: r.ev.updatedAt.toISOString(),
        });
      }
    }
    return accessible;
  }

  async createEvidence(
    eventId: string,
    data: CreateEvidenceRequest,
    user: AuthenticatedUser
  ): Promise<EvidenceResponse> {
    await this.authorizationService.assertAuthorized({user,permission:Permissions.EVIDENCE_CREATE,context:{eventId,unitId:data.owningUnitId,resourceOwnerId:user.id}});
    const evidenceId = generateId();

    return this.db.transaction(async (tx) => {
      const [event]=await tx.select({status:events.status}).from(events).where(eq(events.id,eventId)).for('update').limit(1);
      if(!event||['CLOSED','ARCHIVED'].includes(event.status))throw new BadRequestException('Exercise is read-only');
      if(data.owningUnitId){
        const [unit]=await tx.select({id:organizationalUnits.id}).from(organizationalUnits).where(and(eq(organizationalUnits.id,data.owningUnitId),eq(organizationalUnits.eventId,eventId),isNull(organizationalUnits.archivedAt))).limit(1);
        if(!unit)throw new BadRequestException('Owning unit is unavailable in this exercise');
      }
      if(data.caseId){
        const [linked]=await tx.select({id:resources.id}).from(resources).where(and(eq(resources.id,data.caseId),eq(resources.eventId,eventId),eq(resources.resourceType,'case'))).limit(1);
        if(!linked)throw new BadRequestException('Case is unavailable in this exercise');
        await this.resourceAccessService.assertCanAccessResource(user,data.caseId,Permissions.CASE_READ,tx);
      }
      // 1. Allocate sequential identifier (e.g. E-0001)
      const evidenceNumber = await this.identifierAllocatorService.allocate(
        eventId,
        'E',
        'E',
        tx
      );

      // 2. Create base resource
      await this.resourceService.registerResource(eventId, 'evidence', {
        id: evidenceId,
        visibility: data.visibility as ResourceVisibilityValue,
        owningUnitId: data.owningUnitId,
        ownerUserId: user.id,
        txClient: tx,
      });

      // 3. Create evidence domain row with identical ID
      const [created] = await tx
        .insert(evidence)
        .values({
          id: evidenceId,
          evidenceNumber,
          title: data.title,
          description: data.description ?? null,
          evidenceType: data.evidenceType,
          status: data.status,
          condition: data.condition ?? null,
          securedAt: data.securedAt ? new Date(data.securedAt) : new Date(),
          securedByUserId: data.securedByUserId ?? user.id,
          owningUnitId: data.owningUnitId ?? null,
          currentHolderType: data.currentHolderType,
          currentHolderId: data.currentHolderId,
        })
        .returning();

      // 4. Initial chain-of-custody transfer entry
      await tx.insert(evidenceCustodyTransfers).values({
        id: generateId(),
        evidenceId,
        occurredAt: new Date(),
        transferredByUserId: user.id,
        fromHolderType: 'STORAGE',
        fromHolderId: 'SCENE_ORIGIN',
        toHolderType: data.currentHolderType,
        toHolderId: data.currentHolderId,
        reason: 'Initial evidence registration & securing',
        notes: data.condition ?? null,
      });

      if (data.caseId) {
        await this.resourceService.createRelationship({
          eventId,
          sourceResourceId: data.caseId,
          targetResourceId: evidenceId,
          relationshipType: 'CASE_EVIDENCE',
          createdByUserId: user.id,
          txClient: tx,
        });
      }

      // 5. Audit
      await this.auditService.record({
        action: 'evidence.created',
        category: 'evidence',
        eventId,
        resourceType: 'evidence',
        resourceId: evidenceId,
        actorUserId: user.id,
        metadata: { evidenceNumber, title: data.title, evidenceType: data.evidenceType },
      });

      // 6. Activity
      await this.activityService.recordActivity(
        {
          eventId,
          resourceId: evidenceId,
          activityType: 'evidence.registered',
          actorUserId: user.id,
          title: `Registered evidence ${evidenceNumber}: ${data.title}`,
          summary: data.description ?? undefined,
          visibility: data.visibility,
        },
        tx
      );

      // 7. Search outbox
      await this.searchIndexerService.emitSearchUpsert('evidence', evidenceId, tx);

      return {
        id: created!.id,
        eventId,
        evidenceNumber: created!.evidenceNumber,
        title: created!.title,
        description: created!.description,
        evidenceType: created!.evidenceType,
        status: created!.status,
        condition: created!.condition,
        securedAt: created!.securedAt ? created!.securedAt.toISOString() : null,
        securedByUserId: created!.securedByUserId,
        owningUnitId: created!.owningUnitId,
        currentHolderType: created!.currentHolderType,
        currentHolderId: created!.currentHolderId,
        visibility: data.visibility || 'EVENT',
        createdAt: created!.createdAt.toISOString(),
        updatedAt: created!.updatedAt.toISOString(),
      };
    });
  }

  async getEvidence(
    eventId: string,
    evidenceId: string,
    user: AuthenticatedUser
  ): Promise<EvidenceResponse> {
    await this.resourceAccessService.assertCanAccessResource(user, evidenceId, Permissions.EVIDENCE_READ);

    const [row] = await this.db
      .select({ ev: evidence, resource: resources })
      .from(evidence)
      .innerJoin(resources, eq(evidence.id, resources.id))
      .where(eq(evidence.id, evidenceId))
      .limit(1);

    if (!row || row.resource.eventId !== eventId) {
      throw new NotFoundException(`Evidence '${evidenceId}' not found`);
    }

    const custodyRows = await this.getCustodyHistory(eventId, evidenceId, user);
    const holderNames=await this.holderNames(eventId,[{type:row.ev.currentHolderType,id:row.ev.currentHolderId}]);

    return {
      id: row.ev.id,
      eventId: row.resource.eventId,
      evidenceNumber: row.ev.evidenceNumber,
      title: row.ev.title,
      description: row.ev.description,
      evidenceType: row.ev.evidenceType,
      status: row.ev.status,
      condition: row.ev.condition,
      securedAt: row.ev.securedAt ? row.ev.securedAt.toISOString() : null,
      securedByUserId: row.ev.securedByUserId,
      owningUnitId: row.ev.owningUnitId,
      currentHolderType: row.ev.currentHolderType,
      currentHolderId: row.ev.currentHolderId,
      currentHolderName:holderNames.get(row.ev.currentHolderType+':'+row.ev.currentHolderId)??null,
      visibility: row.resource.visibility,
      createdAt: row.ev.createdAt.toISOString(),
      updatedAt: row.ev.updatedAt.toISOString(),
      custodyHistory: custodyRows,
    };
  }

  async updateEvidence(
    eventId: string,
    evidenceId: string,
    data: UpdateEvidenceRequest,
    user: AuthenticatedUser
  ): Promise<EvidenceResponse> {
    await this.resourceAccessService.assertCanAccessResource(user, evidenceId, Permissions.EVIDENCE_UPDATE);

    const existing = await this.getEvidence(eventId, evidenceId, user);

    const updatePayload: Record<string, unknown> = { updatedAt: new Date() };
    if (data.title !== undefined) updatePayload.title = data.title;
    if (data.description !== undefined) updatePayload.description = data.description;
    if (data.evidenceType !== undefined) updatePayload.evidenceType = data.evidenceType;
    if (data.condition !== undefined) updatePayload.condition = data.condition;
    if (data.owningUnitId !== undefined) updatePayload.owningUnitId = data.owningUnitId;
    if (data.status !== undefined) updatePayload.status = data.status;

    const [updated] = await this.db
      .update(evidence)
      .set(updatePayload)
      .where(eq(evidence.id, evidenceId))
      .returning();

    await this.auditService.record({
      action: 'evidence.updated',
      category: 'evidence',
      eventId,
      resourceType: 'evidence',
      resourceId: evidenceId,
      actorUserId: user.id,
      metadata: { evidenceNumber: updated!.evidenceNumber, title: updated!.title },
    });

    if (data.status && data.status !== existing.status) {
      await this.activityService.recordActivity({
        eventId,
        resourceId: evidenceId,
        activityType: 'evidence.status_changed',
        actorUserId: user.id,
        title: `Evidence ${updated!.evidenceNumber} status changed to ${data.status}`,
        metadata: { from: existing.status, to: data.status },
      });
    }

    await this.searchIndexerService.emitSearchUpsert('evidence', evidenceId);

    return {
      ...existing,
      ...updated!,
      securedAt: updated!.securedAt ? updated!.securedAt.toISOString() : null,
      createdAt: updated!.createdAt.toISOString(),
      updatedAt: updated!.updatedAt.toISOString(),
    };
  }

  /**
   * Transactional chain-of-custody transfer.
   * 1. Validates permissions (evidence.transfer)
   * 2. Appends custody event
   * 3. Updates current holder and status on evidence
   * 4. Audits transfer
   * 5. Creates operational activity
   * 6. Requests search reindex
   * 7. Commits
   */
  async searchRecipients(eventId:string,evidenceId:string,query:CustodyRecipientQuery,user:AuthenticatedUser):Promise<CustodyRecipient[]>{
    await this.resourceAccessService.assertCanAccessResource(user,evidenceId,Permissions.EVIDENCE_TRANSFER);
    const [record]=await this.db.select({id:resources.id}).from(resources).innerJoin(evidence,eq(evidence.id,resources.id)).where(and(eq(resources.id,evidenceId),eq(resources.eventId,eventId))).limit(1);
    if(!record)throw new NotFoundException('Evidence not found');
    if(query.type==='UNIT')return this.db.select({id:organizationalUnits.id,name:organizationalUnits.name}).from(organizationalUnits).where(and(eq(organizationalUnits.eventId,eventId),isNull(organizationalUnits.archivedAt),sql`strpos(lower(${organizationalUnits.name}),lower(${query.q}))>0`)).orderBy(asc(organizationalUnits.name),asc(organizationalUnits.id)).limit(20);
    return this.db.select({id:users.id,name:users.displayName}).from(eventMemberships).innerJoin(users,eq(users.id,eventMemberships.userId)).leftJoin(previewTeamAccounts,eq(previewTeamAccounts.userId,users.id)).where(and(eq(eventMemberships.eventId,eventId),eq(eventMemberships.status,'ACTIVE'),eq(users.status,'ACTIVE'),or(isNull(users.testExpiresAt),gt(users.testExpiresAt,new Date())),isNull(previewTeamAccounts.userId),sql`strpos(lower(${users.displayName}),lower(${query.q}))>0`)).orderBy(asc(users.displayName),asc(users.id)).limit(20);
  }

  private async holderNames(eventId:string,holders:{type:string;id:string}[],db=this.db):Promise<Map<string,string>>{
    const names=new Map<string,string>();const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const ids=(type:string)=>[...new Set(holders.filter(h=>h.type===type&&uuid.test(h.id)).map(h=>h.id))];
    const userIds=ids('USER'),unitIds=ids('UNIT');
    if(userIds.length){const rows=await db.select({id:users.id,name:users.displayName}).from(eventMemberships).innerJoin(users,eq(users.id,eventMemberships.userId)).where(and(eq(eventMemberships.eventId,eventId),inArray(users.id,userIds)));for(const row of rows)names.set('USER:'+row.id,row.name);}
    if(unitIds.length){const rows=await db.select({id:organizationalUnits.id,name:organizationalUnits.name}).from(organizationalUnits).where(and(eq(organizationalUnits.eventId,eventId),inArray(organizationalUnits.id,unitIds)));for(const row of rows)names.set('UNIT:'+row.id,row.name);}
    for(const h of holders)if(h.type==='STORAGE')names.set('STORAGE:'+h.id,h.id==='SCENE_ORIGIN'?'Scene origin':h.id);
    return names;
  }

  async transferCustody(
    eventId: string,
    evidenceId: string,
    data: TransferEvidenceRequest,
    user: AuthenticatedUser
  ): Promise<EvidenceResponse> {
    await this.resourceAccessService.assertCanAccessResource(user, evidenceId, Permissions.EVIDENCE_TRANSFER);

    return this.db.transaction(async (tx) => {
      const [event]=await tx.select({status:events.status}).from(events).where(eq(events.id,eventId)).for('update').limit(1);
      if(!event||['CLOSED','ARCHIVED'].includes(event.status))throw new BadRequestException('Exercise is read-only');
      const [record] = await tx.select({current:evidence,visibility:resources.visibility}).from(evidence).innerJoin(resources,eq(resources.id,evidence.id)).where(and(eq(evidence.id,evidenceId),eq(resources.eventId,eventId))).for('update').limit(1);
      const current=record?.current;
      if (!current) {
        throw new NotFoundException(`Evidence '${evidenceId}' not found`);
      }

      await this.resourceAccessService.assertCanAccessResource(user,evidenceId,Permissions.EVIDENCE_TRANSFER,tx);
      const occurredAt = new Date();
      if(!data.reason?.trim())throw new BadRequestException('Transfer reason is required');
      if(current.currentHolderType===data.toHolderType&&current.currentHolderId===data.toHolderId)throw new BadRequestException('Evidence already has this holder');
      if(data.toHolderType==='USER'){
        const [recipient]=await tx.select({id:users.id}).from(eventMemberships).innerJoin(users,eq(users.id,eventMemberships.userId)).where(and(eq(eventMemberships.eventId,eventId),eq(eventMemberships.status,'ACTIVE'),eq(users.id,data.toHolderId),eq(users.status,'ACTIVE'),or(isNull(users.testExpiresAt),gt(users.testExpiresAt,occurredAt)))).for('share').limit(1);
        const [preview]=await tx.select({id:previewTeamAccounts.userId}).from(previewTeamAccounts).where(eq(previewTeamAccounts.userId,data.toHolderId)).limit(1);
        if(!recipient||preview)throw new BadRequestException('Recipient is unavailable in this exercise');
      }else if(data.toHolderType==='UNIT'){
        const [recipient]=await tx.select({id:organizationalUnits.id}).from(organizationalUnits).where(and(eq(organizationalUnits.eventId,eventId),eq(organizationalUnits.id,data.toHolderId),isNull(organizationalUnits.archivedAt))).for('share').limit(1);
        if(!recipient)throw new BadRequestException('Recipient unit is unavailable in this exercise');
      }
      const names=await this.holderNames(eventId,[{type:data.toHolderType,id:data.toHolderId}],tx as unknown as typeof this.db);
      const holderName=names.get(data.toHolderType+':'+data.toHolderId)??null;
      const fromHolderType = current.currentHolderType;
      const fromHolderId = current.currentHolderId;

      // 1. Append custody event
      await tx.insert(evidenceCustodyTransfers).values({
        id: generateId(),
        evidenceId,
        occurredAt,
        transferredByUserId: user.id,
        fromHolderType,
        fromHolderId,
        toHolderType: data.toHolderType,
        toHolderId: data.toHolderId,
        reason: data.reason ?? null,
        notes: data.notes ?? null,
      });

      // 2. Update current custody state on evidence
      const newStatus = data.newStatus ?? (data.toHolderType === 'STORAGE' ? 'STORED' : current.status);
      const [updated] = await tx
        .update(evidence)
        .set({
          currentHolderType: data.toHolderType as CustodyHolderTypeValue,
          currentHolderId: data.toHolderId,
          status: newStatus as EvidenceStatusValue,
          updatedAt: occurredAt,
        })
        .where(eq(evidence.id, evidenceId))
        .returning();

      // 3. Audit
      await this.auditService.record({
        txClient:tx,
        action: 'evidence.transferred',
        category: 'evidence',
        eventId,
        resourceType: 'evidence',
        resourceId: evidenceId,
        actorUserId: user.id,
        metadata: {
          fromHolderType,
          fromHolderId,
          toHolderType: data.toHolderType,
          toHolderId: data.toHolderId,
          reason: data.reason,
        },
      });

      // 4. Activity
      await this.activityService.recordActivity(
        {
          eventId,
          resourceId: evidenceId,
          activityType: 'evidence.transferred',
          actorUserId: user.id,
          title: `Evidence ${current.evidenceNumber} transferred to ${holderName??data.toHolderType}`,
          summary: data.reason ?? undefined,
          reason: data.reason ?? undefined,
          causationId: data.causationId ?? undefined,
          metadata: {
            fromHolderType,
            fromHolderId,
            toHolderType: data.toHolderType,
            toHolderId: data.toHolderId,
          },
        },
        tx
      );

      // 5. Search outbox
      await this.searchIndexerService.emitSearchUpsert('evidence', evidenceId, tx);

      const custodyHistory = await this.getCustodyHistory(eventId, evidenceId, user, tx);

      return {
        id: updated!.id,
        eventId,
        evidenceNumber: updated!.evidenceNumber,
        title: updated!.title,
        description: updated!.description,
        evidenceType: updated!.evidenceType,
        status: updated!.status,
        condition: updated!.condition,
        securedAt: updated!.securedAt ? updated!.securedAt.toISOString() : null,
        securedByUserId: updated!.securedByUserId,
        owningUnitId: updated!.owningUnitId,
        currentHolderType: updated!.currentHolderType,
        currentHolderId: updated!.currentHolderId,
        currentHolderName:holderName,
        visibility: record!.visibility,
        createdAt: updated!.createdAt.toISOString(),
        updatedAt: updated!.updatedAt.toISOString(),
        custodyHistory,
      };
    });
  }

  async getCustodyHistory(
    eventId: string,
    evidenceId: string,
    user: AuthenticatedUser,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    txClient?: any
  ): Promise<EvidenceCustodyTransferResponse[]> {
    await this.resourceAccessService.assertCanAccessResource(user, evidenceId, Permissions.EVIDENCE_READ, txClient);

    const db = txClient || this.db;
    const [record]=await db.select({id:resources.id}).from(resources).where(and(eq(resources.id,evidenceId),eq(resources.eventId,eventId))).limit(1);
    if(!record)throw new NotFoundException('Evidence not found');
    const rows = await db
      .select()
      .from(evidenceCustodyTransfers)
      .where(eq(evidenceCustodyTransfers.evidenceId, evidenceId))
      .orderBy(desc(evidenceCustodyTransfers.occurredAt));

    const names=await this.holderNames(eventId,rows.flatMap((r:typeof evidenceCustodyTransfers.$inferSelect)=>[{type:r.fromHolderType,id:r.fromHolderId},{type:r.toHolderType,id:r.toHolderId}]),db);
    return rows.map((r: typeof evidenceCustodyTransfers.$inferSelect) => ({
      id: r.id,
      evidenceId: r.evidenceId,
      occurredAt: r.occurredAt.toISOString(),
      transferredByUserId: r.transferredByUserId,
      fromHolderType: r.fromHolderType,
      fromHolderId: r.fromHolderId,
      fromHolderName:names.get(r.fromHolderType+':'+r.fromHolderId)??null,
      toHolderName:names.get(r.toHolderType+':'+r.toHolderId)??null,
      toHolderType: r.toHolderType,
      toHolderId: r.toHolderId,
      reason: r.reason,
      notes: r.notes,
    }));
  }
}

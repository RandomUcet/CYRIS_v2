import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,ConflictException,
} from '@nestjs/common';
import { eq, and, desc, isNull, or, gt, sql, inArray, asc } from 'drizzle-orm';
import {selectLowestWorkloadCandidate} from '../laboratory/laboratory-assignment.js';
import {canTransitionForensic,canEditForensicReport,canReassignForensic} from './forensic-lifecycle.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { DatabaseService } from '../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ActivityService } from '../resources/activity.service.js';
import { ResourceService } from '../resources/resource.service.js';
import { ResourceAccessService } from '../resources/resource-access.service.js';
import { IdentifierAllocatorService } from '../resources/identifier-allocator.service.js';
import {
  forensicAnalyses,
  forensicAnalysisEvidence,
  forensicAnalysisDevices,
  forensicFindings,
  technicalIndicators,
  forensicAcquisitions,
  resources, organizationalUnits, resourceAssignments, users, events, notifications,unitCapabilities,eventMemberships,membershipUnitAssignments,previewTeamAccounts,
  evidence,
  devices,
  outboxEvents,
  OutboxStatus,
  ResourceVisibility,
  type ResourceVisibilityValue,
} from '@cyris/db';
import { Permissions, generateId, normalizeSearchText } from '@cyris/shared';
import type { AuthenticatedUser } from '../auth/session.service.js';
import type {
  ForensicAnalysisItem,
  ForensicAnalysisDetail,
  ForensicFinding,
  TechnicalIndicator,
  ForensicAcquisition,
  CreateForensicAnalysisRequest,
  UpdateForensicStatusRequest,
  CreateForensicFindingRequest,
  CreateTechnicalIndicatorRequest,
  CreateForensicAcquisitionRequest,
  ForensicQueryFilters,SaveForensicReport,ReassignForensicAnalysis,
} from '@cyris/contracts';

@Injectable()
export class ForensicsService {
  private readonly logger = new Logger(ForensicsService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService,
    private readonly activityService: ActivityService,
    private readonly resourceService: ResourceService,
    private readonly resourceAccessService: ResourceAccessService,
    private readonly identifierAllocator: IdentifierAllocatorService,
    private readonly authorizationService:AuthorizationService,
  ) {}

  private get db() {
    return this.databaseService.client;
  }

  async assertAnalysisEvent(eventId:string,analysisId:string):Promise<void>{
    const [row]=await this.db.select({id:forensicAnalyses.id}).from(forensicAnalyses)
      .innerJoin(resources,eq(resources.id,forensicAnalyses.id))
      .where(and(eq(forensicAnalyses.id,analysisId),eq(forensicAnalyses.eventId,eventId),eq(resources.eventId,eventId),eq(resources.resourceType,'forensic_analysis'))).limit(1);
    if(!row)throw new NotFoundException('Forensic analysis not found');
  }

  private async assertWritable(eventId:string,user:AuthenticatedUser){
    const [event]=await this.db.select({status:events.status}).from(events).where(eq(events.id,eventId)).limit(1);
    if(!event)throw new NotFoundException('Exercise not found');
    if(['CLOSED','ARCHIVED'].includes(event.status))throw new BadRequestException('Exercise is read-only');
    if((await this.resourceAccessService.getModuleImpacts(eventId,user)).has('forensics'))throw new ForbiddenException('Forensics is currently read-only or unavailable');
  }

  private async notifyRequester(tx:Parameters<Parameters<DatabaseService['client']['transaction']>[0]>[0],row:typeof forensicAnalyses.$inferSelect){
    if(!row.requestedByUserId)return;
    await tx.insert(notifications).values({id:generateId(),userId:row.requestedByUserId,eventId:row.eventId,type:'FORENSIC_STATUS',severity:['APPROVED','CANCELLED','REJECTED'].includes(row.status)?'ACTION':'INFO',templateKey:'forensics.request.status',templateParams:{analysisNumber:row.analysisNumber,status:row.status},resourceId:row.id,actionUrl:`/events/${row.eventId}/forensics/${row.id}`,sourceEventId:generateId()});
  }

  async listDestinationUnits(eventId:string,user:AuthenticatedUser){
    const rows=await this.db.select({id:organizationalUnits.id,name:organizationalUnits.name}).from(organizationalUnits).innerJoin(unitCapabilities,eq(unitCapabilities.unitId,organizationalUnits.id)).where(and(eq(organizationalUnits.eventId,eventId),isNull(organizationalUnits.archivedAt),eq(unitCapabilities.capabilityKey,'digital_forensics'))).orderBy(asc(organizationalUnits.name),asc(organizationalUnits.id));
    const visible:typeof rows=[];
    for(const unit of rows)if(await this.authorizationService.authorize({user,permission:Permissions.FORENSICS_REQUEST,context:{eventId,unitId:unit.id,resourceOwnerId:user.id}}))visible.push(unit);
    return visible;
  }

  private async eligibleAnalysts(eventId:string,unitId:string,tx:Pick<DatabaseService['client'],'select'>){
    const members=await tx.select({id:users.id,email:users.email,displayName:users.displayName,status:users.status}).from(eventMemberships).innerJoin(membershipUnitAssignments,eq(membershipUnitAssignments.membershipId,eventMemberships.id)).innerJoin(users,eq(users.id,eventMemberships.userId)).leftJoin(previewTeamAccounts,eq(previewTeamAccounts.userId,users.id)).where(and(eq(eventMemberships.eventId,eventId),eq(eventMemberships.status,'ACTIVE'),eq(membershipUnitAssignments.unitId,unitId),eq(users.status,'ACTIVE'),or(isNull(users.testExpiresAt),gt(users.testExpiresAt,new Date())),isNull(previewTeamAccounts.userId)));
    const eligible:Array<{id:string;displayName:string}>=[];
    const required=[Permissions.FORENSICS_READ,Permissions.FORENSICS_ACCEPT,Permissions.FORENSICS_WORK,Permissions.FORENSICS_COMPLETE] as const;
    for(const member of members){
      const allowed=await this.authorizationService.eventCapabilities({user:member,permissions:required,eventId,unitId,resourceScopes:['ASSIGNED'],requireUnitMembership:true});
      if(required.every(p=>allowed.has(p)))eligible.push({id:member.id,displayName:member.displayName});
    }
    return eligible.sort((a,b)=>a.displayName.localeCompare(b.displayName)||a.id.localeCompare(b.id));
  }

  private async selectAnalyst(eventId:string,unitId:string,tx:Parameters<Parameters<DatabaseService['client']['transaction']>[0]>[0],explicit?:string){
    const eligible=(await this.eligibleAnalysts(eventId,unitId,tx)).map(member=>member.id);
    if(explicit){if(!eligible.includes(explicit))throw new BadRequestException('Assignee is not an eligible digital forensic worker');return explicit;}
    if(!eligible.length)return null;
    const work=await tx.select({userId:forensicAnalyses.assignedToUserId,total:sql<number>`count(*)::int`}).from(forensicAnalyses).where(and(eq(forensicAnalyses.eventId,eventId),eq(forensicAnalyses.assignedUnitId,unitId),inArray(forensicAnalyses.status,['REQUESTED','ACCEPTED','IN_PROGRESS']))).groupBy(forensicAnalyses.assignedToUserId);
    const workload=new Map(work.map(w=>[w.userId,w.total]));
    return selectLowestWorkloadCandidate(eligible.map(userId=>({userId,workload:workload.get(userId)??0})))?.userId??null;
  }

  private async assertCoordinationUnit(eventId:string,unitId:string|null,user:AuthenticatedUser,tx:Pick<DatabaseService['client'],'select'>){
    if(!unitId)throw new BadRequestException('No responsible forensic unit');
    await this.authorizationService.assertAuthorized({user,permission:Permissions.FORENSICS_REASSIGN,context:{eventId,unitId}});
    const [unit]=await tx.select({id:organizationalUnits.id}).from(organizationalUnits).innerJoin(unitCapabilities,eq(unitCapabilities.unitId,organizationalUnits.id)).where(and(eq(organizationalUnits.id,unitId),eq(organizationalUnits.eventId,eventId),isNull(organizationalUnits.archivedAt),eq(unitCapabilities.capabilityKey,'digital_forensics'))).limit(1);
    if(!unit)throw new BadRequestException('Responsible forensic unit is unavailable');
    return unit.id;
  }

  async listReassignmentCandidates(eventId:string,analysisId:string,user:AuthenticatedUser){
    await this.assertAnalysisEvent(eventId,analysisId);
    await this.resourceAccessService.assertCanAccessResource(user,analysisId,Permissions.FORENSICS_READ);
    await this.assertWritable(eventId,user);
    const [row]=await this.db.select().from(forensicAnalyses).where(eq(forensicAnalyses.id,analysisId)).limit(1);
    if(!row)throw new NotFoundException('Forensic analysis not found');
    const unitId=await this.assertCoordinationUnit(eventId,row.assignedUnitId,user,this.db);
    if(!canReassignForensic(row.status))throw new BadRequestException('Analysis is not open for reassignment');
    return (await this.eligibleAnalysts(eventId,unitId,this.db)).filter(member=>member.id!==row.assignedToUserId);
  }

  async reassignAnalysis(eventId:string,analysisId:string,dto:ReassignForensicAnalysis,user:AuthenticatedUser):Promise<ForensicAnalysisDetail>{
    await this.assertAnalysisEvent(eventId,analysisId);
    await this.resourceAccessService.assertCanAccessResource(user,analysisId,Permissions.FORENSICS_READ);
    await this.db.transaction(async tx=>{
      const [row]=await tx.select().from(forensicAnalyses).where(and(eq(forensicAnalyses.id,analysisId),eq(forensicAnalyses.eventId,eventId))).for('update').limit(1);
      if(!row)throw new NotFoundException('Forensic analysis not found');
      await this.assertWritable(eventId,user);
      await this.resourceAccessService.assertCanAccessResource(user,analysisId,Permissions.FORENSICS_READ,tx);
      const unitId=await this.assertCoordinationUnit(eventId,row.assignedUnitId,user,tx);
      if(!canReassignForensic(row.status))throw new BadRequestException('Analysis is not open for reassignment');
      if(row.updatedAt.toISOString()!==dto.expectedUpdatedAt)throw new ConflictException('Analysis changed; reload before reassignment');
      if(row.assignedToUserId===dto.assignedToUserId)throw new BadRequestException('Examiner is already assigned');
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${eventId+':forensics:'+unitId}))`);
      await this.selectAnalyst(eventId,unitId,tx,dto.assignedToUserId);
      const now=new Date(Math.max(Date.now(),row.updatedAt.getTime()+1));
      await tx.update(forensicAnalyses).set({assignedToUserId:dto.assignedToUserId,updatedAt:now}).where(eq(forensicAnalyses.id,analysisId));
      await tx.delete(resourceAssignments).where(eq(resourceAssignments.resourceId,analysisId));
      await tx.insert(resourceAssignments).values({eventId,resourceId:analysisId,userId:dto.assignedToUserId,assignedByUserId:user.id});
      await tx.insert(notifications).values({id:generateId(),userId:dto.assignedToUserId,eventId,type:'FORENSIC_ASSIGNED',severity:'ACTION',templateKey:'forensics.assigned',templateParams:{analysisNumber:row.analysisNumber},resourceId:analysisId,actionUrl:`/events/${eventId}/forensics/${analysisId}`,sourceEventId:generateId()});
      const [resource]=await tx.select({visibility:resources.visibility}).from(resources).where(eq(resources.id,analysisId)).limit(1);
      await this.auditService.record({action:'forensics.reassigned',category:'forensics',eventId,resourceType:'forensic_analysis',resourceId:analysisId,actorUserId:user.id,metadata:{previousAssignedToUserId:row.assignedToUserId,assignedToUserId:dto.assignedToUserId,assignedUnitId:unitId,reason:dto.reason},txClient:tx});
      await this.activityService.recordActivity({eventId,resourceId:analysisId,activityType:'forensics.reassigned',actorUserId:user.id,title:'Forensic analysis reassigned: '+row.analysisNumber,visibility:resource?.visibility as ResourceVisibilityValue},tx);
      await tx.insert(outboxEvents).values({id:generateId(),eventType:'search.upsert',status:OutboxStatus.PENDING,payload:{type:'forensic_analysis',id:analysisId}});
    });
    return this.getAnalysisDetail(analysisId,user);
  }

  /**
   * Creates a new Digital Forensics analysis.
   */
  async createAnalysis(
    eventId: string,
    dto: CreateForensicAnalysisRequest,
    user: AuthenticatedUser
  ): Promise<ForensicAnalysisDetail> {
    const destinations=await this.listDestinationUnits(eventId,user);
    const requested=dto.assignedUnitId??dto.owningUnitId;
    const unit=requested?destinations.find(u=>u.id===requested):destinations.length===1?destinations[0]:undefined;
    if(!destinations.length){
      await this.authorizationService.assertAuthorized({user,permission:Permissions.FORENSICS_REQUEST,context:{eventId,resourceOwnerId:user.id}});
      throw new BadRequestException('No eligible digital forensics team configured');
    }
    if(!unit)throw new BadRequestException(destinations.length>1&&!requested?'Select a responsible digital forensics unit':'Invalid digital forensics destination');
    await this.assertWritable(eventId,user);
    if(dto.owningUnitId&&dto.owningUnitId!==unit.id)throw new BadRequestException('Owning unit must match destination');
    if(dto.requestedFromUnitId){
      const [origin]=await this.db.select({id:organizationalUnits.id}).from(organizationalUnits).innerJoin(membershipUnitAssignments,eq(membershipUnitAssignments.unitId,organizationalUnits.id)).innerJoin(eventMemberships,eq(eventMemberships.id,membershipUnitAssignments.membershipId)).where(and(eq(organizationalUnits.id,dto.requestedFromUnitId),eq(organizationalUnits.eventId,eventId),isNull(organizationalUnits.archivedAt),eq(eventMemberships.eventId,eventId),eq(eventMemberships.userId,user.id),eq(eventMemberships.status,'ACTIVE'))).limit(1);
      if(!origin)throw new BadRequestException('Requesting unit must belong to requester');
    }
    if(dto.assignedToUserId)await this.authorizationService.assertAuthorized({user,permission:Permissions.FORENSICS_WORK,context:{eventId,unitId:unit.id}});
    for(const [ids,type,permission] of [[dto.evidenceIds??[],'evidence',Permissions.EVIDENCE_READ],[dto.deviceIds??[],'device',Permissions.REGISTRY_READ]] as const){
      if(ids.length>30||new Set(ids).size!==ids.length)throw new BadRequestException('Invalid reference list');
      for(const id of ids){
        const source=await this.resourceService.getResource(id);
        if(!source||source.eventId!==eventId||source.resourceType!==type)throw new BadRequestException('Reference does not belong to this exercise');
        await this.resourceAccessService.assertCanAccessResource(user,id,permission);
        if(source.visibility!=='EVENT')throw new BadRequestException('Nonpublic evidence or devices require explicit controlled disclosure before forensic submission');
      }
    }
    const analysisId = generateId();
    const now = new Date();

    await this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${eventId+':forensics:'+unit.id}))`);
      const assignedToUserId=await this.selectAnalyst(eventId,unit.id,tx,dto.assignedToUserId);
      const analysisNumber=await this.identifierAllocator.allocate(eventId,'FORENSIC_ANALYSIS','FOR',tx);
      // 1. Register common resource
      await this.resourceService.registerResource(eventId, 'forensic_analysis', {
        id: analysisId,
        visibility: (dto.visibility as ResourceVisibilityValue) || ResourceVisibility.EVENT,
        owningUnitId: unit.id,
        ownerUserId: user.id,
        txClient: tx,
      });

      // 2. Insert analysis row
      const [created]=await tx.insert(forensicAnalyses).values({
        id: analysisId,
        analysisNumber,
        eventId,
        analysisType: dto.analysisType || 'FILE_ANALYSIS',
        status: 'REQUESTED',
        priority: dto.priority || 'MEDIUM',
        requestedByUserId: user.id,
        requestedFromUnitId: dto.requestedFromUnitId || null,
        assignedToUserId,
        assignedUnitId:unit.id,
        requestedAt: now,
        purpose: dto.purpose,
        methodology: dto.methodology || null,
        createdAt: now,
        updatedAt: now,
      }).returning();
      await this.notifyRequester(tx,created!);

      await tx.insert(resourceAssignments).values({eventId,resourceId:analysisId,userId:assignedToUserId,unitId:assignedToUserId?null:unit.id,assignedByUserId:user.id});
      if(assignedToUserId)await tx.insert(notifications).values({id:generateId(),userId:assignedToUserId,eventId,type:'FORENSIC_ASSIGNED',severity:'ACTION',templateKey:'forensics.assigned',templateParams:{analysisNumber},resourceId:analysisId,actionUrl:`/events/${eventId}/forensics/${analysisId}`,sourceEventId:generateId()});

      // 3. Link Evidence
      if (dto.evidenceIds && dto.evidenceIds.length > 0) {
        for (const evidenceId of dto.evidenceIds) {
          await tx.insert(forensicAnalysisEvidence).values({
            id: generateId(),
            analysisId,
            evidenceId,
            addedAt: now,
          });

          // Create cross-resource relationship
          await this.resourceService.createRelationship({
            eventId,
            sourceResourceId: analysisId,
            targetResourceId: evidenceId,
            relationshipType: 'ANALYZES_EVIDENCE',
            createdByUserId: user.id,
            txClient: tx,
          });
        }
      }

      // 4. Link Devices
      if (dto.deviceIds && dto.deviceIds.length > 0) {
        for (const deviceId of dto.deviceIds) {
          await tx.insert(forensicAnalysisDevices).values({
            id: generateId(),
            analysisId,
            deviceId,
            addedAt: now,
          });

          await this.resourceService.createRelationship({
            eventId,
            sourceResourceId: analysisId,
            targetResourceId: deviceId,
            relationshipType: 'ANALYZES_DEVICE',
            createdByUserId: user.id,
            txClient: tx,
          });
        }
      }

      // 5. Outbox for search indexing
      await tx.insert(outboxEvents).values({
        id: generateId(),
        eventType: 'search.upsert',
        status: OutboxStatus.PENDING,
        payload: {
          type: 'forensic_analysis',
          id: analysisId,
        },
      });
    // 6. Audit
    await this.auditService.record({
      action: 'forensics.requested',
      category: 'forensics',
      eventId,
      resourceType: 'forensic_analysis',
      resourceId: analysisId,
      actorUserId: user.id,
      metadata: {
        analysisNumber,
        analysisType: dto.analysisType,
        priority: dto.priority,assignedUnitId:unit.id,assignedToUserId,
      },txClient:tx,
    });

    // 7. Activity
    await this.activityService.recordActivity({
      eventId,
      resourceId: analysisId,
      activityType: 'forensics.requested',
      actorUserId: user.id,
      title: `Forensic Analysis Requested: ${analysisNumber} (${dto.analysisType})`,
      visibility: dto.visibility,
    },tx);
    });

    return this.getAnalysisDetail(analysisId, user);
  }

  /**
   * Updates analysis workflow status.
   */
  async updateStatus(analysisId:string,dto:UpdateForensicStatusRequest,user:AuthenticatedUser):Promise<ForensicAnalysisDetail>{
    const requiredPermission=dto.status==='ACCEPTED'||dto.status==='REJECTED'?Permissions.FORENSICS_ACCEPT:dto.status==='COMPLETED'?Permissions.FORENSICS_COMPLETE:dto.status==='APPROVED'?Permissions.FORENSICS_APPROVE:Permissions.FORENSICS_WORK;
    await this.resourceAccessService.assertCanAccessResource(user,analysisId,requiredPermission);
    await this.db.transaction(async tx=>{
      const [existing]=await tx.select().from(forensicAnalyses).where(eq(forensicAnalyses.id,analysisId)).for('update').limit(1);
      if(!existing)throw new NotFoundException('Forensic analysis not found');
      await this.assertWritable(existing.eventId,user);
      await this.resourceAccessService.assertCanAccessResource(user,analysisId,requiredPermission,tx);
      if(!canTransitionForensic(existing.status,dto.status))throw new BadRequestException('Invalid forensic workflow transition');
      const edits=dto.methodology!==undefined||dto.findings!==undefined||dto.conclusion!==undefined;
      if(edits){
        if(!canEditForensicReport(existing.status)||dto.status==='APPROVED')throw new BadRequestException('Report locked; save before approval');
        await this.resourceAccessService.assertCanAccessResource(user,analysisId,Permissions.FORENSICS_WORK,tx);
      }
      if((dto.status==='COMPLETED'||dto.status==='APPROVED')&&!(dto.conclusion??existing.conclusion)?.trim())throw new BadRequestException('A conclusion is required');
      const now=new Date(Math.max(Date.now(),existing.updatedAt.getTime()+1)),update:Partial<typeof forensicAnalyses.$inferInsert>={status:dto.status,updatedAt:now};
      if(dto.status==='ACCEPTED'){
        update.acceptedAt=now;
        if(!existing.assignedToUserId){
          if(existing.assignedUnitId&&await this.selectAnalyst(existing.eventId,existing.assignedUnitId,tx,user.id)!==user.id)throw new BadRequestException('Examiner is not eligible');
          update.assignedToUserId=user.id;
          await tx.delete(resourceAssignments).where(eq(resourceAssignments.resourceId,analysisId));
          await tx.insert(resourceAssignments).values({eventId:existing.eventId,resourceId:analysisId,userId:user.id,assignedByUserId:user.id});
        }
      }
      if(dto.status==='IN_PROGRESS'){update.startedAt=existing.startedAt??now;update.completedAt=null;update.approvedAt=null;}
      if(dto.status==='COMPLETED')update.completedAt=now;
      if(dto.status==='APPROVED')update.approvedAt=now;
      for(const key of ['methodology','findings','conclusion'] as const)if(dto[key]!==undefined)update[key]=dto[key];
      const [row]=await tx.update(forensicAnalyses).set(update).where(eq(forensicAnalyses.id,analysisId)).returning();
      const [resource]=await tx.select({visibility:resources.visibility}).from(resources).where(eq(resources.id,analysisId)).limit(1);
      await this.auditService.record({action:'forensics.'+dto.status.toLowerCase(),category:'forensics',eventId:existing.eventId,resourceType:'forensic_analysis',resourceId:analysisId,actorUserId:user.id,metadata:{analysisNumber:existing.analysisNumber,previousStatus:existing.status,newStatus:dto.status,notes:dto.notes},txClient:tx});
      await this.activityService.recordActivity({eventId:existing.eventId,resourceId:analysisId,activityType:'forensics.'+dto.status.toLowerCase(),actorUserId:user.id,title:'Forensic analysis '+existing.analysisNumber+': '+dto.status,visibility:resource?.visibility as ResourceVisibilityValue},tx);
      await this.notifyRequester(tx,row!);
      await tx.insert(outboxEvents).values({id:generateId(),eventType:'search.upsert',status:OutboxStatus.PENDING,payload:{type:'forensic_analysis',id:analysisId}});
    });
    return this.getAnalysisDetail(analysisId,user);
  }

  async saveReport(analysisId:string,dto:SaveForensicReport,user:AuthenticatedUser):Promise<ForensicAnalysisDetail>{
    await this.resourceAccessService.assertCanAccessResource(user,analysisId,Permissions.FORENSICS_WORK);
    await this.db.transaction(async tx=>{
      const [existing]=await tx.select().from(forensicAnalyses).where(eq(forensicAnalyses.id,analysisId)).for('update').limit(1);
      if(!existing)throw new NotFoundException('Forensic analysis not found');
      await this.assertWritable(existing.eventId,user);
      await this.resourceAccessService.assertCanAccessResource(user,analysisId,Permissions.FORENSICS_WORK,tx);
      if(!canEditForensicReport(existing.status))throw new BadRequestException('Report is locked');
      const update:Partial<typeof forensicAnalyses.$inferInsert>={updatedAt:new Date(Math.max(Date.now(),existing.updatedAt.getTime()+1))};
      for(const key of ['methodology','findings','conclusion'] as const)if(dto[key]!==undefined)update[key]=dto[key];
      await tx.update(forensicAnalyses).set(update).where(eq(forensicAnalyses.id,analysisId));
      await this.auditService.record({action:'forensics.report.saved',category:'forensics',eventId:existing.eventId,resourceType:'forensic_analysis',resourceId:analysisId,actorUserId:user.id,metadata:{fields:Object.keys(dto)},txClient:tx});
    });
    return this.getAnalysisDetail(analysisId,user);
  }

  /**
   * Adds a structured finding to a forensic analysis.
   */
  async createFinding(
    analysisId: string,
    dto: CreateForensicFindingRequest,
    user: AuthenticatedUser
  ): Promise<ForensicFinding> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      analysisId,
      Permissions.FORENSICS_WORK
    );

    return this.db.transaction(async tx=>{
    const [analysis] = await tx
      .select({ eventId: forensicAnalyses.eventId, analysisNumber: forensicAnalyses.analysisNumber,status:forensicAnalyses.status })
      .from(forensicAnalyses)
      .where(eq(forensicAnalyses.id, analysisId)).for('update')
      .limit(1);

    if (!analysis) {
      throw new NotFoundException(`Forensic analysis '${analysisId}' not found`);
    }

    await this.assertWritable(analysis.eventId,user);
    await this.resourceAccessService.assertCanAccessResource(user,analysisId,Permissions.FORENSICS_WORK,tx);
    if(!canEditForensicReport(analysis.status))throw new BadRequestException('Report is locked');
    const findingId = generateId();
    const now = new Date();

    const [created] = await tx
      .insert(forensicFindings)
      .values({
        id: findingId,
        analysisId,
        findingType: dto.findingType,
        title: dto.title,
        description: dto.description,
        confidence: dto.confidence,
        createdByUserId: user.id,
        createdAt: now,
      })
      .returning();

    // Audit
    await this.auditService.record({
      action: 'forensics.finding.created',
      category: 'forensics',
      eventId: analysis.eventId,
      resourceType: 'forensic_finding',
      resourceId: findingId,
      actorUserId: user.id,
      txClient:tx,
      metadata: {
        analysisNumber: analysis.analysisNumber,
        findingType: dto.findingType,
        title: dto.title,
      },
    });

    // Activity
    await this.activityService.recordActivity({
      eventId: analysis.eventId,
      resourceId: analysisId,
      activityType: 'forensics.finding.created',
      actorUserId: user.id,
      title: `Forensic finding recorded: ${analysis.analysisNumber}`,
    },tx);

    // Reindex analysis
    await tx.insert(outboxEvents).values({
      id: generateId(),
      eventType: 'search.upsert',
      status: OutboxStatus.PENDING,
      payload: {
        type: 'forensic_analysis',
        id: analysisId,
      },
    });

    return {
      id: created!.id,
      analysisId: created!.analysisId,
      findingType: created!.findingType,
      title: created!.title,
      description: created!.description,
      confidence: created!.confidence,
      createdByUserId: created!.createdByUserId,
      createdAt: created!.createdAt.toISOString(),
    };
    });
  }

  /**
   * Adds an acquisition/image metadata record.
   */
  async createAcquisition(
    analysisId: string,
    dto: CreateForensicAcquisitionRequest,
    user: AuthenticatedUser
  ): Promise<ForensicAcquisition> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      analysisId,
      Permissions.FORENSICS_WORK
    );

    return this.db.transaction(async tx=>{
    const [analysis] = await tx
      .select({ eventId: forensicAnalyses.eventId, analysisNumber: forensicAnalyses.analysisNumber,status:forensicAnalyses.status })
      .from(forensicAnalyses)
      .where(eq(forensicAnalyses.id, analysisId)).for('update')
      .limit(1);

    if (!analysis) {
      throw new NotFoundException(`Forensic analysis '${analysisId}' not found`);
    }

    await this.assertWritable(analysis.eventId,user);
    await this.resourceAccessService.assertCanAccessResource(user,analysisId,Permissions.FORENSICS_WORK,tx);
    if(!canEditForensicReport(analysis.status))throw new BadRequestException('Report is locked');
    for(const [id,table] of [[dto.evidenceId,forensicAnalysisEvidence],[dto.deviceId,forensicAnalysisDevices]] as const){
      if(!id)continue;
      // Check the exact input against the analysis, not an arbitrary UUID supplied by the caller.
      const link=table===forensicAnalysisEvidence?await tx.select({id:forensicAnalysisEvidence.id}).from(forensicAnalysisEvidence).where(and(eq(forensicAnalysisEvidence.analysisId,analysisId),eq(forensicAnalysisEvidence.evidenceId,id))).limit(1):await tx.select({id:forensicAnalysisDevices.id}).from(forensicAnalysisDevices).where(and(eq(forensicAnalysisDevices.analysisId,analysisId),eq(forensicAnalysisDevices.deviceId,id))).limit(1);
      if(!link.length)throw new BadRequestException('Acquisition source is not linked to this analysis');
    }
    const acquisitionId = generateId();
    const now = new Date();

    const [created] = await tx
      .insert(forensicAcquisitions)
      .values({
        id: acquisitionId,
        analysisId,
        evidenceId: dto.evidenceId || null,
        deviceId: dto.deviceId || null,
        acquisitionType: dto.acquisitionType,
        startedAt: dto.startedAt ? new Date(dto.startedAt) : now,
        completedAt: dto.completedAt ? new Date(dto.completedAt) : now,
        toolName: dto.toolName || null,
        toolVersion: dto.toolVersion || null,
        sourceSize: dto.sourceSize || null,
        hashAlgorithm: dto.hashAlgorithm || 'SHA-256',
        sourceHash: dto.sourceHash || null,
        imageHash: dto.imageHash || null,
        storageReference: dto.storageReference || null,
        notes: dto.notes || null,
        createdAt: now,
      })
      .returning();

    // Audit
    await this.auditService.record({
      action: 'forensics.acquisition.created',
      category: 'forensics',
      eventId: analysis.eventId,
      resourceType: 'forensic_acquisition',
      resourceId: acquisitionId,
      actorUserId: user.id,
      txClient:tx,
      metadata: {
        analysisNumber: analysis.analysisNumber,
        acquisitionType: dto.acquisitionType,
        hashAlgorithm: dto.hashAlgorithm,
        imageHash: dto.imageHash,
      },
    });

    return {
      id: created!.id,
      analysisId: created!.analysisId,
      evidenceId: created!.evidenceId,
      deviceId: created!.deviceId,
      acquisitionType: created!.acquisitionType,
      startedAt: created!.startedAt.toISOString(),
      completedAt: created!.completedAt ? created!.completedAt.toISOString() : null,
      toolName: created!.toolName,
      toolVersion: created!.toolVersion,
      sourceSize: created!.sourceSize,
      hashAlgorithm: created!.hashAlgorithm,
      sourceHash: created!.sourceHash,
      imageHash: created!.imageHash,
      storageReference: created!.storageReference,
      notes: created!.notes,
      createdAt: created!.createdAt.toISOString(),
    };
    });
  }

  /**
   * Creates a Technical Indicator.
   */
  async createIndicator(
    eventId: string,
    dto: CreateTechnicalIndicatorRequest,
    user: AuthenticatedUser
  ): Promise<TechnicalIndicator> {
    await this.authorizationService.assertAuthorized({user,permission:Permissions.INDICATOR_CREATE,context:{eventId,resourceOwnerId:user.id}});
    await this.assertWritable(eventId,user);
    const indicatorId = generateId();
    const now = new Date();
    const trimmed = dto.value.trim();
    const normalizedValue = normalizeSearchText(trimmed);

    await this.db.transaction(async (tx) => {
      // 1. Register common resource
      await this.resourceService.registerResource(eventId, 'technical_indicator', {
        id: indicatorId,
        visibility: ResourceVisibility.EVENT,
        ownerUserId: user.id,
        txClient: tx,
      });

      // 2. Insert indicator
      await tx.insert(technicalIndicators).values({
        id: indicatorId,
        eventId,
        indicatorType: dto.indicatorType,
        value: trimmed,
        normalizedValue,
        description: dto.description || null,
        verificationState: dto.verificationState || 'UNVERIFIED',
        firstSeenAt: dto.firstSeenAt ? new Date(dto.firstSeenAt) : now,
        createdAt: now,
        updatedAt: now,
      });

      // 3. Outbox for Typesense exact search indexing
      await tx.insert(outboxEvents).values({
        id: generateId(),
        eventType: 'search.upsert',
        status: OutboxStatus.PENDING,
        payload: {
          type: 'technical_indicator',
          id: indicatorId,
        },
      });
    });

    // 4. Audit
    await this.auditService.record({
      action: 'indicator.created',
      category: 'forensics',
      eventId,
      resourceType: 'technical_indicator',
      resourceId: indicatorId,
      actorUserId: user.id,
      metadata: {
        indicatorType: dto.indicatorType,
        value: trimmed,
      },
    });

    // 5. Activity
    await this.activityService.recordActivity({
      eventId,
      resourceId: indicatorId,
      activityType: 'indicator.discovered',
      actorUserId: user.id,
      title: `Indicator Discovered (${dto.indicatorType}): ${trimmed}`,
      summary: dto.description || `Verification state: ${dto.verificationState || 'UNVERIFIED'}`,
    });

    return {
      id: indicatorId,
      eventId,
      indicatorType: dto.indicatorType,
      value: trimmed,
      normalizedValue,
      description: dto.description || null,
      verificationState: dto.verificationState || 'UNVERIFIED',
      firstSeenAt: dto.firstSeenAt ? new Date(dto.firstSeenAt).toISOString() : now.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  }

  /**
   * Retrieves full analysis detail.
   */
  async getAnalysisDetail(
    analysisId: string,
    user: AuthenticatedUser
  ): Promise<ForensicAnalysisDetail> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      analysisId,
      Permissions.FORENSICS_READ
    );

    const [row] = await this.db
      .select()
      .from(forensicAnalyses)
      .where(eq(forensicAnalyses.id, analysisId))
      .limit(1);

    if (!row) {
      throw new NotFoundException(`Forensic analysis '${analysisId}' not found`);
    }

    const reportAvailable=row.status==='APPROVED'&&!!row.approvedAt;
    const [accept,work,complete,approve]=await Promise.all([Permissions.FORENSICS_ACCEPT,Permissions.FORENSICS_WORK,Permissions.FORENSICS_COMPLETE,Permissions.FORENSICS_APPROVE].map(p=>this.resourceAccessService.canAccessResource(user,analysisId,p)));
    const reassign=Boolean(row.assignedUnitId&&canReassignForensic(row.status)&&await this.authorizationService.authorize({user,permission:Permissions.FORENSICS_REASSIGN,context:{eventId:row.eventId,unitId:row.assignedUnitId}}));
    const canSeeReport=reportAvailable||work||approve||complete;
    // Findings
    const findingsRows = await this.db
      .select()
      .from(forensicFindings)
      .where(eq(forensicFindings.analysisId, analysisId))
      .orderBy(desc(forensicFindings.createdAt));

    // Acquisitions
    const acquisitionsRows = await this.db
      .select()
      .from(forensicAcquisitions)
      .where(eq(forensicAcquisitions.analysisId, analysisId))
      .orderBy(desc(forensicAcquisitions.createdAt));

    // Evidence links
    const evidenceRows = await this.db
      .select({
        id: evidence.id,
        evidenceNumber: evidence.evidenceNumber,
        description: evidence.description,
        status: evidence.status,
      })
      .from(forensicAnalysisEvidence)
      .innerJoin(evidence, eq(forensicAnalysisEvidence.evidenceId, evidence.id))
      .innerJoin(resources,eq(resources.id,evidence.id))
      .where(and(eq(forensicAnalysisEvidence.analysisId, analysisId),eq(resources.eventId,row.eventId)));

    // Device links
    const deviceRows = await this.db
      .select({
        id: devices.id,
        name: devices.label,
        deviceType: devices.deviceType,
      })
      .from(forensicAnalysisDevices)
      .innerJoin(devices, eq(forensicAnalysisDevices.deviceId, devices.id))
      .innerJoin(resources,eq(resources.id,devices.id))
      .where(and(eq(forensicAnalysisDevices.analysisId, analysisId),eq(resources.eventId,row.eventId)));

    const visibleEvidence=[] as typeof evidenceRows;
    for(const item of evidenceRows)if(await this.resourceAccessService.canAccessResource(user,item.id,Permissions.EVIDENCE_READ))visibleEvidence.push(item);
    const visibleDevices=[] as typeof deviceRows;
    for(const item of deviceRows)if(await this.resourceAccessService.canAccessResource(user,item.id,Permissions.REGISTRY_READ))visibleDevices.push(item);
    return {
      id: row.id,
      analysisNumber: row.analysisNumber,
      eventId: row.eventId,
      analysisType: row.analysisType,
      status: row.status,
      priority: row.priority,
      requestedByUserId: row.requestedByUserId,
      requestedFromUnitId: row.requestedFromUnitId,
      assignedToUserId: row.assignedToUserId,
      assignedUnitId: row.assignedUnitId,
      requestedAt: row.requestedAt.toISOString(),
      acceptedAt: row.acceptedAt ? row.acceptedAt.toISOString() : null,
      startedAt: row.startedAt ? row.startedAt.toISOString() : null,
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
      purpose: row.purpose,
      methodology: canSeeReport?row.methodology:null,
      findings: canSeeReport?row.findings:null,
      conclusion: canSeeReport?row.conclusion:null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      reportAvailable,actions:{accept,work,complete,approve,reassign},
      requesterName:row.requestedByUserId?(await this.db.select({name:users.displayName}).from(users).where(eq(users.id,row.requestedByUserId)).limit(1))[0]?.name??null:null,
      analystName:row.assignedToUserId?(await this.db.select({name:users.displayName}).from(users).where(eq(users.id,row.assignedToUserId)).limit(1))[0]?.name??null:null,
      unitName:row.assignedUnitId?(await this.db.select({name:organizationalUnits.name}).from(organizationalUnits).where(and(eq(organizationalUnits.id,row.assignedUnitId),eq(organizationalUnits.eventId,row.eventId))).limit(1))[0]?.name??null:null,
      findingsList: (canSeeReport?findingsRows:[]).map((f) => ({
        id: f.id,
        analysisId: f.analysisId,
        findingType: f.findingType,
        title: f.title,
        description: f.description,
        confidence: f.confidence,
        createdByUserId: f.createdByUserId,
        createdAt: f.createdAt.toISOString(),
      })),
      acquisitions: (canSeeReport?acquisitionsRows:[]).map((a) => ({
        id: a.id,
        analysisId: a.analysisId,
        evidenceId:visibleEvidence.some(e=>e.id===a.evidenceId)?a.evidenceId:null,
        deviceId:visibleDevices.some(d=>d.id===a.deviceId)?a.deviceId:null,
        acquisitionType: a.acquisitionType,
        startedAt: a.startedAt.toISOString(),
        completedAt: a.completedAt ? a.completedAt.toISOString() : null,
        toolName: a.toolName,
        toolVersion: a.toolVersion,
        sourceSize: a.sourceSize,
        hashAlgorithm: a.hashAlgorithm,
        sourceHash: a.sourceHash,
        imageHash: a.imageHash,
        storageReference: work||approve?a.storageReference:null,
        notes: work||approve?a.notes:null,
        createdAt: a.createdAt.toISOString(),
      })),
      evidenceLinks: visibleEvidence.map((e) => ({
        id: e.id,
        evidenceNumber: e.evidenceNumber,
        description: e.description || '',
        status: e.status,
      })),
      deviceLinks: visibleDevices,
    };
  }

  /**
   * Lists analyses with access filtering.
   */
  async listAnalyses(
    eventId: string,
    filters: ForensicQueryFilters,
    user: AuthenticatedUser
  ): Promise<{ items: ForensicAnalysisItem[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const offset = (page - 1) * limit;

    const conditions = [eq(forensicAnalyses.eventId, eventId)];
    if(filters.evidenceId){
      const source=await this.resourceService.getResource(filters.evidenceId);
      if(!source||source.eventId!==eventId||source.resourceType!=='evidence')throw new NotFoundException('Evidence not found');
      await this.resourceAccessService.assertCanAccessResource(user,filters.evidenceId,Permissions.EVIDENCE_READ);
      conditions.push(inArray(forensicAnalyses.id,this.db.select({id:forensicAnalysisEvidence.analysisId}).from(forensicAnalysisEvidence).where(eq(forensicAnalysisEvidence.evidenceId,filters.evidenceId))));
    }
    if(filters.mine==='requested')conditions.push(eq(forensicAnalyses.requestedByUserId,user.id));
    if(filters.mine==='assigned'){
      const activeUnits=this.db.select({id:membershipUnitAssignments.unitId})
        .from(membershipUnitAssignments)
        .innerJoin(eventMemberships,eq(eventMemberships.id,membershipUnitAssignments.membershipId))
        .innerJoin(organizationalUnits,eq(organizationalUnits.id,membershipUnitAssignments.unitId))
        .where(and(eq(eventMemberships.eventId,eventId),eq(eventMemberships.userId,user.id),
          eq(eventMemberships.status,'ACTIVE'),eq(organizationalUnits.eventId,eventId),isNull(organizationalUnits.archivedAt)));
      conditions.push(or(eq(forensicAnalyses.assignedToUserId,user.id),
        and(isNull(forensicAnalyses.assignedToUserId),inArray(forensicAnalyses.assignedUnitId,activeUnits)))!);
    }
    if(filters.assignedToUserId)conditions.push(eq(forensicAnalyses.assignedToUserId,filters.assignedToUserId));
    if(filters.assignedUnitId)conditions.push(eq(forensicAnalyses.assignedUnitId,filters.assignedUnitId));
    if (filters.status) conditions.push(eq(forensicAnalyses.status, filters.status));
    if (filters.analysisType) conditions.push(eq(forensicAnalyses.analysisType, filters.analysisType));
    if (filters.priority) conditions.push(eq(forensicAnalyses.priority, filters.priority));
    const search=filters.search?.trim();
    if(search)conditions.push(sql`(strpos(lower(${forensicAnalyses.analysisNumber}),lower(${search}))>0 OR strpos(lower(coalesce(${forensicAnalyses.purpose},'')),lower(${search}))>0 OR strpos(lower(${forensicAnalyses.analysisType}),lower(${search}))>0)`);

    // Page over authorized results, not raw database rows.
    const accessible: ForensicAnalysisItem[] = [];
    let total=0;
    const batchSize=100;
    for(let scanned=0;;scanned+=batchSize){
      const rows=await this.db.select().from(forensicAnalyses).where(and(...conditions))
        .orderBy(desc(forensicAnalyses.createdAt),desc(forensicAnalyses.id)).limit(batchSize).offset(scanned);
      for (const r of rows) {
      const canAccess = await this.resourceAccessService.canAccessResource(
        user,
        r.id,
        Permissions.FORENSICS_READ
      );
      if (canAccess) {
        const index=total++;
        if(index<offset||accessible.length>=limit)continue;
        const canSeeReport=r.status==='APPROVED'&&!!r.approvedAt||await this.resourceAccessService.canAccessResource(user,r.id,Permissions.FORENSICS_WORK)||await this.resourceAccessService.canAccessResource(user,r.id,Permissions.FORENSICS_APPROVE);
        accessible.push({
          id: r.id,
          analysisNumber: r.analysisNumber,
          eventId: r.eventId,
          analysisType: r.analysisType,
          status: r.status,
          priority: r.priority,
          requestedByUserId: r.requestedByUserId,
          requestedFromUnitId: r.requestedFromUnitId,
          assignedToUserId: r.assignedToUserId,
          assignedUnitId: r.assignedUnitId,
          requestedAt: r.requestedAt.toISOString(),
          acceptedAt: r.acceptedAt ? r.acceptedAt.toISOString() : null,
          startedAt: r.startedAt ? r.startedAt.toISOString() : null,
          completedAt: r.completedAt ? r.completedAt.toISOString() : null,
          approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null,
          reportAvailable:r.status==='APPROVED'&&!!r.approvedAt,
          purpose: r.purpose,
          methodology: canSeeReport?r.methodology:null,
          findings: canSeeReport?r.findings:null,
          conclusion: canSeeReport?r.conclusion:null,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        });
      }
      }
      if(rows.length<batchSize)break;
    }

    return {
      items: accessible,
      total,
      page,
      limit,
    };
  }

  /**
   * Lists technical indicators in an event.
   */
  async listIndicators(
    eventId: string,
    user: AuthenticatedUser
  ): Promise<TechnicalIndicator[]> {
    const rows = await this.db
      .select()
      .from(technicalIndicators)
      .where(eq(technicalIndicators.eventId, eventId))
      .orderBy(desc(technicalIndicators.createdAt))
      .limit(200);

    const accessible: TechnicalIndicator[] = [];
    for (const r of rows) {
      const canAccess = await this.resourceAccessService.canAccessResource(
        user,
        r.id,
        Permissions.INDICATOR_READ
      );
      if (canAccess) {
        accessible.push({
          id: r.id,
          eventId: r.eventId,
          indicatorType: r.indicatorType,
          value: r.value,
          normalizedValue: r.normalizedValue,
          description: r.description,
          verificationState: r.verificationState,
          firstSeenAt: r.firstSeenAt ? r.firstSeenAt.toISOString() : null,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        });
      }
    }

    return accessible;
  }
}

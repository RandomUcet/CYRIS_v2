import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,ConflictException,
} from '@nestjs/common';
import { eq, and, desc, isNull } from 'drizzle-orm';
import {canTransitionForensic,canEditForensicReport} from './forensic-lifecycle.js';
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
  resources, organizationalUnits, resourceAssignments, users, events, notifications,
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
  ForensicQueryFilters,SaveForensicReport,
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

  /**
   * Creates a new Digital Forensics analysis.
   */
  async createAnalysis(
    eventId: string,
    dto: CreateForensicAnalysisRequest,
    user: AuthenticatedUser
  ): Promise<ForensicAnalysisDetail> {
    await this.authorizationService.assertAuthorized({user,permission:Permissions.FORENSICS_REQUEST,context:{eventId,unitId:dto.requestedFromUnitId,resourceOwnerId:user.id}});
    await this.assertWritable(eventId,user);
    for(const unitId of new Set([dto.requestedFromUnitId,dto.assignedUnitId,dto.owningUnitId].filter((id):id is string=>!!id))){
      const [unit]=await this.db.select({id:organizationalUnits.id}).from(organizationalUnits).where(and(eq(organizationalUnits.id,unitId),eq(organizationalUnits.eventId,eventId),isNull(organizationalUnits.archivedAt))).limit(1);
      if(!unit)throw new BadRequestException('Unit is unavailable in this exercise');
    }
    // Explicit assignment is a worker/organizer operation, not an authority granted by requesting work.
    if(dto.assignedToUserId||dto.assignedUnitId||dto.owningUnitId){
      await this.authorizationService.assertAuthorized({user,permission:Permissions.FORENSICS_WORK,context:{eventId,unitId:dto.assignedUnitId??dto.owningUnitId}});
      if(dto.assignedToUserId){
        if(!dto.assignedUnitId)throw new BadRequestException('An assigned unit is required');
        const [target]=await this.db.select({id:users.id,email:users.email,displayName:users.displayName,status:users.status}).from(users).where(eq(users.id,dto.assignedToUserId)).limit(1);
        if(!target||!await this.authorizationService.hasEventCapability({user:target,permission:Permissions.FORENSICS_WORK,eventId,unitId:dto.assignedUnitId,resourceScopes:['ASSIGNED'],requireUnitMembership:true}))throw new BadRequestException('Assignee is not eligible in this exercise');
      }
    }
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

    const analysisNumber = await this.identifierAllocator.allocate(
      eventId,
      'FORENSIC_ANALYSIS',
      'FOR'
    );

    await this.db.transaction(async (tx) => {
      // 1. Register common resource
      await this.resourceService.registerResource(eventId, 'forensic_analysis', {
        id: analysisId,
        visibility: (dto.visibility as ResourceVisibilityValue) || ResourceVisibility.EVENT,
        owningUnitId: dto.owningUnitId || dto.assignedUnitId || null,
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
        assignedToUserId: dto.assignedToUserId || null,
        assignedUnitId: dto.assignedUnitId || null,
        requestedAt: now,
        purpose: dto.purpose,
        methodology: dto.methodology || null,
        createdAt: now,
        updatedAt: now,
      }).returning();
      await this.notifyRequester(tx,created!);

      if(dto.assignedToUserId)await tx.insert(resourceAssignments).values({eventId,resourceId:analysisId,userId:dto.assignedToUserId,assignedByUserId:user.id});

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
        priority: dto.priority,
      },
    });

    // 7. Activity
    await this.activityService.recordActivity({
      eventId,
      resourceId: analysisId,
      activityType: 'forensics.requested',
      actorUserId: user.id,
      title: `Forensic Analysis Requested: ${analysisNumber} (${dto.analysisType})`,
      visibility: dto.visibility,
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
      const now=new Date(),update:Partial<typeof forensicAnalyses.$inferInsert>={status:dto.status,updatedAt:now};
      if(dto.status==='ACCEPTED'){
        update.acceptedAt=now;
        if(!existing.assignedToUserId){
          update.assignedToUserId=user.id;
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
      const update:Partial<typeof forensicAnalyses.$inferInsert>={updatedAt:new Date()};
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
      reportAvailable,actions:{accept,work,complete,approve},
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
        evidenceId: a.evidenceId,
        deviceId: a.deviceId,
        acquisitionType: a.acquisitionType,
        startedAt: a.startedAt.toISOString(),
        completedAt: a.completedAt ? a.completedAt.toISOString() : null,
        toolName: a.toolName,
        toolVersion: a.toolVersion,
        sourceSize: a.sourceSize,
        hashAlgorithm: a.hashAlgorithm,
        sourceHash: a.sourceHash,
        imageHash: a.imageHash,
        storageReference: a.storageReference,
        notes: a.notes,
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
    if (filters.status) conditions.push(eq(forensicAnalyses.status, filters.status));
    if (filters.analysisType) conditions.push(eq(forensicAnalyses.analysisType, filters.analysisType));
    if (filters.priority) conditions.push(eq(forensicAnalyses.priority, filters.priority));

    const rows = await this.db
      .select()
      .from(forensicAnalyses)
      .where(and(...conditions))
      .orderBy(desc(forensicAnalyses.createdAt))
      .limit(limit)
      .offset(offset);

    const accessible: ForensicAnalysisItem[] = [];
    for (const r of rows) {
      const canAccess = await this.resourceAccessService.canAccessResource(
        user,
        r.id,
        Permissions.FORENSICS_READ
      );
      if (canAccess) {
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
          purpose: r.purpose,
          methodology: canSeeReport?r.methodology:null,
          findings: canSeeReport?r.findings:null,
          conclusion: canSeeReport?r.conclusion:null,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        });
      }
    }

    return {
      items: accessible,
      total: accessible.length,
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

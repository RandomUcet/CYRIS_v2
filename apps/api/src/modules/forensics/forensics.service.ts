import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
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
  resources,
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
  ForensicQueryFilters,
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
    private readonly identifierAllocator: IdentifierAllocatorService
  ) {}

  private get db() {
    return this.databaseService.client;
  }

  /**
   * Creates a new Digital Forensics analysis.
   */
  async createAnalysis(
    eventId: string,
    dto: CreateForensicAnalysisRequest,
    user: AuthenticatedUser
  ): Promise<ForensicAnalysisDetail> {
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
      await tx.insert(forensicAnalyses).values({
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
      });

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
      summary: dto.purpose,
    });

    return this.getAnalysisDetail(analysisId, user);
  }

  /**
   * Updates analysis workflow status.
   */
  async updateStatus(
    analysisId: string,
    dto: UpdateForensicStatusRequest,
    user: AuthenticatedUser
  ): Promise<ForensicAnalysisDetail> {
    const requiredPermission =
      dto.status === 'ACCEPTED'
        ? Permissions.FORENSICS_ACCEPT
        : dto.status === 'IN_PROGRESS'
        ? Permissions.FORENSICS_WORK
        : dto.status === 'COMPLETED'
        ? Permissions.FORENSICS_COMPLETE
        : dto.status === 'APPROVED'
        ? Permissions.FORENSICS_APPROVE
        : Permissions.FORENSICS_WORK;

    await this.resourceAccessService.assertCanAccessResource(
      user,
      analysisId,
      requiredPermission
    );

    const [existing] = await this.db
      .select()
      .from(forensicAnalyses)
      .where(eq(forensicAnalyses.id, analysisId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`Forensic analysis '${analysisId}' not found`);
    }

    const now = new Date();
    const updateData: Partial<typeof forensicAnalyses.$inferInsert> = {
      status: dto.status,
      updatedAt: now,
    };

    if (dto.status === 'ACCEPTED' && !existing.acceptedAt) {
      updateData.acceptedAt = now;
      if (!existing.assignedToUserId) {
        updateData.assignedToUserId = user.id;
      }
    } else if (dto.status === 'IN_PROGRESS' && !existing.startedAt) {
      updateData.startedAt = now;
    } else if (dto.status === 'COMPLETED' && !existing.completedAt) {
      updateData.completedAt = now;
    } else if (dto.status === 'APPROVED' && !existing.approvedAt) {
      updateData.approvedAt = now;
    }

    if (dto.findings !== undefined) updateData.findings = dto.findings;
    if (dto.conclusion !== undefined) updateData.conclusion = dto.conclusion;
    if (dto.methodology !== undefined) updateData.methodology = dto.methodology;

    await this.db
      .update(forensicAnalyses)
      .set(updateData)
      .where(eq(forensicAnalyses.id, analysisId));

    // Audit
    await this.auditService.record({
      action: `forensics.${dto.status.toLowerCase()}`,
      category: 'forensics',
      eventId: existing.eventId,
      resourceType: 'forensic_analysis',
      resourceId: analysisId,
      actorUserId: user.id,
      metadata: {
        analysisNumber: existing.analysisNumber,
        previousStatus: existing.status,
        newStatus: dto.status,
        notes: dto.notes,
      },
    });

    // Activity
    await this.activityService.recordActivity({
      eventId: existing.eventId,
      resourceId: analysisId,
      activityType: `forensics.${dto.status.toLowerCase()}`,
      actorUserId: user.id,
      title: `Forensic Analysis ${dto.status}: ${existing.analysisNumber}`,
      summary: dto.notes || `Transitioned from ${existing.status} to ${dto.status}`,
    });

    // Update search index
    await this.db.insert(outboxEvents).values({
      id: generateId(),
      eventType: 'search.upsert',
      status: OutboxStatus.PENDING,
      payload: {
        type: 'forensic_analysis',
        id: analysisId,
      },
    });

    return this.getAnalysisDetail(analysisId, user);
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

    const [analysis] = await this.db
      .select({ eventId: forensicAnalyses.eventId, analysisNumber: forensicAnalyses.analysisNumber })
      .from(forensicAnalyses)
      .where(eq(forensicAnalyses.id, analysisId))
      .limit(1);

    if (!analysis) {
      throw new NotFoundException(`Forensic analysis '${analysisId}' not found`);
    }

    const findingId = generateId();
    const now = new Date();

    const [created] = await this.db
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
      title: `Finding Added (${dto.findingType}): ${dto.title}`,
      summary: dto.description.slice(0, 150),
    });

    // Reindex analysis
    await this.db.insert(outboxEvents).values({
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

    const [analysis] = await this.db
      .select({ eventId: forensicAnalyses.eventId, analysisNumber: forensicAnalyses.analysisNumber })
      .from(forensicAnalyses)
      .where(eq(forensicAnalyses.id, analysisId))
      .limit(1);

    if (!analysis) {
      throw new NotFoundException(`Forensic analysis '${analysisId}' not found`);
    }

    const acquisitionId = generateId();
    const now = new Date();

    const [created] = await this.db
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
  }

  /**
   * Creates a Technical Indicator.
   */
  async createIndicator(
    eventId: string,
    dto: CreateTechnicalIndicatorRequest,
    user: AuthenticatedUser
  ): Promise<TechnicalIndicator> {
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
      .where(eq(forensicAnalysisEvidence.analysisId, analysisId));

    // Device links
    const deviceRows = await this.db
      .select({
        id: devices.id,
        name: devices.label,
        deviceType: devices.deviceType,
      })
      .from(forensicAnalysisDevices)
      .innerJoin(devices, eq(forensicAnalysisDevices.deviceId, devices.id))
      .where(eq(forensicAnalysisDevices.analysisId, analysisId));

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
      methodology: row.methodology,
      findings: row.findings,
      conclusion: row.conclusion,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      findingsList: findingsRows.map((f) => ({
        id: f.id,
        analysisId: f.analysisId,
        findingType: f.findingType,
        title: f.title,
        description: f.description,
        confidence: f.confidence,
        createdByUserId: f.createdByUserId,
        createdAt: f.createdAt.toISOString(),
      })),
      acquisitions: acquisitionsRows.map((a) => ({
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
      evidenceLinks: evidenceRows.map((e) => ({
        id: e.id,
        evidenceNumber: e.evidenceNumber,
        description: e.description || '',
        status: e.status,
      })),
      deviceLinks: deviceRows,
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
          methodology: r.methodology,
          findings: r.findings,
          conclusion: r.conclusion,
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

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ActivityService } from '../resources/activity.service.js';
import { ResourceService } from '../resources/resource.service.js';
import { ResourceAccessService } from '../resources/resource-access.service.js';
import { IdentifierAllocatorService } from '../resources/identifier-allocator.service.js';
import {
  courtCases,
  courtCaseParties,
  charges,
  courtExhibits,
  courtHearings,
  courtFilings,
  courtDecisions,
  resources,
  cases,
  evidence,
  evidenceCustodyTransfers,
  persons,
  organisations,
  documents,
  activityEvents,
  outboxEvents,
  OutboxStatus,
  ResourceVisibility,
  type ResourceVisibilityValue,
} from '@cyris/db';
import { Permissions, generateId } from '@cyris/shared';
import type { AuthenticatedUser } from '../auth/session.service.js';
import type {
  CourtCaseItem,
  CourtCaseDetail,
  CourtCaseParty,
  Charge,
  CourtExhibit,
  CourtHearing,
  CourtFiling,
  CourtDecision,
  CourtTimelineEvent,
  CreateCourtCaseRequest,
  UpdateCourtCaseStatusRequest,
  AddCourtCasePartyRequest,
  CreateChargeRequest,
  UpdateChargeStatusRequest,
  SubmitCourtExhibitRequest,
  DecideCourtExhibitRequest,
  CreateCourtHearingRequest,
  UpdateCourtHearingStatusRequest,
  CreateCourtFilingRequest,
  CreateCourtDecisionRequest,
  CourtQueryFilters,
} from '@cyris/contracts';

@Injectable()
export class CourtService {
  private readonly logger = new Logger(CourtService.name);

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

  /** A court permission must never substitute for canonical source access. */
  private async assertReadableSource(eventId: string, id: string, type: 'evidence' | 'document', user: AuthenticatedUser): Promise<void> {
    const [row] = await this.db.select({id: resources.id}).from(resources)
      .where(and(eq(resources.id,id),eq(resources.eventId,eventId),eq(resources.resourceType,type))).limit(1);
    if (!row) throw new NotFoundException('Linked source not found in this exercise');
    await this.resourceAccessService.assertCanAccessResource(user,id,type==='evidence'?Permissions.EVIDENCE_READ:Permissions.DOCUMENT_READ);
  }

  /** Reject a court case addressed through another exercise, before any action. */
  async assertCaseInEvent(eventId: string, courtCaseId: string): Promise<void> {
    const [row] = await this.db.select({id: courtCases.id}).from(courtCases)
      .innerJoin(resources, eq(resources.id, courtCases.id))
      .where(and(eq(courtCases.id, courtCaseId), eq(courtCases.eventId, eventId), eq(resources.eventId, eventId)))
      .limit(1);
    if (!row) throw new NotFoundException('Court case not found in this exercise');
  }

  /**
   * Creates a new legal matter / court case.
   */
  async createCourtCase(
    eventId: string,
    dto: CreateCourtCaseRequest,
    user: AuthenticatedUser
  ): Promise<CourtCaseDetail> {
    const courtCaseId = generateId();
    const now = new Date();

    const courtCaseNumber = await this.identifierAllocator.allocate(
      eventId,
      'COURT_CASE',
      'CRT'
    );

    await this.db.transaction(async (tx) => {
      // 1. Register common resource
      await this.resourceService.registerResource(eventId, 'court_case', {
        id: courtCaseId,
        visibility: (dto.visibility as ResourceVisibilityValue) || ResourceVisibility.EVENT,
        owningUnitId: dto.owningUnitId || null,
        ownerUserId: user.id,
        txClient: tx,
      });

      // 2. Insert court_case row
      await tx.insert(courtCases).values({
        id: courtCaseId,
        courtCaseNumber,
        eventId,
        title: dto.title,
        summary: dto.summary || null,
        status: 'PREPARATION',
        originatingCaseId: dto.originatingCaseId || null,
        openedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      // 3. Link originating investigation case if provided
      if (dto.originatingCaseId) {
        await this.resourceService.createRelationship({
          eventId,
          sourceResourceId: courtCaseId,
          targetResourceId: dto.originatingCaseId,
          relationshipType: 'ORIGINATING_INVESTIGATION',
          createdByUserId: user.id,
          txClient: tx,
        });
      }

      // 4. Outbox for search indexing
      await tx.insert(outboxEvents).values({
        id: generateId(),
        eventType: 'search.upsert',
        status: OutboxStatus.PENDING,
        payload: {
          type: 'court_case',
          id: courtCaseId,
        },
      });
    });

    // 5. Audit
    await this.auditService.record({
      action: 'court.case.created',
      category: 'court',
      eventId,
      resourceType: 'court_case',
      resourceId: courtCaseId,
      actorUserId: user.id,
      metadata: {
        courtCaseNumber,
        title: dto.title,
        originatingCaseId: dto.originatingCaseId || null,
      },
    });

    // 6. Activity
    await this.activityService.recordActivity({
      eventId,
      resourceId: courtCaseId,
      activityType: 'court.case.created',
      actorUserId: user.id,
      title: `Court Case Opened: ${courtCaseNumber} — ${dto.title}`,
      summary: dto.summary || 'Initial preparation of legal proceedings',
    });

    return this.getCourtCaseDetail(courtCaseId, user);
  }

  /**
   * Updates Court Case lifecycle status.
   */
  async updateStatus(
    courtCaseId: string,
    dto: UpdateCourtCaseStatusRequest,
    user: AuthenticatedUser
  ): Promise<CourtCaseDetail> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      courtCaseId,
      Permissions.COURT_UPDATE
    );

    const [existing] = await this.db
      .select()
      .from(courtCases)
      .where(eq(courtCases.id, courtCaseId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`Court case '${courtCaseId}' not found`);
    }

    const now = new Date();
    const updateData: Partial<typeof courtCases.$inferInsert> = {
      status: dto.status,
      updatedAt: now,
    };

    if (dto.status === 'CLOSED' && !existing.closedAt) {
      updateData.closedAt = now;
    }
    if (dto.summary !== undefined) {
      updateData.summary = dto.summary;
    }

    await this.db
      .update(courtCases)
      .set(updateData)
      .where(eq(courtCases.id, courtCaseId));

    // Audit
    await this.auditService.record({
      action: 'court.case.status_updated',
      category: 'court',
      eventId: existing.eventId,
      resourceType: 'court_case',
      resourceId: courtCaseId,
      actorUserId: user.id,
      metadata: {
        courtCaseNumber: existing.courtCaseNumber,
        previousStatus: existing.status,
        newStatus: dto.status,
      },
    });

    // Activity
    await this.activityService.recordActivity({
      eventId: existing.eventId,
      resourceId: courtCaseId,
      activityType: 'court.case.status_updated',
      actorUserId: user.id,
      title: `Court Case Status: ${existing.courtCaseNumber} is now ${dto.status}`,
      summary: dto.summary || `Lifecycle transition to ${dto.status}`,
    });

    // Reindex search
    await this.db.insert(outboxEvents).values({
      id: generateId(),
      eventType: 'search.upsert',
      status: OutboxStatus.PENDING,
      payload: {
        type: 'court_case',
        id: courtCaseId,
      },
    });

    return this.getCourtCaseDetail(courtCaseId, user);
  }

  /**
   * Adds a party / role to a court case (references existing Person or Organisation).
   */
  async addParty(
    courtCaseId: string,
    dto: AddCourtCasePartyRequest,
    user: AuthenticatedUser
  ): Promise<CourtCaseParty> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      courtCaseId,
      Permissions.COURT_ASSIGN
    );

    const [courtCase] = await this.db
      .select({ eventId: courtCases.eventId, courtCaseNumber: courtCases.courtCaseNumber })
      .from(courtCases)
      .where(eq(courtCases.id, courtCaseId))
      .limit(1);

    if (!courtCase) {
      throw new NotFoundException(`Court case '${courtCaseId}' not found`);
    }

    const partyId = generateId();
    const now = new Date();

    const [created] = await this.db
      .insert(courtCaseParties)
      .values({
        id: partyId,
        courtCaseId,
        partyResourceId: dto.partyResourceId,
        partyRole: dto.partyRole,
        notes: dto.notes || null,
        createdAt: now,
      })
      .returning();

    // Link in resource relationships
    await this.resourceService.createRelationship({
      eventId: courtCase.eventId,
      sourceResourceId: courtCaseId,
      targetResourceId: dto.partyResourceId,
      relationshipType: `PARTY_${dto.partyRole}`,
      createdByUserId: user.id,
    });

    // Audit
    await this.auditService.record({
      action: 'court.party.added',
      category: 'court',
      eventId: courtCase.eventId,
      resourceType: 'court_case_party',
      resourceId: partyId,
      actorUserId: user.id,
      metadata: {
        courtCaseNumber: courtCase.courtCaseNumber,
        partyResourceId: dto.partyResourceId,
        partyRole: dto.partyRole,
      },
    });

    // Activity
    await this.activityService.recordActivity({
      eventId: courtCase.eventId,
      resourceId: courtCaseId,
      activityType: 'court.party.added',
      actorUserId: user.id,
      title: `Party Added to ${courtCase.courtCaseNumber}: ${dto.partyRole}`,
      summary: dto.notes || `Assigned role ${dto.partyRole}`,
    });

    return {
      id: created!.id,
      courtCaseId: created!.courtCaseId,
      partyResourceId: created!.partyResourceId,
      partyRole: created!.partyRole,
      notes: created!.notes,
      createdAt: created!.createdAt.toISOString(),
    };
  }

  /**
   * Adds a fictional/scenario-friendly charge to a court case.
   */
  async createCharge(
    courtCaseId: string,
    dto: CreateChargeRequest,
    user: AuthenticatedUser
  ): Promise<Charge> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      courtCaseId,
      Permissions.COURT_CHARGE_MANAGE
    );

    const [courtCase] = await this.db
      .select({ eventId: courtCases.eventId, courtCaseNumber: courtCases.courtCaseNumber })
      .from(courtCases)
      .where(eq(courtCases.id, courtCaseId))
      .limit(1);

    if (!courtCase) {
      throw new NotFoundException(`Court case '${courtCaseId}' not found`);
    }

    const chargeId = generateId();
    const now = new Date();

    const [created] = await this.db
      .insert(charges)
      .values({
        id: chargeId,
        courtCaseId,
        code: dto.code || null,
        title: dto.title,
        description: dto.description,
        status: 'FILED',
        relatedCaseResourceId: dto.relatedCaseResourceId || null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // Audit
    await this.auditService.record({
      action: 'court.charge.added',
      category: 'court',
      eventId: courtCase.eventId,
      resourceType: 'charge',
      resourceId: chargeId,
      actorUserId: user.id,
      metadata: {
        courtCaseNumber: courtCase.courtCaseNumber,
        code: dto.code || null,
        title: dto.title,
      },
    });

    // Activity
    await this.activityService.recordActivity({
      eventId: courtCase.eventId,
      resourceId: courtCaseId,
      activityType: 'court.charge.added',
      actorUserId: user.id,
      title: `Charge Filed: ${dto.code ? `[${dto.code}] ` : ''}${dto.title}`,
      summary: dto.description.slice(0, 150),
    });

    return {
      id: created!.id,
      courtCaseId: created!.courtCaseId,
      code: created!.code,
      title: created!.title,
      description: created!.description,
      status: created!.status,
      relatedCaseResourceId: created!.relatedCaseResourceId,
      createdAt: created!.createdAt.toISOString(),
      updatedAt: created!.updatedAt.toISOString(),
    };
  }

  /**
   * Submits existing Evidence as a Court Exhibit.
   * STRICT: Never duplicates Evidence row. References canonical evidence.id.
   */
  async submitExhibit(
    courtCaseId: string,
    dto: SubmitCourtExhibitRequest,
    user: AuthenticatedUser
  ): Promise<CourtExhibit> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      courtCaseId,
      Permissions.COURT_EXHIBIT_SUBMIT
    );

    const [courtCase] = await this.db
      .select({ eventId: courtCases.eventId, courtCaseNumber: courtCases.courtCaseNumber })
      .from(courtCases)
      .where(eq(courtCases.id, courtCaseId))
      .limit(1);

    if (!courtCase) {
      throw new NotFoundException(`Court case '${courtCaseId}' not found`);
    }

    await this.assertReadableSource(courtCase.eventId,dto.evidenceId,'evidence',user);
    if (dto.documentId) await this.assertReadableSource(courtCase.eventId,dto.documentId,'document',user);
    // Verify canonical evidence exists
    const [ev] = await this.db
      .select({ id: evidence.id, evidenceNumber: evidence.evidenceNumber, description: evidence.description })
      .from(evidence)
      .where(eq(evidence.id, dto.evidenceId))
      .limit(1);

    if (!ev) {
      throw new NotFoundException(`Canonical evidence item '${dto.evidenceId}' not found`);
    }

    // Determine exhibit number if not provided
    let exhibitNumber = dto.exhibitNumber;
    if (!exhibitNumber) {
      const existingExhibits = await this.db
        .select({ id: courtExhibits.id })
        .from(courtExhibits)
        .where(eq(courtExhibits.courtCaseId, courtCaseId));
      exhibitNumber = `EX-${String(existingExhibits.length + 1).padStart(2, '0')}`;
    }

    const exhibitId = generateId();
    const now = new Date();

    const [created] = await this.db
      .insert(courtExhibits)
      .values({
        id: exhibitId,
        courtCaseId,
        evidenceId: dto.evidenceId,
        documentId: dto.documentId || null,
        exhibitNumber,
        status: 'SUBMITTED',
        proposedByUserId: user.id,
        proposedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // Link relationship
    await this.resourceService.createRelationship({
      eventId: courtCase.eventId,
      sourceResourceId: courtCaseId,
      targetResourceId: dto.evidenceId,
      relationshipType: 'SUBMITTED_EXHIBIT',
      createdByUserId: user.id,
      metadata: { exhibitNumber },
    });

    // Audit
    await this.auditService.record({
      action: 'court.exhibit.submitted',
      category: 'court',
      eventId: courtCase.eventId,
      resourceType: 'court_exhibit',
      resourceId: exhibitId,
      actorUserId: user.id,
      metadata: {
        courtCaseNumber: courtCase.courtCaseNumber,
        exhibitNumber,
        evidenceNumber: ev.evidenceNumber,
      },
    });

    // Activity
    await this.activityService.recordActivity({
      eventId: courtCase.eventId,
      resourceId: courtCaseId,
      activityType: 'court.exhibit.submitted',
      actorUserId: user.id,
      title: `Exhibit Submitted: ${exhibitNumber} (${ev.evidenceNumber})`,
      summary: `Evidence ${ev.evidenceNumber} submitted to court for admission`,
    });

    return {
      id: created!.id,
      courtCaseId: created!.courtCaseId,
      evidenceId: created!.evidenceId,
      evidenceNumber: ev.evidenceNumber,
      evidenceDescription: ev.description || undefined,
      documentId: created!.documentId,
      exhibitNumber: created!.exhibitNumber,
      status: created!.status,
      proposedByUserId: created!.proposedByUserId,
      proposedAt: created!.proposedAt.toISOString(),
      decisionByUserId: created!.decisionByUserId,
      decidedAt: created!.decidedAt ? created!.decidedAt.toISOString() : null,
      decisionReason: created!.decisionReason,
      chainOfCustodyCount: 0,
      createdAt: created!.createdAt.toISOString(),
      updatedAt: created!.updatedAt.toISOString(),
    };
  }

  /**
   * Judicial ruling on Exhibit admissibility: ADMITTED or EXCLUDED.
   */
  async decideExhibit(
    courtCaseId: string,
    exhibitId: string,
    dto: DecideCourtExhibitRequest,
    user: AuthenticatedUser
  ): Promise<CourtExhibit> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      courtCaseId,
      Permissions.COURT_EXHIBIT_DECIDE
    );

    const [courtCase] = await this.db
      .select({ eventId: courtCases.eventId, courtCaseNumber: courtCases.courtCaseNumber })
      .from(courtCases)
      .where(eq(courtCases.id, courtCaseId))
      .limit(1);

    if (!courtCase) {
      throw new NotFoundException(`Court case '${courtCaseId}' not found`);
    }

    const [exhibit] = await this.db
      .select()
      .from(courtExhibits)
      .where(and(eq(courtExhibits.id, exhibitId), eq(courtExhibits.courtCaseId, courtCaseId)))
      .limit(1);

    if (!exhibit) {
      throw new NotFoundException(`Court exhibit '${exhibitId}' not found`);
    }

    const now = new Date();
    await this.db
      .update(courtExhibits)
      .set({
        status: dto.status,
        decisionByUserId: user.id,
        decidedAt: now,
        decisionReason: dto.decisionReason,
        updatedAt: now,
      })
      .where(eq(courtExhibits.id, exhibitId));

    const action = dto.status === 'ADMITTED' ? 'court.exhibit.admitted' : 'court.exhibit.excluded';

    // Audit
    await this.auditService.record({
      action,
      category: 'court',
      eventId: courtCase.eventId,
      resourceType: 'court_exhibit',
      resourceId: exhibitId,
      actorUserId: user.id,
      metadata: {
        courtCaseNumber: courtCase.courtCaseNumber,
        exhibitNumber: exhibit.exhibitNumber,
        decisionReason: dto.decisionReason,
      },
    });

    // Activity
    await this.activityService.recordActivity({
      eventId: courtCase.eventId,
      resourceId: courtCaseId,
      activityType: action,
      actorUserId: user.id,
      title: `Exhibit ${dto.status}: ${exhibit.exhibitNumber}`,
      summary: dto.decisionReason,
    });

    return (await this.getCourtCaseDetail(courtCaseId, user)).exhibits.find((e) => e.id === exhibitId)!;
  }

  /**
   * Schedules a Court Hearing.
   */
  async createHearing(
    courtCaseId: string,
    dto: CreateCourtHearingRequest,
    user: AuthenticatedUser
  ): Promise<CourtHearing> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      courtCaseId,
      Permissions.COURT_HEARING_MANAGE
    );

    const [courtCase] = await this.db
      .select({ eventId: courtCases.eventId, courtCaseNumber: courtCases.courtCaseNumber })
      .from(courtCases)
      .where(eq(courtCases.id, courtCaseId))
      .limit(1);

    if (!courtCase) {
      throw new NotFoundException(`Court case '${courtCaseId}' not found`);
    }

    const hearingId = generateId();
    const now = new Date();

    const [created] = await this.db
      .insert(courtHearings)
      .values({
        id: hearingId,
        courtCaseId,
        title: dto.title,
        scheduledAt: new Date(dto.scheduledAt),
        status: 'SCHEDULED',
        locationResourceId: dto.locationResourceId || null,
        notes: dto.notes || null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // Audit
    await this.auditService.record({
      action: 'court.hearing.scheduled',
      category: 'court',
      eventId: courtCase.eventId,
      resourceType: 'court_hearing',
      resourceId: hearingId,
      actorUserId: user.id,
      metadata: {
        courtCaseNumber: courtCase.courtCaseNumber,
        title: dto.title,
        scheduledAt: dto.scheduledAt,
      },
    });

    // Activity
    await this.activityService.recordActivity({
      eventId: courtCase.eventId,
      resourceId: courtCaseId,
      activityType: 'court.hearing.scheduled',
      actorUserId: user.id,
      title: `Hearing Scheduled: ${dto.title}`,
      summary: `Scheduled for ${dto.scheduledAt}`,
    });

    return {
      id: created!.id,
      courtCaseId: created!.courtCaseId,
      title: created!.title,
      scheduledAt: created!.scheduledAt.toISOString(),
      startedAt: null,
      endedAt: null,
      status: created!.status,
      locationResourceId: created!.locationResourceId,
      notes: created!.notes,
      createdAt: created!.createdAt.toISOString(),
      updatedAt: created!.updatedAt.toISOString(),
    };
  }

  /**
   * Updates hearing lifecycle: SCHEDULED -> IN_SESSION -> COMPLETED
   */
  async updateHearingStatus(
    courtCaseId: string,
    hearingId: string,
    dto: UpdateCourtHearingStatusRequest,
    user: AuthenticatedUser
  ): Promise<CourtHearing> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      courtCaseId,
      Permissions.COURT_HEARING_MANAGE
    );

    const [courtCase] = await this.db
      .select({ eventId: courtCases.eventId, courtCaseNumber: courtCases.courtCaseNumber })
      .from(courtCases)
      .where(eq(courtCases.id, courtCaseId))
      .limit(1);

    if (!courtCase) {
      throw new NotFoundException(`Court case '${courtCaseId}' not found`);
    }

    const [hearing] = await this.db
      .select()
      .from(courtHearings)
      .where(and(eq(courtHearings.id, hearingId), eq(courtHearings.courtCaseId, courtCaseId)))
      .limit(1);

    if (!hearing) {
      throw new NotFoundException(`Hearing '${hearingId}' not found`);
    }

    const now = new Date();
    const updateData: Partial<typeof courtHearings.$inferInsert> = {
      status: dto.status,
      updatedAt: now,
    };

    if (dto.status === 'IN_SESSION' && !hearing.startedAt) {
      updateData.startedAt = now;
    } else if (dto.status === 'COMPLETED' && !hearing.endedAt) {
      updateData.endedAt = now;
    }
    if (dto.notes !== undefined) {
      updateData.notes = dto.notes;
    }

    await this.db
      .update(courtHearings)
      .set(updateData)
      .where(eq(courtHearings.id, hearingId));

    const activityType =
      dto.status === 'IN_SESSION'
        ? 'court.hearing.started'
        : dto.status === 'COMPLETED'
        ? 'court.hearing.completed'
        : 'court.hearing.updated';

    // Audit
    await this.auditService.record({
      action: activityType,
      category: 'court',
      eventId: courtCase.eventId,
      resourceType: 'court_hearing',
      resourceId: hearingId,
      actorUserId: user.id,
      metadata: {
        courtCaseNumber: courtCase.courtCaseNumber,
        previousStatus: hearing.status,
        newStatus: dto.status,
      },
    });

    // Activity
    await this.activityService.recordActivity({
      eventId: courtCase.eventId,
      resourceId: courtCaseId,
      activityType,
      actorUserId: user.id,
      title: `Hearing ${dto.status}: ${hearing.title}`,
      summary: dto.notes || `Session transitioned to ${dto.status}`,
    });

    return (await this.getCourtCaseDetail(courtCaseId, user)).hearings.find((h) => h.id === hearingId)!;
  }

  /**
   * Files a legal submission referencing a shared Document.
   */
  async createFiling(
    courtCaseId: string,
    dto: CreateCourtFilingRequest,
    user: AuthenticatedUser
  ): Promise<CourtFiling> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      courtCaseId,
      Permissions.COURT_FILING_CREATE
    );

    const [courtCase] = await this.db
      .select({ eventId: courtCases.eventId, courtCaseNumber: courtCases.courtCaseNumber })
      .from(courtCases)
      .where(eq(courtCases.id, courtCaseId))
      .limit(1);

    if (!courtCase) {
      throw new NotFoundException(`Court case '${courtCaseId}' not found`);
    }

    await this.assertReadableSource(courtCase.eventId,dto.documentId,'document',user);
    // Verify document exists
    const [doc] = await this.db
      .select({ id: documents.id, title: documents.title, documentNumber: documents.documentNumber })
      .from(documents)
      .where(eq(documents.id, dto.documentId))
      .limit(1);

    if (!doc) {
      throw new NotFoundException(`Shared document '${dto.documentId}' not found`);
    }

    const filingId = generateId();
    const now = new Date();

    const [created] = await this.db
      .insert(courtFilings)
      .values({
        id: filingId,
        courtCaseId,
        documentId: dto.documentId,
        filingType: dto.filingType,
        filedByUserId: user.id,
        filedAt: now,
        notes: dto.notes || null,
        createdAt: now,
      })
      .returning();

    // Link relationship
    await this.resourceService.createRelationship({
      eventId: courtCase.eventId,
      sourceResourceId: courtCaseId,
      targetResourceId: dto.documentId,
      relationshipType: 'COURT_FILING_DOCUMENT',
      createdByUserId: user.id,
      metadata: { filingType: dto.filingType },
    });

    // Audit
    await this.auditService.record({
      action: 'court.filing.created',
      category: 'court',
      eventId: courtCase.eventId,
      resourceType: 'court_filing',
      resourceId: filingId,
      actorUserId: user.id,
      metadata: {
        courtCaseNumber: courtCase.courtCaseNumber,
        filingType: dto.filingType,
        documentTitle: doc.title,
      },
    });

    // Activity
    await this.activityService.recordActivity({
      eventId: courtCase.eventId,
      resourceId: courtCaseId,
      activityType: 'court.filing.created',
      actorUserId: user.id,
      title: `Legal Filing Submitted: ${dto.filingType}`,
      summary: `${doc.documentNumber || doc.title} filed by ${user.displayName || user.email}`,
    });

    return {
      id: created!.id,
      courtCaseId: created!.courtCaseId,
      documentId: created!.documentId,
      documentTitle: doc.title,
      documentNumber: doc.documentNumber || undefined,
      filingType: created!.filingType,
      filedByUserId: created!.filedByUserId,
      filedAt: created!.filedAt.toISOString(),
      notes: created!.notes,
      createdAt: created!.createdAt.toISOString(),
    };
  }

  /**
   * Issues a court verdict / decision.
   */
  async createDecision(
    courtCaseId: string,
    dto: CreateCourtDecisionRequest,
    user: AuthenticatedUser
  ): Promise<CourtDecision> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      courtCaseId,
      Permissions.COURT_DECISION_CREATE
    );

    const [courtCase] = await this.db
      .select({ eventId: courtCases.eventId, courtCaseNumber: courtCases.courtCaseNumber })
      .from(courtCases)
      .where(eq(courtCases.id, courtCaseId))
      .limit(1);

    if (!courtCase) {
      throw new NotFoundException(`Court case '${courtCaseId}' not found`);
    }

    if (dto.documentId) await this.assertReadableSource(courtCase.eventId,dto.documentId,'document',user);
    const decisionId = generateId();
    const now = new Date();

    const [created] = await this.db
      .insert(courtDecisions)
      .values({
        id: decisionId,
        courtCaseId,
        decisionType: dto.decisionType,
        summary: dto.summary,
        reasoning: dto.reasoning || null,
        decidedAt: now,
        decidedByUserId: user.id,
        documentId: dto.documentId || null,
        createdAt: now,
      })
      .returning();

    // Transition court case to DECIDED
    await this.db
      .update(courtCases)
      .set({ status: 'DECIDED', updatedAt: now })
      .where(eq(courtCases.id, courtCaseId));

    // Audit
    await this.auditService.record({
      action: 'court.decision.issued',
      category: 'court',
      eventId: courtCase.eventId,
      resourceType: 'court_decision',
      resourceId: decisionId,
      actorUserId: user.id,
      metadata: {
        courtCaseNumber: courtCase.courtCaseNumber,
        decisionType: dto.decisionType,
      },
    });

    // Activity
    await this.activityService.recordActivity({
      eventId: courtCase.eventId,
      resourceId: courtCaseId,
      activityType: 'court.decision.issued',
      actorUserId: user.id,
      title: `Judicial Decision Issued: ${dto.decisionType}`,
      summary: dto.summary,
    });

    return {
      id: created!.id,
      courtCaseId: created!.courtCaseId,
      decisionType: created!.decisionType,
      summary: created!.summary,
      reasoning: created!.reasoning,
      decidedAt: created!.decidedAt.toISOString(),
      decidedByUserId: created!.decidedByUserId,
      documentId: created!.documentId,
      createdAt: created!.createdAt.toISOString(),
    };
  }

  /**
   * Retrieves bounded court case timeline.
   */
  async getCourtTimeline(
    courtCaseId: string,
    user: AuthenticatedUser
  ): Promise<CourtTimelineEvent[]> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      courtCaseId,
      Permissions.COURT_READ
    );

    const [courtCase] = await this.db
      .select({ eventId: courtCases.eventId, courtCaseNumber: courtCases.courtCaseNumber, originatingCaseId: courtCases.originatingCaseId })
      .from(courtCases)
      .where(eq(courtCases.id, courtCaseId))
      .limit(1);

    if (!courtCase) {
      throw new NotFoundException(`Court case '${courtCaseId}' not found`);
    }

    const relevantResourceIds = [courtCaseId];
    if (courtCase.originatingCaseId) {
      relevantResourceIds.push(courtCase.originatingCaseId);
    }

    // Get linked exhibits
    const exhibits = await this.db
      .select({ evidenceId: courtExhibits.evidenceId })
      .from(courtExhibits)
      .where(eq(courtExhibits.courtCaseId, courtCaseId));

    for (const e of exhibits) {
      relevantResourceIds.push(e.evidenceId);
    }

    const rows = await this.db
      .select()
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.eventId, courtCase.eventId),
          sql`(${activityEvents.resourceId} IN ${relevantResourceIds} OR ${activityEvents.relatedResourceIds} && ${relevantResourceIds})`
        )
      )
      .orderBy(asc(activityEvents.occurredAt))
      .limit(100);

    return rows.map((r) => ({
      id: r.id,
      occurredAt: r.occurredAt.toISOString(),
      eventType: r.activityType,
      title: r.title,
      summary: r.summary || undefined,
      actorUserId: r.actorUserId,
      metadata: (r.metadata as Record<string, any>) || undefined,
    }));
  }

  /**
   * Retrieves full Court Case detail including parties, charges, exhibits, hearings, filings, decisions.
   */
  async getCourtCaseDetail(
    courtCaseId: string,
    user: AuthenticatedUser
  ): Promise<CourtCaseDetail> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      courtCaseId,
      Permissions.COURT_READ
    );

    const [courtCase] = await this.db
      .select({
        c: courtCases,
        origNumber: cases.caseNumber,
      })
      .from(courtCases)
      .leftJoin(cases, eq(courtCases.originatingCaseId, cases.id))
      .where(eq(courtCases.id, courtCaseId))
      .limit(1);

    if (!courtCase) {
      throw new NotFoundException(`Court case '${courtCaseId}' not found`);
    }

    // 1. Parties
    const partyRows = await this.db
      .select({
        p: courtCaseParties,
        personName: persons.displayName,
        orgName: organisations.name,
      })
      .from(courtCaseParties)
      .leftJoin(persons, eq(courtCaseParties.partyResourceId, persons.id))
      .leftJoin(organisations, eq(courtCaseParties.partyResourceId, organisations.id))
      .where(eq(courtCaseParties.courtCaseId, courtCaseId))
      .orderBy(asc(courtCaseParties.createdAt));

    // 2. Charges
    const chargeRows = await this.db
      .select()
      .from(charges)
      .where(eq(charges.courtCaseId, courtCaseId))
      .orderBy(asc(charges.createdAt));

    // 3. Exhibits
    const exhibitRows = await this.db
      .select({
        ex: courtExhibits,
        evidenceNumber: evidence.evidenceNumber,
        evidenceDescription: evidence.description,
        documentTitle: documents.title,
        custodyCount: sql<number>`(select count(*)::int from ${evidenceCustodyTransfers} where ${evidenceCustodyTransfers.evidenceId} = ${courtExhibits.evidenceId})`,
      })
      .from(courtExhibits)
      .innerJoin(evidence, eq(courtExhibits.evidenceId, evidence.id))
      .leftJoin(documents, eq(courtExhibits.documentId, documents.id))
      .where(eq(courtExhibits.courtCaseId, courtCaseId))
      .orderBy(asc(courtExhibits.exhibitNumber));

    // 4. Hearings
    const hearingRows = await this.db
      .select()
      .from(courtHearings)
      .where(eq(courtHearings.courtCaseId, courtCaseId))
      .orderBy(asc(courtHearings.scheduledAt));

    // 5. Filings
    const filingRows = await this.db
      .select({
        f: courtFilings,
        documentTitle: documents.title,
        documentNumber: documents.documentNumber,
      })
      .from(courtFilings)
      .innerJoin(documents, eq(courtFilings.documentId, documents.id))
      .where(eq(courtFilings.courtCaseId, courtCaseId))
      .orderBy(desc(courtFilings.filedAt));

    // 6. Decisions
    const decisionRows = await this.db
      .select()
      .from(courtDecisions)
      .where(eq(courtDecisions.courtCaseId, courtCaseId))
      .orderBy(desc(courtDecisions.decidedAt));

    return {
      id: courtCase.c.id,
      eventId: courtCase.c.eventId,
      courtCaseNumber: courtCase.c.courtCaseNumber,
      title: courtCase.c.title,
      summary: courtCase.c.summary,
      status: courtCase.c.status,
      originatingCaseId: courtCase.c.originatingCaseId,
      originatingCaseNumber: courtCase.origNumber || undefined,
      openedAt: courtCase.c.openedAt.toISOString(),
      closedAt: courtCase.c.closedAt ? courtCase.c.closedAt.toISOString() : null,
      createdAt: courtCase.c.createdAt.toISOString(),
      updatedAt: courtCase.c.updatedAt.toISOString(),
      parties: partyRows.map((row) => ({
        id: row.p.id,
        courtCaseId: row.p.courtCaseId,
        partyResourceId: row.p.partyResourceId,
        partyRole: row.p.partyRole,
        partyName: row.personName?.trim() || row.orgName || undefined,
        partyType: row.personName ? 'person' : row.orgName ? 'organisation' : undefined,
        notes: row.p.notes,
        createdAt: row.p.createdAt.toISOString(),
      })),
      charges: chargeRows.map((ch) => ({
        id: ch.id,
        courtCaseId: ch.courtCaseId,
        code: ch.code,
        title: ch.title,
        description: ch.description,
        status: ch.status,
        relatedCaseResourceId: ch.relatedCaseResourceId,
        createdAt: ch.createdAt.toISOString(),
        updatedAt: ch.updatedAt.toISOString(),
      })),
      exhibits: exhibitRows.map((row) => ({
        id: row.ex.id,
        courtCaseId: row.ex.courtCaseId,
        evidenceId: row.ex.evidenceId,
        evidenceNumber: row.evidenceNumber,
        evidenceDescription: row.evidenceDescription || undefined,
        documentId: row.ex.documentId,
        documentTitle: row.documentTitle || undefined,
        exhibitNumber: row.ex.exhibitNumber,
        status: row.ex.status,
        proposedByUserId: row.ex.proposedByUserId,
        proposedAt: row.ex.proposedAt.toISOString(),
        decisionByUserId: row.ex.decisionByUserId,
        decidedAt: row.ex.decidedAt ? row.ex.decidedAt.toISOString() : null,
        decisionReason: row.ex.decisionReason,
        chainOfCustodyCount: row.custodyCount,
        createdAt: row.ex.createdAt.toISOString(),
        updatedAt: row.ex.updatedAt.toISOString(),
      })),
      hearings: hearingRows.map((h) => ({
        id: h.id,
        courtCaseId: h.courtCaseId,
        title: h.title,
        scheduledAt: h.scheduledAt.toISOString(),
        startedAt: h.startedAt ? h.startedAt.toISOString() : null,
        endedAt: h.endedAt ? h.endedAt.toISOString() : null,
        status: h.status,
        locationResourceId: h.locationResourceId,
        notes: h.notes,
        createdAt: h.createdAt.toISOString(),
        updatedAt: h.updatedAt.toISOString(),
      })),
      filings: filingRows.map((row) => ({
        id: row.f.id,
        courtCaseId: row.f.courtCaseId,
        documentId: row.f.documentId,
        documentTitle: row.documentTitle,
        documentNumber: row.documentNumber || undefined,
        filingType: row.f.filingType,
        filedByUserId: row.f.filedByUserId,
        filedAt: row.f.filedAt.toISOString(),
        notes: row.f.notes,
        createdAt: row.f.createdAt.toISOString(),
      })),
      decisions: decisionRows.map((d) => ({
        id: d.id,
        courtCaseId: d.courtCaseId,
        decisionType: d.decisionType,
        summary: d.summary,
        reasoning: d.reasoning,
        decidedAt: d.decidedAt.toISOString(),
        decidedByUserId: d.decidedByUserId,
        documentId: d.documentId,
        createdAt: d.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Lists court cases in an event with access filtering.
   */
  async listCourtCases(
    eventId: string,
    filters: CourtQueryFilters,
    user: AuthenticatedUser
  ): Promise<{ items: CourtCaseItem[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const offset = (page - 1) * limit;

    const conditions = [eq(courtCases.eventId, eventId)];
    if (filters.status) conditions.push(eq(courtCases.status, filters.status));
    if (filters.originatingCaseId) conditions.push(eq(courtCases.originatingCaseId, filters.originatingCaseId));

    const rows = await this.db
      .select({
        c: courtCases,
        origNumber: cases.caseNumber,
      })
      .from(courtCases)
      .leftJoin(cases, eq(courtCases.originatingCaseId, cases.id))
      .where(and(...conditions))
      .orderBy(desc(courtCases.createdAt))
      .limit(limit)
      .offset(offset);

    const accessible: CourtCaseItem[] = [];
    for (const r of rows) {
      const canAccess = await this.resourceAccessService.canAccessResource(
        user,
        r.c.id,
        Permissions.COURT_READ
      );
      if (canAccess) {
        accessible.push({
          id: r.c.id,
          eventId: r.c.eventId,
          courtCaseNumber: r.c.courtCaseNumber,
          title: r.c.title,
          summary: r.c.summary,
          status: r.c.status,
          originatingCaseId: r.c.originatingCaseId,
          originatingCaseNumber: r.origNumber || undefined,
          openedAt: r.c.openedAt.toISOString(),
          closedAt: r.c.closedAt ? r.c.closedAt.toISOString() : null,
          createdAt: r.c.createdAt.toISOString(),
          updatedAt: r.c.updatedAt.toISOString(),
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
}

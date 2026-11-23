import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { eq, and, desc, sql, isNull } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { ResourceService } from '../resources/resource.service.js';
import { ResourceAccessService } from '../resources/resource-access.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { IdentifierAllocatorService } from '../resources/identifier-allocator.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ActivityService } from '../resources/activity.service.js';
import { SearchIndexerService } from '../search/search-indexer.service.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import {
  medicalEncounters,
  medicalObservations,
  medicalInterventions,
  resources,
  type ResourceVisibilityValue,
  persons,
  locations,
  incidents,
  organizationalUnits,
  users,
  activityEvents,
  eventMemberships,
  membershipUnitAssignments,
  unitCapabilities,
  MembershipStatus,
} from '@cyris/db';
import { generateId, Permissions } from '@cyris/shared';
import { UnitCapabilityKeys } from '@cyris/contracts';
import type {
  MedicalEncounterItem,
  MedicalEncounterDetail,
  MedicalObservationItem,
  MedicalInterventionItem,
  MedicalOperationalSummaryResponse,
  CreateMedicalEncounterRequest,
  UpdateMedicalEncounterRequest,
  TriageMedicalEncounterRequest,
  CreateMedicalObservationRequest,
  CreateMedicalInterventionRequest,
  TransferMedicalEncounterRequest,
  CloseMedicalEncounterRequest,
  MedicalQueryFilters,
} from '@cyris/contracts';

type MedicalLinkedReferences = {
  personId?: string | null;
  incidentId?: string | null;
  locationId?: string | null;
  assignedUnitId?: string | null;
  assignedUserId?: string | null;
  targetLocationId?: string | null;
  receivingUnitId?: string | null;
};

@Injectable()
export class MedicalService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly resourceService: ResourceService,
    private readonly resourceAccessService: ResourceAccessService,
    private readonly identifierAllocator: IdentifierAllocatorService,
    private readonly auditService: AuditService,
    private readonly activityService: ActivityService,
    private readonly searchIndexer: SearchIndexerService,
    private readonly authorization: AuthorizationService
  ) {}

  private get db() {
    return this.databaseService.client;
  }

  /**
   * Validate every patient/incident/location/team assignment against this exercise.
   * UUID foreign keys alone do not enforce event-level isolation.
   * Also blocks assigning an inactive or non-member operator.
   */
  async assertReferencesInEvent(eventId: string, refs: MedicalLinkedReferences): Promise<void> {
    const resourceRefs = [
      ['personId', refs.personId, 'person'],
      ['incidentId', refs.incidentId, 'incident'],
      ['locationId', refs.locationId, 'location'],
      ['targetLocationId', refs.targetLocationId, 'location'],
    ] as const;
    for (const [field, id, type] of resourceRefs) {
      if (id == null) continue; // Explicit null clears an existing optional association.
      const record = await this.resourceService.getResource(id);
      if (!record || record.eventId !== eventId || record.resourceType !== type) {
        throw new BadRequestException(`Invalid ${field}: reference is not in this exercise`);
      }
    }

    const unitRefs = [
      ['assignedUnitId', refs.assignedUnitId],
      ['receivingUnitId', refs.receivingUnitId],
    ] as const;
    for (const [field, id] of unitRefs) {
      if (id == null) continue;
      const [unit] = await this.db.select({ id: organizationalUnits.id })
        .from(organizationalUnits)
        .where(and(
          eq(organizationalUnits.id, id),
          eq(organizationalUnits.eventId, eventId),
          isNull(organizationalUnits.archivedAt),
        )).limit(1);
      if (!unit) throw new BadRequestException(`Invalid ${field}: active unit is not in this exercise`);
    }

    if (refs.assignedUserId != null) {
      const [membership] = await this.db.select({ id: eventMemberships.id })
        .from(eventMemberships)
        .innerJoin(users, eq(users.id, eventMemberships.userId))
        .where(and(
          eq(eventMemberships.eventId, eventId),
          eq(eventMemberships.userId, refs.assignedUserId),
          eq(eventMemberships.status, MembershipStatus.ACTIVE),
          eq(users.status, 'ACTIVE'),
        )).limit(1);
      if (!membership) throw new BadRequestException('Invalid assignedUserId: user is not an active exercise member');
    }
  }

  /** Handoff destinations must be active medical-capable teams in this exercise. */
  private async assertMedicalReceivingUnit(eventId: string, unitId: string): Promise<void> {
    const [unit] = await this.db.select({id: organizationalUnits.id})
      .from(organizationalUnits)
      .innerJoin(unitCapabilities, eq(unitCapabilities.unitId, organizationalUnits.id))
      .where(and(
        eq(organizationalUnits.id, unitId),
        eq(organizationalUnits.eventId, eventId),
        isNull(organizationalUnits.archivedAt),
        eq(unitCapabilities.capabilityKey, UnitCapabilityKeys.MEDICAL_OPERATIONS),
      )).limit(1);
    if (!unit) throw new BadRequestException('Receiving unit must be an active medical team in this exercise');
  }

  /**
   * The medical intake screen does not ask operators to choose their own team.
   * If the operator belongs to exactly one active medical-capable unit, use that
   * unit automatically so colleagues can see the record under UNIT visibility.
   * Never guess when several medical teams are eligible, or adopt an unrelated
   * non-medical unit just because the actor happens to belong to it.
   */
  async resolveIntakeUnit(eventId: string, userId: string): Promise<string | null> {
    const units = await this.db.select({unitId: organizationalUnits.id})
      .from(eventMemberships)
      .innerJoin(membershipUnitAssignments, eq(membershipUnitAssignments.membershipId, eventMemberships.id))
      .innerJoin(organizationalUnits, eq(organizationalUnits.id, membershipUnitAssignments.unitId))
      .innerJoin(unitCapabilities, eq(unitCapabilities.unitId, organizationalUnits.id))
      .where(and(
        eq(eventMemberships.eventId, eventId),
        eq(eventMemberships.userId, userId),
        eq(eventMemberships.status, MembershipStatus.ACTIVE),
        eq(organizationalUnits.eventId, eventId),
        isNull(organizationalUnits.archivedAt),
        eq(unitCapabilities.capabilityKey, UnitCapabilityKeys.MEDICAL_OPERATIONS),
      ));
    const eligible = [...new Set(units.map(unit => unit.unitId))];
    return eligible.length === 1 ? eligible[0]! : null;
  }

  /**
   * Creates a new casualty encounter.
   * Default visibility is UNIT-scoped for medical confidentiality.
   */
  async createEncounter(
    eventId: string,
    dto: CreateMedicalEncounterRequest,
    user: AuthenticatedUser
  ): Promise<MedicalEncounterItem> {
    const canCreate = await this.authorization.authorize({ user, permission: Permissions.MEDICAL_CREATE, context: { eventId } })
      || await this.authorization.hasEventCapability({
        user, eventId, permission: Permissions.MEDICAL_CREATE,
        unitId: dto.assignedUnitId ?? undefined, resourceScopes: [],
      });
    if (!canCreate) throw new ForbiddenException('Medical encounter creation is not authorized for this exercise');

    // Reject cross-event reference IDs before allocating a MED number or writing any resource.
    await this.assertReferencesInEvent(eventId, dto);
    const owningUnitId = dto.assignedUnitId ?? await this.resolveIntakeUnit(eventId, user.id);
    // A single medical-capable unit is safe to auto-select. Ambiguous/no unit stays
    // owner-only instead of disclosing sensitive patient records to the wrong team.
    const encounterId = generateId();

    return this.db.transaction(async (tx) => {
      // 1. Allocate identifier: MED-0001
      const medicalNumber = await this.identifierAllocator.allocate(
        eventId,
        'MED',
        'MED',
        tx
      );

      // 2. Base resource registration (defaults to UNIT visibility)
      await this.resourceService.registerResource(eventId, 'medical_encounter', {
        id: encounterId,
        visibility: (dto.visibility as ResourceVisibilityValue) || 'UNIT',
        owningUnitId,
        ownerUserId: user.id,
        txClient: tx,
      });

      // 3. Insert domain encounter
      const [created] = await tx
        .insert(medicalEncounters)
        .values({
          id: encounterId,
          eventId,
          medicalNumber,
          personId: dto.personId || null,
          status: 'RECEIVED',
          triageCategory: dto.triageCategory || 'UNKNOWN',
          incidentId: dto.incidentId || null,
          locationId: dto.locationId || null,
          chiefComplaint: dto.chiefComplaint || null,
          mechanismOfInjury: dto.mechanismOfInjury || null,
          assessmentSummary: dto.assessmentSummary || null,
          assignedUnitId: owningUnitId,
          assignedUserId: dto.assignedUserId || null,
        })
        .returning();

      // 4. Link relationships
      if (dto.incidentId) {
        await this.resourceService.createRelationship({
          eventId,
          sourceResourceId: dto.incidentId,
          targetResourceId: encounterId,
          relationshipType: 'CASUALTY_ENCOUNTER',
          createdByUserId: user.id,
          metadata: { medicalNumber },
          txClient: tx,
        });
      }

      if (dto.personId) {
        await this.resourceService.createRelationship({
          eventId,
          sourceResourceId: dto.personId,
          targetResourceId: encounterId,
          relationshipType: 'PATIENT_RECORD',
          createdByUserId: user.id,
          metadata: { medicalNumber },
          txClient: tx,
        });
      }

      // 5. Audit (Sanitized: does not duplicate detailed clinical prose)
      await this.auditService.record({
        action: 'medical.encounter.created',
        category: 'medical',
        eventId,
        resourceType: 'medical_encounter',
        resourceId: encounterId,
        actorUserId: user.id,
        metadata: {
          medicalNumber,
          triageCategory: dto.triageCategory,
          incidentId: dto.incidentId,
          hasLinkedPerson: Boolean(dto.personId),
        },
      });

      // 6. Activity
      await this.activityService.recordActivity(
        {
          eventId,
          resourceId: encounterId,
          activityType: 'medical.encounter.created',
          actorUserId: user.id,
          title: `Medical Encounter Opened: ${medicalNumber}`,
          summary: `Triage: ${dto.triageCategory || 'UNKNOWN'}`,
        },
        tx
      );

      // 7. Search index outbox event
      await this.searchIndexer.emitSearchUpsert('medical_encounter', encounterId, tx);

      return this.mapEncounterItem(created!, {
        visibility: dto.visibility || 'UNIT',
      });
    });
  }

  /** The exercise in the URL must own the medical record before any read or mutation. */
  async assertEncounterInEvent(eventId: string, encounterId: string): Promise<void> {
    const [record] = await this.db.select({ id: medicalEncounters.id })
      .from(medicalEncounters)
      .where(and(eq(medicalEncounters.id, encounterId), eq(medicalEncounters.eventId, eventId)))
      .limit(1);
    if (!record) throw new NotFoundException('Medical encounter not found in the requested exercise');
  }

  /**
   * Updates general medical encounter fields.
   */
  async updateEncounter(
    encounterId: string,
    dto: UpdateMedicalEncounterRequest,
    user: AuthenticatedUser
  ): Promise<MedicalEncounterDetail> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      encounterId,
      Permissions.MEDICAL_UPDATE
    );

    // Validate all optional references before touching the encounter.
    // A second event match is enforced on the locked row inside the transaction.
    const [existing] = await this.db
      .select({ eventId: medicalEncounters.eventId, assignedUnitId: medicalEncounters.assignedUnitId })
      .from(medicalEncounters)
      .where(eq(medicalEncounters.id, encounterId))
      .limit(1);
    if (!existing) throw new NotFoundException(`Medical encounter '${encounterId}' not found`);
    await this.assertReferencesInEvent(existing.eventId, dto);
    const isTeamChange = dto.assignedUnitId !== undefined && dto.assignedUnitId !== existing.assignedUnitId;
    if (isTeamChange) {
      // A reassignment moves visibility to another team; ordinary editing rights
      // must not be sufficient to disclose a patient's record to that team.
      await this.resourceAccessService.assertCanAccessResource(user, encounterId, Permissions.MEDICAL_TRANSFER);
      await this.resourceAccessService.assertCanAccessResource(user, encounterId, Permissions.MEDICAL_READ);
      await this.assertMedicalReceivingUnit(existing.eventId, dto.assignedUnitId!);
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.personId !== undefined) updates.personId = dto.personId;
    if (dto.locationId !== undefined) updates.locationId = dto.locationId;
    if (dto.chiefComplaint !== undefined) updates.chiefComplaint = dto.chiefComplaint;
    if (dto.mechanismOfInjury !== undefined) updates.mechanismOfInjury = dto.mechanismOfInjury;
    if (dto.assessmentSummary !== undefined) updates.assessmentSummary = dto.assessmentSummary;
    if (dto.disposition !== undefined) updates.disposition = dto.disposition;
    if (dto.assignedUnitId !== undefined) updates.assignedUnitId = dto.assignedUnitId;
    if (dto.assignedUserId !== undefined) updates.assignedUserId = dto.assignedUserId;

    // Lock this encounter so concurrent patient changes cannot leave stale active links.
    // The record, graph history, audit entries and search outbox commit together.
    await this.db.transaction(async (tx) => {
      const [locked] = await tx.select()
        .from(medicalEncounters)
        .where(eq(medicalEncounters.id, encounterId))
        .limit(1)
        .for('update');
      if (!locked || locked.eventId !== existing.eventId) {
        throw new NotFoundException('Medical encounter no longer belongs to the requested exercise');
      }
      if (locked.assignedUnitId !== existing.assignedUnitId) {
        throw new ConflictException('Medical unit was changed concurrently; refresh and try again');
      }

      await tx.update(medicalEncounters).set(updates).where(eq(medicalEncounters.id, encounterId));
      if (dto.assignedUnitId !== undefined) {
        await tx.update(resources).set({
          owningUnitId: dto.assignedUnitId,
          // Do not preserve a former team's private owner access after handoff.
          ...(isTeamChange ? { ownerUserId: null } : {}),
          updatedAt: new Date(),
        }).where(and(eq(resources.id, encounterId), eq(resources.eventId, locked.eventId)));
      }

      // Reconcile even an unchanged explicit personId: repairs a missing legacy link
      // without duplicating an already active PATIENT_RECORD relationship.
      if (dto.personId !== undefined) {
        await this.resourceService.synchronizeMedicalPatientLink({
          eventId: locked.eventId,
          encounterId,
          personId: dto.personId,
          medicalNumber: locked.medicalNumber,
          actorUserId: user.id,
          txClient: tx,
        });
      }

      await this.auditService.record({
        action: 'medical.encounter.updated',
        category: 'medical',
        eventId: locked.eventId,
        resourceType: 'medical_encounter',
        resourceId: encounterId,
        actorUserId: user.id,
        metadata: {
          medicalNumber: locked.medicalNumber,
          patientLinkChanged: dto.personId !== undefined && dto.personId !== locked.personId,
          owningTeamChanged: isTeamChange,
        },
        txClient: tx,
      });
      await this.searchIndexer.emitSearchUpsert('medical_encounter', encounterId, tx);
    });

    // The transfer actor was authorized before the ownership change and must
    // receive an accurate success response even if the new unit cannot read it.
    return isTeamChange ? this.loadEncounterDetail(encounterId) : this.getEncounterDetail(encounterId, user);
  }

  /**
   * Updates triage classification (human operator decision).
   */
  async triageEncounter(
    encounterId: string,
    dto: TriageMedicalEncounterRequest,
    user: AuthenticatedUser
  ): Promise<MedicalEncounterDetail> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      encounterId,
      Permissions.MEDICAL_TRIAGE
    );

    const [existing] = await this.db
      .select()
      .from(medicalEncounters)
      .where(eq(medicalEncounters.id, encounterId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`Medical encounter '${encounterId}' not found`);
    }

    const now = new Date();
    const newStatus = existing.status === 'RECEIVED' ? 'TRIAGED' : existing.status;

    await this.db
      .update(medicalEncounters)
      .set({
        triageCategory: dto.triageCategory,
        status: newStatus,
        updatedAt: now,
      })
      .where(eq(medicalEncounters.id, encounterId));

    await this.auditService.record({
      action: 'medical.triaged',
      category: 'medical',
      eventId: existing.eventId,
      resourceType: 'medical_encounter',
      resourceId: encounterId,
      actorUserId: user.id,
      metadata: {
        medicalNumber: existing.medicalNumber,
        previousTriage: existing.triageCategory,
        newTriage: dto.triageCategory,
        notes: dto.notes,
      },
    });

    await this.activityService.recordActivity({
      eventId: existing.eventId,
      resourceId: encounterId,
      activityType: 'medical.triaged',
      actorUserId: user.id,
      title: `Casualty Triaged: ${existing.medicalNumber} — ${dto.triageCategory}`,
      summary: dto.notes || `Assigned triage category ${dto.triageCategory}`,
    });

    await this.searchIndexer.emitSearchUpsert('medical_encounter', encounterId);

    return this.getEncounterDetail(encounterId, user);
  }

  /**
   * Adds a structured observation (vitals / measurements).
   * Note: Not emitted to global public timeline to preserve casualty privacy.
   */
  async addObservation(
    encounterId: string,
    dto: CreateMedicalObservationRequest,
    user: AuthenticatedUser
  ): Promise<MedicalObservationItem> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      encounterId,
      Permissions.MEDICAL_OBSERVE
    );

    const [existing] = await this.db
      .select({ eventId: medicalEncounters.eventId, medicalNumber: medicalEncounters.medicalNumber })
      .from(medicalEncounters)
      .where(eq(medicalEncounters.id, encounterId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`Medical encounter '${encounterId}' not found`);
    }

    const obsId = generateId();
    const now = new Date();

    const [created] = await this.db
      .insert(medicalObservations)
      .values({
        id: obsId,
        encounterId,
        observationType: dto.observationType,
        value: dto.value,
        unit: dto.unit || null,
        note: dto.note || null,
        recordedByUserId: user.id,
        observedAt: now,
        createdAt: now,
      })
      .returning();

    await this.auditService.record({
      action: 'medical.observation.added',
      category: 'medical',
      eventId: existing.eventId,
      resourceType: 'medical_observation',
      resourceId: obsId,
      actorUserId: user.id,
      metadata: {
        medicalNumber: existing.medicalNumber,
        observationType: dto.observationType,
      },
    });

    return {
      id: created!.id,
      encounterId: created!.encounterId,
      observedAt: created!.observedAt.toISOString(),
      observationType: created!.observationType,
      value: created!.value,
      unit: created!.unit,
      note: created!.note,
      recordedByUserId: created!.recordedByUserId,
      recordedByUserDisplayName: user.displayName,
      createdAt: created!.createdAt.toISOString(),
    };
  }

  /**
   * Records a clinical or field medical intervention.
   */
  async addIntervention(
    encounterId: string,
    dto: CreateMedicalInterventionRequest,
    user: AuthenticatedUser
  ): Promise<MedicalInterventionItem> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      encounterId,
      Permissions.MEDICAL_INTERVENE
    );

    const [existing] = await this.db
      .select({
        eventId: medicalEncounters.eventId,
        medicalNumber: medicalEncounters.medicalNumber,
        status: medicalEncounters.status,
      })
      .from(medicalEncounters)
      .where(eq(medicalEncounters.id, encounterId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`Medical encounter '${encounterId}' not found`);
    }

    const intId = generateId();
    const now = new Date();

    const [created] = await this.db
      .insert(medicalInterventions)
      .values({
        id: intId,
        encounterId,
        interventionType: dto.interventionType,
        description: dto.description,
        performedAt: now,
        performedByUserId: user.id,
        outcome: dto.outcome || null,
        createdAt: now,
      })
      .returning();

    // Transition status to UNDER_CARE if previously RECEIVED or TRIAGED
    if (existing.status === 'RECEIVED' || existing.status === 'TRIAGED') {
      await this.db
        .update(medicalEncounters)
        .set({ status: 'UNDER_CARE', updatedAt: now })
        .where(eq(medicalEncounters.id, encounterId));
    }

    await this.auditService.record({
      action: 'medical.intervention.added',
      category: 'medical',
      eventId: existing.eventId,
      resourceType: 'medical_intervention',
      resourceId: intId,
      actorUserId: user.id,
      metadata: {
        medicalNumber: existing.medicalNumber,
        interventionType: dto.interventionType,
      },
    });

    return {
      id: created!.id,
      encounterId: created!.encounterId,
      interventionType: created!.interventionType,
      description: created!.description,
      performedAt: created!.performedAt.toISOString(),
      performedByUserId: created!.performedByUserId,
      performedByUserDisplayName: user.displayName,
      outcome: created!.outcome,
      createdAt: created!.createdAt.toISOString(),
    };
  }

  /**
   * Marks casualty as stabilized.
   */
  async stabilizeEncounter(
    encounterId: string,
    user: AuthenticatedUser
  ): Promise<MedicalEncounterDetail> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      encounterId,
      Permissions.MEDICAL_INTERVENE
    );

    const [existing] = await this.db
      .select()
      .from(medicalEncounters)
      .where(eq(medicalEncounters.id, encounterId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`Medical encounter '${encounterId}' not found`);
    }

    const now = new Date();
    await this.db
      .update(medicalEncounters)
      .set({
        status: 'STABILIZED',
        stabilizedAt: now,
        updatedAt: now,
      })
      .where(eq(medicalEncounters.id, encounterId));

    await this.auditService.record({
      action: 'medical.stabilized',
      category: 'medical',
      eventId: existing.eventId,
      resourceType: 'medical_encounter',
      resourceId: encounterId,
      actorUserId: user.id,
      metadata: { medicalNumber: existing.medicalNumber },
    });

    await this.activityService.recordActivity({
      eventId: existing.eventId,
      resourceId: encounterId,
      activityType: 'medical.stabilized',
      actorUserId: user.id,
      title: `Casualty Stabilized: ${existing.medicalNumber}`,
      summary: `Vitals stabilized; awaiting evacuation or ongoing monitoring`,
    });

    await this.searchIndexer.emitSearchUpsert('medical_encounter', encounterId);

    return this.getEncounterDetail(encounterId, user);
  }

  /**
   * Transfers casualty to another facility or location (aid station, ambulance, hospital).
   */
  async transferEncounter(
    encounterId: string,
    dto: TransferMedicalEncounterRequest,
    user: AuthenticatedUser
  ): Promise<MedicalEncounterDetail> {
    await this.resourceAccessService.assertCanAccessResource(user, encounterId, Permissions.MEDICAL_TRANSFER);
    await this.resourceAccessService.assertCanAccessResource(user, encounterId, Permissions.MEDICAL_READ);

    const [existing] = await this.db.select()
      .from(medicalEncounters).where(eq(medicalEncounters.id, encounterId)).limit(1);
    if (!existing) throw new NotFoundException(`Medical encounter '${encounterId}' not found`);

    await this.assertReferencesInEvent(existing.eventId, {
      targetLocationId: dto.targetLocationId, receivingUnitId: dto.receivingUnitId,
    });
    if (dto.receivingUnitId && dto.receivingUnitId !== existing.assignedUnitId) {
      await this.assertMedicalReceivingUnit(existing.eventId, dto.receivingUnitId);
    }
    const [destination] = await this.db.select({name:locations.name}).from(locations)
      .where(eq(locations.id, dto.targetLocationId)).limit(1);
    if (!destination) throw new NotFoundException('Transfer location not found');

    const now = new Date();
    await this.db.transaction(async tx => {
      const [locked] = await tx.select().from(medicalEncounters)
        .where(eq(medicalEncounters.id, encounterId)).limit(1).for('update');
      if (!locked || locked.eventId !== existing.eventId) {
        throw new NotFoundException('Medical encounter no longer belongs to this exercise');
      }
      const nextUnitId = dto.receivingUnitId ?? locked.assignedUnitId;
      const teamChanged = nextUnitId !== locked.assignedUnitId;

      await tx.update(medicalEncounters).set({
        status: 'TRANSFERRED',
        locationId: dto.targetLocationId,
        transferredAt: now,
        disposition: dto.disposition,
        assignedUnitId: nextUnitId,
        // The old assignee is not automatically a member of the receiving unit.
        assignedUserId: teamChanged ? null : locked.assignedUserId,
        updatedAt: now,
      }).where(eq(medicalEncounters.id, encounterId));

      // ResourceAccessService evaluates the resources table, not medicalEncounters.
      // The domain ownership and access-control ownership must move together.
      if (teamChanged) {
        await tx.update(resources).set({
          owningUnitId: nextUnitId,
          ownerUserId: null,
          updatedAt: now,
        }).where(and(eq(resources.id, encounterId), eq(resources.eventId, locked.eventId)));
      }

      await this.auditService.record({
        action: 'medical.transferred',
        category: 'medical',
        eventId: locked.eventId,
        resourceType: 'medical_encounter',
        resourceId: encounterId,
        actorUserId: user.id,
        metadata: {
          medicalNumber: locked.medicalNumber,
          targetLocationId: dto.targetLocationId,
          targetLocationName: destination.name,
          owningTeamChanged: teamChanged,
          disposition: dto.disposition,
        },
        txClient: tx,
      });
      await this.activityService.recordActivity({
        eventId: locked.eventId,
        resourceId: encounterId,
        activityType: 'medical.transferred',
        actorUserId: user.id,
        title: `Casualty Transferred: ${locked.medicalNumber} → ${destination.name}`,
        summary: dto.disposition,
      }, tx);
      await this.searchIndexer.emitSearchUpsert('medical_encounter', encounterId, tx);
    });

    // Safe one-time acknowledgement: transfer permissions were checked against
    // the source unit BEFORE the atomic handoff. Future GETs enforce the new ACL.
    return this.loadEncounterDetail(encounterId);
  }

  /**
   * Concludes or closes the medical encounter (e.g. discharged or deceased).
   */
  async closeEncounter(
    encounterId: string,
    dto: CloseMedicalEncounterRequest,
    user: AuthenticatedUser
  ): Promise<MedicalEncounterDetail> {
    await this.resourceAccessService.assertCanAccessResource(
      user,
      encounterId,
      Permissions.MEDICAL_CLOSE
    );

    const [existing] = await this.db
      .select()
      .from(medicalEncounters)
      .where(eq(medicalEncounters.id, encounterId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`Medical encounter '${encounterId}' not found`);
    }

    const now = new Date();
    await this.db
      .update(medicalEncounters)
      .set({
        status: dto.status || 'CLOSED',
        closedAt: now,
        disposition: dto.disposition,
        updatedAt: now,
      })
      .where(eq(medicalEncounters.id, encounterId));

    await this.auditService.record({
      action: 'medical.closed',
      category: 'medical',
      eventId: existing.eventId,
      resourceType: 'medical_encounter',
      resourceId: encounterId,
      actorUserId: user.id,
      metadata: {
        medicalNumber: existing.medicalNumber,
        finalStatus: dto.status,
        disposition: dto.disposition,
      },
    });

    await this.activityService.recordActivity({
      eventId: existing.eventId,
      resourceId: encounterId,
      activityType: 'medical.closed',
      actorUserId: user.id,
      title: `Medical Encounter Closed: ${existing.medicalNumber} (${dto.status})`,
      summary: dto.disposition,
    });

    await this.searchIndexer.emitSearchUpsert('medical_encounter', encounterId);

    return this.getEncounterDetail(encounterId, user);
  }

  /**
   * Retrieves full encounter detail including observations and interventions.
   * STRICT ACCESS: Requires medical.read AND unit resource access.
   */
  async getEncounterDetail(
    encounterId: string,
    user: AuthenticatedUser
  ): Promise<MedicalEncounterDetail> {
    await this.resourceAccessService.assertCanAccessResource(
      user, encounterId, Permissions.MEDICAL_READ
    );
    return this.loadEncounterDetail(encounterId);
  }

  /** Internal post-mutation response. Call only after pre-mutation access check. */
  private async loadEncounterDetail(encounterId: string): Promise<MedicalEncounterDetail> {
    const [row] = await this.db
      .select({
        encounter: medicalEncounters,
        resource: resources,
        person: persons,
        location: locations,
        incident: incidents,
        unit: organizationalUnits,
        assignedUser: users,
      })
      .from(medicalEncounters)
      .innerJoin(resources, eq(medicalEncounters.id, resources.id))
      .leftJoin(persons, eq(medicalEncounters.personId, persons.id))
      .leftJoin(locations, eq(medicalEncounters.locationId, locations.id))
      .leftJoin(incidents, eq(medicalEncounters.incidentId, incidents.id))
      .leftJoin(organizationalUnits, eq(medicalEncounters.assignedUnitId, organizationalUnits.id))
      .leftJoin(users, eq(medicalEncounters.assignedUserId, users.id))
      .where(eq(medicalEncounters.id, encounterId))
      .limit(1);

    if (!row) {
      throw new NotFoundException(`Medical encounter '${encounterId}' not found`);
    }

    // Observations
    const obsRows = await this.db
      .select({
        obs: medicalObservations,
        recorder: users,
      })
      .from(medicalObservations)
      .leftJoin(users, eq(medicalObservations.recordedByUserId, users.id))
      .where(eq(medicalObservations.encounterId, encounterId))
      .orderBy(desc(medicalObservations.observedAt));

    const observations: MedicalObservationItem[] = obsRows.map((r) => ({
      id: r.obs.id,
      encounterId: r.obs.encounterId,
      observedAt: r.obs.observedAt.toISOString(),
      observationType: r.obs.observationType,
      value: r.obs.value,
      unit: r.obs.unit,
      note: r.obs.note,
      recordedByUserId: r.obs.recordedByUserId,
      recordedByUserDisplayName: r.recorder?.displayName,
      createdAt: r.obs.createdAt.toISOString(),
    }));

    // Interventions
    const intRows = await this.db
      .select({
        int: medicalInterventions,
        performer: users,
      })
      .from(medicalInterventions)
      .leftJoin(users, eq(medicalInterventions.performedByUserId, users.id))
      .where(eq(medicalInterventions.encounterId, encounterId))
      .orderBy(desc(medicalInterventions.performedAt));

    const interventions: MedicalInterventionItem[] = intRows.map((r) => ({
      id: r.int.id,
      encounterId: r.int.encounterId,
      interventionType: r.int.interventionType,
      description: r.int.description,
      performedAt: r.int.performedAt.toISOString(),
      performedByUserId: r.int.performedByUserId,
      performedByUserDisplayName: r.performer?.displayName,
      outcome: r.int.outcome,
      createdAt: r.int.createdAt.toISOString(),
    }));

    // Timeline events for this encounter
    const activities = await this.db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.resourceId, encounterId))
      .orderBy(desc(activityEvents.occurredAt))
      .limit(20);

    return {
      ...this.mapEncounterItem(row.encounter, {
        visibility: row.resource.visibility,
        personDisplayName: row.person?.displayName,
        locationName: row.location?.name,
        incidentNumber: row.incident?.incidentNumber,
        assignedUnitName: row.unit?.name,
        assignedUserDisplayName: row.assignedUser?.displayName,
      }),
      observations,
      interventions,
      documents: [],
      timeline: activities.map((a) => ({
        id: a.id,
        activityType: a.activityType,
        occurredAt: a.occurredAt.toISOString(),
        title: a.title,
        summary: a.summary || undefined,
        actorUserId: a.actorUserId,
      })),
    };
  }

  /**
   * Lists medical encounters for authorized medical personnel.
   */
  async listEncounters(
    eventId: string,
    filters: MedicalQueryFilters,
    user: AuthenticatedUser
  ): Promise<MedicalEncounterItem[]> {
    const whereConditions = [eq(medicalEncounters.eventId, eventId)];

    if (filters.status) {
      whereConditions.push(eq(medicalEncounters.status, filters.status));
    }
    if (filters.triageCategory) {
      whereConditions.push(eq(medicalEncounters.triageCategory, filters.triageCategory));
    }
    if (filters.locationId) {
      whereConditions.push(eq(medicalEncounters.locationId, filters.locationId));
    }
    if (filters.incidentId) {
      whereConditions.push(eq(medicalEncounters.incidentId, filters.incidentId));
    }
    if (filters.assignedUnitId) {
      whereConditions.push(eq(medicalEncounters.assignedUnitId, filters.assignedUnitId));
    }

    const rows = await this.db
      .select({
        encounter: medicalEncounters,
        resource: resources,
        person: persons,
        location: locations,
      })
      .from(medicalEncounters)
      .innerJoin(resources, eq(medicalEncounters.id, resources.id))
      .leftJoin(persons, eq(medicalEncounters.personId, persons.id))
      .leftJoin(locations, eq(medicalEncounters.locationId, locations.id))
      .where(and(...whereConditions))
      .orderBy(desc(medicalEncounters.openedAt));

    const accessible: MedicalEncounterItem[] = [];
    for (const r of rows) {
      const allowed = await this.resourceAccessService.canAccessResource(
        user,
        r.encounter.id,
        Permissions.MEDICAL_READ
      );
      if (allowed) {
        accessible.push(
          this.mapEncounterItem(r.encounter, {
            visibility: r.resource.visibility,
            personDisplayName: r.person?.displayName,
            locationName: r.location?.name,
          })
        );
      }
    }

    return accessible;
  }

  /**
   * Operational Medical Summary for Command / Crisis Management.
   * STRICT CONFIDENTIALITY: Contains ONLY aggregate counts.
   * Returns ZERO patient identities, clinical descriptions, or vital values.
   */
  async getOperationalSummary(
    eventId: string,
    user: AuthenticatedUser
  ): Promise<MedicalOperationalSummaryResponse> {
    // Aggregate data is still exercise-scoped and must not be exposed to any signed-in account.
    const canRead = await this.authorization.hasEventCapability({
      user, eventId, permission: Permissions.COMMAND_READ, resourceScopes: [],
    }) || await this.authorization.hasEventCapability({
      user, eventId, permission: Permissions.MEDICAL_READ, resourceScopes: [],
    }) || await this.authorization.authorize({ user, permission: Permissions.PLATFORM_MANAGE });
    if (!canRead) throw new ForbiddenException('Medical operational summary is not available to this operator');

    const rows = await this.db
      .select({
        status: medicalEncounters.status,
        triageCategory: medicalEncounters.triageCategory,
      })
      .from(medicalEncounters)
      .where(eq(medicalEncounters.eventId, eventId));

    let activeCasualties = 0;
    let stabilizedCasualties = 0;
    let transferredCasualties = 0;
    let closedCasualties = 0;
    let deceasedCasualties = 0;

    const triageCounts = {
      IMMEDIATE: 0,
      DELAYED: 0,
      MINOR: 0,
      EXPECTANT: 0,
      UNKNOWN: 0,
    };

    for (const r of rows) {
      if (r.status === 'RECEIVED' || r.status === 'TRIAGED' || r.status === 'UNDER_CARE') {
        activeCasualties++;
      } else if (r.status === 'STABILIZED') {
        stabilizedCasualties++;
      } else if (r.status === 'TRANSFERRED') {
        transferredCasualties++;
      } else if (r.status === 'CLOSED') {
        closedCasualties++;
      } else if (r.status === 'DECEASED') {
        deceasedCasualties++;
      }

      const cat = r.triageCategory as keyof typeof triageCounts;
      if (triageCounts[cat] !== undefined) {
        triageCounts[cat]++;
      } else {
        triageCounts.UNKNOWN++;
      }
    }

    return {
      eventId,
      totalEncounters: rows.length,
      activeCasualties,
      stabilizedCasualties,
      transferredCasualties,
      closedCasualties,
      deceasedCasualties,
      triageCounts,
      lastUpdated: new Date().toISOString(),
    };
  }

  private mapEncounterItem(
    e: typeof medicalEncounters.$inferSelect,
    meta: {
      visibility?: string;
      personDisplayName?: string;
      locationName?: string;
      incidentNumber?: string;
      assignedUnitName?: string;
      assignedUserDisplayName?: string;
    }
  ): MedicalEncounterItem {
    return {
      id: e.id,
      eventId: e.eventId,
      medicalNumber: e.medicalNumber,
      personId: e.personId,
      personDisplayName: meta.personDisplayName,
      status: e.status as any,
      triageCategory: e.triageCategory as any,
      visibility: (meta.visibility as any) || 'UNIT',
      incidentId: e.incidentId,
      incidentNumber: meta.incidentNumber,
      locationId: e.locationId,
      locationName: meta.locationName,
      chiefComplaint: e.chiefComplaint,
      mechanismOfInjury: e.mechanismOfInjury,
      assessmentSummary: e.assessmentSummary,
      disposition: e.disposition,
      assignedUnitId: e.assignedUnitId,
      assignedUnitName: meta.assignedUnitName,
      assignedUserId: e.assignedUserId,
      assignedUserDisplayName: meta.assignedUserDisplayName,
      openedAt: e.openedAt.toISOString(),
      stabilizedAt: e.stabilizedAt ? e.stabilizedAt.toISOString() : null,
      transferredAt: e.transferredAt ? e.transferredAt.toISOString() : null,
      closedAt: e.closedAt ? e.closedAt.toISOString() : null,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }
}

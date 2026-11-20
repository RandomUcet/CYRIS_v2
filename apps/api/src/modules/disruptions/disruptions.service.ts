import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import {
  eventMemberships,
  exerciseDisruptions,
  organizationalUnits,
  users,
  events,
  MembershipStatus,
  recoveryObjectives,
  recoveryReports,
  recoveryArtifacts,
} from '@cyris/db';
import { Permissions } from '@cyris/shared';
import type {
  CreateDisruptionRequest,
  DisruptionSnapshot,
  RestoreDisruptionRequest,
  ParticipantDisruptionStatus,
  CreateRecoveryObjectiveRequest,
  RecoveryObjectiveReviewRequest,
  RecoveryObjectiveRestoreRequest,
  RecoveryReportRequest,
  RecoveryObjective,
  RecoveryReport,
  CreateRecoveryArtifactRequest,
  RecoveryArtifact,
} from '@cyris/contracts';
import type { RestrictedServiceMode, ServiceModule, ServiceStatusResponse, ServiceStatusItem } from '@cyris/contracts';
import { assertRevision, assertServiceOperation, assertSupportedDisruption, isActiveDisruption, type ServiceOperation } from './disruption-policy.js';
import { assertApprovalHasReport, assertLinkedDisruptionActive, assertNoDuplicateReport, assertObjectiveTransition, assertReportAllowed } from './recovery-policy.js';
import { serviceReadPermissions, summarizeServiceStatus } from './service-status-policy.js';
import { requestModuleImpacts } from './request-impacts.js';

@Injectable()
export class DisruptionsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly authorizationService: AuthorizationService,
    private readonly auditService: AuditService,
  ) {}

  private get db() {
    return this.databaseService.client;
  }

  async getParticipantStatus(eventId: string, user: AuthenticatedUser): Promise<ParticipantDisruptionStatus> {
    await this.assertStatusAccess(eventId, user);
    if (!(await this.hasModuleCapability(eventId, user, 'tasks')) &&
        !(await this.authorizationService.authorize({ user, permission: Permissions.PLATFORM_MANAGE }))) {
      throw new ForbiddenException('Access denied');
    }
    const impact = (await this.getModuleImpacts(eventId, user)).get('tasks');
    return { eventId, module: 'tasks', mode: impact ?? null, active: Boolean(impact) };
  }

  async getServiceStatus(eventId: string, user: AuthenticatedUser): Promise<ServiceStatusResponse> {
    await this.assertStatusAccess(eventId, user);
    const impacts = await this.getModuleImpacts(eventId, user);
    const visible = await Promise.all([...impacts].map(async ([service, impact]) =>
      await this.hasModuleCapability(eventId, user, service) ? { service, impact } : null
    ));
    const items = visible.filter((item): item is ServiceStatusItem => item !== null)
      .sort((a, b) => a.service.localeCompare(b.service));
    return {
      eventId,
      generatedAt: new Date().toISOString(),
      scope: 'PERSONAL',
      current: summarizeServiceStatus(items),
      items,
    };
  }

  private async hasModuleCapability(eventId: string, user: AuthenticatedUser, module: ServiceModule): Promise<boolean> {
    for (const permission of serviceReadPermissions[module]) {
      if (await this.authorizationService.hasEventCapability({
        user, permission, eventId, resourceScopes: ['OWN', 'ASSIGNED'],
      })) return true;
    }
    return false;
  }

  /** Membership, unit assignments and rule windows are evaluated together for the effective identity. */
  async getModuleImpacts(eventId: string, user: AuthenticatedUser): Promise<ReadonlyMap<ServiceModule, RestrictedServiceMode>> {
    if (user.status !== 'ACTIVE') return new Map();
    const impacts = await requestModuleImpacts(this.db, eventId, user);
    if (impacts.size && await this.authorizationService.authorize({ user, permission: Permissions.PLATFORM_MANAGE })) {
      return new Map();
    }
    return impacts;
  }

  async assertModuleAccess(eventId: string, user: AuthenticatedUser, module: ServiceModule, operation: ServiceOperation): Promise<void> {
    const impact = (await this.getModuleImpacts(eventId, user)).get(module);
    if (!impact || (operation === 'read' && impact === 'READ_ONLY')) return;
    if (!await this.hasModuleCapability(eventId, user, module)) throw new ForbiddenException('Access denied');
    assertServiceOperation(impact, operation);
  }

  async listOperator(eventId: string, user: AuthenticatedUser): Promise<DisruptionSnapshot[]> {
    await this.assertAdminAccess(eventId, user);
    const rows = await this.db.select().from(exerciseDisruptions)
      .where(eq(exerciseDisruptions.eventId, eventId))
      .orderBy(desc(exerciseDisruptions.startsAt));
    return rows.map((row) => this.toSnapshot(row));
  }

  async start(eventId: string, dto: CreateDisruptionRequest, user: AuthenticatedUser): Promise<DisruptionSnapshot> {
    await this.assertAdminAccess(eventId, user);
    assertSupportedDisruption(dto.module, dto.mode);
    await this.validateTarget(eventId, dto.targetType, dto.targetId);
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : new Date();
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (Number.isNaN(startsAt.getTime()) || (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt <= startsAt))) {
      throw new BadRequestException('Disruption start and expiry must be valid and expiry must be after start');
    }
    const created = await this.db.transaction(async (tx) => {
      const [row] = await tx.insert(exerciseDisruptions).values({
        eventId,
        targetType: dto.targetType,
        targetId: dto.targetId ?? null,
        module: dto.module,
        mode: dto.mode,
        startsAt,
        expiresAt,
        reason: dto.reason,
        revision: 1,
        createdByUserId: user.id,
      }).returning();
      await this.auditService.record({
        action: 'exercise.disruption.started',
        category: 'scenario',
        eventId,
        resourceType: 'exercise_disruption',
        resourceId: row.id,
        actorUserId: user.id,
        metadata: { targetType: dto.targetType, targetId: dto.targetId, module: dto.module, mode: dto.mode, reason: dto.reason },
        txClient: tx,
      });
      return row;
    });
    return this.toSnapshot(created);
  }

  async restore(eventId: string, disruptionId: string, dto: RestoreDisruptionRequest, user: AuthenticatedUser): Promise<DisruptionSnapshot> {
    await this.assertAdminAccess(eventId, user);
    const restored = await this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(exerciseDisruptions).where(and(eq(exerciseDisruptions.id, disruptionId), eq(exerciseDisruptions.eventId, eventId))).limit(1);
      if (!current) throw new NotFoundException(`Disruption '${disruptionId}' not found`);
      assertRevision(dto.expectedRevision, current.revision);
      const [row] = await tx.update(exerciseDisruptions).set({
        revision: current.revision + 1,
        restoredAt: new Date(),
        restoredByUserId: user.id,
      }).where(and(
        eq(exerciseDisruptions.id, disruptionId),
        eq(exerciseDisruptions.eventId, eventId),
        eq(exerciseDisruptions.revision, dto.expectedRevision),
        isNull(exerciseDisruptions.restoredAt),
      )).returning();
      if (!row) throw new ConflictException('Disruption was restored concurrently');
      await this.auditService.record({
        action: 'exercise.disruption.restored',
        category: 'scenario',
        eventId,
        resourceType: 'exercise_disruption',
        resourceId: disruptionId,
        actorUserId: user.id,
        metadata: { reason: dto.reason },
        changes: { fromRevision: current.revision, toRevision: row.revision },
        txClient: tx,
      });
      return row;
    });
    return this.toSnapshot(restored);
  }

  async createRecoveryObjective(eventId: string, dto: CreateRecoveryObjectiveRequest, user: AuthenticatedUser): Promise<RecoveryObjective> {
    await this.assertAdminAccess(eventId, user);
    const [disruption] = await this.db.select().from(exerciseDisruptions).where(and(eq(exerciseDisruptions.id, dto.disruptionId), eq(exerciseDisruptions.eventId, eventId))).limit(1);
    if (!disruption || !isActiveDisruption(disruption)) {
      throw new ConflictException('Recovery objective requires an active restriction in this event');
    }
    assertSupportedDisruption(disruption.module, disruption.mode);
    await this.validateTarget(eventId, dto.audienceType, dto.audienceId);
    const [row] = await this.db.transaction(async (tx) => {
      const created = await tx.insert(recoveryObjectives).values({
        eventId, disruptionId: dto.disruptionId, audienceType: dto.audienceType, audienceId: dto.audienceId ?? null,
        title: dto.title, instructions: dto.instructions, status: 'DRAFT', revision: 1, createdByUserId: user.id,
      }).returning();
      await this.auditService.record({
        action: 'exercise.recovery_objective.created', category: 'scenario', eventId,
        resourceType: 'recovery_objective', resourceId: created[0]!.id, actorUserId: user.id,
        metadata: { disruptionId: dto.disruptionId, audienceType: dto.audienceType, audienceId: dto.audienceId ?? null },
        txClient: tx,
      });
      return created;
    });
    return this.toRecoveryObjective(row!);
  }

  async listRecoveryObjectives(eventId: string, user: AuthenticatedUser): Promise<RecoveryObjective[]> {
    await this.assertAdminAccess(eventId, user);
    const rows = await this.db.select().from(recoveryObjectives)
      .where(eq(recoveryObjectives.eventId, eventId)).orderBy(desc(recoveryObjectives.createdAt));
    return rows.map((row) => this.toRecoveryObjective(row));
  }

  async publishRecoveryObjective(eventId: string, objectiveId: string, expectedRevision: number, user: AuthenticatedUser): Promise<RecoveryObjective> {
    await this.assertAdminAccess(eventId, user);
    const [objective] = await this.db.select().from(recoveryObjectives).where(and(eq(recoveryObjectives.id, objectiveId), eq(recoveryObjectives.eventId, eventId))).limit(1);
    if (!objective) throw new NotFoundException('Recovery objective not found');
    const [disruption] = await this.db.select().from(exerciseDisruptions).where(and(eq(exerciseDisruptions.id, objective.disruptionId), eq(exerciseDisruptions.eventId, eventId))).limit(1);
    if (!disruption || !isActiveDisruption(disruption)) throw new ConflictException('The linked disruption must still be active before publication');
    const row = await this.transitionObjective(eventId, objectiveId, expectedRevision, 'PUBLISHED', user, 'exercise.recovery_objective.published');
    return this.toRecoveryObjective(row);
  }

  async reviewRecoveryObjective(eventId: string, objectiveId: string, dto: RecoveryObjectiveReviewRequest, user: AuthenticatedUser): Promise<RecoveryObjective> {
    await this.assertAdminAccess(eventId, user);
    const status = dto.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    if (status === 'APPROVED') {
      const [report] = await this.db.select({ id: recoveryReports.id })
        .from(recoveryReports)
        .where(and(eq(recoveryReports.eventId, eventId), eq(recoveryReports.objectiveId, objectiveId)))
        .limit(1);
      try { assertApprovalHasReport(Boolean(report)); } catch { throw new ConflictException('A recovery report is required before approval'); }
    }
    const row = await this.transitionObjective(eventId, objectiveId, dto.expectedRevision, status, user, `exercise.recovery_objective.${status.toLowerCase()}`);
    return this.toRecoveryObjective(row);
  }

  async restoreFromRecoveryObjective(eventId: string, objectiveId: string, dto: RecoveryObjectiveRestoreRequest, user: AuthenticatedUser): Promise<RecoveryObjective> {
    await this.assertAdminAccess(eventId, user);
    const result = await this.db.transaction(async (tx) => {
      const [objective] = await tx.select().from(recoveryObjectives).where(and(eq(recoveryObjectives.id, objectiveId), eq(recoveryObjectives.eventId, eventId))).limit(1);
      if (!objective || objective.status !== 'APPROVED') throw new ConflictException('Only an approved recovery objective can restore its disruption');
      if (objective.revision !== dto.expectedRevision) throw new ConflictException('Recovery objective revision conflict');
      try { assertObjectiveTransition(objective.status as RecoveryObjective['status'], 'RESTORED'); } catch { throw new ConflictException('Invalid recovery objective transition'); }
      const [disruption] = await tx.select().from(exerciseDisruptions).where(and(eq(exerciseDisruptions.id, objective.disruptionId), eq(exerciseDisruptions.eventId, eventId))).limit(1);
      try { assertLinkedDisruptionActive(Boolean(disruption && isActiveDisruption(disruption))); } catch { throw new ConflictException('Linked disruption is expired, restored or unavailable'); }
      const [restored] = await tx.update(exerciseDisruptions).set({ revision: disruption.revision + 1, restoredAt: new Date(), restoredByUserId: user.id }).where(and(eq(exerciseDisruptions.id, disruption.id), eq(exerciseDisruptions.revision, disruption.revision), isNull(exerciseDisruptions.restoredAt))).returning();
      if (!restored) throw new ConflictException('Disruption was restored concurrently');
      const [updated] = await tx.update(recoveryObjectives).set({ status: 'RESTORED', revision: objective.revision + 1, reviewedByUserId: user.id, reviewedAt: new Date() }).where(and(eq(recoveryObjectives.id, objective.id), eq(recoveryObjectives.revision, dto.expectedRevision))).returning();
      if (!updated) throw new ConflictException('Recovery objective was changed concurrently');
      await this.auditService.record({
        action: 'exercise.recovery_objective.restored', category: 'scenario', eventId,
        resourceType: 'recovery_objective', resourceId: objective.id, actorUserId: user.id,
        metadata: { disruptionId: disruption.id, reason: dto.reason }, changes: { fromRevision: objective.revision, toRevision: updated.revision }, txClient: tx,
      });
      return updated;
    });
    return this.toRecoveryObjective(result);
  }

  async submitRecoveryReport(eventId: string, objectiveId: string, dto: RecoveryReportRequest, user: AuthenticatedUser): Promise<RecoveryReport> {
    await this.assertAdminAccess(eventId, user);
    const [objective] = await this.db.select().from(recoveryObjectives).where(and(eq(recoveryObjectives.id, objectiveId), eq(recoveryObjectives.eventId, eventId), eq(recoveryObjectives.status, 'PUBLISHED'))).limit(1);
    if (!objective) throw new NotFoundException('Published recovery objective not found');
    const [disruption] = await this.db.select().from(exerciseDisruptions).where(and(eq(exerciseDisruptions.id, objective.disruptionId), eq(exerciseDisruptions.eventId, eventId))).limit(1);
    try { assertReportAllowed(objective.status as RecoveryObjective['status'], Boolean(disruption && isActiveDisruption(disruption))); } catch { throw new ConflictException('The linked disruption is expired, restored or unavailable'); }
    const [existing] = await this.db.select({ id: recoveryReports.id }).from(recoveryReports)
      .where(and(eq(recoveryReports.objectiveId, objectiveId), eq(recoveryReports.authorUserId, user.id))).limit(1);
    try { assertNoDuplicateReport(Boolean(existing)); } catch { throw new ConflictException('A recovery report was already submitted for this objective'); }
    const [row] = await this.db.transaction(async (tx) => {
      const created = await tx.insert(recoveryReports).values({ objectiveId, eventId, authorUserId: user.id, body: dto.body, revision: 1 }).returning();
      await this.auditService.record({
        action: 'exercise.recovery_report.submitted', category: 'scenario', eventId,
        resourceType: 'recovery_objective', resourceId: objectiveId, actorUserId: user.id,
        metadata: { objectiveRevision: objective.revision }, txClient: tx,
      });
      return created;
    });
    return this.toRecoveryReport(row!);
  }

  async listRecoveryArtifacts(eventId: string, objectiveId: string, user: AuthenticatedUser): Promise<RecoveryArtifact[]> {
    await this.assertAdminAccess(eventId, user);
    const [objective] = await this.db.select({ id: recoveryObjectives.id }).from(recoveryObjectives)
      .where(and(eq(recoveryObjectives.id, objectiveId), eq(recoveryObjectives.eventId, eventId))).limit(1);
    if (!objective) throw new NotFoundException('Recovery objective not found');
    const rows = await this.db.select().from(recoveryArtifacts)
      .where(and(eq(recoveryArtifacts.eventId, eventId), eq(recoveryArtifacts.objectiveId, objectiveId)))
      .orderBy(desc(recoveryArtifacts.createdAt));
    return rows.map((row) => this.toRecoveryArtifact(row));
  }

  async createRecoveryArtifact(eventId: string, dto: CreateRecoveryArtifactRequest, user: AuthenticatedUser): Promise<RecoveryArtifact> {
    await this.assertAdminAccess(eventId, user);
    const [objective] = await this.db.select().from(recoveryObjectives)
      .where(and(eq(recoveryObjectives.id, dto.objectiveId), eq(recoveryObjectives.eventId, eventId), eq(recoveryObjectives.status, 'DRAFT'))).limit(1);
    if (!objective) throw new ConflictException('Artifacts can only be attached to a draft objective in this event');
    const [row] = await this.db.transaction(async (tx) => {
      const created = await tx.insert(recoveryArtifacts).values({
        objectiveId: dto.objectiveId, eventId, title: dto.title, filename: dto.filename,
        mimeType: 'text/plain', body: dto.body, status: 'DRAFT', revision: 1, createdByUserId: user.id,
      }).returning();
      await this.auditService.record({
        action: 'exercise.recovery_artifact.created', category: 'scenario', eventId,
        resourceType: 'recovery_artifact', resourceId: created[0]!.id, actorUserId: user.id,
        metadata: { objectiveId: dto.objectiveId, filename: dto.filename, mimeType: 'text/plain' }, txClient: tx,
      });
      return created;
    });
    return this.toRecoveryArtifact(row!);
  }

  async publishRecoveryArtifact(eventId: string, objectiveId: string, artifactId: string, expectedRevision: number, user: AuthenticatedUser): Promise<RecoveryArtifact> {
    await this.assertAdminAccess(eventId, user);
    const [row] = await this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(recoveryArtifacts).where(and(eq(recoveryArtifacts.id, artifactId), eq(recoveryArtifacts.objectiveId, objectiveId), eq(recoveryArtifacts.eventId, eventId))).limit(1);
      if (!current || current.status !== 'DRAFT' || current.revision !== expectedRevision) throw new ConflictException('Recovery artifact revision or state conflict');
      const [objective] = await tx.select().from(recoveryObjectives).where(and(eq(recoveryObjectives.id, current.objectiveId), eq(recoveryObjectives.eventId, eventId), eq(recoveryObjectives.status, 'PUBLISHED'))).limit(1);
      if (!objective) throw new ConflictException('Publish the recovery objective before publishing its artifact');
      const [disruption] = await tx.select().from(exerciseDisruptions).where(and(eq(exerciseDisruptions.id, objective.disruptionId), eq(exerciseDisruptions.eventId, eventId))).limit(1);
      try { assertLinkedDisruptionActive(Boolean(disruption && isActiveDisruption(disruption))); } catch { throw new ConflictException('The linked disruption must still be active before artifact publication'); }
      const [updated] = await tx.update(recoveryArtifacts).set({ status: 'PUBLISHED', revision: current.revision + 1, publishedAt: new Date() })
        .where(and(eq(recoveryArtifacts.id, artifactId), eq(recoveryArtifacts.revision, expectedRevision), eq(recoveryArtifacts.status, 'DRAFT'))).returning();
      if (!updated) throw new ConflictException('Recovery artifact was changed concurrently');
      await this.auditService.record({
        action: 'exercise.recovery_artifact.published', category: 'scenario', eventId,
        resourceType: 'recovery_artifact', resourceId: artifactId, actorUserId: user.id,
        metadata: { objectiveId: current.objectiveId, fromRevision: current.revision, toRevision: updated.revision }, txClient: tx,
      });
      return [updated];
    });
    return this.toRecoveryArtifact(row!);
  }

  async downloadRecoveryArtifact(eventId: string, objectiveId: string, artifactId: string, user: AuthenticatedUser): Promise<{ body: string; filename: string }> {
    await this.assertAdminAccess(eventId, user);
    const [artifact] = await this.db.select().from(recoveryArtifacts)
      .where(and(eq(recoveryArtifacts.id, artifactId), eq(recoveryArtifacts.objectiveId, objectiveId), eq(recoveryArtifacts.eventId, eventId), eq(recoveryArtifacts.status, 'PUBLISHED'))).limit(1);
    if (!artifact) throw new NotFoundException('Published recovery artifact not found');
    const [objective] = await this.db.select().from(recoveryObjectives).where(and(eq(recoveryObjectives.id, artifact.objectiveId), eq(recoveryObjectives.eventId, eventId))).limit(1);
    if (!objective || objective.status !== 'PUBLISHED') throw new ConflictException('Recovery objective is no longer published');
    return { body: artifact.body, filename: artifact.filename };
  }

  async listRecoveryReports(eventId: string, objectiveId: string, user: AuthenticatedUser): Promise<RecoveryReport[]> {
    await this.assertAdminAccess(eventId, user);
    const [objective] = await this.db.select({ id: recoveryObjectives.id }).from(recoveryObjectives)
      .where(and(eq(recoveryObjectives.id, objectiveId), eq(recoveryObjectives.eventId, eventId))).limit(1);
    if (!objective) throw new NotFoundException('Recovery objective not found');
    const rows = await this.db.select().from(recoveryReports)
      .where(and(eq(recoveryReports.eventId, eventId), eq(recoveryReports.objectiveId, objectiveId)))
      .orderBy(desc(recoveryReports.createdAt));
    return rows.map((row) => this.toRecoveryReport(row));
  }

  private async transitionObjective(eventId: string, objectiveId: string, expectedRevision: number, status: 'PUBLISHED' | 'APPROVED' | 'REJECTED', user: AuthenticatedUser, action: string) {
    const [row] = await this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(recoveryObjectives).where(and(eq(recoveryObjectives.id, objectiveId), eq(recoveryObjectives.eventId, eventId))).limit(1);
      if (!current || current.revision !== expectedRevision) throw new ConflictException('Recovery objective revision conflict');
      try { assertObjectiveTransition(current.status as RecoveryObjective['status'], status); } catch { throw new ConflictException('Invalid recovery objective transition'); }
      const [updated] = await tx.update(recoveryObjectives).set({ status, revision: current.revision + 1, reviewedByUserId: user.id, reviewedAt: new Date(), publishedAt: status === 'PUBLISHED' ? new Date() : current.publishedAt }).where(and(eq(recoveryObjectives.id, objectiveId), eq(recoveryObjectives.eventId, eventId), eq(recoveryObjectives.revision, expectedRevision))).returning();
      if (!updated) throw new ConflictException('Recovery objective was changed concurrently');
      await this.auditService.record({ action, category: 'scenario', eventId, resourceType: 'recovery_objective', resourceId: objectiveId, actorUserId: user.id, metadata: { fromRevision: current.revision, toRevision: updated.revision }, txClient: tx });
      return [updated];
    });
    return row!;
  }

  private toRecoveryObjective(row: typeof recoveryObjectives.$inferSelect): RecoveryObjective {
    return { id: row.id, eventId: row.eventId, disruptionId: row.disruptionId, audienceType: row.audienceType as RecoveryObjective['audienceType'], audienceId: row.audienceId, title: row.title, instructions: row.instructions, status: row.status as RecoveryObjective['status'], revision: row.revision, createdAt: row.createdAt.toISOString(), publishedAt: row.publishedAt?.toISOString() ?? null };
  }

  private toRecoveryReport(row: typeof recoveryReports.$inferSelect): RecoveryReport {
    return { id: row.id, objectiveId: row.objectiveId, body: row.body, authorUserId: row.authorUserId, createdAt: row.createdAt.toISOString() };
  }

  private toRecoveryArtifact(row: typeof recoveryArtifacts.$inferSelect): RecoveryArtifact {
    return { id: row.id, objectiveId: row.objectiveId, title: row.title, filename: row.filename, mimeType: 'text/plain', status: row.status as RecoveryArtifact['status'], revision: row.revision, createdAt: row.createdAt.toISOString(), publishedAt: row.publishedAt?.toISOString() ?? null };
  }

  async assertTaskWriteAllowed(eventId: string, user: AuthenticatedUser, _assignedUnitId?: string | null): Promise<void> {
    await this.assertModuleAccess(eventId, user, 'tasks', 'write');
  }

  async assertTaskReadAllowed(eventId: string, user: AuthenticatedUser, _assignedUnitId?: string | null): Promise<void> {
    await this.assertModuleAccess(eventId, user, 'tasks', 'read');
  }

  private async validateTarget(eventId: string, type: CreateDisruptionRequest['targetType'], id?: string | null): Promise<void> {
    if (type === 'EVENT') {
      if (id) throw new BadRequestException('An event-wide target cannot specify a unit or member');
      return;
    }
    if (!id) throw new BadRequestException('Select a target within the event');
    if (type === 'USER') {
      const [member] = await this.db.select({ id: eventMemberships.id }).from(eventMemberships)
        .innerJoin(users, eq(users.id, eventMemberships.userId))
        .where(and(eq(eventMemberships.eventId, eventId), eq(eventMemberships.userId, id),
          eq(eventMemberships.status, MembershipStatus.ACTIVE), eq(users.status, 'ACTIVE'))).limit(1);
      if (!member) throw new NotFoundException('Target user is not an active event member');
      return;
    }
    const [unit] = await this.db.select({ id: organizationalUnits.id }).from(organizationalUnits)
      .where(and(eq(organizationalUnits.eventId, eventId), eq(organizationalUnits.id, id), isNull(organizationalUnits.archivedAt)))
      .limit(1);
    if (!unit) throw new NotFoundException('Target unit is not active in this event');
  }

  private async assertAdminAccess(eventId: string, user: AuthenticatedUser): Promise<void> {
    if (!await this.authorizationService.authorize({ user, permission: Permissions.PLATFORM_MANAGE })) {
      throw new ForbiddenException('Access denied');
    }
    const [event] = await this.db.select({ id: events.id }).from(events).where(eq(events.id, eventId)).limit(1);
    if (!event) throw new NotFoundException('Event not found');
  }

  private async assertStatusAccess(eventId: string, user: AuthenticatedUser): Promise<void> {
    const [member] = await this.db.select({ id: eventMemberships.id }).from(eventMemberships)
      .where(and(eq(eventMemberships.eventId, eventId), eq(eventMemberships.userId, user.id),
        eq(eventMemberships.status, MembershipStatus.ACTIVE))).limit(1);
    if (user.status === 'ACTIVE' && member) return;
    await this.assertAdminAccess(eventId, user);
  }

  private toSnapshot(row: typeof exerciseDisruptions.$inferSelect): DisruptionSnapshot {
    return {
      id: row.id,
      eventId: row.eventId,
      targetType: row.targetType as DisruptionSnapshot['targetType'],
      targetId: row.targetId,
      module: row.module,
      mode: row.mode as DisruptionSnapshot['mode'],
      startsAt: row.startsAt.toISOString(),
      expiresAt: row.expiresAt?.toISOString() ?? null,
      reason: row.reason,
      revision: row.revision,
      restoredAt: row.restoredAt?.toISOString() ?? null,
      active: isActiveDisruption(row),
    };
  }
}

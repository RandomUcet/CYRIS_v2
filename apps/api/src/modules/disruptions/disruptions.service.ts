import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import {
  eventMemberships,
  exerciseDisruptions,
  membershipUnitAssignments,
  events,
  MembershipStatus,
  recoveryObjectives,
  recoveryReports,
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
} from '@cyris/contracts';
import { assertRevision, assertParticipantWriteAllowed, assertSupportedDisruption, ENFORCED_DISRUPTION_MODULE, isActiveDisruption, resolveDisruption } from './disruption-policy.js';
import { assertObjectiveTransition, assertReportAllowed } from './recovery-policy.js';

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

  async listParticipantVisible(eventId: string, user: AuthenticatedUser, module?: string): Promise<DisruptionSnapshot[]> {
    await this.assertEventPermission(eventId, user, Permissions.SCENARIO_READ);
    const memberships = await this.db
      .select({ unitId: membershipUnitAssignments.unitId })
      .from(eventMemberships)
      .innerJoin(membershipUnitAssignments, eq(membershipUnitAssignments.membershipId, eventMemberships.id))
      .where(and(eq(eventMemberships.eventId, eventId), eq(eventMemberships.userId, user.id), eq(eventMemberships.status, MembershipStatus.ACTIVE)));
    const unitIds = new Set(memberships.map((membership) => membership.unitId));
    const rows = await this.db.select().from(exerciseDisruptions).where(eq(exerciseDisruptions.eventId, eventId)).orderBy(desc(exerciseDisruptions.startsAt));
    return rows
      .filter((row) => isActiveDisruption(row) && (!module || row.module === module))
      .filter((row) => row.targetType === 'EVENT' || (row.targetType === 'USER' && row.targetId === user.id) || (row.targetType === 'UNIT' && row.targetId && unitIds.has(row.targetId)))
      .map((row) => this.toSnapshot(row));
  }

  async getParticipantStatus(eventId: string, user: AuthenticatedUser): Promise<ParticipantDisruptionStatus> {
    await this.assertParticipantAccess(eventId, user);
    const resolved = await this.getEffectiveDisruption(eventId, user);
    const active = resolved?.mode === 'DEGRADED' ? null : resolved;
    return {
      eventId,
      module: ENFORCED_DISRUPTION_MODULE,
      mode: active?.mode as ParticipantDisruptionStatus['mode'] ?? null,
      active: Boolean(active),
      revision: active?.revision ?? null,
    };
  }

  async listOperator(eventId: string, user: AuthenticatedUser): Promise<DisruptionSnapshot[]> {
    await this.assertEventPermission(eventId, user, Permissions.SCENARIO_MANAGE);
    const rows = await this.db.select().from(exerciseDisruptions)
      .where(eq(exerciseDisruptions.eventId, eventId))
      .orderBy(desc(exerciseDisruptions.startsAt));
    return rows.map((row) => this.toSnapshot(row));
  }

  async start(eventId: string, dto: CreateDisruptionRequest, user: AuthenticatedUser): Promise<DisruptionSnapshot> {
    await this.assertEventPermission(eventId, user, Permissions.SCENARIO_MANAGE);
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
    await this.assertEventPermission(eventId, user, Permissions.SCENARIO_OVERRIDE);
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
    await this.assertEventPermission(eventId, user, Permissions.SCENARIO_MANAGE);
    const [disruption] = await this.db.select().from(exerciseDisruptions).where(and(eq(exerciseDisruptions.id, dto.disruptionId), eq(exerciseDisruptions.eventId, eventId))).limit(1);
    if (!disruption || disruption.restoredAt || disruption.module !== ENFORCED_DISRUPTION_MODULE) {
      throw new ConflictException('Recovery objective requires an active task disruption in this event');
    }
    await this.validateAudience(eventId, dto.audienceType, dto.audienceId);
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
    const canManage = await this.authorizationService.authorize({ user, permission: Permissions.SCENARIO_MANAGE, context: { eventId } });
    if (canManage) {
      const rows = await this.db.select().from(recoveryObjectives).where(eq(recoveryObjectives.eventId, eventId)).orderBy(desc(recoveryObjectives.createdAt));
      return rows.map((row) => this.toRecoveryObjective(row));
    }
    await this.assertParticipantAccess(eventId, user);
    const rows = await this.db.select().from(recoveryObjectives).where(and(eq(recoveryObjectives.eventId, eventId), eq(recoveryObjectives.status, 'PUBLISHED'))).orderBy(desc(recoveryObjectives.createdAt));
    const visible: RecoveryObjective[] = [];
    for (const row of rows) {
      if (await this.audienceMatches(eventId, row.audienceType, row.audienceId, user)) visible.push(this.toRecoveryObjective(row));
    }
    return visible;
  }

  async publishRecoveryObjective(eventId: string, objectiveId: string, expectedRevision: number, user: AuthenticatedUser): Promise<RecoveryObjective> {
    await this.assertEventPermission(eventId, user, Permissions.SCENARIO_MANAGE);
    const row = await this.transitionObjective(eventId, objectiveId, expectedRevision, 'PUBLISHED', user, 'exercise.recovery_objective.published');
    return this.toRecoveryObjective(row);
  }

  async reviewRecoveryObjective(eventId: string, objectiveId: string, dto: RecoveryObjectiveReviewRequest, user: AuthenticatedUser): Promise<RecoveryObjective> {
    await this.assertEventPermission(eventId, user, Permissions.SCENARIO_OVERRIDE);
    const status = dto.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const row = await this.transitionObjective(eventId, objectiveId, dto.expectedRevision, status, user, `exercise.recovery_objective.${status.toLowerCase()}`);
    return this.toRecoveryObjective(row);
  }

  async restoreFromRecoveryObjective(eventId: string, objectiveId: string, dto: RecoveryObjectiveRestoreRequest, user: AuthenticatedUser): Promise<RecoveryObjective> {
    await this.assertEventPermission(eventId, user, Permissions.SCENARIO_OVERRIDE);
    const result = await this.db.transaction(async (tx) => {
      const [objective] = await tx.select().from(recoveryObjectives).where(and(eq(recoveryObjectives.id, objectiveId), eq(recoveryObjectives.eventId, eventId))).limit(1);
      if (!objective || objective.status !== 'APPROVED') throw new ConflictException('Only an approved recovery objective can restore its disruption');
      if (objective.revision !== dto.expectedRevision) throw new ConflictException('Recovery objective revision conflict');
      assertObjectiveTransition(objective.status as RecoveryObjective['status'], 'RESTORED');
      const [disruption] = await tx.select().from(exerciseDisruptions).where(and(eq(exerciseDisruptions.id, objective.disruptionId), eq(exerciseDisruptions.eventId, eventId))).limit(1);
      if (!disruption || disruption.restoredAt) throw new ConflictException('Linked disruption is already restored or unavailable');
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
    await this.assertParticipantAccess(eventId, user);
    const [objective] = await this.db.select().from(recoveryObjectives).where(and(eq(recoveryObjectives.id, objectiveId), eq(recoveryObjectives.eventId, eventId), eq(recoveryObjectives.status, 'PUBLISHED'))).limit(1);
    if (!objective || !(await this.audienceMatches(eventId, objective.audienceType, objective.audienceId, user))) throw new ForbiddenException('Recovery objective is not available in this event scope');
    const [disruption] = await this.db.select().from(exerciseDisruptions).where(and(eq(exerciseDisruptions.id, objective.disruptionId), eq(exerciseDisruptions.eventId, eventId))).limit(1);
    assertReportAllowed(objective.status as RecoveryObjective['status'], Boolean(disruption && isActiveDisruption(disruption)));
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

  async listRecoveryReports(eventId: string, objectiveId: string, user: AuthenticatedUser): Promise<RecoveryReport[]> {
    await this.assertEventPermission(eventId, user, Permissions.SCENARIO_OVERRIDE);
    const rows = await this.db.select().from(recoveryReports).where(and(eq(recoveryReports.eventId, eventId), eq(recoveryReports.objectiveId, objectiveId))).orderBy(desc(recoveryReports.createdAt));
    return rows.map((row) => this.toRecoveryReport(row));
  }

  private async transitionObjective(eventId: string, objectiveId: string, expectedRevision: number, status: 'PUBLISHED' | 'APPROVED' | 'REJECTED', user: AuthenticatedUser, action: string) {
    const [row] = await this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(recoveryObjectives).where(and(eq(recoveryObjectives.id, objectiveId), eq(recoveryObjectives.eventId, eventId))).limit(1);
      if (!current || current.revision !== expectedRevision) throw new ConflictException('Recovery objective revision conflict');
      assertObjectiveTransition(current.status as RecoveryObjective['status'], status);
      const [updated] = await tx.update(recoveryObjectives).set({ status, revision: current.revision + 1, reviewedByUserId: user.id, reviewedAt: new Date(), publishedAt: status === 'PUBLISHED' ? new Date() : current.publishedAt }).where(and(eq(recoveryObjectives.id, objectiveId), eq(recoveryObjectives.eventId, eventId), eq(recoveryObjectives.revision, expectedRevision))).returning();
      if (!updated) throw new ConflictException('Recovery objective was changed concurrently');
      await this.auditService.record({ action, category: 'scenario', eventId, resourceType: 'recovery_objective', resourceId: objectiveId, actorUserId: user.id, metadata: { fromRevision: current.revision, toRevision: updated.revision }, txClient: tx });
      return [updated];
    });
    return row!;
  }

  private async validateAudience(eventId: string, audienceType: CreateRecoveryObjectiveRequest['audienceType'], audienceId?: string | null): Promise<void> {
    if (audienceType === 'EVENT') {
      if (audienceId) throw new BadRequestException('EVENT audience must not have audienceId');
      return;
    }
    if (!audienceId) throw new BadRequestException('UNIT and USER audiences require audienceId');
    if (audienceType === 'USER') {
      const [membership] = await this.db.select({ id: eventMemberships.id }).from(eventMemberships).where(and(eq(eventMemberships.eventId, eventId), eq(eventMemberships.userId, audienceId), eq(eventMemberships.status, MembershipStatus.ACTIVE))).limit(1);
      if (!membership) throw new NotFoundException('Audience user is not an active event member');
      return;
    }
    const [assignment] = await this.db.select({ id: membershipUnitAssignments.id }).from(membershipUnitAssignments).innerJoin(eventMemberships, eq(eventMemberships.id, membershipUnitAssignments.membershipId)).where(and(eq(eventMemberships.eventId, eventId), eq(eventMemberships.status, MembershipStatus.ACTIVE), eq(membershipUnitAssignments.unitId, audienceId))).limit(1);
    if (!assignment) throw new NotFoundException('Audience unit is not active in this event');
  }

  private async audienceMatches(eventId: string, audienceType: string, audienceId: string | null, user: AuthenticatedUser): Promise<boolean> {
    if (audienceType === 'EVENT') return true;
    if (audienceType === 'USER') return audienceId === user.id && await this.isActiveMember(eventId, user.id);
    const assignments = await this.db.select({ unitId: membershipUnitAssignments.unitId }).from(eventMemberships).innerJoin(membershipUnitAssignments, eq(membershipUnitAssignments.membershipId, eventMemberships.id)).where(and(eq(eventMemberships.eventId, eventId), eq(eventMemberships.userId, user.id), eq(eventMemberships.status, MembershipStatus.ACTIVE)));
    return assignments.some((assignment) => assignment.unitId === audienceId);
  }

  private async isActiveMember(eventId: string, userId: string): Promise<boolean> {
    const [membership] = await this.db.select({ id: eventMemberships.id }).from(eventMemberships).where(and(eq(eventMemberships.eventId, eventId), eq(eventMemberships.userId, userId), eq(eventMemberships.status, MembershipStatus.ACTIVE))).limit(1);
    return Boolean(membership);
  }

  private toRecoveryObjective(row: typeof recoveryObjectives.$inferSelect): RecoveryObjective {
    return { id: row.id, eventId: row.eventId, disruptionId: row.disruptionId, audienceType: row.audienceType as RecoveryObjective['audienceType'], audienceId: row.audienceId, title: row.title, instructions: row.instructions, status: row.status as RecoveryObjective['status'], revision: row.revision, createdAt: row.createdAt.toISOString(), publishedAt: row.publishedAt?.toISOString() ?? null };
  }

  private toRecoveryReport(row: typeof recoveryReports.$inferSelect): RecoveryReport {
    return { id: row.id, objectiveId: row.objectiveId, body: row.body, createdAt: row.createdAt.toISOString() };
  }

  async assertTaskWriteAllowed(eventId: string, user: AuthenticatedUser, unitId?: string | null): Promise<void> {
    const excon = await this.authorizationService.authorize({ user, permission: Permissions.SCENARIO_OVERRIDE, context: { eventId } });
    if (excon) return;
    assertParticipantWriteAllowed(await this.getEffectiveDisruption(eventId, user));
  }

  async assertTaskReadAllowed(eventId: string, user: AuthenticatedUser, unitId?: string | null): Promise<void> {
    const excon = await this.authorizationService.authorize({ user, permission: Permissions.SCENARIO_OVERRIDE, context: { eventId } });
    if (excon) return;
    const active = await this.getEffectiveDisruption(eventId, user);
    if (active?.mode === 'UNAVAILABLE') {
      throw new ForbiddenException('Module is simulated as unavailable');
    }
  }

  private async getEffectiveDisruption(eventId: string, user: AuthenticatedUser) {
    const memberships = await this.db.select({ unitId: membershipUnitAssignments.unitId })
      .from(eventMemberships)
      .innerJoin(membershipUnitAssignments, eq(membershipUnitAssignments.membershipId, eventMemberships.id))
      .where(and(eq(eventMemberships.eventId, eventId), eq(eventMemberships.userId, user.id), eq(eventMemberships.status, MembershipStatus.ACTIVE)));
    const unitIds = new Set(memberships.map((membership) => membership.unitId));
    const rows = await this.db.select().from(exerciseDisruptions)
      .where(and(eq(exerciseDisruptions.eventId, eventId), eq(exerciseDisruptions.module, ENFORCED_DISRUPTION_MODULE)));
    const candidates = [
      resolveDisruption(rows, new Date(), user.id, null),
      ...Array.from(unitIds, (unitId: string) => resolveDisruption(rows, new Date(), user.id, unitId)),
    ].filter((row): row is NonNullable<typeof row> => Boolean(row));
    return candidates.sort((left, right) => {
      const restriction = { UNAVAILABLE: 3, READ_ONLY: 2, DEGRADED: 1 } as const;
      return restriction[right.mode as keyof typeof restriction] - restriction[left.mode as keyof typeof restriction]
        || right.startsAt.getTime() - left.startsAt.getTime()
        || left.id.localeCompare(right.id);
    })[0] ?? null;
  }

  private async validateTarget(eventId: string, targetType: CreateDisruptionRequest['targetType'], targetId: string | null | undefined): Promise<void> {
    if (targetType === 'EVENT') return;
    if (!targetId) throw new ForbiddenException('Target is required');
    if (targetType === 'USER') {
      const [membership] = await this.db.select({ id: eventMemberships.id }).from(eventMemberships).where(and(eq(eventMemberships.eventId, eventId), eq(eventMemberships.userId, targetId), eq(eventMemberships.status, MembershipStatus.ACTIVE))).limit(1);
      if (!membership) throw new NotFoundException('Target user is not a member of this event');
      return;
    }
    const [unit] = await this.db.select({ id: membershipUnitAssignments.unitId }).from(membershipUnitAssignments).innerJoin(eventMemberships, eq(eventMemberships.id, membershipUnitAssignments.membershipId)).where(and(eq(eventMemberships.eventId, eventId), eq(eventMemberships.status, MembershipStatus.ACTIVE), eq(membershipUnitAssignments.unitId, targetId))).limit(1);
    if (!unit) throw new NotFoundException('Target unit is not assigned in this event');
  }

  private async assertEventPermission(eventId: string, user: AuthenticatedUser, permission: typeof Permissions.SCENARIO_READ | typeof Permissions.SCENARIO_MANAGE | typeof Permissions.SCENARIO_OVERRIDE): Promise<void> {
    const [event] = await this.db.select({ id: events.id }).from(events).where(eq(events.id, eventId)).limit(1);
    if (!event) throw new NotFoundException(`Event '${eventId}' not found`);
    await this.authorizationService.assertAuthorized({ user, permission, context: { eventId } });
  }

  private async assertParticipantAccess(eventId: string, user: AuthenticatedUser): Promise<void> {
    const [event] = await this.db.select({ id: events.id }).from(events).where(eq(events.id, eventId)).limit(1);
    if (!event) throw new NotFoundException(`Event '${eventId}' not found`);
    const canReadTasks = await this.authorizationService.authorize({
      user,
      permission: Permissions.TASK_READ,
      context: { eventId },
    });
    const canOverride = await this.authorizationService.authorize({
      user,
      permission: Permissions.SCENARIO_OVERRIDE,
      context: { eventId },
    });
    if (!canReadTasks && !canOverride) {
      throw new ForbiddenException('Event participation does not authorize task disruption status');
    }
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

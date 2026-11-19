import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
} from '@cyris/db';
import { Permissions } from '@cyris/shared';
import type {
  CreateDisruptionRequest,
  DisruptionSnapshot,
  RestoreDisruptionRequest,
} from '@cyris/contracts';
import { assertRevision, assertParticipantWriteAllowed, isActiveDisruption, resolveDisruption } from './disruption-policy.js';

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
      .where(and(eq(eventMemberships.userId, user.id), eq(eventMemberships.status, MembershipStatus.ACTIVE)));
    const unitIds = new Set(memberships.map((membership) => membership.unitId));
    const rows = await this.db.select().from(exerciseDisruptions).where(eq(exerciseDisruptions.eventId, eventId)).orderBy(desc(exerciseDisruptions.startsAt));
    return rows
      .filter((row) => isActiveDisruption(row) && (!module || row.module === module))
      .filter((row) => row.targetType === 'EVENT' || (row.targetType === 'USER' && row.targetId === user.id) || (row.targetType === 'UNIT' && row.targetId && unitIds.has(row.targetId)))
      .map((row) => this.toSnapshot(row));
  }

  async start(eventId: string, dto: CreateDisruptionRequest, user: AuthenticatedUser): Promise<DisruptionSnapshot> {
    await this.assertEventPermission(eventId, user, Permissions.SCENARIO_MANAGE);
    await this.validateTarget(eventId, dto.targetType, dto.targetId);
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : new Date();
    const created = await this.db.transaction(async (tx) => {
      const [row] = await tx.insert(exerciseDisruptions).values({
        eventId,
        targetType: dto.targetType,
        targetId: dto.targetId ?? null,
        module: dto.module,
        mode: dto.mode,
        startsAt,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
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

  async assertTaskWriteAllowed(eventId: string, user: AuthenticatedUser, unitId?: string | null): Promise<void> {
    const excon = await this.authorizationService.authorize({ user, permission: Permissions.SCENARIO_OVERRIDE, context: { eventId } });
    if (excon) return;
    const rows = await this.db.select().from(exerciseDisruptions).where(and(eq(exerciseDisruptions.eventId, eventId), eq(exerciseDisruptions.module, 'tasks')));
    assertParticipantWriteAllowed(resolveDisruption(rows, new Date(), user.id, unitId));
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

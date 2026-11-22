import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gt, isNull, lte, or } from 'drizzle-orm';
import { eventMemberships, membershipUnitAssignments, organizationalUnits, operationalHolds, users, MembershipStatus, type OperationalHoldRow } from '@cyris/db';
import { Permissions } from '@cyris/shared';
import { type CreateOperationalHold, type RestoreOperationalHold, type OperationalHold, type CurrentOperationalHolds, HoldModuleSchema } from '@cyris/contracts';
import type { ServiceModule } from '@cyris/contracts';
import { DatabaseService } from '../database/database.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { holdIsActive, holdTargetsUser, shouldBlockHold } from './hold-policy.js';

@Injectable()
export class OperationalHoldsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
  ) {}
  private get db() { return this.database.client; }

  private async assertOperator(user: AuthenticatedUser) {
    await this.authz.assertAuthorized({ user, permission: Permissions.PLATFORM_MANAGE });
  }
  private snapshot(row: OperationalHoldRow): OperationalHold {
    return {
      id: row.id, eventId: row.eventId, targetType: row.targetType as OperationalHold['targetType'],
      targetId: row.targetId, module: HoldModuleSchema.parse(row.module),
      reason: row.reason, startsAt: row.startsAt.toISOString(), expiresAt: row.expiresAt?.toISOString() ?? null,
      revision: row.revision, restoredAt: row.restoredAt?.toISOString() ?? null, active: holdIsActive(row),
    };
  }
  private async validateTarget(eventId: string, type: CreateOperationalHold['targetType'], id: string | null | undefined) {
    if (type === 'EVENT') return;
    if (!id) throw new BadRequestException('Missing person/team target');
    if (type === 'UNIT') {
      const [unit] = await this.db.select({ id: organizationalUnits.id }).from(organizationalUnits)
        .where(and(eq(organizationalUnits.id, id), eq(organizationalUnits.eventId, eventId), isNull(organizationalUnits.archivedAt))).limit(1);
      if (!unit) throw new BadRequestException('Team must belong to this exercise and be active');
      return;
    }
    const [member] = await this.db.select({ id: eventMemberships.id }).from(eventMemberships)
      .innerJoin(users, eq(users.id, eventMemberships.userId))
      .where(and(eq(eventMemberships.eventId, eventId), eq(eventMemberships.userId, id),
        eq(eventMemberships.status, MembershipStatus.ACTIVE), eq(users.status, 'ACTIVE'))).limit(1);
    if (!member) throw new BadRequestException('Person must be an active member of this exercise');
  }

  async list(eventId: string, user: AuthenticatedUser): Promise<OperationalHold[]> {
    await this.assertOperator(user);
    const rows = await this.db.select().from(operationalHolds)
      .where(eq(operationalHolds.eventId, eventId)).orderBy(desc(operationalHolds.createdAt));
    return rows.map(row => this.snapshot(row));
  }

  async create(eventId: string, input: CreateOperationalHold, user: AuthenticatedUser): Promise<OperationalHold> {
    await this.assertOperator(user);
    await this.validateTarget(eventId, input.targetType, input.targetId);
    const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (Number.isNaN(startsAt.getTime()) || (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt <= startsAt)))
      throw new BadRequestException('Invalid hold window');
    const row = await this.db.transaction(async tx => {
      const [created] = await tx.insert(operationalHolds).values({
        eventId, targetType: input.targetType, targetId: input.targetId ?? null, module: input.module,
        reason: input.reason, startsAt, expiresAt, createdByUserId: user.id,
      }).returning();
      await this.audit.record({
        action: 'exercise.operational_hold.created', category: 'scenario', eventId,
        actorUserId: user.id, resourceType: 'exercise_operation_hold', resourceId: created!.id,
        metadata: { targetType: input.targetType, targetId: input.targetId ?? null, module: input.module, startsAt: startsAt.toISOString(), expiresAt: expiresAt?.toISOString(), reason: input.reason },
        txClient: tx,
      });
      return created!;
    });
    return this.snapshot(row);
  }

  async restore(eventId: string, id: string, input: RestoreOperationalHold, user: AuthenticatedUser): Promise<OperationalHold> {
    await this.assertOperator(user);
    return this.db.transaction(async tx => {
      const [existing] = await tx.select().from(operationalHolds)
        .where(and(eq(operationalHolds.eventId, eventId), eq(operationalHolds.id, id))).limit(1);
      if (!existing) throw new NotFoundException('Operational hold not found in this exercise');
      if (existing.revision !== input.expectedRevision || existing.restoredAt) throw new ConflictException('Hold changed; refresh the list');
      const [updated] = await tx.update(operationalHolds).set({
        restoredAt: new Date(), restoredByUserId: user.id, revision: existing.revision + 1,
      }).where(and(eq(operationalHolds.eventId, eventId), eq(operationalHolds.id, id),
        eq(operationalHolds.revision, input.expectedRevision), isNull(operationalHolds.restoredAt))).returning();
      if (!updated) throw new ConflictException('Hold already changed');
      await this.audit.record({
        action: 'exercise.operational_hold.restored', category: 'scenario', eventId,
        actorUserId: user.id, resourceType: 'exercise_operation_hold', resourceId: id,
        metadata: { reason: input.reason, previousRevision: existing.revision }, txClient: tx,
      });
      return this.snapshot(updated);
    });
  }

  private async scopedRows(eventId: string, user: AuthenticatedUser) {
    const [membership] = await this.db.select({ id: eventMemberships.id }).from(eventMemberships)
      .where(and(eq(eventMemberships.eventId, eventId), eq(eventMemberships.userId, user.id),
        eq(eventMemberships.status, MembershipStatus.ACTIVE))).limit(1);
    const unitIds = membership
      ? (await this.db.select({ unitId: membershipUnitAssignments.unitId }).from(membershipUnitAssignments)
          .innerJoin(organizationalUnits, eq(organizationalUnits.id, membershipUnitAssignments.unitId))
          .where(and(eq(membershipUnitAssignments.membershipId, membership.id),
            eq(organizationalUnits.eventId, eventId), isNull(organizationalUnits.archivedAt)))).map(row => row.unitId)
      : [];
    const now = new Date();
    const rows = await this.db.select().from(operationalHolds).where(and(
      eq(operationalHolds.eventId, eventId), isNull(operationalHolds.restoredAt),
      lte(operationalHolds.startsAt, now),
      or(isNull(operationalHolds.expiresAt), gt(operationalHolds.expiresAt, now)),
    ));
    return { membership: Boolean(membership), rows: rows.filter(row => holdTargetsUser(row, user.id, new Set(unitIds))), units: new Set(unitIds), now };
  }

  async current(eventId: string, user: AuthenticatedUser): Promise<CurrentOperationalHolds> {
    const scoped = await this.scopedRows(eventId, user);
    const admin = await this.authz.authorize({ user, permission: Permissions.PLATFORM_MANAGE });
    if (!admin && !scoped.membership) throw new ForbiddenException('Not an active exercise member');
    return { eventId, generatedAt: scoped.now.toISOString(),
      holds: scoped.rows.map(row => ({ id: row.id, module: HoldModuleSchema.parse(row.module), reason: row.reason, expiresAt: row.expiresAt?.toISOString() ?? null })),
    };
  }

  async assertWriteAllowed(eventId: string, user: AuthenticatedUser, modules: readonly ServiceModule[]): Promise<void> {
    // Administrators retain emergency unlock, recovery and corrective permissions.
    if (await this.authz.authorize({ user, permission: Permissions.PLATFORM_MANAGE })) return;
    const { rows, units, now } = await this.scopedRows(eventId, user);
    if (shouldBlockHold(rows, user.id, units, modules, now)) {
      throw new ForbiddenException({
        code: 'EXERCISE_WRITE_PAUSED',
        message: 'Exercise actions are temporarily paused by an administrator. No changes were saved.',
      });
    }
  }
}

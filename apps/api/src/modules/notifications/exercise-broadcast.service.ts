import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { AuditService } from '../audit/audit.service.js';
import { events, eventMemberships, membershipUnitAssignments, notifications, organizationalUnits, userPreferences, users } from '@cyris/db';
import { generateId, Permissions } from '@cyris/shared';
import type { AuthenticatedUser } from '../auth/session.service.js';
import type { ExerciseBroadcastAudienceQuery, ExerciseBroadcastHistory, ExerciseBroadcastReceipt, ExerciseBroadcastRequest } from '@cyris/contracts';

const sourcePrefix = 'exercise.broadcast:';
const maximumAudience = 5000;
type Tx = Parameters<Parameters<DatabaseService['client']['transaction']>[0]>[0];

@Injectable()
export class ExerciseBroadcastService {
  constructor(
    private readonly database: DatabaseService,
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
  ) {}

  private async assertOrganizer(eventId: string, actor: AuthenticatedUser) {
    await this.authz.assertAuthorized({ user: actor, permission: Permissions.SCENARIO_MANAGE, context: { eventId } });
  }

  private async assertAudience(tx: Tx | DatabaseService['client'], eventId: string, audience: 'ALL' | 'UNIT', unitId?: string) {
    const [event] = await tx.select({ status: events.status }).from(events).where(eq(events.id, eventId)).limit(1);
    if (!event) throw new NotFoundException('Exercise not found');
    if (event.status === 'CLOSED' || event.status === 'ARCHIVED') {
      throw new ConflictException('Broadcasts are disabled for closed or archived exercises');
    }
    if (audience === 'UNIT') {
      if (!unitId) throw new BadRequestException('Select a receiving team');
      const [unit] = await tx.select({ id: organizationalUnits.id }).from(organizationalUnits).where(and(
        eq(organizationalUnits.id, unitId), eq(organizationalUnits.eventId, eventId),
        isNull(organizationalUnits.archivedAt)
      )).limit(1);
      if (!unit) throw new BadRequestException('Receiving team does not belong to this active exercise');
    } else if (unitId) {
      throw new BadRequestException('Do not specify a team when notifying the entire exercise');
    }
  }

  private async recipients(tx: Tx | DatabaseService['client'], eventId: string,
    audience: 'ALL' | 'UNIT', unitId: string | undefined, kind: ExerciseBroadcastRequest['kind']) {
    // Distinct users, not distinct unit memberships. Disabled accounts, inactive
    // memberships and archived units cannot receive participant broadcasts.
    const rules = [
      eq(eventMemberships.eventId, eventId),
      eq(eventMemberships.status, 'ACTIVE'),
      eq(users.status, 'ACTIVE'),
    ];
    if (audience === 'UNIT') {
      rules.push(eq(membershipUnitAssignments.unitId, unitId!));
    }
    // Non-urgent operational notices respect the recipient's in-app opt-out.
    // Urgent announcements are explicitly mandatory to this exercise audience.
    if (kind !== 'URGENT') {
      rules.push(sql`coalesce(${userPreferences.notificationChannels}->>'inApp', 'true') <> 'false'`);
    }
    const rows = await tx.selectDistinct({ userId: users.id })
      .from(eventMemberships)
      .innerJoin(users, eq(users.id, eventMemberships.userId))
      .leftJoin(userPreferences, eq(userPreferences.userId, users.id))
      .leftJoin(membershipUnitAssignments, eq(membershipUnitAssignments.membershipId, eventMemberships.id))
      .where(and(...rules));
    if (rows.length > maximumAudience) {
      throw new ConflictException('Audience exceeds 5,000 participants. Select a smaller team or split the broadcast.');
    }
    return rows;
  }

  async preview(eventId: string, actor: AuthenticatedUser, query: ExerciseBroadcastAudienceQuery) {
    await this.assertOrganizer(eventId, actor);
    await this.assertAudience(this.database.client, eventId, query.audience, query.unitId);
    const recipients = await this.recipients(this.database.client, eventId, query.audience, query.unitId, query.kind);
    return { eligible: recipients.length, kind: query.kind, audience: query.audience, unitId: query.unitId ?? null };
  }

  async send(eventId: string, actor: AuthenticatedUser, input: ExerciseBroadcastRequest, requestId?: string): Promise<ExerciseBroadcastReceipt> {
    await this.assertOrganizer(eventId, actor);
    return this.database.client.transaction(async (tx) => {
      // Serialize same-event sends, idempotency keys and audience snapshots.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${'exercise-broadcast:' + eventId}, 0))`);
      await this.assertAudience(tx, eventId, input.audience, input.unitId);
      const source = sourcePrefix + input.nonce;
      const [previous] = await tx.select({ params: notifications.templateParams }).from(notifications)
        .where(and(eq(notifications.eventId, eventId), eq(notifications.sourceEventId, source))).limit(1);
      if (previous) {
        const prior = previous.params as Record<string, unknown>;
        if (prior.title !== input.title || prior.description !== input.message ||
          prior.kind !== input.kind || prior.audience !== input.audience || (prior.unitId ?? null) !== (input.unitId ?? null)) {
          throw new ConflictException('The broadcast idempotency key was already used with different contents');
        }
        const [c] = await tx.select({ delivered: count() }).from(notifications).where(and(
          eq(notifications.eventId, eventId), eq(notifications.sourceEventId, source)));
        return { nonce: input.nonce, delivered: c?.delivered ?? 0, repeated: true };
      }
      const recipients = await this.recipients(tx, eventId, input.audience, input.unitId, input.kind);
      if (recipients.length === 0) throw new BadRequestException('No eligible participants for the selected audience');
      const severity = input.kind === 'URGENT' ? 'URGENT' : input.kind === 'INSTRUCTION' ? 'ACTION' : 'INFO';
      const timestamp = new Date();
      const params = {
        title: input.title, description: input.message, kind: input.kind,
        audience: input.audience, unitId: input.unitId ?? null, senderId: actor.id,
      };
      // Transactional in-app delivery without unbounded per-recipient SMTP
      // requests. Keep urgent/exercise content off external email by design.
      for (let i = 0; i < recipients.length; i += 250) {
        await tx.insert(notifications).values(recipients.slice(i, i + 250).map(({userId}) => ({
          id: generateId(), userId, eventId,
          type: 'EXERCISE_' + input.kind, severity,
          templateKey: 'exercise.broadcast', templateParams: params,
          actionUrl: '/events/' + eventId + '/overview',
          sourceEventId: source, createdAt: timestamp,
        }))).onConflictDoNothing();
      }
      await this.audit.record({
        action: 'exercise.broadcast.sent', category: 'scenario', actorUserId: actor.id,
        eventId, requestId, resourceType: 'exercise_broadcast', metadata: {
          nonce: input.nonce, kind: input.kind, audience: input.audience,
          unitId: input.unitId ?? null, delivered: recipients.length,
        }, txClient: tx,
      });
      return { nonce: input.nonce, delivered: recipients.length, repeated: false };
    });
  }

  async history(eventId: string, actor: AuthenticatedUser): Promise<ExerciseBroadcastHistory> {
    await this.assertOrganizer(eventId, actor);
    // Aggregate recipient receipts server-side; never expose other users' notices
    // or recipient profiles in the manager's dashboard.
    const rows = await this.database.client.select({
      source: notifications.sourceEventId,
      kind: sql<string>`max(${notifications.templateParams}->>'kind')`,
      title: sql<string>`max(${notifications.templateParams}->>'title')`,
      audience: sql<string>`max(${notifications.templateParams}->>'audience')`,
      unitId: sql<string | null>`nullif(max(${notifications.templateParams}->>'unitId'), '')`,
      delivered: count(notifications.id),
      read: sql<number>`count(${notifications.readAt})::int`,
      sentAt: sql<Date>`max(${notifications.createdAt})`,
    }).from(notifications)
      .where(and(eq(notifications.eventId, eventId), eq(notifications.templateKey, 'exercise.broadcast')))
      .groupBy(notifications.sourceEventId)
      .orderBy(desc(sql`max(${notifications.createdAt})`))
      .limit(30);
    return rows.map(row => ({
      nonce: (row.source ?? '').slice(sourcePrefix.length),
      kind: row.kind as ExerciseBroadcastHistory[number]['kind'],
      title: row.title,
      audience: row.audience as 'ALL' | 'UNIT',
      unitId: row.unitId ?? null,
      delivered: row.delivered,
      read: row.read,
      sentAt: row.sentAt.toISOString(),
    }));
  }
}

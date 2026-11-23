import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, notExists, or, sql } from 'drizzle-orm';
import {
  eventMemberships, events, integrations, membershipUnitAssignments, organizationalUnits, userIdentities, users,
} from '@cyris/db';
import { LdapTeamAssignmentSchema, type LdapConfig, type LdapTeamAccount, type LdapTeamAssignment } from '@cyris/contracts';
import { AuditService } from '../audit/audit.service.js';
import { platformAdminGrant } from './ldap-account-lifecycle.service.js';
import { readTeamOverrides, reconcileLdapMemberships, validateManualTeam } from '../auth/providers/ldap-provisioning.js';
import { DatabaseService } from '../database/database.service.js';

const pageSize = 50;
const accountProvider = and(eq(integrations.category, 'LDAP'), sql`${integrations.id}::text = ${userIdentities.metadata}->>'providerId'`);

@Injectable()
export class LdapTeamsService {
  constructor(private readonly database: DatabaseService, private readonly audit: AuditService) {}

  async listAccounts(eventId?: string, q?: string, onlyUnassigned = false, status?: 'ACTIVE' | 'DISABLED', page = 1): Promise<{ accounts: LdapTeamAccount[]; hasMore: boolean }> {
    const db = this.database.client;
    if (onlyUnassigned && !eventId) throw new BadRequestException('Choose an exercise to filter unassigned members');
    if (eventId) {
      const [event] = await db.select({ id: events.id }).from(events).where(eq(events.id, eventId));
      if (!event) throw new NotFoundException('Cvičení nebylo nalezeno.');
    }
    const activeTeam = eventId ? db.select({ id: membershipUnitAssignments.id }).from(membershipUnitAssignments)
      .innerJoin(organizationalUnits, eq(organizationalUnits.id, membershipUnitAssignments.unitId))
      .where(and(eq(membershipUnitAssignments.membershipId, eventMemberships.id),
        eq(organizationalUnits.eventId, eventId), isNull(organizationalUnits.archivedAt))) : null;
    const rows = await db.select({
      identityId: userIdentities.id, userId: users.id, email: users.email, displayName: users.displayName,
      providerName: integrations.name, providerEnabled: integrations.enabled,
      lastLoginAt: users.lastLoginAt, userStatus: users.status, platformAdmin: platformAdminGrant,
      otherLoginMethods: sql<boolean>`exists (
        select 1 from user_identities i where i.user_id = ${users.id} and i.id <> ${userIdentities.id}
      )`,
      membershipId: eventMemberships.id, status: eventMemberships.status,
      choice: eventId ? sql<unknown>`${userIdentities.metadata} -> 'ldapTeamOverrides' -> ${eventId}::text` : sql<unknown>`null`,
    }).from(userIdentities).innerJoin(users, eq(users.id, userIdentities.userId))
      .innerJoin(integrations, accountProvider)
      .leftJoin(eventMemberships, eventId ? and(eq(eventMemberships.userId, users.id), eq(eventMemberships.eventId, eventId)) : sql`false`)
      .where(and(eq(userIdentities.providerType, 'LDAP'),
        status ? eq(users.status, status) : undefined,
        q ? or(sql`strpos(lower(${users.displayName}), lower(${q})) > 0`, sql`strpos(lower(${users.email}), lower(${q})) > 0`) : undefined,
        onlyUnassigned && activeTeam ? or(isNull(eventMemberships.id), eq(eventMemberships.status, 'INACTIVE'), notExists(activeTeam)) : undefined,
      )).orderBy(asc(users.displayName), asc(users.email), asc(userIdentities.id))
      .limit(pageSize + 1).offset((page - 1) * pageSize);
    const accountRows = rows.slice(0, pageSize);
    const membershipIds = accountRows.flatMap(row => row.membershipId ? [row.membershipId] : []);
    const units = membershipIds.length ? await db.select({
      membershipId: membershipUnitAssignments.membershipId, id: organizationalUnits.id, name: organizationalUnits.name,
    }).from(membershipUnitAssignments).innerJoin(organizationalUnits, eq(organizationalUnits.id, membershipUnitAssignments.unitId))
      .where(and(inArray(membershipUnitAssignments.membershipId, membershipIds), eventId ? eq(organizationalUnits.eventId, eventId) : sql`false`, isNull(organizationalUnits.archivedAt)))
      .orderBy(asc(organizationalUnits.name)) : [];
    return {
      hasMore: rows.length > pageSize,
      accounts: accountRows.map(row => {
        const saved = LdapTeamAssignmentSchema.safeParse(row.choice);
        return {
          identityId: row.identityId, userId: row.userId, displayName: row.displayName, email: row.email, providerName: row.providerName,
          providerEnabled: row.providerEnabled, lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
          userStatus: row.userStatus === 'DISABLED' ? 'DISABLED' : 'ACTIVE',
          platformAdmin: row.platformAdmin, otherLoginMethods: row.otherLoginMethods,
          membershipStatus: row.status === 'ACTIVE' || row.status === 'INACTIVE' ? row.status : null,
          units: units.filter(unit => unit.membershipId === row.membershipId).map(({ id, name }) => ({ id, name })),
          assignment: saved.success ? saved.data : { mode: 'DIRECTORY' },
        };
      }),
    };
  }

  async assign(identityId: string, eventId: string, assignment: LdapTeamAssignment, actorUserId: string) {
    return this.database.client.transaction(async tx => {
      const [event] = await tx.select({ status: events.status }).from(events).where(eq(events.id, eventId)).for('share');
      if (!event) throw new NotFoundException('Cvičení nebylo nalezeno.');
      if (event.status === 'CLOSED' || event.status === 'ARCHIVED') throw new BadRequestException('Uzavřené cvičení již nepřijímá účastníky.');
      const [user] = await tx.select({ id: users.id }).from(users).innerJoin(userIdentities, eq(userIdentities.userId, users.id))
        .where(and(eq(userIdentities.id, identityId), eq(userIdentities.providerType, 'LDAP'), eq(users.status, 'ACTIVE')))
        .for('update', { of: users });
      if (!user) throw new NotFoundException('Aktivní LDAP účet nebyl nalezen.');
      const [identity] = await tx.select({ metadata: userIdentities.metadata, providerId: integrations.id, config: integrations.config })
        .from(userIdentities).innerJoin(integrations, accountProvider).where(eq(userIdentities.id, identityId))
        .for('update', { of: userIdentities });
      if (!identity) throw new NotFoundException('Adresář tohoto účtu již není nakonfigurován.');
      const metadata = (identity.metadata ?? {}) as Record<string, unknown>;
      const overrides = readTeamOverrides(metadata);
      if (assignment.mode === 'MANUAL') {
        await validateManualTeam(tx, eventId, assignment);
        const [membership] = await tx.select().from(eventMemberships)
          .where(and(eq(eventMemberships.eventId, eventId), eq(eventMemberships.userId, user.id))).for('update');
        if (membership?.status === 'INACTIVE' && membership.ldapDeactivatedBy !== identityId) {
          throw new ConflictException('Členství ve cvičení je pozastavené. Nejprve jej znovu aktivujte.');
        }
      }
      const previous: LdapTeamAssignment = overrides[eventId] ?? { mode: 'DIRECTORY' };
      if (assignment.mode === 'DIRECTORY') delete overrides[eventId];
      else overrides[eventId] = assignment;
      const groups = Array.isArray(metadata.groups) ? metadata.groups.filter((g): g is string => typeof g === 'string') : [];
      const config = identity.config as LdapConfig;
      await reconcileLdapMemberships(tx, identityId, user.id, identity.providerId, config.groupMappings ?? [], groups,
        { ...metadata, ldapTeamOverrides: overrides }, eventId);
      await this.audit.record({ action: 'identity.ldap.team-assignment.updated', category: 'membership', actorUserId, eventId,
        resourceType: 'ldap_identity', resourceId: identityId, metadata: { userId: user.id, providerId: identity.providerId },
        changes: { from: previous, to: assignment }, txClient: tx });
      return { ok: true as const };
    });
  }
}

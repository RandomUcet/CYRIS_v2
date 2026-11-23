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

  async listAccounts(eventId: string, q?: string, onlyUnassigned = false): Promise<{ accounts: LdapTeamAccount[]; hasMore: boolean }> {
    const db = this.database.client;
    const [event] = await db.select({ id: events.id }).from(events).where(eq(events.id, eventId));
    if (!event) throw new NotFoundException('Cvičení nebylo nalezeno.');
    const activeTeam = db.select({ id: membershipUnitAssignments.id }).from(membershipUnitAssignments)
      .innerJoin(organizationalUnits, eq(organizationalUnits.id, membershipUnitAssignments.unitId))
      .where(and(eq(membershipUnitAssignments.membershipId, eventMemberships.id),
        eq(organizationalUnits.eventId, eventId), isNull(organizationalUnits.archivedAt)));
    const rows = await db.select({
      identityId: userIdentities.id, userId: users.id, email: users.email, displayName: users.displayName,
      providerName: integrations.name, userStatus: users.status, platformAdmin: platformAdminGrant,
      otherLoginMethods: sql<boolean>`exists (
        select 1 from user_identities i where i.user_id = ${users.id} and i.id <> ${userIdentities.id}
      )`,
      membershipId: eventMemberships.id, status: eventMemberships.status,
      choice: sql<unknown>`${userIdentities.metadata} -> 'ldapTeamOverrides' -> ${eventId}::text`,
    }).from(userIdentities).innerJoin(users, eq(users.id, userIdentities.userId))
      .innerJoin(integrations, accountProvider)
      .leftJoin(eventMemberships, and(eq(eventMemberships.userId, users.id), eq(eventMemberships.eventId, eventId)))
      .where(and(eq(userIdentities.providerType, 'LDAP'),
        q ? or(sql`strpos(lower(${users.displayName}), lower(${q})) > 0`, sql`strpos(lower(${users.email}), lower(${q})) > 0`) : undefined,
        onlyUnassigned ? or(isNull(eventMemberships.id), eq(eventMemberships.status, 'INACTIVE'), notExists(activeTeam)) : undefined,
      )).orderBy(asc(users.displayName), asc(users.email), asc(userIdentities.id)).limit(pageSize + 1);
    const page = rows.slice(0, pageSize);
    const membershipIds = page.flatMap(row => row.membershipId ? [row.membershipId] : []);
    const units = membershipIds.length ? await db.select({
      membershipId: membershipUnitAssignments.membershipId, id: organizationalUnits.id, name: organizationalUnits.name,
    }).from(membershipUnitAssignments).innerJoin(organizationalUnits, eq(organizationalUnits.id, membershipUnitAssignments.unitId))
      .where(and(inArray(membershipUnitAssignments.membershipId, membershipIds), eq(organizationalUnits.eventId, eventId), isNull(organizationalUnits.archivedAt)))
      .orderBy(asc(organizationalUnits.name)) : [];
    return {
      hasMore: rows.length > pageSize,
      accounts: page.map(row => {
        const saved = LdapTeamAssignmentSchema.safeParse(row.choice);
        return {
          identityId: row.identityId, userId: row.userId, displayName: row.displayName, email: row.email, providerName: row.providerName,
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

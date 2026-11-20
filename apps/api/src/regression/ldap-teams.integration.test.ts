import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  auditEvents, closeDatabaseConnection, eventMemberships, events, getDbClient, integrations, membershipUnitAssignments,
  organizationalUnits, roleAssignments, rolePermissions, roles, userIdentities, users,
} from '@cyris/db';
import { generateId, Permissions } from '@cyris/shared';
import type { LdapConfig } from '@cyris/contracts';
import { AuditService } from '../modules/audit/audit.service.js';
import { LdapIdentityProvider } from '../modules/auth/providers/ldap-identity.provider.js';
import { resolveLdapMappings } from '../modules/auth/providers/ldap-provisioning.js';
import { AuthorizationService } from '../modules/authorization/authorization.service.js';
import { PermissionsGuard } from '../modules/authorization/guards/permissions.guard.js';
import { DatabaseService } from '../modules/database/database.service.js';
import { EventsService } from '../modules/events/events.service.js';
import { LdapTeamsController } from '../modules/integrations/ldap-teams.controller.js';
import { PlatformAdminsController } from '../modules/integrations/platform-admins.controller.js';
import { PlatformAdminsService } from '../modules/integrations/platform-admins.service.js';
import { LdapTeamsService } from '../modules/integrations/ldap-teams.service.js';
import { requireVerifiedIsolatedDatabase } from './isolated-postgres-harness.js';

const url = requireVerifiedIsolatedDatabase();
test('LDAP group and operator team selection through repeated logins', { skip: !url }, async () => {
  const db = getDbClient({ url: url!, max: 6 });
  const database = { client: db } as DatabaseService;
  const audit = new AuditService(database);
  const teams = new LdapTeamsService(database, audit);
  const authz = new AuthorizationService(database);
  const eventService = new EventsService(database, authz, audit, {} as never);
  const event = generateId(), other = generateId(), teamA = generateId(), teamB = generateId(), otherTeam = generateId();
  const role = generateId(), otherRole = generateId(), manualRole = generateId(), platformRole = generateId(), providerId = generateId();
  const admin = { id: generateId(), displayName: 'LDAP QA admin', email: generateId()+'@example.test', status: 'ACTIVE' };
  const userEmail = generateId() + '@example.test';
  const config: LdapConfig = {
    displayName: 'Directory', url: 'ldaps://directory.test', tls: true, bindDn: 'cn=svc', baseDn: 'dc=test', groupBaseDn: 'ou=groups,dc=test',
    groupMappings: [
      { ldapGroup: 'Blue', eventId: event, roleSlug: 'member', unitSlug: 'blue' },
      { ldapGroup: 'cn=Green,ou=teams,dc=test', eventId: event, roleSlug: 'member', unitSlug: 'green' },
      { ldapGroup: 'Second', eventId: other, roleSlug: 'member', unitSlug: 'second' },
      { ldapGroup: 'Old-admin-rule', roleSlug: platformRole }, // historical unsafe rule
    ],
  };
  let groups: string[] = [];
  let groupDns: string[] = [];
  class Directory extends LdapIdentityProvider {
    protected override async authenticateDirectory() {
      return { dn: 'cn=ldap-participant,dc=test', email: userEmail, displayName: 'Directory participant',
        groups: [...groups], groupDns: [...groupDns] };
    }
  }
  const provider = new Directory(database, { getSecret: async () => 'test-bind' } as never);
  const login = () => provider.authenticate({ providerId, username: 'participant', password: 'test' });
  try {
    await db.insert(events).values([{ id: event, slug: event, name: 'First' }, { id: other, slug: other, name: 'Second' }]);
    await db.insert(organizationalUnits).values([{ id: teamA, eventId: event, slug: 'blue', name: 'Blue' },
      { id: teamB, eventId: event, slug: 'green', name: 'Green' }, { id: otherTeam, eventId: other, slug: 'second', name: 'Second' }]);
    await db.insert(roles).values([{ id: role, eventId: event, slug: 'member', name: 'Member' },
      { id: otherRole, eventId: other, slug: 'member', name: 'Member' }, { id: manualRole, eventId: event, slug: manualRole, name: 'Independent' },
      { id: platformRole, slug: platformRole, name: 'Platform admin' }]);
    await db.insert(rolePermissions).values([{ roleId: platformRole, permissionKey: Permissions.PLATFORM_MANAGE, scope: 'PLATFORM' },
      { roleId: role, permissionKey: Permissions.EVENT_READ, scope: 'EVENT' }]);
    await db.insert(users).values(admin);
    await db.insert(roleAssignments).values({ roleId: platformRole, userId: admin.id });
    await db.insert(integrations).values({ id: providerId, name: 'Directory QA', category: 'LDAP', providerType: 'LDAP_ACTIVE_DIRECTORY', enabled: true, config });
    await assert.rejects(resolveLdapMappings(db, [{ ldapGroup: 'Admins', roleSlug: platformRole }]), BadRequestException);
    await assert.rejects(resolveLdapMappings(db, [{ ldapGroup: 'Blue', roleSlug: 'member' }]), BadRequestException);
    await assert.rejects(resolveLdapMappings(db, [{ ldapGroup: 'Bad', eventId: event, roleSlug: 'member', unitSlug: 'second' }]), BadRequestException);

    const [first, concurrent] = await Promise.all([login(), login()]);
    assert.ok(first && concurrent); assert.equal(first.identityId, concurrent.identityId);
    const id = first.identityId, participant = { id: first.userId, email: userEmail, displayName: 'Directory participant', status: 'ACTIVE' };
    const account = async (eventId = event) => (await teams.listAccounts(eventId, userEmail)).accounts[0]!;
    const admins = new PlatformAdminsService(database, audit);
    const guardAdmin = new PermissionsGuard(new Reflector(), authz, audit);
    for (const handler of ['list', 'set'] as const) {
      const context = (user: typeof admin) => ({
        getHandler: () => PlatformAdminsController.prototype[handler], getClass: () => PlatformAdminsController,
        switchToHttp: () => ({ getRequest: () => ({ user, headers: {}, params: {} }) }),
      } as unknown as ExecutionContext);
      await assert.rejects(guardAdmin.canActivate(context(participant)), ForbiddenException);
      assert.ok(await guardAdmin.canActivate(context(admin)));
    }
    const [existingRole] = await db.select().from(roles).where(and(isNull(roles.eventId), eq(roles.slug, 'platform-admin')));
    if (!existingRole) {
      const [canonical] = await db.insert(roles).values({ slug: 'platform-admin', name: 'Platform Administrator' }).returning();
      await db.insert(rolePermissions).values({ roleId: canonical!.id, permissionKey: Permissions.PLATFORM_MANAGE, scope: 'PLATFORM' });
    }
    assert.equal((await admins.list(userEmail)).accounts[0]?.id, first.userId);
    await assert.rejects(admins.set(first.userId, true, first.userId), ForbiddenException);
    const alternateId = generateId();
    await db.insert(userIdentities).values({ id: alternateId, userId: first.userId, providerType: 'OIDC', providerSubject: alternateId });
    await assert.rejects(admins.set(first.userId, true, admin.id), ConflictException);
    await db.delete(userIdentities).where(eq(userIdentities.id, alternateId));
    await Promise.all([admins.set(first.userId, true, admin.id), admins.set(first.userId, true, admin.id)]);
    assert.ok(await login());
    assert.ok(await authz.authorize({ user: participant, permission: Permissions.PLATFORM_MANAGE }));
    assert.ok((await admins.list('')).accounts.some(item => item.id === first.userId));
    await assert.rejects(admins.set(first.userId, false, first.userId), ConflictException);
    await assert.rejects(admins.set(admin.id, false, first.userId), NotFoundException);
    await admins.set(first.userId, false, admin.id);
    await admins.set(first.userId, false, admin.id);
    await assert.rejects(admins.set(first.userId, true, first.userId), ForbiddenException);
    assert.equal(await authz.authorize({ user: participant, permission: Permissions.PLATFORM_MANAGE }), false);
    const changes = await db.select({ action: auditEvents.action }).from(auditEvents)
      .where(and(eq(auditEvents.actorUserId, admin.id), eq(auditEvents.resourceId, first.userId)));
    assert.deepEqual(changes.map(row => row.action).sort(), ['platform.admin.granted', 'platform.admin.revoked']);
    const ids = async (eventId = event) => (await account(eventId)).units.map(unit => unit.id).sort();
    assert.equal((await account()).membershipStatus, null);
    assert.equal((await teams.listAccounts(event, userEmail, true)).accounts.length, 1);
    assert.deepEqual(await eventService.listEvents(participant), []);
    groups = ['BLUE', 'Green', 'cn=Green,ou=teams,dc=test', 'Second', 'Old-admin-rule'];
    groupDns = ['cn=Green,ou=other,dc=test'];
    assert.ok(await login()); assert.deepEqual(await ids(), [teamA]);
    groupDns = ['CN=Green,OU=Teams,DC=test'];
    assert.ok(await login());
    assert.deepEqual(await ids(), [teamA, teamB].sort());
    assert.deepEqual(await ids(other), [otherTeam]);
    assert.equal((await teams.listAccounts(event, userEmail, true)).accounts.length, 0);
    assert.equal(await authz.authorize({ user: participant, permission: Permissions.PLATFORM_MANAGE }), false);

    const [membership] = await db.select().from(eventMemberships).where(and(eq(eventMemberships.eventId, event), eq(eventMemberships.userId, first.userId)));
    await assert.rejects(eventService.assignMembershipToUnit(other, otherTeam, membership.id), NotFoundException);
    await assert.rejects(teams.assign(id, event, { mode: 'MANUAL', unitId: otherTeam, roleId: role }, admin.id), BadRequestException);
    await assert.rejects(teams.assign(id, event, { mode: 'MANUAL', unitId: teamB, roleId: platformRole }, admin.id), BadRequestException);
    await teams.assign(id, event, { mode: 'MANUAL', roleId: role, unitId: teamB }, admin.id);
    assert.deepEqual(await ids(), [teamB]); assert.deepEqual(await ids(other), [otherTeam]);
    groups = ['Blue', 'Second']; groupDns = [];
    await login(); assert.deepEqual(await ids(), [teamB]);
    assert.deepEqual((await account()).assignment, { mode: 'MANUAL', roleId: role, unitId: teamB });
    await teams.assign(id, event, { mode: 'UNASSIGNED' }, admin.id);
    assert.equal((await account()).membershipStatus, 'INACTIVE');
    assert.deepEqual(await ids(), []);
    await login(); assert.equal((await account()).membershipStatus, 'INACTIVE');
    await teams.assign(id, event, { mode: 'DIRECTORY' }, admin.id);
    assert.equal((await account()).membershipStatus, 'ACTIVE'); assert.deepEqual(await ids(), [teamA]);

    // Independently assigned grants survive a change of source or group departure.
    await db.insert(roleAssignments).values({ membershipId: membership.id, roleId: manualRole });
    await db.insert(membershipUnitAssignments).values({ membershipId: membership.id, unitId: teamB });
    groups = [];
    assert.ok(await login()); assert.deepEqual(await ids(), [teamB]); assert.equal((await account()).membershipStatus, 'ACTIVE');
    assert.equal((await account(other)).membershipStatus, 'INACTIVE');
    groups = ['Second']; await login(); assert.deepEqual(await ids(other), [otherTeam]);
    assert.equal((await db.select().from(roleAssignments).where(and(eq(roleAssignments.membershipId, membership.id), eq(roleAssignments.roleId, manualRole)))).length, 1);
    await eventService.updateMembership(event, membership.id, { status: 'INACTIVE' }, admin.id);
    groups = ['Blue']; await login(); assert.equal((await account()).membershipStatus, 'INACTIVE');
    await assert.rejects(teams.assign(id, event, { mode: 'MANUAL', unitId: teamA, roleId: role }, admin.id), ConflictException);
    assert.ok((await db.select().from(auditEvents).where(and(eq(auditEvents.eventId, event), eq(auditEvents.action, 'identity.ldap.team-assignment.updated')))).length >= 3);

    const guard = new PermissionsGuard(new Reflector(), authz, audit);
    const context = (user: typeof admin, handler: 'list'|'assign') => ({
      getHandler: () => LdapTeamsController.prototype[handler], getClass: () => LdapTeamsController,
      switchToHttp: () => ({ getRequest: () => ({ user, headers: {}, params: { eventId: event } }) }),
    } as unknown as ExecutionContext);
    for (const handler of ['list', 'assign'] as const) {
      assert.ok(await guard.canActivate(context(admin, handler)));
      await assert.rejects(guard.canActivate(context(participant, handler)), ForbiddenException);
    }
  } finally {
    // The test database is disposable. Keep the immutable audit's referenced event and actors.
    await db.delete(integrations).where(eq(integrations.id, providerId));
    await closeDatabaseConnection();
  }
});


test('legacy LDAP migration removes only the proven automatic platform grant', { skip: !url }, async () => {
  const db = getDbClient({ url: url!, max: 1 });
  const script = await readFile(new URL('../../../../packages/db/migrations/0023_ldap_event_roles_only.sql', import.meta.url), 'utf8');
  const cleanup = script.split('--> statement-breakpoint')[1]!;
  const userId = generateId(), roleId = generateId(), identityId = generateId(), owned = generateId(), independent = generateId();
  const rollback = new Error('rollback migration fixture');
  try {
    await assert.rejects(db.transaction(async tx => {
      await tx.insert(users).values({ id: userId, email: userId+'@test.example', displayName: 'Legacy directory user' });
      await tx.insert(roles).values({ id: roleId, name: 'Existing platform role', slug: roleId });
      await tx.insert(userIdentities).values({ id: identityId, userId, providerType: 'LDAP', providerSubject: identityId,
        metadata: { ldapGrants: { version: 1, roles: [{ id: owned, roleId, membershipId: null, unitId: null }] } } });
      await tx.insert(roleAssignments).values([{ id: owned, roleId, userId }, { id: independent, roleId, userId }]);
      await tx.execute(sql.raw(cleanup));
      const grants = await tx.select({ id: roleAssignments.id }).from(roleAssignments).where(eq(roleAssignments.userId, userId));
      assert.deepEqual(grants, [{ id: independent }]);
      throw rollback;
    }), error => error === rollback);
  } finally { await closeDatabaseConnection(); }
});

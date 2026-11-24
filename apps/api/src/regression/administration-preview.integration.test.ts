import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { and, eq } from 'drizzle-orm';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  getDbClient, closeDatabaseConnection, users, events, eventMemberships, organizationalUnits,
  membershipUnitAssignments, roles, roleAssignments, rolePermissions, auditEvents, userPreferences, scenarioClocks,
} from '@cyris/db';
import { generateId, Permissions } from '@cyris/shared';
import { MembershipResponseSchema, AssignRoleRequestSchema } from '@cyris/contracts';
import { DatabaseService } from '../modules/database/database.service.js';
import { AuthorizationService } from '../modules/authorization/authorization.service.js';
import { PermissionsGuard } from '../modules/authorization/guards/permissions.guard.js';
import { AuditService } from '../modules/audit/audit.service.js';
import { EventsService } from '../modules/events/events.service.js';
import { EventTemplatesController } from '../modules/events/event-templates.controller.js';
import { SearchIndexerService } from '../modules/search/search-indexer.service.js';
import { WorkspaceResolverService } from '../modules/events/workspace-resolver.service.js';
import { SearchAuthzService } from '../modules/search/search-authz.service.js';
import { AuthService } from '../modules/auth/auth.service.js';
import { AuthGuard, type CyrisRequest } from '../modules/auth/guards/auth.guard.js';
import { SessionService, type AuthenticatedUser } from '../modules/auth/session.service.js';
import { ViewAsService } from '../modules/auth/view-as.service.js';
import { QueueService } from '../modules/queue/queue.service.js';
import { PreferencesService } from '../modules/preferences/preferences.service.js';
import { ScenarioClockService } from '../modules/scenario/scenario-clock.service.js';
import { requireVerifiedIsolatedDatabase } from './isolated-postgres-harness.js';

const url = requireVerifiedIsolatedDatabase();
test('event administration and read-only participant preview against isolated PostgreSQL', {
  skip: !url && 'Requires an explicitly isolated local PostgreSQL database',
}, async (t) => {
  const db = getDbClient({ url: url!, max: 5 });
  const database = { client: db } as DatabaseService;
  const authz = new AuthorizationService(database);
  const audit = new AuditService(database);
  const indexer = new SearchIndexerService(database, {} as never);
  const service = new EventsService(database, authz, audit, indexer);
  const profile = new AuthService(database, {} as never, {} as never, {} as never, {} as never, {} as never);
  const eventA = generateId(), eventB = generateId(), unitA = generateId(), unitB = generateId();
  const people = ['admin', 'organizer', 'participant', 'outsider'].map((name): AuthenticatedUser => ({
    id: generateId(), email: `${generateId()}@example.test`, displayName: name, status: 'ACTIVE',
  }));
  const [admin, organizer, participant, outsider] = people as [AuthenticatedUser, AuthenticatedUser, AuthenticatedUser, AuthenticatedUser];
  const organizerMembership = generateId(), participantMembership = generateId();
  const platformRole = generateId();
  const redis = new Map<string, string>();
  const queue = { client: {
    async get(key: string) { return redis.get(key) ?? null; },
    async set(key: string, value: string) { redis.set(key, value); return 'OK'; },
    async del(key: string) { return Number(redis.delete(key)); },
  } } as unknown as QueueService;
  const previews = new ViewAsService(database, queue, authz, audit);
  const sessionToken = 'isolated-administrator-session';
  const sessions = { async validateSession(token: string) { return token === sessionToken ? { user: admin } : null; } } as SessionService;
  const guard = new AuthGuard(sessions, previews);
  const request = (id: string, path: string, method = 'GET', params: Record<string, string> = {}, query: Record<string, string> = {}): CyrisRequest => ({
    id: generateId(), url: path, method, params, query, headers: { 'x-cyris-view-as': id }, cookies: { cyris_session: sessionToken },
  } as unknown as CyrisRequest);
  const activate = (req: CyrisRequest) => guard.canActivate({ switchToHttp: () => ({ getRequest: () => req }) } as ExecutionContext);

  try {
    await db.insert(users).values(people);
    await db.insert(events).values([{ id: eventA, name: 'Preview fixture A', slug: eventA }, { id: eventB, name: 'Preview fixture B', slug: eventB }]);
    await db.insert(organizationalUnits).values([{ id: unitA, eventId: eventA, name: 'Laboratory A', slug: 'lab-a' }, { id: unitB, eventId: eventA, name: 'Laboratory B', slug: 'lab-b' }]);
    await db.insert(eventMemberships).values([
      { id: organizerMembership, eventId: eventA, userId: organizer.id, status: 'ACTIVE' },
      { id: participantMembership, eventId: eventA, userId: participant.id, status: 'ACTIVE' },
      { eventId: eventB, userId: participant.id, status: 'ACTIVE' },
    ]);
    await db.insert(membershipUnitAssignments).values([{ membershipId: participantMembership, unitId: unitA }, { membershipId: participantMembership, unitId: unitB }]);
    await db.insert(roles).values({ id: platformRole, name: 'Fixture administrator', slug: `admin-${platformRole}` });
    await db.insert(rolePermissions).values({ roleId: platformRole, permissionKey: Permissions.PLATFORM_MANAGE, scope: 'PLATFORM' });
    await db.insert(roleAssignments).values({ roleId: platformRole, userId: admin.id });
    const manager = await service.createRole(eventA, { name: 'Organizer', slug: 'fixture-organizer', permissions: [{ permissionKey: Permissions.ROLE_MANAGE, scope: 'EVENT' }] }, admin.id);
    await service.assignRole(eventA, { roleId: manager!.id, membershipId: organizerMembership }, admin.id);

    await t.test('organizer can manage event roles but cannot grant or revoke platform authority', async () => {
      await assert.rejects(service.createRole(eventA, { name: 'Escalation', slug: 'bad-role', permissions: [{ permissionKey: Permissions.PLATFORM_MANAGE, scope: 'EVENT' }] }, organizer.id), BadRequestException);
      await assert.rejects(service.createRole(eventA, { name: 'Escalation', slug: 'bad-scope', permissions: [{ permissionKey: Permissions.CASE_READ, scope: 'PLATFORM' }] }, organizer.id), BadRequestException);
      await assert.rejects(service.createRole(eventA, { name: 'Unknown', slug: 'bad-key', permissions: [{ permissionKey: 'invented.permission', scope: 'EVENT' }] }, organizer.id), BadRequestException);
      await assert.rejects(service.assignRole(eventA, { roleId: platformRole, userId: participant.id }, organizer.id), NotFoundException);
      const [assignment] = await db.select().from(roleAssignments).where(eq(roleAssignments.roleId, platformRole));
      await assert.rejects(service.revokeRole(eventA, assignment!.id, organizer.id), NotFoundException);
      assert.equal(await authz.authorize({ user: admin, permission: Permissions.PLATFORM_MANAGE }), true);
      assert.equal(AssignRoleRequestSchema.safeParse({ roleId: manager!.id }).success, false);
      assert.equal(AssignRoleRequestSchema.safeParse({ roleId: manager!.id, userId: participant.id, membershipId: participantMembership }).success, false);
    });

    let participantRole = '';
    await t.test('role creation is serialized; assignment is idempotent and membership-bound', async () => {
      const input = { name: 'Participant reader', slug: 'fixture-reader', permissions: [{ permissionKey: Permissions.CASE_READ, scope: 'UNIT' as const }] };
      const results = await Promise.allSettled([service.createRole(eventA, input, organizer.id), service.createRole(eventA, input, organizer.id)]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
      assert.ok(rejected.reason instanceof ConflictException);
      const succeeded = results.find((result) => result.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<EventsService['createRole']>>>;
      participantRole = succeeded.value!.id;
      const grants = await Promise.all([service.assignRole(eventA, { roleId: participantRole, userId: participant.id, unitId: unitA }, organizer.id), service.assignRole(eventA, { roleId: participantRole, membershipId: participantMembership, unitId: unitA }, organizer.id)]);
      assert.equal(grants[0]!.id, grants[1]!.id);
      assert.equal(grants[0]!.userId, null);
      assert.equal(grants[0]!.membershipId, participantMembership);
      await assert.rejects(service.assignRole(eventA, { roleId: participantRole, userId: outsider.id }, organizer.id), BadRequestException);
      await assert.rejects(service.updateRole(eventB, participantRole, { name: 'Cross-event edit' }, organizer.id), ForbiddenException);
      assert.equal(await authz.authorize({ user: participant, permission: Permissions.CASE_READ, context: { eventId: eventA, unitId: unitA } }), true);
      assert.equal(await authz.authorize({ user: participant, permission: Permissions.CASE_READ, context: { eventId: eventA, unitId: unitB } }), false);
    });

    await t.test('unit grant controls navigation, profile and search; archival revokes it without a new login',async()=>{
      const resolver=new WorkspaceResolverService(database,authz);
      const getHrefs=async()=> (await resolver.resolveWorkspace(participant,eventA)).sections.flatMap(s=>s.items.map(i=>i.href));
      assert.ok((await getHrefs()).includes('/events/'+eventA+'/cases'));
      assert.ok(!(await getHrefs()).includes('/events/'+eventA+'/command'));
      await db.update(organizationalUnits).set({archivedAt:new Date()}).where(eq(organizationalUnits.id,unitA));
      try {
        assert.equal(await authz.authorize({user:participant,permission:Permissions.CASE_READ,context:{eventId:eventA,unitId:unitA}}),false);
        assert.equal(await authz.hasEventCapability({user:participant,permission:Permissions.CASE_READ,eventId:eventA,resourceScopes:['OWN','ASSIGNED']}),false);
        const membership=(await profile.getCurrentUserProfile(participant.id)).memberships.find(m=>m.eventId===eventA)!;
        assert.ok(!membership.permissions.includes(Permissions.CASE_READ));
        assert.ok(!membership.unitIds.includes(unitA));
        assert.ok(!(await getHrefs()).includes('/events/'+eventA+'/cases'));
        const filter=await new SearchAuthzService(database).buildTypesenseFilter(participant,{eventFilter:eventA});
        assert.ok(!filter?.includes(unitA));
      } finally {
        await db.update(organizationalUnits).set({archivedAt:null}).where(eq(organizationalUnits.id,unitA));
      }
    });

    await t.test('roster matches its shared contract and returns names, all teams, roles and joinedAt', async () => {
      const row = (await service.listMemberships(eventA)).find((member) => member.userId === participant.id)!;
      assert.ok(MembershipResponseSchema.safeParse(row).success);
      assert.equal(row.units.length, 2);
      assert.equal(row.roles[0]?.id, participantRole);
      assert.equal(row.user.status, 'ACTIVE');
      assert.ok(!Number.isNaN(Date.parse(row.joinedAt)));
    });

    await t.test('legacy malformed grants cannot escalate via authorization, profile or search', async () => {
      const invalidRole = generateId();
      await db.insert(roles).values({ id: invalidRole, eventId: eventB, name: 'Invalid historical role', slug: 'legacy-invalid' });
      await db.insert(rolePermissions).values({ roleId: invalidRole, permissionKey: Permissions.PLATFORM_MANAGE, scope: 'PLATFORM' });
      await db.insert(roleAssignments).values([{ roleId: invalidRole, userId: participant.id }, { roleId: invalidRole, membershipId: participantMembership }]);
      assert.equal(await authz.authorize({ user: participant, permission: Permissions.PLATFORM_MANAGE }), false);
      const current = await profile.getCurrentUserProfile(participant.id);
      assert.deepEqual(current.platformPermissions, []);
      assert.ok(current.memberships.every((membership) => !membership.permissions.includes(Permissions.PLATFORM_MANAGE)));
      const filter = await new SearchAuthzService(database).buildTypesenseFilter(participant, { eventFilter: eventA });
      assert.ok(filter?.includes(unitA));
      assert.ok(!filter?.includes(unitB));
      assert.ok(!filter?.includes('platform.manage'));
      const searchAuthz=new SearchAuthzService(database);
      assert.equal(await searchAuthz.buildTypesenseFilter(participant,{typeFilter:'case || visibility:PLATFORM'}),null);
      assert.equal(await searchAuthz.buildTypesenseFilter(admin,{typeFilter:'case || visibility:PLATFORM'}),null);
      const allEvents=await searchAuthz.buildTypesenseFilter(participant);
      assert.ok(allEvents?.includes(unitA));
      assert.ok(!allEvents?.includes(unitB));
    });

    let previewId = '';
    await t.test('only a platform administrator can open an active participant preview', async () => {
      await assert.rejects(previews.start(organizer, sessionToken, { reason: 'Participant support', eventId: eventA, targetUserId: participant.id }), ForbiddenException);
      await assert.rejects(previews.start(admin, sessionToken, { reason: 'Participant support', eventId: eventA, targetUserId: outsider.id }), ForbiddenException);
      const preview = await previews.start(admin, sessionToken, { reason: 'Participant support', eventId: eventA, targetUserId: participant.id });
      previewId = preview.id;
      assert.equal(preview.readOnly, true);
      assert.ok(!('sessionHash' in preview));
      const req = request(preview.id, `/events/${eventA}/cases`, 'GET', { eventId: eventA });
      assert.equal(await activate(req), true);
      assert.equal(req.user?.id, participant.id);
      assert.equal(req.viewAs?.actorUserId, admin.id);
      assert.equal(await authz.authorize({ user: req.user!, permission: Permissions.PLATFORM_MANAGE }), false);
      await assert.rejects(previews.apply(request(preview.id, '/auth/me'), admin, 'different-session'), ForbiddenException);
      await assert.rejects(previews.apply(request(preview.id, '/auth/me'), outsider, sessionToken), ForbiddenException);
    });

    await t.test('preview rejects every write method, unrelated event, unscoped search and platform endpoint', async () => {
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        await assert.rejects(activate(request(previewId, `/events/${eventA}/tasks`, method, { eventId: eventA })), ForbiddenException);
      }
      await assert.rejects(activate(request(previewId, `/events/${eventB}/cases`, 'GET', { eventId: eventB })), ForbiddenException);
      await assert.rejects(activate(request(previewId, '/search')), ForbiddenException);
      await assert.rejects(activate(request(previewId, '/admin/integrations/ai')), ForbiddenException);
      await assert.rejects(activate(request(previewId, '/auth/view-as', 'POST')), ForbiddenException);
      assert.equal(await activate(request(previewId, '/search', 'GET', {}, { eventId: eventA })), true);
    });

    await t.test('reading target preferences and previewing do not change participant data', async () => {
      const preferences = new PreferencesService(database);
      await preferences.getUserPreferences(participant.id, false);
      assert.equal((await db.select().from(userPreferences).where(eq(userPreferences.userId, participant.id))).length, 0);
      const clock = await new ScenarioClockService(database, audit).getState(eventA);
      assert.equal(clock.mode, 'REAL_TIME');
      assert.equal((await db.select().from(scenarioClocks).where(eq(scenarioClocks.eventId, eventA))).length, 0);
      const records = await db.select().from(auditEvents).where(and(eq(auditEvents.eventId, eventA), eq(auditEvents.category, 'auth')));
      assert.ok(records.some((row) => row.action === 'auth.view_as.read'));
      assert.ok(records.some((row) => row.action === 'auth.view_as.blocked'));
      assert.ok(records.every((row) => row.actorUserId === admin.id));
    });

    await t.test('only a platform administrator can add missing team templates to the requested exercise', async () => {
      const controller = new EventTemplatesController(database, audit, indexer);
      const permissions = new PermissionsGuard(new Reflector(), authz, audit);
      const req = { user: organizer, headers: {}, params: { eventId: eventA }, id: generateId() } as unknown as CyrisRequest;
      const ctx = {
        getClass: () => EventTemplatesController, getHandler: () => controller.initialize,
        switchToHttp: () => ({ getRequest: () => req }),
      } as unknown as ExecutionContext;
      await assert.rejects(permissions.canActivate(ctx), ForbiddenException);
      req.user = admin;
      assert.equal(await permissions.canActivate(ctx), true);
      const results = await Promise.all([controller.initialize(eventA, admin, req), controller.initialize(eventA, admin, req)]);
      assert.deepEqual(results.map(r => r.unitsCreated).sort(), [0, 8]);
      assert.deepEqual(results.map(r => r.rolesCreated).sort(), [0, 11]);
      assert.ok(results.every(r => r.eventId === eventA));
      assert.equal((await db.select().from(organizationalUnits).where(eq(organizationalUnits.eventId, eventB))).length, 0);
      const records = await db.select().from(auditEvents).where(and(eq(auditEvents.eventId, eventA), eq(auditEvents.action, 'event.team_templates.initialized')));
      assert.equal(records.length, 2);
      assert.ok(records.every(row => row.actorUserId === admin.id));
      await assert.rejects(controller.initialize(generateId(), admin, req), NotFoundException);
    });

    await t.test('expiry and revoked rights fail closed; the original actor can still exit', async () => {
      const key = `cyris:view_as:${previewId}`;
      const stored = JSON.parse(redis.get(key)!);
      redis.set(key, JSON.stringify({ ...stored, expiresAt: new Date(0).toISOString() }));
      await assert.rejects(activate(request(previewId, '/auth/me')), ForbiddenException);
      redis.set(key, JSON.stringify(stored));
      await db.update(eventMemberships).set({ status: 'INACTIVE' }).where(eq(eventMemberships.id, participantMembership));
      await assert.rejects(activate(request(previewId, '/auth/me')), ForbiddenException);
      await db.update(eventMemberships).set({ status: 'ACTIVE' }).where(eq(eventMemberships.id, participantMembership));
      await db.delete(roleAssignments).where(eq(roleAssignments.roleId, platformRole));
      await assert.rejects(activate(request(previewId, '/auth/me')), ForbiddenException);
      const req = request(previewId, '/auth/view-as', 'DELETE');
      assert.equal(await activate(req), true);
      assert.equal(req.user?.id, admin.id);
      await previews.stop(previewId, admin, sessionToken);
      assert.equal(redis.has(key), false);
      await assert.rejects(activate(request(previewId, '/auth/me')), ForbiddenException);
      assert.equal((await db.select().from(auditEvents).where(and(eq(auditEvents.eventId, eventA), eq(auditEvents.action, 'auth.view_as.ended')))).length, 1);
    });
  } finally {
    await closeDatabaseConnection();
  }
});

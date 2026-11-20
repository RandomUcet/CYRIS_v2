import 'reflect-metadata';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  getDbClient, closeDatabaseConnection, events, users, eventMemberships, organizationalUnits,
  membershipUnitAssignments, roles, roleAssignments, rolePermissions, resources, resourceAssignments,
  activityEvents, cases,
} from '@cyris/db';
import { generateId, Permissions, type PermissionKey } from '@cyris/shared';
import { DatabaseService } from '../modules/database/database.service.js';
import { AuthorizationService } from '../modules/authorization/authorization.service.js';
import { ResourceAccessService } from '../modules/resources/resource-access.service.js';
import { ActivityService } from '../modules/resources/activity.service.js';
import { TimelineService } from '../modules/timeline/timeline.service.js';
import { AIContextService } from '../modules/ai/ai-context.service.js';
import { CommandService } from '../modules/command/command.service.js';
import type { AuthenticatedUser } from '../modules/auth/session.service.js';
import { requireVerifiedIsolatedDatabase, skipWithoutVerifiedDatabase } from './isolated-postgres-harness.js';

skipWithoutVerifiedDatabase('all activity consumers preserve audience, resource and event boundaries in PostgreSQL', async () => {
  const db = getDbClient({ url: requireVerifiedIsolatedDatabase()! });
  const rollback = new Error('ROLLBACK_ACTIVITY_FIXTURES');
  try {
    await db.transaction(async (tx) => {
      const database = { client: tx } as unknown as DatabaseService;
      const authz = new AuthorizationService(database);
      const resourceAccess = new ResourceAccessService(database, authz);
      const activity = new ActivityService(database, authz, resourceAccess);
      const timeline = new TimelineService(database, resourceAccess, activity);
      const aiContext = new AIContextService(database, resourceAccess, activity);
      const command = new CommandService(database, { listTasks: async () => [] } as never,
        { getOperationalSummary: async () => null } as never, {} as never,
        { listIncidents: async () => [] } as never, {} as never, activity, resourceAccess, authz);
      const eventA = generateId(); const eventB = generateId();
      const teamA = generateId(); const teamB = generateId();
      const member = (name: string): AuthenticatedUser => ({ id: generateId(), email: `${generateId()}@test.invalid`, displayName: name, status: 'ACTIVE' });
      const alice = member('Alice'); const bob = member('Bob'); const controller = member('Controller'); const outsider = member('Outsider');
      await tx.insert(events).values([{ id: eventA, name: 'Visibility A', slug: eventA }, { id: eventB, name: 'Visibility B', slug: eventB }]);
      await tx.insert(users).values([alice, bob, controller, outsider]);
      await tx.insert(organizationalUnits).values([{ id: teamA, eventId: eventA, name: 'Team A', slug: 'a' }, { id: teamB, eventId: eventA, name: 'Team B', slug: 'b' }]);
      const memberships = new Map<string, string>();
      for (const user of [alice, bob, controller]) {
        const id = generateId(); memberships.set(user.id, id);
        await tx.insert(eventMemberships).values({ id, eventId: eventA, userId: user.id });
      }
      // Alice belongs to two units; an explicitly bound role must not expand to both.
      await tx.insert(membershipUnitAssignments).values([
        { membershipId: memberships.get(alice.id)!, unitId: teamA },
        { membershipId: memberships.get(alice.id)!, unitId: teamB },
        { membershipId: memberships.get(bob.id)!, unitId: teamB },
      ]);
      const role = async (user: AuthenticatedUser, grants: Array<[PermissionKey, string]>, unitId?: string) => {
        const id = generateId();
        await tx.insert(roles).values({ id, eventId: eventA, name: id, slug: id });
        await tx.insert(rolePermissions).values(grants.map(([permissionKey, scope]) => ({ roleId: id, permissionKey, scope })));
        await tx.insert(roleAssignments).values({ roleId: id, membershipId: memberships.get(user.id)!, unitId });
      };
      for (const user of [alice, bob, controller]) await role(user, [
        [Permissions.EVENT_READ, 'EVENT'], [Permissions.TIMELINE_READ, 'EVENT'],
        [Permissions.CASE_READ, 'EVENT'], [Permissions.REGISTRY_READ, 'EVENT'], [Permissions.COMMAND_READ, 'EVENT'],
      ]);
      await role(controller, [[Permissions.SCENARIO_READ, 'EVENT']]);
      await role(alice, [[Permissions.LAB_WORK, 'UNIT']], teamA);
      await role(bob, [[Permissions.LAB_READ, 'ASSIGNED']]);
      const publicCase = generateId(); const foreign = generateId(); const lab = generateId();
      await tx.insert(resources).values([
        { id: publicCase, eventId: eventA, resourceType: 'case', visibility: 'EVENT', owningUnitId: teamA },
        { id: foreign, eventId: eventB, resourceType: 'case', visibility: 'EVENT' },
        { id: lab, eventId: eventA, resourceType: 'lab_analysis', visibility: 'RESTRICTED', owningUnitId: teamB, ownerUserId: alice.id },
      ]);
      await tx.insert(cases).values({ id: publicCase, caseNumber: 'TEST-CASE', title: 'Permitted case' });
      await tx.insert(resourceAssignments).values({ eventId: eventA, resourceId: lab, userId: bob.id });
      assert.equal(await resourceAccess.canAccessResource(alice, lab, Permissions.LAB_WORK), false,
        'a role bound to team A cannot work on team B records even when the member belongs to both');
      assert.equal(await resourceAccess.canAccessResource(bob, lab, Permissions.LAB_READ), true,
        'a specifically assigned worker can read the restricted work item with ASSIGNED permission');

      const secret = generateId(); const foreignCause = generateId(); const publicTarget = generateId();
      await tx.insert(activityEvents).values([
        { id: secret, eventId: eventA, activityType: 'scenario.note', title: 'SECRET ANSWER', visibility: 'SCENARIO', resourceId: publicCase },
        { eventId: eventA, activityType: 'scenario.note', title: 'RESOURCELESS SECRET', visibility: 'SCENARIO' },
        { id: foreignCause, eventId: eventB, activityType: 'briefing.note', title: 'OTHER EVENT CAUSE', visibility: 'EVENT' },
        { id: publicTarget, eventId: eventA, activityType: 'case.updated', title: 'VISIBLE CASE UPDATE', visibility: 'EVENT', resourceId: publicCase, causationId: foreignCause },
        { eventId: eventA, activityType: 'briefing.delivered', title: 'BOB ONLY', visibility: 'RESTRICTED', metadata: { audience: { type: 'USER', id: bob.id } } },
        { eventId: eventA, activityType: 'briefing.delivered', title: 'ALICE ONLY', visibility: 'RESTRICTED', metadata: { audience: { type: 'USER', id: alice.id } } },
        { eventId: eventA, activityType: 'briefing.delivered', title: 'LEGACY UNKNOWN AUDIENCE', visibility: 'EVENT' },
        { eventId: eventA, activityType: 'briefing.note', title: 'MALFORMED PRIVATE', visibility: 'RESTRICTED', metadata: { audience: 'everyone' } },
      ]);
      const assertSafe = (items: Array<{ title: string }>) => {
        const titles = items.map((item) => item.title);
        for (const forbidden of ['SECRET ANSWER', 'RESOURCELESS SECRET', 'OTHER EVENT CAUSE', 'BOB ONLY', 'LEGACY UNKNOWN AUDIENCE', 'MALFORMED PRIVATE']) {
          assert.equal(titles.includes(forbidden), false, `must hide ${forbidden}`);
        }
      };
      const feed = await activity.getActivityFeed({ eventId: eventA }, alice);
      assertSafe(feed);
      assert.ok(feed.some((item) => item.title === 'ALICE ONLY'));
      assert.ok(feed.some((item) => item.title === 'VISIBLE CASE UPDATE'));
      assertSafe((await timeline.getEventTimeline(eventA, {}, alice)).items);
      assertSafe((await timeline.getResourceTimeline(publicCase, {}, alice)).items);
      assertSafe((await timeline.getCaseTimeline(publicCase, {}, alice)).items);
      assertSafe((await command.getOperationalPicture(eventA, alice)).recentActivities);
      assertSafe((await aiContext.buildCaseContext(alice, publicCase)).timelineHighlights);
      assertSafe((await aiContext.buildCatchMeUpContext(alice, eventA, 'LAST_2_HOURS')).items);
      await assert.rejects(() => aiContext.buildTimelineExplainContext(alice, eventA, { activityId: secret }), NotFoundException);
      const explained = await aiContext.buildTimelineExplainContext(alice, eventA, { activityId: publicTarget });
      assert.equal(explained.causalChain.length, 0, 'cross-event causal parent cannot enter AI context');
      assert.equal(explained.targetActivity?.causationId, null, 'hidden parent identifier is omitted too');
      const controllerFeed = await activity.getActivityFeed({ eventId: eventA }, controller);
      assert.ok(controllerFeed.some((item) => item.title === 'RESOURCELESS SECRET'));
      assert.ok(controllerFeed.some((item) => item.title === 'BOB ONLY'));
      await assert.rejects(() => activity.getActivityFeed({ eventId: eventA }, outsider), ForbiddenException);
      await assert.rejects(() => activity.getActivityFeed({ eventId: eventB }, alice), ForbiddenException);

      // All rows share the same microsecond timestamp. Stable ID tie-breaking and
      // the raw database timestamp must survive cursor serialization without loss.
      const pageIds = Array.from({ length: 5 }, () => generateId());
      const timestamp = '2040-01-01T00:00:00.123456Z';
      await tx.insert(activityEvents).values(pageIds.map((id) => ({
        id, eventId: eventA, activityType: 'paging.test', title: id, visibility: 'EVENT',
        occurredAt: sql`${timestamp}::timestamptz`,
      })));
      await tx.insert(activityEvents).values({ eventId: eventA, activityType: 'paging.test', title: 'HIDDEN PAGE', visibility: 'SCENARIO', occurredAt: sql`${timestamp}::timestamptz` });
      let cursor: string | undefined;
      const seen: string[] = [];
      do {
        const page = await activity.getTimeline({ eventId: eventA, type: 'paging.test', limit: 2, cursor }, alice);
        seen.push(...page.items.map((item) => item.id));
        cursor = page.nextCursor ?? undefined;
        assert.ok(seen.length <= 5, 'pagination must not repeat same-timestamp rows');
      } while (cursor);
      assert.deepEqual([...seen].sort(), [...pageIds].sort());
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    await closeDatabaseConnection();
  }
});

import 'reflect-metadata';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import {
  getDbClient, closeDatabaseConnection, events, users, eventMemberships, userPreferences, resources, cases, incidents,
  scenarioInjects, scenarioInjectConditions, scenarioInjectDependencies, scenarioInjectTargets, scenarioInjectActions,
  scenarioInjectTranslations, scenarioInjectReleases, scenarioDeliveries, scenarioBriefingReceipts,
  activityEvents, notifications, auditEvents, scenarioClocks,
  releaseScenarioInject, reconcileScenarioInject, validateScenarioReferences,
} from '@cyris/db';
import { generateId, Permissions } from '@cyris/shared';
import { ScenarioBriefingsService } from '../modules/scenario/scenario-briefings.service.js';
import { AuditService } from '../modules/audit/audit.service.js';
import { requireVerifiedIsolatedDatabase, skipWithoutVerifiedDatabase } from './isolated-postgres-harness.js';

skipWithoutVerifiedDatabase('scenario transactions, real PostgreSQL audience and scheduler regression', async () => {
  const db = getDbClient({ url: requireVerifiedIsolatedDatabase()! });
  const eventA = generateId(); const eventB = generateId();
  const alice = generateId(); const bob = generateId(); const outsider = generateId(); const admin = generateId();
  const userIds = [alice, bob, outsider, admin];
  const provider = { client: db } as any;
  const briefings = new ScenarioBriefingsService(provider, new AuditService(provider), { canAccessResource: async () => true } as any,
    { authorize: async ({ user: requestingUser, permission }: any) => requestingUser.id === admin && permission === Permissions.PLATFORM_MANAGE } as any);
  const user = (id: string) => ({ id, displayName: id, email: `${id}@test.invalid`, isPlatformAdmin: false } as any);
  let serial = 0;
  const makeInject = async (extra: Partial<typeof scenarioInjects.$inferInsert> = {}) => {
    const [row] = await db.insert(scenarioInjects).values({ id: generateId(), eventId: eventA, injectNumber: `TEST-${++serial}`,
      title: 'INTERNAL SECRET TITLE', controllerSummary: 'SECRET CONTROLLER ANSWER', participantTitle: 'Participant update', participantContent: 'Public exercise text',
      status: 'READY', triggerType: 'MANUAL', releasePolicy: 'MANUAL_CONFIRMATION', requiresAcknowledgement: true, ...extra }).returning();
    return row!;
  };
  try {
    await db.insert(users).values(userIds.map(id => ({ id, email: `${id}@test.invalid`, displayName: id })));
    await db.insert(events).values([{ id: eventA, slug: eventA, name: 'Scenario regression A', status: 'ACTIVE', defaultLocale: 'en' }, { id: eventB, slug: eventB, name: 'Scenario regression B', status: 'ACTIVE' }]);
    await db.insert(eventMemberships).values([{ eventId: eventA, userId: alice }, { eventId: eventA, userId: bob }, { eventId: eventB, userId: outsider }]);
    await db.insert(userPreferences).values({ userId: alice, locale: 'cs' });

    // Same inject concurrently requested by API/worker paths produces one immutable release.
    const targeted = await makeInject();
    await db.insert(scenarioInjectTargets).values({ eventId: eventA, injectId: targeted.id, targetType: 'USER', targetUserId: alice });
    await db.insert(scenarioInjectTranslations).values({ injectId: targeted.id, locale: 'cs', participantTitle: 'Úkol pro Alici', participantContent: 'Přesný český obsah' });
    const concurrent = await Promise.all(Array.from({ length: 4 }, () => releaseScenarioInject(db, eventA, targeted.id, 'MANUAL', alice)));
    assert.equal(concurrent.filter(result => !result.alreadyReleased).length, 1);
    assert.equal(new Set(concurrent.map(result => result.releaseId)).size, 1);
    const deliveries = await db.select().from(scenarioDeliveries).where(eq(scenarioDeliveries.injectId, targeted.id));
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0]!.participantTitle, 'Úkol pro Alici');
    assert.equal(deliveries[0]!.recipientUserId, alice);
    assert.equal((await db.select().from(notifications).where(and(eq(notifications.eventId, eventA), eq(notifications.userId, alice)))).length, 1);
    const feed = await db.select().from(activityEvents).where(and(eq(activityEvents.eventId, eventA), eq(activityEvents.activityType, 'briefing.delivered')));
    assert.equal(feed.length, 1);
    assert.equal(feed[0]!.visibility, 'RESTRICTED');
    assert.deepEqual((feed[0]!.metadata as any).audience, { type: 'USER', id: alice });
    await assert.rejects(() => briefings.markAsRead(eventA, deliveries[0]!.id, user(bob)), /not available/);
    await assert.rejects(() => briefings.acknowledgeBriefing(eventA, deliveries[0]!.id, user(bob)), /not available/);
    await assert.rejects(() => briefings.getBriefingsForUser(eventA, user(outsider)), /participation/);
    // Admin has platform-level Briefings permission but no event membership.
    // Reading someone else's directed briefing never changes that recipient's receipt.
    const adminBriefings = await briefings.getBriefingsForUser(eventA, user(admin));
    assert.equal(adminBriefings.newBriefings.find(item => item.deliveryId === deliveries[0]!.id)?.title, 'Úkol pro Alici');
    await briefings.markAsRead(eventA, deliveries[0]!.id, user(admin));
    assert.equal((await briefings.getBriefingsForUser(eventA, user(alice))).unreadCount, 1);
    assert.equal((await briefings.getBriefingsForUser(eventA, user(admin))).unreadCount, 0);
    await assert.rejects(() => releaseScenarioInject(db, eventB, targeted.id, 'MANUAL', outsider), /not found/);

    // A legacy event broadcast still tracks each user's independent read/ack state.
    const broadcast = await makeInject();
    const released = await releaseScenarioInject(db, eventA, broadcast.id, 'MANUAL', alice);
    await db.delete(scenarioDeliveries).where(eq(scenarioDeliveries.releaseId, released.releaseId));
    const [legacy] = await db.insert(scenarioDeliveries).values({ eventId: eventA, injectId: broadcast.id, releaseId: released.releaseId }).returning();
    await Promise.all([briefings.acknowledgeBriefing(eventA, legacy!.id, user(alice)), briefings.acknowledgeBriefing(eventA, legacy!.id, user(alice))]);
    const aliceView = await briefings.getBriefingsForUser(eventA, user(alice));
    const bobView = await briefings.getBriefingsForUser(eventA, user(bob));
    assert.ok(aliceView.earlierBriefings.find(item => item.deliveryId === legacy!.id)?.acknowledgedAt);
    assert.equal(bobView.newBriefings.find(item => item.deliveryId === legacy!.id)?.acknowledgedAt, null);
    assert.equal((await db.select().from(scenarioBriefingReceipts).where(eq(scenarioBriefingReceipts.releaseId, released.releaseId))).length, 1);
    const ackAudits = await db.select().from(auditEvents).where(and(eq(auditEvents.eventId, eventA), eq(auditEvents.action, 'briefing.acknowledged')));
    assert.equal(ackAudits.length, 1);

    // Identical readable case numbers in another exercise cannot satisfy conditions.
    const ownCase = generateId(); const foreignCase = generateId();
    await db.insert(resources).values([{ id: ownCase, eventId: eventA, resourceType: 'case' }, { id: foreignCase, eventId: eventB, resourceType: 'case' }]);
    const caseNumber = `CASE-${eventA.slice(0, 8)}`;
    await db.insert(cases).values([{ id: ownCase, caseNumber, title: 'Own', status: 'OPEN' }, { id: foreignCase, caseNumber, title: 'Foreign', status: 'CLOSED' }]);
    const conditional = await makeInject({ triggerType: 'CONDITION', releasePolicy: 'AUTO_RELEASE', status: 'BLOCKED' });
    await db.insert(scenarioInjectConditions).values({ eventId: eventA, injectId: conditional.id, conditionType: 'CASE_STATUS', targetIdentifier: caseNumber, targetStatus: 'CLOSED' });
    assert.equal((await reconcileScenarioInject(db, conditional.id)).isReady, false);
    await assert.rejects(() => releaseScenarioInject(db, eventA, conditional.id, 'MANUAL', alice), /Prerequisites/);
    await db.update(cases).set({ status: 'CLOSED' }).where(eq(cases.id, ownCase));
    await reconcileScenarioInject(db, conditional.id);
    assert.equal((await db.select().from(scenarioInjects).where(eq(scenarioInjects.id, conditional.id)))[0]!.status, 'RELEASED');

    // Scheduled confirmation waits; actual scenario clock pause also stops due automatic release.
    const scheduled = await makeInject({ triggerType: 'SCHEDULED_TIME', scheduledAt: new Date(0), status: 'SCHEDULED' });
    await reconcileScenarioInject(db, scheduled.id);
    assert.equal((await db.select().from(scenarioInjects).where(eq(scenarioInjects.id, scheduled.id)))[0]!.status, 'READY');
    const paused = await makeInject({ triggerType: 'SCHEDULED_TIME', releasePolicy: 'AUTO_RELEASE', scheduledAt: new Date(0), status: 'SCHEDULED' });
    await db.insert(scenarioClocks).values({ eventId: eventA, mode: 'SCENARIO_TIME', scenarioBaseTime: new Date(), realBaseTime: new Date(), pausedAt: new Date(), pausedScenarioTime: new Date() });
    await reconcileScenarioInject(db, paused.id);
    assert.equal((await db.select().from(scenarioInjects).where(eq(scenarioInjects.id, paused.id)))[0]!.status, 'READY');
    await db.update(scenarioClocks).set({ pausedAt: null, pausedScenarioTime: null }).where(eq(scenarioClocks.eventId, eventA));
    await reconcileScenarioInject(db, paused.id);
    assert.equal((await db.select().from(scenarioInjects).where(eq(scenarioInjects.id, paused.id)))[0]!.status, 'RELEASED');

    // Both paths execute CREATE_INCIDENT and never use internal controller text as participant defaults.
    const actionInject = await makeInject({ triggerType: 'CONDITION', releasePolicy: 'AUTO_RELEASE', status: 'BLOCKED', participantTitle: null, participantContent: null });
    await db.insert(scenarioInjectActions).values({ eventId: eventA, injectId: actionInject.id, actionType: 'CREATE_INCIDENT' });
    await reconcileScenarioInject(db, actionInject.id);
    const newIncidents = await db.select({ title: incidents.title, description: incidents.description }).from(incidents).innerJoin(resources, eq(resources.id, incidents.id)).where(eq(resources.eventId, eventA));
    assert.equal(newIncidents.length, 1);
    assert.doesNotMatch(JSON.stringify(newIncidents), /SECRET/);

    // Foreign disclosure is rejected even when a malformed legacy row bypassed the write API.
    const malicious = await makeInject();
    await db.insert(scenarioInjectActions).values({ eventId: eventA, injectId: malicious.id, actionType: 'CHANGE_RESOURCE_VISIBILITY', resourceId: foreignCase, newVisibility: 'EVENT' });
    await assert.rejects(() => releaseScenarioInject(db, eventA, malicious.id, 'MANUAL', alice), /belong to this exercise/);
    assert.equal((await db.select().from(scenarioInjectReleases).where(eq(scenarioInjectReleases.injectId, malicious.id))).length, 0);
    await assert.rejects(() => validateScenarioReferences(db, eventA, { conditions: [{ conditionType: 'CASE_STATUS', targetResourceId: foreignCase, targetStatus: 'CLOSED' }] }), /type and exercise/);

    // Inject conditions can target actual inject IDs (not resource registry IDs).
    const waiting = await makeInject({ triggerType: 'CONDITION', releasePolicy: 'AUTO_RELEASE', status: 'BLOCKED' });
    await db.insert(scenarioInjectConditions).values({ eventId: eventA, injectId: waiting.id, conditionType: 'INJECT_RELEASED', targetResourceId: scheduled.id });
    assert.equal((await reconcileScenarioInject(db, waiting.id)).isReady, false);
    await releaseScenarioInject(db, eventA, scheduled.id, 'MANUAL', alice);
    await reconcileScenarioInject(db, waiting.id);
    assert.equal((await db.select().from(scenarioInjects).where(eq(scenarioInjects.id, waiting.id)))[0]!.status, 'RELEASED');
  } finally {
    // Immutable audit rows intentionally remain in the disposable database; the harness destroys it.
    await closeDatabaseConnection();
  }
});

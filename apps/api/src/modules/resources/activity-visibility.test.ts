import assert from 'node:assert/strict';
import test from 'node:test';
import { Permissions } from '@cyris/shared';
import { canReadActivity, type ActivityReader, type VisibleActivity } from './activity-visibility.js';

const publicActivity: VisibleActivity = {
  eventId: 'exercise-a', resourceId: null, activityType: 'briefing.note',
  actorUserId: 'alice', visibility: 'EVENT', metadata: null,
};
function reader(overrides: Partial<ActivityReader> = {}): ActivityReader {
  return {
    eventId: 'exercise-a', userId: 'alice', unitIds: ['team-a'],
    platformAdmin: false, eventTimeline: true, scenarioReader: false,
    resource: async () => ({ eventId: 'exercise-a', resourceType: 'case', owningUnitId: 'team-a', ownerUserId: 'bob', explicitlyGranted: false }),
    canReadResource: async () => true,
    hasEventPermission: async () => true,
    ...overrides,
  };
}

test('scenario metadata is hidden even from its participant author; event controllers can read it', async () => {
  const secret = { ...publicActivity, visibility: 'SCENARIO' };
  assert.equal(await canReadActivity(secret, reader()), false);
  assert.equal(await canReadActivity(secret, reader({ scenarioReader: true })), true);
  assert.equal(await canReadActivity({ ...secret, eventId: 'exercise-b' }, reader({ platformAdmin: true })), false);
});

test('exact per-user and unit briefing audiences apply to resource-less activity', async () => {
  const targeted = { ...publicActivity, activityType: 'briefing.delivered', visibility: 'RESTRICTED', metadata: { audience: { type: 'USER', id: 'bob' } } };
  assert.equal(await canReadActivity(targeted, reader()), false);
  assert.equal(await canReadActivity(targeted, reader({ userId: 'bob' })), true);
  assert.equal(await canReadActivity(targeted, reader({ scenarioReader: true })), true);
  const team = { ...targeted, visibility: 'UNIT', metadata: { audience: { type: 'UNIT', id: 'team-a' } } };
  assert.equal(await canReadActivity(team, reader()), true);
  assert.equal(await canReadActivity(team, reader({ unitIds: ['team-b'] })), false);
});

test('legacy unscoped briefing content and malformed audiences fail closed', async () => {
  assert.equal(await canReadActivity({ ...publicActivity, activityType: 'briefing.delivered' }, reader()), false);
  for (const audience of [null, 'all', {}, { type: 'UNKNOWN' }, { type: 'USER' }, { type: 'EVENT', id: 'wrong' }]) {
    assert.equal(await canReadActivity({ ...publicActivity, metadata: { audience } }, reader()), false);
  }
});

test('resource access cannot make a secret activity public or disclose a hidden related resource', async () => {
  assert.equal(await canReadActivity({ ...publicActivity, resourceId: 'public-case', visibility: 'SCENARIO' }, reader()), false);
  assert.equal(await canReadActivity({ ...publicActivity, resourceId: 'public-case', relatedResourceIds: ['private-evidence'] }, reader({
    canReadResource: async (id) => id !== 'private-evidence',
  })), false);
  assert.equal(await canReadActivity({ ...publicActivity, resourceId: 'foreign-resource' }, reader({
    resource: async () => ({ eventId: 'exercise-b', resourceType: 'case', owningUnitId: null, ownerUserId: null, explicitlyGranted: false }),
  })), false);
});

test('clinical details require domain read permission as well as timeline permission', async () => {
  const clinical = { ...publicActivity, resourceId: 'patient', activityType: 'medical.observation' };
  assert.equal(await canReadActivity(clinical, reader({ canReadResource: async (_, permission) => permission !== Permissions.MEDICAL_READ })), false);
  assert.equal(await canReadActivity(clinical, reader()), true);
});

test('a restricted activity on an event-visible resource still needs owner or explicit access', async () => {
  const restricted = { ...publicActivity, resourceId: 'public-case', visibility: 'RESTRICTED' };
  assert.equal(await canReadActivity(restricted, reader()), false);
  assert.equal(await canReadActivity(restricted, reader({ resource: async () => ({
    eventId: 'exercise-a', resourceType: 'case', owningUnitId: 'team-b', ownerUserId: 'bob', explicitlyGranted: true,
  }) })), true);
});

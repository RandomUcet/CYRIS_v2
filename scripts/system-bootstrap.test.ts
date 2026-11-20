import assert from 'node:assert/strict';
import test from 'node:test';
import { readBootstrapOptions, exerciseOrganizerPermissions } from './system-bootstrap.js';
import { Permissions } from '@cyris/shared';

test('bootstrap stays empty unless an exercise is explicitly selected', () => {
  assert.deepEqual(readBootstrapOptions({}), { eventId: undefined, eventSlug: undefined, eventName: undefined });
  assert.deepEqual(readBootstrapOptions({ CYRIS_SEED_EVENT_SLUG: 'exercise-a' }).eventSlug, 'exercise-a');
  assert.throws(() => readBootstrapOptions({ CYRIS_SEED_EVENT_ID: 'not-a-uuid' }), /UUID/);
  assert.throws(() => readBootstrapOptions({ CYRIS_SEED_EVENT_SLUG: 'Exercise / A' }), /slug|SLUG/);
  assert.throws(() => readBootstrapOptions({ CYRIS_SEED_EVENT_NAME: 'No selected event' }), /requires/);
  assert.throws(() => readBootstrapOptions({
    CYRIS_SEED_EVENT_ID: '00000000-0000-0000-0000-000000000001',
    CYRIS_SEED_EVENT_SLUG: 'exercise-a',
  }), /not both/);
});

test('organizer template supports exercise correction without granting platform administration', () => {
  const keys = new Set(exerciseOrganizerPermissions.map((permission) => permission.key));
  assert.ok(exerciseOrganizerPermissions.every((permission) => permission.scope === 'EVENT'));
  assert.equal(keys.size, exerciseOrganizerPermissions.length);
  for (const permission of [
    Permissions.PLATFORM_MANAGE, Permissions.EVENT_CREATE, Permissions.IDENTITY_MANAGE,
    Permissions.INTEGRATION_MANAGE, Permissions.PREFERENCE_READ, Permissions.PREFERENCE_UPDATE,
    Permissions.NOTIFICATION_MANAGE,
  ]) assert.equal(keys.has(permission as never), false, `${permission} must remain outside exercise support`);
  for (const permission of [
    Permissions.MEMBERSHIP_MANAGE, Permissions.UNIT_MANAGE, Permissions.ROLE_MANAGE,
    Permissions.COMMAND_DEFCON_CHANGE, Permissions.SCENARIO_RELEASE, Permissions.SCENARIO_OVERRIDE,
    Permissions.REGISTRY_UPDATE, Permissions.LAB_CORRECT, Permissions.TASK_ASSIGN,
    Permissions.CASE_CLOSE, Permissions.EVIDENCE_TRANSFER, Permissions.COURT_DECISION_CREATE,
    Permissions.MEDICAL_UPDATE, Permissions.FORENSICS_APPROVE, Permissions.EVALUATION_PUBLISH,
  ]) assert.equal(keys.has(permission), true, `${permission} is required for exercise support`);
});

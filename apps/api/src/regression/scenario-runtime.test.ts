import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateScenarioTime, scenarioReleaseGate } from '@cyris/db';

const now = new Date('2030-05-10T10:00:00Z');
const ready = { status: 'READY', triggerType: 'CONDITION', releasePolicy: 'AUTO_RELEASE', scheduledAt: null };

test('automatic release respects pause, event lifecycle and explicit confirmation', () => {
  assert.equal(scenarioReleaseGate(ready, 'AUTO', true, 'ACTIVE', null, now), null);
  assert.match(scenarioReleaseGate(ready, 'AUTO', true, 'DRAFT', null, now)!, /exercise state/);
  assert.match(scenarioReleaseGate(ready, 'AUTO', true, 'CLOSED', null, now)!, /closed/);
  assert.match(scenarioReleaseGate(ready, 'AUTO', true, 'ACTIVE', { pausedAt: now }, now)!, /paused/);
  assert.match(scenarioReleaseGate({ ...ready, releasePolicy: 'MANUAL_CONFIRMATION' }, 'AUTO', true, 'ACTIVE', null, now)!, /confirmation/);
  assert.match(scenarioReleaseGate({ ...ready, triggerType: 'MANUAL' }, 'AUTO', true, 'ACTIVE', null, now)!, /explicit/);
});

test('manual release rechecks prerequisites; only explicit override bypasses time and conditions', () => {
  assert.match(scenarioReleaseGate(ready, 'MANUAL', false, 'ACTIVE', null, now)!, /Prerequisites/);
  assert.equal(scenarioReleaseGate(ready, 'OVERRIDE', false, 'ACTIVE', null, now), null);
  assert.match(scenarioReleaseGate({ ...ready, status: 'CANCELLED' }, 'OVERRIDE', false, 'ACTIVE', null, now)!, /cancelled/);
});

test('scheduled release uses accelerated scenario time and honors a paused clock', () => {
  const clock = { mode: 'SCENARIO_TIME', scenarioBaseTime: new Date('2030-05-10T09:00:00Z'), realBaseTime: new Date('2030-05-10T09:30:00Z'), speedMultiplier: 4 };
  assert.equal(calculateScenarioTime(clock, now).toISOString(), '2030-05-10T11:00:00.000Z');
  const scheduled = { ...ready, triggerType: 'SCHEDULED_TIME', scheduledAt: new Date('2030-05-10T10:30:00Z') };
  assert.equal(scenarioReleaseGate(scheduled, 'AUTO', true, 'ACTIVE', clock, now), null);
  assert.match(scenarioReleaseGate(scheduled, 'AUTO', true, 'ACTIVE', null, now)!, /not been reached/);
  assert.equal(calculateScenarioTime({ ...clock, pausedScenarioTime: now }, new Date('2030-05-12')).toISOString(), now.toISOString());
});

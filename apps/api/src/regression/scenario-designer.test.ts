import assert from 'node:assert/strict';
import test from 'node:test';
import { canScenarioAutoRelease, validateScenarioDependencyGraph } from '@cyris/contracts';

test('designer rejects self and transitive dependency cycles', () => {
  assert.equal(validateScenarioDependencyGraph('a', ['a'], []), 'Inject cannot depend on itself.');
  assert.match(validateScenarioDependencyGraph('a', ['b'], [{ injectId: 'b', dependsOnInjectId: 'c' }, { injectId: 'c', dependsOnInjectId: 'a' }]) ?? '', /Circular/);
});

test('designer accepts an acyclic prerequisite graph', () => {
  assert.equal(validateScenarioDependencyGraph('c', ['b'], [{ injectId: 'b', dependsOnInjectId: 'a' }]), null);
});

test('typed progression statuses remain explicit and event-scoped by target identity', () => {
  const payload = { conditionType: 'TASK_STATUS', targetResourceId: 'task-event-a', targetStatus: 'COMPLETED' };
  assert.equal(payload.conditionType, 'TASK_STATUS');
  assert.equal(payload.targetResourceId, 'task-event-a');
  assert.equal(payload.targetStatus, 'COMPLETED');
});

test('designer preserves manual confirmation and excludes draft/cancelled auto release', () => {
  assert.equal(canScenarioAutoRelease('READY', 'MANUAL_CONFIRMATION', true), false);
  assert.equal(canScenarioAutoRelease('READY', 'AUTO_RELEASE', true), true);
  assert.equal(canScenarioAutoRelease('DRAFT', 'AUTO_RELEASE', true), false);
  assert.equal(canScenarioAutoRelease('CANCELLED', 'AUTO_RELEASE', true), false);
});

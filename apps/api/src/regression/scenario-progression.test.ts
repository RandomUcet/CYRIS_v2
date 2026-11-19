import assert from 'node:assert/strict';
import test from 'node:test';
import { combineScenarioConditions, scenarioStatusMatches } from '@cyris/contracts';

test('scenario status predicates support task and recovery progression states', () => {
  assert.equal(scenarioStatusMatches('IN_PROGRESS', 'IN_PROGRESS').met, true);
  assert.equal(scenarioStatusMatches('PUBLISHED', 'APPROVED').met, false);
  assert.match(scenarioStatusMatches('PUBLISHED', 'APPROVED').reason, /APPROVED/);
});

test('scenario condition aggregation preserves ALL and ANY semantics', () => {
  const unmet = { met: false, reason: 'Task is not complete' };
  const met = { met: true, reason: '' };
  assert.equal(combineScenarioConditions([met, unmet], 'ALL').met, false);
  assert.equal(combineScenarioConditions([met, unmet], 'ANY').met, true);
  assert.match(combineScenarioConditions([unmet], 'ALL').reason, /not complete/);
});

test('empty condition sets are ready for both logic modes', () => {
  assert.equal(combineScenarioConditions([], 'ALL').met, true);
  assert.equal(combineScenarioConditions([], 'ANY').met, true);
});

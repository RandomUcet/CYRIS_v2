import test from 'node:test';
import assert from 'node:assert/strict';
import { selectLowestWorkloadCandidate } from './laboratory-assignment.js';

test('selects lowest workload candidate', () => {
  const selected = selectLowestWorkloadCandidate([
    { userId: 'b', workload: 3 },
    { userId: 'a', workload: 1 },
  ]);
  assert.equal(selected?.userId, 'a');
});

test('uses stable user ID to break workload ties', () => {
  const selected = selectLowestWorkloadCandidate([
    { userId: 'b', workload: 2 },
    { userId: 'a', workload: 2 },
  ]);
  assert.equal(selected?.userId, 'a');
});

test('returns null when no eligible candidate exists', () => {
  assert.equal(selectLowestWorkloadCandidate([]), null);
});

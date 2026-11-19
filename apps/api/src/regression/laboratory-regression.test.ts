import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CorrectLabAnalysisRequestSchema,
  ReassignLabAnalysisRequestSchema,
  UpdateLabAnalysisRequestSchema,
} from '@cyris/contracts';
import { selectLowestWorkloadCandidate } from '../modules/laboratory/laboratory-assignment.js';
import { skipWithoutVerifiedDatabase } from './isolated-postgres-harness.js';

test('laboratory selection excludes unavailable candidates before selection', () => {
  const selected = selectLowestWorkloadCandidate([
    { userId: 'active-unit-worker', workload: 2 },
    { userId: 'active-other-unit-worker', workload: 0 },
  ]);

  assert.equal(selected?.userId, 'active-other-unit-worker');
});

test('laboratory selection is least-loaded and deterministic for equal workloads', () => {
  const selected = selectLowestWorkloadCandidate([
    { userId: 'worker-z', workload: 1 },
    { userId: 'worker-a', workload: 1 },
    { userId: 'worker-b', workload: 3 },
  ]);

  assert.deepEqual(selected, { userId: 'worker-a', workload: 1 });
});

test('laboratory selection does not mutate the candidate collection', () => {
  const candidates = [
    { userId: 'worker-z', workload: 0 },
    { userId: 'worker-a', workload: 0 },
  ];

  selectLowestWorkloadCandidate(candidates);

  assert.deepEqual(candidates, [
    { userId: 'worker-z', workload: 0 },
    { userId: 'worker-a', workload: 0 },
  ]);
});

test('reassignment and correction require a meaningful reason', () => {
  const reassignment = ReassignLabAnalysisRequestSchema.safeParse({
    assignedToUserId: null,
    reason: '  ',
  });
  const correction = CorrectLabAnalysisRequestSchema.safeParse({
    status: 'REQUESTED',
    reason: 'x',
  });

  assert.equal(reassignment.success, false);
  assert.equal(correction.success, false);
});

test('correction preserves supported workflow statuses in the contract', () => {
  const result = CorrectLabAnalysisRequestSchema.safeParse({
    status: 'REQUESTED',
    assignedToUserId: null,
    assignedUnitId: null,
    reason: 'Reopen for validated correction',
  });

  assert.equal(result.success, true);
});

test('work updates reject unknown workflow statuses', () => {
  const result = UpdateLabAnalysisRequestSchema.safeParse({
    status: 'INVALID_STATUS',
  });

  assert.equal(result.success, false);
});

skipWithoutVerifiedDatabase(
  'NOT IMPLEMENTED: database assignment eligibility excludes inactive, wrong-unit, wrong-exercise, and missing-permission users',
  async () => {
    throw new Error(
      'Harness extension required: provision isolated exercise memberships, units, roles, and laboratory rows before running this test'
    );
  }
);

skipWithoutVerifiedDatabase(
  'NOT IMPLEMENTED: database concurrent laboratory requests serialize assignment and preserve transaction consistency',
  async () => {
    throw new Error(
      'Harness extension required: run concurrent requests against an isolated disposable PostgreSQL instance'
    );
  }
);

skipWithoutVerifiedDatabase(
  'NOT IMPLEMENTED: database reassignment and correction preserve findings and invalidate approval metadata when reopening',
  async () => {
    throw new Error(
      'Harness extension required: exercise the real LaboratoryService with isolated database fixtures'
    );
  }
);

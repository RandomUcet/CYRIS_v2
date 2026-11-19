import assert from 'node:assert/strict';
import test from 'node:test';
import { CommandDefconLevelSchema, CommandReadinessSnapshotSchema } from './command-defcon.js';

test('readiness contract accepts all five established levels', () => {
  for (const level of [1, 2, 3, 4, 5]) {
    assert.equal(CommandDefconLevelSchema.safeParse(level).success, true);
  }
});

test('readiness contract excludes audit reasons and actor identities', () => {
  const parsed = CommandReadinessSnapshotSchema.parse({
    eventId: '00000000-0000-0000-0000-000000000001',
    level: null,
    initialized: false,
    revision: 0,
    updatedAt: null,
    reason: 'internal',
    updatedByUserId: '00000000-0000-0000-0000-000000000002',
  });
  assert.deepEqual(parsed, {
    eventId: '00000000-0000-0000-0000-000000000001',
    level: null,
    initialized: false,
    revision: 0,
    updatedAt: null,
  });
});

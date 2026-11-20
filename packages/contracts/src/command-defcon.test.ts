import assert from 'node:assert/strict';
import test from 'node:test';
import { ChangeCommandDefconRequestSchema, CommandDefconLevelSchema, CommandReadinessSnapshotSchema } from './command-defcon.js';

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

test('public instructions are trimmed, bounded and can be explicitly cleared', () => {
  const change = { level: 4, reason: 'Interní zápis', expectedRevision: 3 };
  assert.equal(ChangeCommandDefconRequestSchema.parse({ ...change, publicMessage: '  Přesuňte poradu  ' }).publicMessage, 'Přesuňte poradu');
  assert.equal(ChangeCommandDefconRequestSchema.parse({ ...change, publicMessage: '  ' }).publicMessage, '');
  assert.equal(ChangeCommandDefconRequestSchema.safeParse({ ...change, publicMessage: 'a'.repeat(401) }).success, false);
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertParticipantWriteAllowed, isActiveDisruption, resolveDisruption } from './disruption-policy.js';
import type { ExerciseDisruption } from '@cyris/db';

const row = (values: Partial<ExerciseDisruption>): ExerciseDisruption => ({
  id: '00000000-0000-0000-0000-000000000001',
  eventId: '00000000-0000-0000-0000-000000000010',
  targetType: 'EVENT',
  targetId: null,
  module: 'tasks',
  mode: 'READ_ONLY',
  startsAt: new Date('2026-01-01T00:00:00Z'),
  expiresAt: null,
  reason: 'exercise',
  revision: 1,
  restoredAt: null,
  restoredByUserId: null,
  createdByUserId: '00000000-0000-0000-0000-000000000020',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...values,
});

describe('disruption policy', () => {
  it('resolves specificity, then newest start, then stable id', () => {
    const event = row({ id: '00000000-0000-0000-0000-000000000001' });
    const unit = row({ id: '00000000-0000-0000-0000-000000000002', targetType: 'UNIT', targetId: '00000000-0000-0000-0000-000000000030' });
    const user = row({ id: '00000000-0000-0000-0000-000000000003', targetType: 'USER', targetId: '00000000-0000-0000-0000-000000000040' });
    assert.equal(resolveDisruption([event, unit, user], new Date('2026-02-01T00:00:00Z'), user.targetId!, unit.targetId)?.id, user.id);
    assert.equal(resolveDisruption([event, unit], new Date('2026-02-01T00:00:00Z'), user.targetId!, unit.targetId)?.id, unit.id);
  });

  it('does not resolve expired or restored rows', () => {
    assert.equal(isActiveDisruption(row({ expiresAt: new Date('2026-01-02T00:00:00Z') }), new Date('2026-01-01T12:00:00Z')), true);
    assert.equal(isActiveDisruption(row({ expiresAt: new Date('2026-01-02T00:00:00Z') }), new Date('2026-02-03T00:00:00Z')), false);
    assert.equal(isActiveDisruption(row({ restoredAt: new Date('2026-01-01T12:00:00Z') }), new Date('2026-02-01T00:00:00Z')), false);
  });

  it('blocks unavailable and read-only writes but permits degraded mode', () => {
    assert.throws(() => assertParticipantWriteAllowed(row({ mode: 'UNAVAILABLE' })));
    assert.throws(() => assertParticipantWriteAllowed(row({ mode: 'READ_ONLY' })));
    assert.doesNotThrow(() => assertParticipantWriteAllowed(row({ mode: 'DEGRADED' })));
    assert.doesNotThrow(() => assertParticipantWriteAllowed(null));
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isVisibleToParticipant, projectServiceImpact, resolveServiceStatusState } from './service-status-policy.js';

const source = (overrides: Partial<Parameters<typeof resolveServiceStatusState>[0]> = {}) => ({
  module: 'tasks',
  mode: 'UNAVAILABLE',
  startsAt: new Date('2026-01-01T10:00:00.000Z'),
  expiresAt: null,
  restoredAt: null,
  revision: 1,
  reason: 'synthetic exercise notice',
  ...overrides,
});

describe('service status policy', () => {
  it('keeps planned, active, expired and restored states distinct', () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    assert.equal(resolveServiceStatusState(source({ startsAt: new Date('2026-01-01T13:00:00.000Z') }), now), 'PLANNED');
    assert.equal(resolveServiceStatusState(source(), now), 'ACTIVE');
    assert.equal(resolveServiceStatusState(source({ expiresAt: new Date('2026-01-01T11:00:00.000Z') }), now), 'EXPIRED');
    assert.equal(resolveServiceStatusState(source({ restoredAt: new Date('2026-01-01T11:30:00.000Z') }), now), 'RESTORED');
  });

  it('does not expose reason through participant impact projection', () => {
    assert.equal(projectServiceImpact(null), 'NONE');
    assert.equal(projectServiceImpact(source({ mode: 'READ_ONLY' })), 'READ_ONLY');
  });

  it('requires event, user or assigned unit scope', () => {
    assert.equal(isVisibleToParticipant('EVENT', null, 'user-1', new Set()), true);
    assert.equal(isVisibleToParticipant('USER', 'user-1', 'user-1', new Set()), true);
    assert.equal(isVisibleToParticipant('USER', 'user-2', 'user-1', new Set()), false);
    assert.equal(isVisibleToParticipant('UNIT', 'unit-1', 'user-1', new Set(['unit-1'])), true);
    assert.equal(isVisibleToParticipant('UNIT', 'unit-2', 'user-1', new Set(['unit-1'])), false);
  });
});

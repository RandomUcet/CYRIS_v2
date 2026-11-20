import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { publicReadinessChanged } from './team-displays.js';
import { acceptDefconSnapshot } from './defcon-live.js';
import type { CommandDefconSnapshot } from '@cyris/contracts';

const snapshot = (eventId: string, revision: number): CommandDefconSnapshot => ({
  eventId,
  level: 3,
  initialized: true,
  revision,
  reason: 'exercise',
  updatedByUserId: null,
  updatedAt: new Date().toISOString(),
  history: [],
});

describe('DEFCON live snapshot fallback', () => {
  it('rejects snapshots from another event and older revisions', () => {
    const current = snapshot('00000000-0000-0000-0000-000000000001', 3);
    assert.equal(acceptDefconSnapshot(current, snapshot('00000000-0000-0000-0000-000000000002', 4), current.eventId), current);
    assert.equal(acceptDefconSnapshot(current, snapshot(current.eventId, 2), current.eventId), current);
  });

  it('accepts equal/newer revisions and preserves an explicit unknown snapshot', () => {
    const current = snapshot('00000000-0000-0000-0000-000000000001', 3);
    const next = snapshot(current.eventId, 4);
    assert.equal(acceptDefconSnapshot(current, next, current.eventId), next);
    const unknown = { ...next, initialized: false, level: null, revision: 0 };
    assert.equal(acceptDefconSnapshot(null, unknown, current.eventId)?.initialized, false);
  });
});

describe('team display alerts', () => {
  const state = snapshot('00000000-0000-0000-0000-000000000001', 6);
  it('only alerts for a newer public revision of the same exercise', () => {
    assert.equal(publicReadinessChanged(null, state), false);
    assert.equal(publicReadinessChanged(state, null), false);
    assert.equal(publicReadinessChanged(state, { ...state }), false);
    assert.equal(publicReadinessChanged(state, { ...state, revision: 5 }), false);
    assert.equal(publicReadinessChanged(state, { ...state, eventId: 'other', revision: 7 }), false);
    assert.equal(publicReadinessChanged(state, { ...state, revision: 7, publicMessage: 'Nový pokyn' }), true);
  });
  it('catches a change and return to the same level between polls', () => {
    assert.equal(publicReadinessChanged(state, { ...state, revision: 8 }), true);
  });
});

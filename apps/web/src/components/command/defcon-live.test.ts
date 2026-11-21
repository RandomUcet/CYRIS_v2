import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defconLevelChanged, publicReadinessChanged } from './team-displays.js';
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

describe('DEFCON audio alerts', () => {
  const eventId = '00000000-0000-0000-0000-000000000001';
  const before = snapshot(eventId, 7);
  it('ignores initial load, re-enable, reconnect and unchanged snapshots', () => {
    assert.equal(defconLevelChanged(null, before), false);
    assert.equal(defconLevelChanged(before, before), false);
    assert.equal(defconLevelChanged(before, { ...before }), false);
    assert.equal(defconLevelChanged(before, { ...before, revision: 8, publicMessage: 'New bulletin' }), false);
    assert.equal(defconLevelChanged(before, { ...before, revision: 8, level: 3 }), false);
    assert.equal(defconLevelChanged(before, { ...before, revision: 6, level: 2 }), false);
  });
  it('only alerts to a confirmed new level in the same event', () => {
    assert.equal(defconLevelChanged(before, { ...before, revision: 8, level: 2 }), true);
    assert.equal(defconLevelChanged(before, { ...before, revision: 8, level: 4, eventId: 'another-event' }), false);
    assert.equal(defconLevelChanged({ ...before, level: null, initialized: false }, { ...before, revision: 8, level: 2 }), false);
    assert.equal(defconLevelChanged(before, { ...before, revision: 8, level: null, initialized: false }), false);
    // A change and return between polling snapshots is not observable without history.
    assert.equal(defconLevelChanged(before, { ...before, revision: 9, level: before.level }), false);
  });
});

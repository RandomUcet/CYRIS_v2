import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { holdIsActive, holdTargetsUser, operationHoldModules, shouldBlockHold } from './hold-policy.js';

const now = new Date('2026-11-21T12:00:00.000Z');
const row = {
  startsAt: new Date('2026-11-21T11:00:00.000Z'),
  expiresAt: null, restoredAt: null,
  targetType: 'EVENT', targetId: null, module: 'ALL',
};

describe('administrative operational holds (not simulated disruptions)', () => {
  it('honours active windows, restoration and scope', () => {
    assert.equal(holdIsActive(row, now), true);
    assert.equal(holdIsActive({ ...row, restoredAt: now }, now), false);
    assert.equal(holdIsActive({ ...row, expiresAt: now }, now), false);
    assert.equal(holdIsActive({ ...row, startsAt: new Date('2026-11-21T13:00:00Z') }, now), false);
    assert.equal(holdTargetsUser({ targetType: 'EVENT', targetId: null }, 'alice', new Set()), true);
    assert.equal(holdTargetsUser({ targetType: 'UNIT', targetId: 'blue' }, 'alice', new Set(['red'])), false);
    assert.equal(holdTargetsUser({ targetType: 'UNIT', targetId: 'blue' }, 'alice', new Set(['blue'])), true);
    assert.equal(holdTargetsUser({ targetType: 'USER', targetId: 'bob' }, 'alice', new Set()), false);
    assert.equal(holdTargetsUser({ targetType: 'USER', targetId: 'alice' }, 'alice', new Set()), true);
  });
  it('blocks writes and uploads but never read-only navigation or operator unlock', () => {
    assert.deepEqual(operationHoldModules('/events/:eventId/medical', 'POST'), { eventRoute: true, modules: ['medical'] });
    assert.deepEqual(operationHoldModules('/events/:eventId/registry/:id/primary-media', 'POST'), { eventRoute: true, modules: ['registry'] });
    assert.deepEqual(operationHoldModules('/events/:eventId/command/defcon', 'POST'), { eventRoute: true, modules: ['command'] });
    assert.deepEqual(operationHoldModules('/events/:eventId/scenario-data/:batchId/publish', 'POST'), { eventRoute: true, modules: ['scenario', 'registry'] });
    assert.equal(operationHoldModules('/events/:eventId/medical', 'GET'), null);
    assert.deepEqual(operationHoldModules('/events/:eventId/disruptions', 'POST'), { eventRoute: true, modules: [] });
    assert.equal(operationHoldModules('/events/:eventId/support', 'POST'), null);
    assert.equal(operationHoldModules('/events/:eventId/operational-holds/:holdId/restore', 'POST'), null);
    assert.equal(operationHoldModules('/health/ready', 'POST'), null);
  });
  it('does not treat a module hold as a global hold', () => {
    assert.equal(shouldBlockHold([{ ...row, module: 'medical' }], 'alice', new Set(), ['registry'], now), false);
    assert.equal(shouldBlockHold([{ ...row, module: 'medical' }], 'alice', new Set(), ['medical'], now), true);
    assert.equal(shouldBlockHold([row], 'alice', new Set(), [], now), true);
    assert.equal(shouldBlockHold([{ ...row, targetType: 'USER', targetId: 'bob' }], 'alice', new Set(), ['medical'], now), false);
    assert.equal(shouldBlockHold([{ ...row, restoredAt: now }], 'alice', new Set(), ['medical'], now), false);
  });
});

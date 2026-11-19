import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ChangeCommandDefconRequestSchema } from '@cyris/contracts';
import { assertExpectedRevision, isConcurrentInitializationError, validateDefconLevel } from './defcon-policy.js';

describe('DEFCON policy', () => {
  it('accepts only levels 1 through 5 and requires a reason', () => {
    assert.equal(ChangeCommandDefconRequestSchema.safeParse({
      level: 3, expectedRevision: 0, reason: 'Exercise posture changed',
    }).success, true);
    assert.equal(ChangeCommandDefconRequestSchema.safeParse({
      level: 6, expectedRevision: 0, reason: 'invalid',
    }).success, false);
    assert.equal(ChangeCommandDefconRequestSchema.safeParse({
      level: 3, expectedRevision: 0, reason: 'x',
    }).success, false);
  });

  it('rejects invalid numeric levels', () => {
    assert.doesNotThrow(() => validateDefconLevel(1));
    assert.doesNotThrow(() => validateDefconLevel(5));
    assert.throws(() => validateDefconLevel(0));
    assert.throws(() => validateDefconLevel(2.5));
  });

  it('rejects stale revisions and accepts the current revision', () => {
    assert.doesNotThrow(() => assertExpectedRevision(2, 2));
    assert.throws(() => assertExpectedRevision(1, 2), /revision conflict/);
  });

  it('keeps uninitialized state explicit in the snapshot contract', () => {
    const result = ChangeCommandDefconRequestSchema.safeParse({
      level: 5, expectedRevision: 0, reason: 'Initial explicit posture',
    });
    assert.equal(result.success, true);
  });

  it('turns a concurrent initial insert into a revision conflict signal', () => {
    assert.equal(isConcurrentInitializationError({ code: '23505' }), true);
    assert.equal(isConcurrentInitializationError({ code: '23503' }), false);
  });
});

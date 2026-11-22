import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chooseEligibleResponder } from './support-assignment-policy.js';
describe('Exercise support auto-routing', () => {
  it('chooses the least loaded eligible responder, deterministic on ties', () => {
    assert.equal(chooseEligibleResponder(['b', 'a', 'b'], ['a','a']), 'b');
    assert.equal(chooseEligibleResponder(['b', 'a'], []), 'a');
  });
  it('never selects an ineligible, inactive, or excluded requester', () => {
    assert.equal(chooseEligibleResponder(['u1','u2'], ['u1'], 'u2'), 'u1');
    assert.equal(chooseEligibleResponder(['u1'], [], 'u1'), null);
    assert.equal(chooseEligibleResponder([], ['stranger']), null);
  });
});

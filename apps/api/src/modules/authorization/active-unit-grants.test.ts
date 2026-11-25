import {test} from 'node:test';
import assert from 'node:assert/strict';
import {activeUnitGrant} from './active-unit-grants.js';
test('detached or archived team roles cease to grant permissions',()=>{
  const units=new Set(['active-unit']);
  assert.equal(activeUnitGrant(null,units),true);
  assert.equal(activeUnitGrant('active-unit',units),true);
  assert.equal(activeUnitGrant('removed-unit',units),false);
  assert.equal(activeUnitGrant('archived-unit',new Set()),false);
});

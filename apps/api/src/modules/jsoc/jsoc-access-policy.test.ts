import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canAccessSimulatedTelemetry as allow} from './jsoc-access-policy.js';
test('EXCON can prepare and read simulated telemetry',()=>{
  assert.equal(allow(true,false,false),true);
});
test('technical membership does not bypass forensics permission',()=>{
  assert.equal(allow(false,true,false),false);
  assert.equal(allow(false,true,true),true);
});
test('crisis team or generic forensic grant alone does not reveal JSOC logs',()=>{
  assert.equal(allow(false,false,false),false);
  assert.equal(allow(false,false,true),false);
});

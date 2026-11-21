import assert from 'node:assert/strict';
import {test} from 'node:test';
import {checkVersion} from './check-version.mjs';
test('release manifests match the single VERSION identifier',()=>{
  const result=checkVersion();
  assert.equal(result.version,'2.1.0-rc.3');
  assert.ok(result.checked>=8);
});

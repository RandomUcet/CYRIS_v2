import assert from 'node:assert/strict';
import {test} from 'node:test';
import {checkVersion} from './check-version.mjs';
test('release manifests match the single VERSION identifier',()=>{
  const result=checkVersion();
  assert.match(result.version,/^\d+\.\d+\.\d+$/);
  assert.ok(result.checked>=8);
});

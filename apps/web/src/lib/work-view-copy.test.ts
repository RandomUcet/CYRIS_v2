import test from 'node:test';
import assert from 'node:assert/strict';
import {workViewCopy} from './work-view-copy.js';
import {MyWorkViewSchema} from '@cyris/contracts';
test('every work view explains its scope and empty state in Czech and English',()=>{
 for(const cs of [true,false]){
  const values=MyWorkViewSchema.options.map(view=>workViewCopy(view,cs));
  assert.equal(new Set(values.map(v=>v.label)).size,5);
  assert.equal(new Set(values.map(v=>v.empty)).size,5);
  assert.ok(values.every(v=>v.description.length>20));
 }
});

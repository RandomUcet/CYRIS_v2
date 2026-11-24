import {test} from 'node:test';import assert from 'node:assert/strict';import {reconcileTablePage} from './table-interaction';
test('pagination resets even when returning to a previously visited filter',()=>{
 const a={key:'A',page:4};const b=reconcileTablePage(a,'B',10);assert.deepEqual(b,{key:'B',page:1});assert.deepEqual(reconcileTablePage(b,'A',10),{key:'A',page:1});
});
test('pagination clamps after deletions and does not jump back after rows return',()=>{
 const old={key:'A',page:5};const clamped=reconcileTablePage(old,'A',2);assert.deepEqual(clamped,{key:'A',page:2});assert.equal(reconcileTablePage(clamped,'A',9),clamped);
});

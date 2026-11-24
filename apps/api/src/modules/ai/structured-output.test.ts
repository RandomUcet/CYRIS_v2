import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseModelJson} from './structured-output.js';
test('strict JSON accepts bounded wrappers but never repairs incomplete or mixed content',()=>{
 const expected={setting:'fictional'};
 assert.deepEqual(parseModelJson(JSON.stringify(expected)),expected);
 assert.deepEqual(parseModelJson('<think>private</think>\n'+JSON.stringify(expected)),expected);
 assert.deepEqual(parseModelJson('```json\n'+JSON.stringify(expected)+'\n```'),expected);
 for(const bad of ['<think>unfinished','{"setting":','{} trailing','before {}','{} {}'])assert.throws(()=>parseModelJson(bad));
 assert.throws(()=>parseModelJson('{}',1));
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeChunks} from './write-chunks.js';
test('bounded database batches preserve order and every record',()=>{
  const rows=Array.from({length:12000},(_,i)=>i);
  const chunks=[...writeChunks(rows)];
  assert.equal(chunks.length,48);
  assert.deepEqual(chunks.flat(),rows);
  assert.deepEqual([...writeChunks([])],[]);
  assert.throws(()=>[...writeChunks(rows,0)],RangeError);
});

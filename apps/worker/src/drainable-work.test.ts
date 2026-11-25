import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DrainableWork} from './drainable-work.js';
test('shutdown refuses new work and waits for running asynchronous operation',async()=>{
  const work=new DrainableWork<number>();
  let release!:()=>void,started=0,closed=false;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const pending=work.run(async()=>{started++;await gate;return 7;},0);
  assert.equal(await work.run(async()=>99,0),0);
  const closing=work.close().then(()=>{closed=true;});
  assert.equal(await work.run(async()=>99,0),0);
  assert.equal(started,1);assert.equal(closed,false);
  release();assert.equal(await pending,7);await closing;
  assert.equal(closed,true);assert.equal(await work.run(async()=>99,0),0);
});
test('failed operation clears single-flight state',async()=>{
  const work=new DrainableWork<number>();
  await assert.rejects(work.run(async()=>{throw Error('failure');},0),/failure/);
  assert.equal(await work.run(async()=>3,0),3);
  await work.close();
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ExerciseBroadcastPlanResponse } from '@cyris/contracts';
import { broadcastComposerControls, copyBroadcastPlan, type BroadcastComposerState } from './broadcast-composer.js';

const ready: BroadcastComposerState = {
  readOnly:false,loading:false,sending:false,planBusy:false,editingDraft:false,
  eligible:4,audience:'ALL',unitId:'',title:'Exercise update',
  message:'Proceed to your team briefings.',
};

test('EXCON send-now is never enabled for a saved draft or concurrent plan update',()=>{
  assert.deepEqual(broadcastComposerControls(ready),{canSave:true,canSendNow:true});
  for (const key of ['readOnly','loading','sending','planBusy'] as const) {
    assert.deepEqual(broadcastComposerControls({...ready,[key]:true}),{canSave:false,canSendNow:false},key);
  }
  assert.deepEqual(broadcastComposerControls({...ready,editingDraft:true}),{canSave:true,canSendNow:false});
  assert.deepEqual(broadcastComposerControls({...ready,eligible:null}),{canSave:true,canSendNow:false});
  assert.deepEqual(broadcastComposerControls({...ready,eligible:0}),{canSave:true,canSendNow:false});
});

test('EXCON requires complete content and selected unit, matching server constraints',()=>{
  assert.equal(broadcastComposerControls({...ready,title:'ab'}).canSave,false);
  assert.equal(broadcastComposerControls({...ready,message:' x '}).canSave,false);
  assert.equal(broadcastComposerControls({...ready,title:'x'.repeat(121)}).canSave,false);
  assert.equal(broadcastComposerControls({...ready,message:'x'.repeat(901)}).canSave,false);
  assert.equal(broadcastComposerControls({...ready,audience:'UNIT',unitId:''}).canSave,false);
  assert.equal(broadcastComposerControls({...ready,audience:'UNIT',unitId:'unit'}).canSendNow,true);
});

test('copying any broadcast plan never carries plan identifiers or revisions',()=>{
  const plan={
    id:'original-plan',eventId:'original-event',revision:7,status:'FAILED',
    nonce:'unsafe-to-reuse',title:'Old warning',message:'Review new facts before sending',
    kind:'URGENT',audience:'UNIT',unitId:'team-1',
  } as unknown as ExerciseBroadcastPlanResponse;
  const copy=copyBroadcastPlan(plan);
  assert.deepEqual(copy,{
    title:'Old warning',message:'Review new facts before sending',
    kind:'URGENT',audience:'UNIT',unitId:'team-1',
  });
  assert.equal('id' in copy,false);
  assert.equal('revision' in copy,false);
  assert.equal('nonce' in copy,false);
  assert.deepEqual(copyBroadcastPlan({...plan,audience:'ALL'}).unitId,'');
});

import {test} from 'node:test';import assert from 'node:assert/strict';
import {exerciseSignals,validateExerciseDraft} from './exercise-intelligence-policy.js';
import type {ExconDashboardResponse} from '@cyris/contracts';
test('signals are source counts, not inferred causes',()=>{
 const s=exerciseSignals({broadcasts:{failed:2},participation:{urgentUnread:1,briefingReceipts:2,briefingsAcknowledged:5},injects:{blocked:1,ready:0}} as ExconDashboardResponse);
 assert.equal(s.find(x=>x.id==='failed-broadcasts')?.count,2);
 assert.equal(s.find(x=>x.id==='unacknowledged-briefings')?.count,0);
});
test('invalid, unknown-source and unexpected command outputs are rejected',()=>{
 const valid={summary:'Review delivery',actions:[{module:'EXCON',title:'Inspect',proposal:'Check delivery',reason:'Observed failure',signalIds:[]}],reviewNotes:[]};
 assert.deepEqual(validateExerciseDraft(JSON.stringify(valid),[]),valid);
 assert.throws(()=>validateExerciseDraft(JSON.stringify({...valid,actions:[{...valid.actions[0],signalIds:['invented']}]}),[]));
 assert.throws(()=>validateExerciseDraft(JSON.stringify({...valid,execute:true}),[]));
 assert.throws(()=>validateExerciseDraft('not JSON',[]));
});

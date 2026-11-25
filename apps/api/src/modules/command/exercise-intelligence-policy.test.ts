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

test('structured phase plans are restricted to one architect scenario action',()=>{const action={module:'SCENARIO',title:'Stages',proposal:'Draft timeline',reason:'Planning',signalIds:[],phasePlan:[{title:'Initial assessment',purpose:'Review inputs'}]};const draft={summary:'Plan',actions:[action],reviewNotes:[]};assert.deepEqual(validateExerciseDraft(JSON.stringify(draft),[],true),draft);assert.throws(()=>validateExerciseDraft(JSON.stringify(draft),[]));assert.throws(()=>validateExerciseDraft(JSON.stringify({...draft,actions:[{...action,module:'LEGAL'}]}),[],true));assert.throws(()=>validateExerciseDraft(JSON.stringify({...draft,actions:[action,action]}),[],true));});

test('team plans are limited to a single architect COMMAND action',()=>{const action={module:'COMMAND',title:'Teams',proposal:'Draft teams',reason:'Planning',signalIds:[],teamPlan:[{name:'Investigation',slug:'investigation',purpose:'Private planning'}]};const draft={summary:'Plan',actions:[action],reviewNotes:[]};assert.deepEqual(validateExerciseDraft(JSON.stringify(draft),[],true),draft);assert.throws(()=>validateExerciseDraft(JSON.stringify(draft),[]));assert.throws(()=>validateExerciseDraft(JSON.stringify({...draft,actions:[{...action,module:'SCENARIO'}]}),[],true));assert.throws(()=>validateExerciseDraft(JSON.stringify({...draft,actions:[action,action]}),[],true));assert.throws(()=>validateExerciseDraft(JSON.stringify({...draft,actions:[{...action,teamPlan:[{...action.teamPlan[0],roles:['admin']}]}]}),[],true));});

test('inject plans are private, separate, and only allowed with a saved architect blueprint',()=>{
 const a={module:'SCENARIO',title:'Injects',proposal:'Plan',reason:'Planning',signalIds:[],injectPlan:[{title:'Initial incident',purpose:'Observe team process'}]};
 const draft={summary:'Plan',actions:[a],reviewNotes:[]};
 assert.deepEqual(validateExerciseDraft(JSON.stringify(draft),[],true),draft);
 assert.throws(()=>validateExerciseDraft(JSON.stringify(draft),[]));
 assert.throws(()=>validateExerciseDraft(JSON.stringify({...draft,actions:[a,a]}),[],true));
 assert.throws(()=>validateExerciseDraft(JSON.stringify({...draft,actions:[{...a,phasePlan:[{title:'Phase',purpose:'Private'}]}]}),[],true));
 assert.throws(()=>validateExerciseDraft(JSON.stringify({...draft,actions:[{...a,injectPlan:[{...a.injectPlan[0],participantContent:'secret'}]}]}),[],true));
});

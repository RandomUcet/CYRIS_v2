import 'reflect-metadata';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ForbiddenException,BadGatewayException,ServiceUnavailableException,ConflictException} from '@nestjs/common';
import {ExerciseIntelligenceService} from './exercise-intelligence.service.js';
import type {ExconDashboardResponse} from '@cyris/contracts';

const eventId='12345678-1234-4123-8123-123456789abc';
const snapshot={asOf:'2026-11-24T18:00:00.000Z',event:{id:eventId,name:'Fixture',status:'ACTIVE',timezone:'Europe/Prague'},scenarioClock:{paused:false,mode:'REAL_TIME',scenarioTime:'2026-11-24T18:00:00.000Z',speedMultiplier:1},phases:{total:2,completed:0},injects:{blocked:1,ready:0},broadcasts:{failed:1},participation:{urgentUnread:0,briefingReceipts:0,briefingsAcknowledged:0},holds:{active:0,modules:[]}} as ExconDashboardResponse;
const actor={id:'organizer'} as any;
const input={mode:'ARCHITECT' as const,brief:'Exercise planning context',locale:'cs' as const};
const valid={summary:'Draft',actions:[{module:'EXCON',title:'Review',proposal:'Check delivery',reason:'Observed signal',signalIds:['failed-broadcasts']}],reviewNotes:[]};
function fixture(options:{denied?:boolean;revoke?:boolean;disabled?:boolean;invalid?:boolean}={}){
 let calls=0,checks=0;let request:any;
 const dashboard={overview:async()=>{checks++;if(options.denied||(options.revoke&&checks>1))throw new ForbiddenException();return snapshot;}};
 const gateway={getStatus:async()=>({configured:true,enabled:!options.disabled}),execute:async(params:any)=>{calls++;request=params;return {text:JSON.stringify(options.invalid?{...valid,execute:true}:valid),model:'spark-fixture',runId:'run-1',durationMs:100};}};
 const observer={read:async()=>null};
 const service=new ExerciseIntelligenceService({} as any,gateway as any,dashboard as any,observer as any,{overview:async()=>({current:null,history:[]})} as any);
 return {service,calls:()=>calls,request:()=>request};
}
test('organizer permission is checked before any AI inference; disabled Spark never falls back',async()=>{
 const denied=fixture({denied:true});await assert.rejects(denied.service.advise(eventId,actor,input),ForbiddenException);assert.equal(denied.calls(),0);
 const disabled=fixture({disabled:true});await assert.rejects(disabled.service.advise(eventId,actor,input),ServiceUnavailableException);assert.equal(disabled.calls(),0);
});
test('advice is draft-only, rejects unexpected output and rechecks access after inference',async()=>{
 const ok=fixture();const result=await ok.service.advise(eventId,actor,input);assert.equal(result.status,'DRAFT');assert.equal(result.runId,'run-1');assert.equal(ok.request().operationType,'EXERCISE_ARCHITECT');assert.ok(!ok.request().exclusiveScope.includes(input.brief));
 const invalid=fixture({invalid:true});await assert.rejects(invalid.service.advise(eventId,actor,input),BadGatewayException);
 const revoked=fixture({revoke:true});await assert.rejects(revoked.service.advise(eventId,actor,input),ForbiddenException);
});

test('stale blueprint revision is rejected before inference',async()=>{const f=fixture();await assert.rejects(f.service.advise(eventId,actor,{...input,blueprintRevision:1}),ConflictException);assert.equal(f.calls(),0);});

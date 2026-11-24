import {test} from 'node:test';import assert from 'node:assert/strict';
import {validObserverSample} from './exercise-observer-reader.service.js';
import type {ExconDashboardResponse} from '@cyris/contracts';
test('observer refuses foreign, stale, paused or held observations',()=>{
 const eventId='12345678-1234-4123-8123-123456789abc',now=Date.parse('2026-11-24T18:00:00Z');
 const snapshot={event:{id:eventId,name:'Fixture',status:'ACTIVE',timezone:'Europe/Prague'},scenarioClock:{paused:false,mode:'REAL_TIME',scenarioTime:new Date(now).toISOString(),speedMultiplier:1},holds:{active:0,modules:[]}} as Pick<ExconDashboardResponse,'event'|'scenarioClock'|'holds'>;
 const raw=JSON.stringify({eventId,observedAt:new Date(now).toISOString(),pending:3,reviewAfterHours:12,unchanged:2,blocked:1});
 assert.equal(validObserverSample(raw,snapshot,now)?.unchanged,2);
 assert.equal(validObserverSample(raw,snapshot,now+181000),null);
 assert.equal(validObserverSample(raw,{...snapshot,event:{...snapshot.event,id:'foreign'}},now),null);
 assert.equal(validObserverSample(raw,{...snapshot,scenarioClock:{...snapshot.scenarioClock,paused:true}},now),null);
 assert.equal(validObserverSample(raw,{...snapshot,holds:{active:1,modules:['tasks']}},now),null);
});

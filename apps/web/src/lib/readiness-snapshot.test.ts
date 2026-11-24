import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stableReadinessSnapshot} from './readiness-snapshot.js';
import type {CommandReadinessSnapshot} from '@cyris/contracts';
const last:CommandReadinessSnapshot={eventId:'event-a',level:3,revision:5,initialized:true,updatedAt:'2026-11-24T12:00:00Z',publicMessage:null};
test('unchanged DEFCON polling preserves identity and accepts changes',()=>{
 assert.equal(stableReadinessSnapshot(last,{...last}),last);
 assert.equal(stableReadinessSnapshot(last,{...last,revision:4,level:1}),last);
 const next={...last,revision:6,level:2 as const};assert.equal(stableReadinessSnapshot(last,next),next);
 const msg={...last,publicMessage:'Updated'};assert.equal(stableReadinessSnapshot(last,msg),msg);
 const other={...last,eventId:'event-b'};assert.equal(stableReadinessSnapshot(last,other),other);
});

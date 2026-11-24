import {test} from 'node:test';import assert from 'node:assert/strict';import {formatSimulatedLog} from './jsoc-reference';
test('copy includes exercise-only notice, stable IDs and UTC context',()=>{
 const text=formatSimulatedLog({id:'record-1',eventId:'exercise-1',observedAt:'2026-01-01T12:00:00.000Z',createdAt:'2026-01-01T12:00:00.000Z',category:'DNS',severity:'HIGH',source:'training-dns',message:'Simulated anomaly',sourceAddress:'192.0.2.1',destinationAddress:null,scenario:'DNS exercise'});
 for(const value of ['SIMULACE / EXERCISE ONLY','exercise-1','record-1','2026-01-01T12:00:00.000Z','192.0.2.1','Destination IP (documentation): —','DNS exercise'])assert.ok(text.includes(value));
});

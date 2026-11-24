import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {CourtRequestItem} from '@cyris/contracts';
import {legalRequestQueue,legalRequestCounts,requestOverdue} from './legal-request-queue.js';
const now=Date.parse('2026-11-24T12:00:00Z');
const row=(subject:string,status:CourtRequestItem['status'],dueAt:string|null,kind:CourtRequestItem['kind']='EVIDENCE')=>({subject,status,dueAt,kind,createdAt:'2026-11-23T12:00:00Z',details:'Znalecký posudek',response:null,requestedFromUnitId:null});
const rows=[row('Uzavřená','FULFILLED','2026-11-20T12:00:00Z'),row('Čeká','OPEN',null),row('Důkaz','IN_PROGRESS','2026-11-24T10:00:00Z'),row('Zpráva','OPEN','2026-11-25T10:00:00Z','MEDICAL_REPORT')];
test('legal request queue prioritizes overdue pending items, not completed cases',()=>{
 assert.equal(requestOverdue(rows[0]!,now),false);
 assert.deepEqual(legalRequestCounts(rows,now),{total:4,pending:3,overdue:1,fulfilled:1});
 assert.deepEqual(legalRequestQueue(rows,{status:'ALL',kind:'ALL',query:'',deadline:'ALL'},now).map(r=>r.subject),['Důkaz','Zpráva','Čeká','Uzavřená']);
});
test('filters by pending status, deadline, material and accent-insensitive text',()=>{
 assert.deepEqual(legalRequestQueue(rows,{status:'PENDING',kind:'ALL',query:'dukaz znalecky',deadline:'OVERDUE'},now),[rows[2]]);
 assert.deepEqual(legalRequestQueue(rows,{status:'ALL',kind:'MEDICAL_REPORT',query:'',deadline:'ALL'},now),[rows[3]]);
});

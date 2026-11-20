import assert from 'node:assert/strict';
import {test} from 'node:test';
import {supportVisibility,nextSupportReply} from './support-policy.js';
import {CreateSupportRequestSchema,SupportMessageInputSchema} from '@cyris/contracts';
test('participants cannot read another requester’s conversation',()=>{
 assert.equal(supportVisibility(false,'a','b'),false);
 assert.equal(supportVisibility(false,'a','a'),true);
 assert.equal(supportVisibility(true,'a','b'),true);
});
test('EXCON answers a request, participant follow-up returns it to open',()=>{
 assert.deepEqual(nextSupportReply('OPEN',true,'excon','student'),{authorKind:'EXCON',status:'ANSWERED'});
 assert.deepEqual(nextSupportReply('ANSWERED',false,'student','student'),{authorKind:'PARTICIPANT',status:'OPEN'});
 assert.equal(nextSupportReply('RESOLVED',true,'excon','student'),null);
 assert.equal(nextSupportReply('OPEN',false,'stranger','student'),null);
});
test('support payloads do not accept arbitrary owner, state or revision',()=>{
 const parsed=CreateSupportRequestSchema.parse({category:'TASK',subject:'Help',body:'Question',requesterId:'forged',status:'RESOLVED'});
 assert.deepEqual(parsed,{category:'TASK',subject:'Help',body:'Question'});
 assert.equal(SupportMessageInputSchema.safeParse({body:'reply',expectedRevision:0}).success,false);
 assert.equal(CreateSupportRequestSchema.safeParse({category:'TASK',subject:'hi',body:' '}).success,false);
});

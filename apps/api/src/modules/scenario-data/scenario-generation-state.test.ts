import {test} from 'node:test';import assert from 'node:assert/strict';
import {queuedGeneration,finishGenerationPage,failGenerationPage,expireGeneration,generationView,type GenerationJob} from './scenario-generation-state.js';
test('generation can pause, resume per page, expire claims and retry capacity only',()=>{
 const queued=queuedGeneration('actor',1000);const running:GenerationJob={...queued,state:'RUNNING',attempts:1,token:'secret',leaseUntil:2000};
 assert.equal(finishGenerationPage(running,false,2000).state,'QUEUED');
 assert.equal(finishGenerationPage({...running,pauseRequested:true},false,2000).state,'PAUSED');
 assert.equal(finishGenerationPage(running,true,2000).state,'COMPLETED');
 assert.equal(failGenerationPage(running,'CAPACITY',2000).availableAt,32000);
 assert.equal(failGenerationPage({...running,attempts:3},'CAPACITY',2000).state,'FAILED');
 assert.equal(failGenerationPage(running,'INVALID_OUTPUT',2000).state,'FAILED');
 assert.equal(expireGeneration(running,3000).state,'INTERRUPTED');
 assert.ok(!('token' in generationView(running)));assert.ok(!('actorId' in generationView(running)));
});

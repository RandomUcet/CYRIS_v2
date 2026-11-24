import 'reflect-metadata';
import {test} from 'node:test';import assert from 'node:assert/strict';
import {ConflictException,BadRequestException,ForbiddenException} from '@nestjs/common';
import {applyAdviceReview,ExerciseAdviceStore} from './exercise-advice-store.service.js';
const actor='12345678-1234-4123-8123-123456789abc',now='2026-11-24T18:00:00.000Z';
test('review modifies only the selected action and refuses stale revisions',()=>{
 const input={actionIndex:0,expectedRevision:1,decision:'ACCEPTED' as const,note:'Reviewed'};
 const first=applyAdviceReview([],2,input,1,actor,now);
 assert.equal(first[0]?.decision,'ACCEPTED');
 const second=applyAdviceReview(first,2,{...input,actionIndex:1,expectedRevision:2,decision:'REJECTED'},2,actor,now);
 assert.equal(second.length,2);assert.equal(second[0]?.decision,'ACCEPTED');assert.equal(second[1]?.decision,'REJECTED');
 assert.throws(()=>applyAdviceReview(second,2,input,3,actor,now),ConflictException);
 assert.throws(()=>applyAdviceReview([],1,{...input,actionIndex:1},1,actor,now),BadRequestException);
});
test('participant cannot access review store before authorization',async()=>{
 const svc=new ExerciseAdviceStore({} as any,{assertAuthorized:async()=>{throw new ForbiddenException();}} as any,{} as any);
 await assert.rejects(svc.list('event',{id:actor} as any),ForbiddenException);
 await assert.rejects(svc.review('event','run',{id:actor} as any,{} as any),ForbiddenException);
});

import {ExerciseAdviceHandoffInputSchema} from '@cyris/contracts';
test('handoff requires fresh explicit team wording and safety confirmation',()=>{
 const data={actionIndex:0,expectedRevision:2,unitId:actor,title:'Review leads',message:'Review your list of leads.',confirmedSafe:true};
 assert.ok(ExerciseAdviceHandoffInputSchema.safeParse(data).success);
 for(const invalid of [{...data,confirmedSafe:false},{...data,unitId:''},{...data,message:''},{...data,scheduledAt:now},{...data,audience:'ALL'}])assert.ok(!ExerciseAdviceHandoffInputSchema.safeParse(invalid).success);
});

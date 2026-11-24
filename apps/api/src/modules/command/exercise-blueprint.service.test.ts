import 'reflect-metadata';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ConflictException,ForbiddenException} from '@nestjs/common';
import {assertBlueprintRevision,ExerciseBlueprintService} from './exercise-blueprint.service.js';
import {ExerciseBlueprintInputSchema} from '@cyris/contracts';
test('blueprint rejects stale revisions and read-only exercises',()=>{
 assert.doesNotThrow(()=>assertBlueprintRevision(0,0,'DRAFT'));
 assert.throws(()=>assertBlueprintRevision(1,2,'ACTIVE'),ConflictException);
 assert.throws(()=>assertBlueprintRevision(2,2,'ARCHIVED'),ConflictException);
});
test('blueprint request is bounded and cannot smuggle execution instructions as fields',()=>{
 const valid={expectedRevision:0,title:'Scenario',brief:'Fictional incident briefing',objectives:'Review evidence',constraints:'No solutions',durationHours:48,reviewAfterHours:12};
 assert.ok(ExerciseBlueprintInputSchema.safeParse(valid).success);
 assert.ok(!ExerciseBlueprintInputSchema.safeParse({...valid,execute:true}).success);
 assert.ok(!ExerciseBlueprintInputSchema.safeParse({...valid,reviewAfterHours:0}).success);
});
test('permission is checked before reading or writing any blueprint',async()=>{
 const service=new ExerciseBlueprintService({} as any,{assertAuthorized:async()=>{throw new ForbiddenException();}} as any,{} as any);
 await assert.rejects(service.overview('event',{id:'student'} as any),ForbiddenException);
 await assert.rejects(service.save('event',{id:'student'} as any,{} as any),ForbiddenException);
});

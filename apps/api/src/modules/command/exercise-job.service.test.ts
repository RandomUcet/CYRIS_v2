import 'reflect-metadata';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {InferenceError} from '../ai/structured-output.js';
import {HttpException,ForbiddenException,ConflictException,BadGatewayException} from '@nestjs/common';
import {jobFailure,ExerciseJobService} from './exercise-job.service.js';
test('only known capacity failures are automatically retried, at most three attempts',()=>{
 assert.deepEqual(jobFailure(new HttpException('busy',429),1),{retry:true,code:'CAPACITY'});
 assert.deepEqual(jobFailure(new HttpException('busy',429),3),{retry:false,code:'CAPACITY'});
 assert.equal(jobFailure(new Error('timeout'),1).retry,false);
 assert.deepEqual(jobFailure(new InferenceError('TIMEOUT'),1),{retry:false,code:'TIMEOUT'});
 assert.equal(jobFailure(new BadGatewayException(),1).code,'INVALID_OUTPUT');
 assert.equal(jobFailure(new ConflictException(),1).code,'CONTEXT_CHANGED');
 assert.equal(jobFailure(new ForbiddenException(),1).code,'ACCESS_REVOKED');
});
test('job APIs check permission before database access',async()=>{
 const svc=new ExerciseJobService({} as any,{assertAuthorized:async()=>{throw new ForbiddenException();}} as any,{} as any);
 await assert.rejects(svc.list('event',{} as any),ForbiddenException);
 await assert.rejects(svc.submit('event',{} as any,{} as any),ForbiddenException);
 await assert.rejects(svc.cancel('event','job',{} as any),ForbiddenException);
});

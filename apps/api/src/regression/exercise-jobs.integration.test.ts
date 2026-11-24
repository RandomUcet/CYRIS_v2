import 'reflect-metadata';
import assert from 'node:assert/strict';
import {ConflictException,ForbiddenException} from '@nestjs/common';
import {eq} from 'drizzle-orm';
import {getDbClient,closeDatabaseConnection,events,users,eventMemberships,roles,rolePermissions,roleAssignments,exerciseJobs,exerciseAdvice} from '@cyris/db';
import {generateId,Permissions} from '@cyris/shared';
import type {ExerciseAdviceResult,ExerciseJobSubmit} from '@cyris/contracts';
import {AuthorizationService} from '../modules/authorization/authorization.service.js';
import {AuditService} from '../modules/audit/audit.service.js';
import {ExerciseAdviceStore} from '../modules/command/exercise-advice-store.service.js';
import {ExerciseJobService} from '../modules/command/exercise-job.service.js';
import {requireVerifiedIsolatedDatabase,skipWithoutVerifiedDatabase} from './isolated-postgres-harness.js';

skipWithoutVerifiedDatabase('durable intelligence jobs are isolated, idempotent and fenced across dispatchers',async()=>{
 const db=getDbClient({url:requireVerifiedIsolatedDatabase()!}),provider={client:db} as any;
 const auth=new AuthorizationService(provider),store=new ExerciseAdviceStore(provider,auth,new AuditService(provider));
 const eventId=generateId(),other=generateId(),organizer=generateId(),student=generateId(),role=generateId(),member=generateId();
 const actor={id:organizer,email:organizer+'@example.test',displayName:'Organizer',status:'ACTIVE'};
 const req:ExerciseJobSubmit={requestId:generateId(),input:{mode:'ARCHITECT',brief:'Private fictional exercise fixture',locale:'cs'}};
 const a=new ExerciseJobService(provider,auth,{} as any),b=new ExerciseJobService(provider,auth,{} as any);
 const result=(runId:string):ExerciseAdviceResult=>({eventId,runId,model:'fixture',durationMs:10,generatedAt:new Date().toISOString(),status:'DRAFT',mode:'ARCHITECT',blueprintRevision:null,summary:'Draft fixture',actions:[{module:'EXCON',title:'Review',proposal:'Review available leads',reason:'Fixture',signalIds:[]}],reviewNotes:[]});
 try{
  await db.insert(users).values([organizer,student].map(id=>({id,email:id+'@example.test',displayName:'Job fixture',status:'ACTIVE'})));
  await db.insert(events).values([{id:eventId,slug:eventId,name:'Job fixture',status:'ACTIVE'},{id:other,slug:other,name:'Foreign fixture',status:'ACTIVE'}]);
  await db.insert(eventMemberships).values([{id:member,eventId,userId:organizer,status:'ACTIVE'},{eventId,userId:student,status:'ACTIVE'}]);
  await db.insert(roles).values({id:role,eventId,name:'Organizer',slug:'job-organizer'});
  await db.insert(rolePermissions).values({roleId:role,permissionKey:Permissions.SCENARIO_MANAGE,scope:'EVENT'});
  await db.insert(roleAssignments).values({roleId:role,membershipId:member});
  await assert.rejects(a.submit(eventId,{...actor,id:student},req),ForbiddenException);
  await assert.rejects(a.list(other,actor),ForbiddenException);
  const [first,duplicate]=await Promise.all([a.submit(eventId,actor,req),b.submit(eventId,actor,req)]);
  assert.equal(first.id,duplicate.id);assert.equal(first.status,'QUEUED');assert.ok(!JSON.stringify(first).includes(req.input.brief));
  await assert.rejects(a.submit(eventId,actor,{...req,requestId:generateId()}),ConflictException);
  const claims=await Promise.all([a.claim(),b.claim()]);const claimed=claims.find(Boolean);
  assert.equal(claims.filter(Boolean).length,1);assert.equal(claimed?.id,first.id);
  await assert.rejects(a.cancel(eventId,first.id,actor),ConflictException);
  const runId=generateId();
  await assert.rejects(store.persist(actor,result(runId),new Date().toISOString(),[],{id:first.id,claimToken:generateId()}),ConflictException);
  assert.equal((await db.select().from(exerciseAdvice).where(eq(exerciseAdvice.runId,runId))).length,0);
  await store.persist(actor,result(runId),new Date().toISOString(),[],{id:first.id,claimToken:claimed!.claimToken!});
  const done=(await a.list(eventId,actor)).find(r=>r.id===first.id);assert.equal(done?.status,'SUCCEEDED');assert.equal(done?.resultRunId,runId);
  assert.equal((await db.select().from(exerciseJobs).where(eq(exerciseJobs.id,first.id)))[0]?.input,null);
  const second=await a.submit(eventId,actor,{...req,requestId:generateId()});
  const secondClaim=await b.claim();assert.equal(secondClaim?.id,second.id);
  await db.update(exerciseJobs).set({leaseUntil:new Date(Date.now()-1000)}).where(eq(exerciseJobs.id,second.id));
  assert.equal(await a.claim(),null);
  assert.equal((await a.list(eventId,actor)).find(r=>r.id===second.id)?.status,'INTERRUPTED');
  await assert.rejects(store.persist(actor,result(generateId()),new Date().toISOString(),[],{id:second.id,claimToken:secondClaim!.claimToken!}),ConflictException);
  const third=await a.submit(eventId,actor,{...req,requestId:generateId()});
  assert.equal((await b.cancel(eventId,third.id,actor)).status,'CANCELLED');
  assert.equal(await a.claim(),null);
  const fourth=await a.submit(eventId,actor,{...req,requestId:generateId()});
  await db.update(users).set({status:'DISABLED'}).where(eq(users.id,organizer));
  await b.tick();
  const [failed]=await db.select().from(exerciseJobs).where(eq(exerciseJobs.id,fourth.id));
  assert.equal(failed?.status,'FAILED');assert.equal(failed?.errorCode,'ACCESS_REVOKED');assert.equal(failed?.input,null);
 }finally{
  // Audit rows are immutable; the verified isolated database is discarded by CI.
  await closeDatabaseConnection();
 }
});

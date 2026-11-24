import 'reflect-metadata';
import assert from 'node:assert/strict';
import {ConflictException,ForbiddenException} from '@nestjs/common';
import {eq} from 'drizzle-orm';
import {getDbClient,closeDatabaseConnection,events,users,eventMemberships,roles,rolePermissions,roleAssignments,exerciseBlueprints,auditEvents} from '@cyris/db';
import {generateId,Permissions} from '@cyris/shared';
import {AuthorizationService} from '../modules/authorization/authorization.service.js';
import {AuditService} from '../modules/audit/audit.service.js';
import {ExerciseBlueprintService} from '../modules/command/exercise-blueprint.service.js';
import {requireVerifiedIsolatedDatabase,skipWithoutVerifiedDatabase} from './isolated-postgres-harness.js';
skipWithoutVerifiedDatabase('private exercise blueprint revisions are atomic, scoped and audited',async()=>{
 const db=getDbClient({url:requireVerifiedIsolatedDatabase()!}),provider={client:db} as any;
 const svc=new ExerciseBlueprintService(provider,new AuthorizationService(provider),new AuditService(provider));
 const eventId=generateId(),other=generateId(),organizer=generateId(),student=generateId(),role=generateId(),member=generateId();
 const actor={id:organizer,status:'ACTIVE'} as any;
 const input={expectedRevision:0,title:'Fictional exercise',brief:'SECRET PRIVATE BLUEPRINT FIXTURE',objectives:'Review leads',constraints:'No answers',durationHours:48,reviewAfterHours:6};
 try{
  await db.insert(users).values([organizer,student].map(id=>({id,email:id+'@example.test',displayName:'Blueprint fixture',status:'ACTIVE'})));
  await db.insert(events).values([{id:eventId,slug:eventId,name:'Blueprint A',status:'PREPARATION'},{id:other,slug:other,name:'Blueprint B',status:'ACTIVE'}]);
  await db.insert(eventMemberships).values([{id:member,eventId,userId:organizer,status:'ACTIVE'},{eventId,userId:student,status:'ACTIVE'}]);
  await db.insert(roles).values({id:role,eventId,name:'Blueprint organizer',slug:'blueprint-excon'});
  await db.insert(rolePermissions).values({roleId:role,permissionKey:Permissions.SCENARIO_MANAGE,scope:'EVENT'});
  await db.insert(roleAssignments).values({roleId:role,membershipId:member});
  await assert.rejects(svc.overview(eventId,{id:student,status:'ACTIVE'} as any),ForbiddenException);
  await assert.rejects(svc.overview(other,actor),ForbiddenException);
  assert.equal((await svc.overview(eventId,actor)).current,null);
  const first=await svc.save(eventId,actor,input);assert.equal(first.revision,1);
  const results=await Promise.allSettled([svc.save(eventId,actor,{...input,expectedRevision:1,title:'Revision A'}),svc.save(eventId,actor,{...input,expectedRevision:1,title:'Revision B'})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.filter(r=>r.status==='rejected'&&r.reason instanceof ConflictException).length,1);
  const saved=await svc.overview(eventId,actor);assert.equal(saved.current?.revision,2);assert.equal(saved.history.length,2);
  assert.equal((await db.select().from(exerciseBlueprints).where(eq(exerciseBlueprints.eventId,eventId))).length,2);
  const audits=await db.select().from(auditEvents).where(eq(auditEvents.eventId,eventId));
  assert.equal(audits.filter(a=>a.action==='exercise.blueprint.revised').length,2);assert.ok(!JSON.stringify(audits).includes(input.brief));
  await db.update(events).set({status:'CLOSED'}).where(eq(events.id,eventId));
  await assert.rejects(svc.save(eventId,actor,{...input,expectedRevision:2}),ConflictException);
 }finally{await closeDatabaseConnection();}
});

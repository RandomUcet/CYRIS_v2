import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  getDbClient, closeDatabaseConnection, events, resources, auditEvents, activityEvents,
} from '@cyris/db';
import { generateId } from '@cyris/shared';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { EventAfterActionService } from './event-after-action.service.js';
import { requireVerifiedIsolatedDatabase } from '../../regression/isolated-postgres-harness.js';

const isolatedUrl=requireVerifiedIsolatedDatabase();
test('admin UTC after-action metrics and partial cleanup preview remain tenant-scoped and read-only',{
  skip:!isolatedUrl && 'Requires an isolated PostgreSQL test database',
},async()=>{
  const db=getDbClient({url:isolatedUrl!,max:5});
  const eventA=generateId(),eventB=generateId(),adminId=generateId();
  const admin={id:adminId,email:'admin@test.invalid',status:'ACTIVE'} as AuthenticatedUser;
  const denied={id:generateId(),email:'denied@test.invalid',status:'ACTIVE'} as AuthenticatedUser;
  const authz={assertAuthorized:async({user}: {user:AuthenticatedUser})=>{
    if(user.id!==admin.id)throw new ForbiddenException('platform admin required');
  }};
  const service=new EventAfterActionService({client:db} as never,authz as never);
  try{
    await db.insert(events).values([
      {id:eventA,slug:eventA,name:'After Action Event A',status:'CLOSED'},
      {id:eventB,slug:eventB,name:'After Action Event B',status:'CLOSED'},
    ]);
    await db.insert(resources).values([
      {id:generateId(),eventId:eventA,resourceType:'device'},
      {id:generateId(),eventId:eventA,resourceType:'evidence'},
      {id:generateId(),eventId:eventB,resourceType:'device'},
    ]);
    await db.insert(auditEvents).values([
      {id:generateId(),eventId:eventA,action:'resource.read',category:'registry',outcome:'DENIED',
        occurredAt:new Date('2026-11-22T23:59:00Z')},
      {id:generateId(),eventId:eventA,action:'resource.create',category:'registry',outcome:'SUCCESS',
        occurredAt:new Date('2026-11-23T00:01:00Z')},
      {id:generateId(),eventId:eventB,action:'resource.create',category:'registry',outcome:'SUCCESS',
        occurredAt:new Date('2026-11-21T12:00:00Z')},
    ]);
    await db.insert(activityEvents).values([
      {id:generateId(),eventId:eventA,activityType:'registry.create',
        title:'Created record',occurredAt:new Date('2026-11-22T23:58:00Z')},
      {id:generateId(),eventId:eventB,activityType:'registry.create',
        title:'Other event activity',occurredAt:new Date('2026-11-21T12:02:00Z')},
    ]);
    await assert.rejects(()=>service.report(eventA,denied),ForbiddenException);
    await assert.rejects(()=>service.purgePreview(eventA,denied),ForbiddenException);
    await assert.rejects(()=>service.relationalPlan(eventA,denied),ForbiddenException);
    const plan=await service.relationalPlan(eventA,admin);
    assert.equal(plan.eventId,eventA);
    assert.equal(plan.relational.executable,false);
    assert.equal(plan.relational.tables.find(t=>t.table==='resources')?.count,2);
    assert.equal(plan.relational.auditRows,2);
    assert.equal(plan.relational.tables.find(t=>t.table==='events')?.reset,'KEEP');
    assert.equal(plan.relational.tables.find(t=>t.table==='events')?.remove,'DELETE');
    const report=await service.report(eventA,admin);
    assert.equal(report.eventId,eventA);
    assert.equal(report.auditEvents,2);
    assert.equal(report.operationalEvents,1);
    assert.equal(report.auditOutcomes.DENIED,1);
    assert.equal(report.auditOutcomes.SUCCESS,1);
    assert.equal(report.resources.device,1);
    assert.equal(report.resources.evidence,1);
    assert.deepEqual(report.dailyActivity,[
      {day:'2026-11-22',auditEvents:1,operationalEvents:1,denied:1,failures:0},
      {day:'2026-11-23',auditEvents:1,operationalEvents:0,denied:0,failures:0},
    ]);
    const preview=await service.purgePreview(eventA,admin,['device']);
    assert.equal(preview.executable,false);
    assert.equal(preview.selection.inventoryCoverage,'DATABASE_RESOURCES_ONLY');
    assert.equal(preview.selection.matchingResources,1);
    assert.equal(preview.retention.execution,'HOST_ONLY');
    assert.equal(preview.retention.eventSlug,eventA);
    assert.equal(preview.retention.inventory.resources,2);
    assert.equal(preview.retention.inventory.audit,2);
    for(const key of ['documentObjects','documentVersions','registryMedia','draftMedia','forensicStorageReferences','exerciseJobs','aiRuns'])assert.equal(preview.retention.inventory[key],0);
    assert.equal(preview.retention.notificationHistory,0);
    assert.equal(preview.retention.terminalManualTasks,0);
    assert.equal(preview.selection.unselectedResources,1);
    assert.deepEqual(preview.profiles.exerciseDataOnly.counts,{device:1});
    await assert.rejects(()=>service.purgePreview(eventA,admin,['other']),BadRequestException);
    const after=await service.report(eventA,admin);
    assert.equal(after.auditEvents,report.auditEvents);
    assert.equal(after.resources.evidence,1);
  }finally{
    await db.delete(auditEvents).where(eq(auditEvents.eventId,eventA)).catch(()=>undefined);
    await db.delete(auditEvents).where(eq(auditEvents.eventId,eventB)).catch(()=>undefined);
    await db.delete(events).where(eq(events.id,eventA)).catch(()=>undefined);
    await db.delete(events).where(eq(events.id,eventB)).catch(()=>undefined);
    await closeDatabaseConnection();
  }
});

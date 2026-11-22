import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { getDbClient, closeDatabaseConnection, events, eventMemberships,
  organizationalUnits, membershipUnitAssignments, users, resources, courtCases,
  courtRequests, roles, roleAssignments, rolePermissions, notifications } from '@cyris/db';
import { generateId, Permissions, PermissionScopes } from '@cyris/shared';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CourtRequestsService } from '../court/court-requests.service.js';
import { requireVerifiedIsolatedDatabase } from '../../regression/isolated-postgres-harness.js';

const url = requireVerifiedIsolatedDatabase();
test('formal prosecution/tribunal requests reject cross-event unit links and stale replies', {
  skip: !url && 'Requires verified disposable PostgreSQL',
}, async () => {
  const db=getDbClient({url:url!,max:5});
  const eventA=generateId(),eventB=generateId(),caseA=generateId(),otherResource=generateId();
  const requesterId=generateId(),responderId=generateId(),strangerId=generateId();
  const unitId=generateId(),wrongUnitId=generateId(),memberId=generateId(),responderRoleId=generateId();
  const actor=(id:string):AuthenticatedUser=>({id,status:'ACTIVE',email:id+'@example.test',
    displayName:id} as AuthenticatedUser);
  const requester=actor(requesterId),responder=actor(responderId),stranger=actor(strangerId);
  const database={client:db} as any;
  const authz={
    assertAuthorized:async({user,permission}:any)=>{
      if(![requesterId,responderId].includes(user.id) ||
        (permission===Permissions.COURT_REQUEST_CREATE&&user.id!==requesterId) ||
        (permission===Permissions.COURT_REQUEST_RESPOND&&user.id!==responderId))
        throw new ForbiddenException('Not authorised');
    },
    authorize:async({user,permission}:any)=>permission===Permissions.COURT_REQUEST_CREATE && user.id===requesterId,
  };
  const access={
    assertCanAccessResource:async(user:AuthenticatedUser,id:string)=>{
      if(id!==caseA||user.id===strangerId)throw new ForbiddenException('Restricted matter');
    },
    canAccessResource:async(user:AuthenticatedUser,id:string)=>
      id===caseA&&user.id!==strangerId,
  };
  const audit=new AuditService(database);
  const service=new CourtRequestsService(database,authz as any,access as any,audit);
  try {
    await db.insert(users).values([requester,responder,stranger].map(x=>({
      id:x.id,email:x.email,displayName:x.displayName,
    })));
    await db.insert(events).values([
      {id:eventA,name:'Legal Test A',slug:eventA},
      {id:eventB,name:'Legal Test B',slug:eventB},
    ]);
    await db.insert(organizationalUnits).values([
      {id:unitId,eventId:eventA,name:'Expert Office',slug:'expert'},
      {id:wrongUnitId,eventId:eventB,name:'Other Expert Office',slug:'other-expert'},
    ]);
    await db.insert(resources).values([
      {id:caseA,eventId:eventA,resourceType:'court_case'},
      {id:otherResource,eventId:eventB,resourceType:'document'},
    ]);
    await db.insert(courtCases).values({
      id:caseA,eventId:eventA,courtCaseNumber:'CRT-001',title:'Protected Court Matter',
    });
    await db.insert(eventMemberships).values({
      id:memberId,eventId:eventA,userId:responderId,status:'ACTIVE',
    });
    await db.insert(membershipUnitAssignments).values({
      id:generateId(),membershipId:memberId,unitId,
    });
    await db.insert(roles).values({
      id:responderRoleId,eventId:eventA,name:'Expert responder',slug:'expert-responder',
    });
    await db.insert(rolePermissions).values({
      id:generateId(),roleId:responderRoleId,permissionKey:Permissions.COURT_REQUEST_RESPOND,
      scope:PermissionScopes.EVENT,
    });
    await db.insert(roleAssignments).values({
      id:generateId(),roleId:responderRoleId,membershipId:memberId,
    });
    const input={
      kind:'EXPERT_OPINION' as const,subject:'Independent expert assessment',
      details:'Please assess the submitted simulated evidence.',
    };
    await assert.rejects(()=>service.create(eventA,caseA,{
      ...input,requestedFromUnitId:wrongUnitId,
    },requester),BadRequestException);
    await assert.rejects(()=>service.create(eventB,caseA,input,requester),NotFoundException);
    const created=await service.create(eventA,caseA,{
      ...input,requestedFromUnitId:unitId,
    },requester);
    assert.equal(created.status,'OPEN');
    const newAlerts=await db.select().from(notifications).where(eq(notifications.eventId,eventA));
    assert.equal(newAlerts.filter(row=>row.type==='COURT_REQUEST_CREATED').length,1);
    assert.equal(newAlerts[0]?.userId,responderId);
    assert.deepEqual(newAlerts[0]?.templateParams,{});
    assert.equal(newAlerts[0]?.actionUrl,'/events/'+eventA+'/court/'+caseA+'?tab=requests');
    assert.equal((await service.list(eventA,caseA,requester)).length,1);
    await assert.rejects(()=>service.reply(eventA,caseA,created.id,{
      expectedRevision:1,status:'FULFILLED',response:'Unauthorised reply',
    },requester),ForbiddenException);
    await assert.rejects(()=>service.reply(eventB,caseA,created.id,{
      expectedRevision:1,status:'FULFILLED',response:'Wrong exercise',
    },responder),NotFoundException);
    await assert.rejects(()=>service.reply(eventA,caseA,created.id,{
      expectedRevision:1,status:'FULFILLED',response:'Wrong evidence',
      linkedResourceId:otherResource,
    },responder),BadRequestException);
    const progress=await service.reply(eventA,caseA,created.id,{
      expectedRevision:1,status:'IN_PROGRESS',response:'Expert team is preparing the report.',
    },responder);
    assert.equal(progress.revision,2);
    assert.equal(progress.history.length,1);
    assert.equal(progress.history[0]?.status,'IN_PROGRESS');
    await assert.rejects(()=>service.reply(eventA,caseA,created.id,{
      expectedRevision:1,status:'DECLINED',response:'Stale pending update.',
    },responder),ConflictException);
    const returned=await service.reply(eventA,caseA,created.id,{
      expectedRevision:2,status:'FULFILLED',response:'Signed simulated expert opinion.',
    },responder);
    assert.equal(returned.revision,3);
    assert.deepEqual(returned.history.map(x=>x.status),['IN_PROGRESS','FULFILLED']);
    assert.equal(returned.history[0]?.response,'Expert team is preparing the report.');
    assert.equal(returned.respondedByUserId,responderId);
    const replyAlerts=await db.select().from(notifications).where(eq(notifications.eventId,eventA));
    assert.equal(replyAlerts.filter(row=>row.type==='COURT_REQUEST_RESPONDED').length,2);
    assert.ok(replyAlerts.filter(row=>row.type==='COURT_REQUEST_RESPONDED').every(row=>row.userId===requesterId));
    await assert.rejects(()=>service.reply(eventA,caseA,created.id,{
      expectedRevision:1,status:'FULFILLED',response:'Late, stale response.',
    },responder),ConflictException);
    assert.equal((await db.select().from(courtRequests)
      .where(and(eq(courtRequests.eventId,eventA),eq(courtRequests.id,created.id)))).length,1);
  } finally {
    await db.delete(events).where(eq(events.id,eventA)).catch(()=>undefined);
    await db.delete(events).where(eq(events.id,eventB)).catch(()=>undefined);
    await db.delete(users).where(eq(users.id,requesterId)).catch(()=>undefined);
    await db.delete(users).where(eq(users.id,responderId)).catch(()=>undefined);
    await db.delete(users).where(eq(users.id,strangerId)).catch(()=>undefined);
    await closeDatabaseConnection();
  }
});

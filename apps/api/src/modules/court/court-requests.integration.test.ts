import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { getDbClient, closeDatabaseConnection, events, eventMemberships,
  organizationalUnits, membershipUnitAssignments, users, resources, courtCases,
  courtRequests, type CyrisDatabase } from '@cyris/db';
import { generateId, Permissions } from '@cyris/shared';
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
  const unitId=generateId(),wrongUnitId=generateId(),memberId=generateId();
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
    const returned=await service.reply(eventA,caseA,created.id,{
      expectedRevision:1,status:'FULFILLED',response:'Signed simulated expert opinion.',
    },responder);
    assert.equal(returned.revision,2);
    assert.equal(returned.respondedByUserId,responderId);
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

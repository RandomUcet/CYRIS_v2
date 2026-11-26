import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { getDbClient, closeDatabaseConnection, events, eventMemberships,
  organizationalUnits, membershipUnitAssignments, users, resources, courtCases,
  courtRequests, roles, roleAssignments, rolePermissions, notifications, forensicAnalyses } from '@cyris/db';
import { generateId, Permissions, PermissionScopes } from '@cyris/shared';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CourtRequestsService } from '../court/court-requests.service.js';
import { listCourtWork } from './court-work.js';
import { requireVerifiedIsolatedDatabase } from '../../regression/isolated-postgres-harness.js';

const url = requireVerifiedIsolatedDatabase();
test('formal prosecution/tribunal requests reject cross-event unit links and stale replies', {
  skip: !url && 'Requires verified disposable PostgreSQL',
}, async () => {
  const db=getDbClient({url:url!,max:5});
  const eventA=generateId(),eventB=generateId(),caseA=generateId(),otherResource=generateId();
  const requesterId=generateId(),responderId=generateId(),strangerId=generateId();
  const reportId=generateId(),documentId=generateId();
  let requesterReportAccess=false;
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
    authorize:async({user,permission,context}:any)=>context?.eventId===eventA&&((permission===Permissions.COURT_REQUEST_CREATE&&user.id===requesterId)||(permission===Permissions.COURT_REQUEST_READ&&[requesterId,responderId].includes(user.id))||(permission===Permissions.COURT_REQUEST_RESPOND&&user.id===responderId)),
  };
  const access={
    assertCanAccessResource:async(user:AuthenticatedUser,id:string)=>{
      if(id!==caseA||user.id===strangerId)throw new ForbiddenException('Restricted matter');
    },
    canAccessResource:async(user:AuthenticatedUser,id:string)=>
      (id===caseA&&user.id!==strangerId)||(id===reportId&&(user.id===responderId||(user.id===requesterId&&requesterReportAccess)))||(id===documentId&&user.id===responderId),
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
      {id:reportId,eventId:eventA,resourceType:'forensic_analysis'},
      {id:documentId,eventId:eventA,resourceType:'document'},
    ]);
    await db.insert(forensicAnalyses).values({id:reportId,eventId:eventA,analysisNumber:'FOR-001',status:'COMPLETED',conclusion:'Fixture conclusion'});
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
      kind:'FORENSIC_REPORT' as const,subject:'Independent expert assessment',
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
    const work=(user:AuthenticatedUser,view:'personal'|'requested',event=eventA)=>listCourtWork(db,authz as any,access as any,event,user,view);
    assert.deepEqual((await work(responder,'personal')).map(x=>x.id),[created.id]);
    assert.deepEqual((await work(requester,'requested')).map(x=>x.id),[created.id]);
    assert.equal((await work(responder,'requested')).length,0);
    assert.equal((await work(requester,'personal')).length,0);
    assert.equal((await work(stranger,'personal')).length,0);
    assert.equal((await work(responder,'personal',eventB)).length,0);
    await db.delete(membershipUnitAssignments).where(eq(membershipUnitAssignments.membershipId,memberId));
    assert.equal((await work(responder,'personal')).length,0);
    await db.insert(membershipUnitAssignments).values({id:generateId(),membershipId:memberId,unitId});
    const newAlerts=await db.select().from(notifications).where(eq(notifications.eventId,eventA));
    assert.equal(newAlerts.filter(row=>row.type==='COURT_REQUEST_CREATED').length,1);
    assert.equal(newAlerts[0]?.userId,responderId);
    assert.deepEqual(newAlerts[0]?.templateParams,{});
    assert.equal(newAlerts[0]?.actionUrl,'/events/'+eventA+'/court/'+caseA+'?tab=requests');
    // Exercise the production notification ACL, not the mocked court service ACL.
    await db.insert(rolePermissions).values([Permissions.COURT_READ,Permissions.COURT_REQUEST_READ].map(permissionKey=>({id:generateId(),roleId:responderRoleId,permissionKey,scope:PermissionScopes.EVENT})));
    const inbox=new NotificationsService(database,{} as never,{} as never,{} as never,new AuthorizationService(database));
    const noticeId=newAlerts[0]!.id;
    assert.ok((await inbox.getNotifications(responderId,eventA)).newItems.some(x=>x.id===noticeId));
    const unrelatedId=generateId();
    await db.insert(notifications).values({id:unrelatedId,userId:responderId,eventId:eventA,type:'COURT_REQUEST_CREATED',templateKey:'court.request.created',resourceId:caseA,sourceEventId:generateId()});
    assert.ok(!(await inbox.getNotifications(responderId,eventA)).newItems.some(x=>x.id===unrelatedId));
    assert.equal((await inbox.markAllRead(responderId,eventA)).updatedCount,1);
    const [hiddenNotice]=await db.select().from(notifications).where(eq(notifications.id,unrelatedId));
    assert.equal(hiddenNotice?.readAt,null);
    await inbox.markRead(noticeId,responderId,false);
    await db.delete(membershipUnitAssignments).where(eq(membershipUnitAssignments.membershipId,memberId));
    try{
      assert.ok(!(await inbox.getNotifications(responderId,eventA)).newItems.some(x=>x.id===noticeId));
      await assert.rejects(inbox.markRead(noticeId,responderId),NotFoundException);
      await assert.rejects(inbox.dismiss(noticeId,responderId),NotFoundException);
    }finally{await db.insert(membershipUnitAssignments).values({id:generateId(),membershipId:memberId,unitId});}
    await db.delete(notifications).where(eq(notifications.id,unrelatedId));
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
    const deliver={expectedRevision:2,status:'FULFILLED' as const,response:'Signed simulated expert opinion.',linkedResourceId:reportId};
    await assert.rejects(()=>service.reply(eventA,caseA,created.id,{...deliver,linkedResourceId:documentId},responder),BadRequestException);
    await assert.rejects(()=>service.reply(eventA,caseA,created.id,deliver,responder),BadRequestException);
    await db.update(forensicAnalyses).set({status:'APPROVED',approvedAt:new Date()}).where(eq(forensicAnalyses.id,reportId));
    await assert.rejects(()=>service.reply(eventA,caseA,created.id,deliver,responder),ForbiddenException);
    requesterReportAccess=true;
    const returned=await service.reply(eventA,caseA,created.id,{
      expectedRevision:2,status:'FULFILLED',response:'Signed simulated expert opinion.',linkedResourceId:reportId,
    },responder);
    assert.equal(returned.revision,3);
    assert.equal((await work(responder,'personal')).length,0);
    assert.deepEqual((await work(requester,'requested')).map(x=>[x.id,x.status]),[[created.id,'FULFILLED']]);
    assert.deepEqual(returned.history.map(x=>x.status),['IN_PROGRESS','FULFILLED']);
    assert.equal(returned.history[0]?.response,'Expert team is preparing the report.');
    assert.equal(returned.respondedByUserId,responderId);
    assert.equal((await service.list(eventA,caseA,requester))[0]?.linkedResourceId,reportId);
    requesterReportAccess=false;
    const redacted=(await service.list(eventA,caseA,requester))[0]!;
    assert.equal(redacted.linkedResourceId,null);assert.equal(redacted.history.at(-1)?.linkedResourceId,null);
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

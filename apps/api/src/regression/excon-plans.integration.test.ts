import 'reflect-metadata';
import assert from 'node:assert/strict';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import {
  getDbClient, closeDatabaseConnection, dispatchDueExerciseBroadcasts, events, users,
  eventMemberships, organizationalUnits, membershipUnitAssignments,
  userPreferences, notifications, exerciseBroadcastPlans, operationalHolds, auditEvents,
} from '@cyris/db';
import { generateId } from '@cyris/shared';
import { ExerciseBroadcastPlansService } from '../modules/notifications/exercise-broadcast-plans.service.js';
import { AuditService } from '../modules/audit/audit.service.js';
import { requireVerifiedIsolatedDatabase, skipWithoutVerifiedDatabase } from './isolated-postgres-harness.js';

skipWithoutVerifiedDatabase('EXCON durable drafts and due-worker delivery obey roles, revocation, holds, audience and idempotency',async()=>{
  const db=getDbClient({url:requireVerifiedIsolatedDatabase()!});
  const database={client:db} as any;
  const audit=new AuditService(database);
  const eventId=generateId(), otherEvent=generateId(), unitId=generateId(), otherUnit=generateId();
  const admin=generateId(), alpha=generateId(), beta=generateId(), foreign=generateId();
  const actor={id:admin,status:'ACTIVE'} as any;
  const authz={assertAuthorized:async({user}:{user:{id:string}})=>{
    if(user.id!==admin)throw new ForbiddenException('No EXCON management permission');
  }};
  const service=new ExerciseBroadcastPlansService(database,authz as any,audit);
  const userIds=[admin,alpha,beta,foreign];
  try {
    await db.insert(users).values(userIds.map(id=>({id,email:id+'@test.invalid',displayName:'Plan test '+id.slice(0,5)})));
    await db.insert(events).values([
      {id:eventId,slug:eventId,name:'EXCON plans A',status:'PREPARATION'},
      {id:otherEvent,slug:otherEvent,name:'EXCON plans B',status:'ACTIVE'},
    ]);
    await db.insert(organizationalUnits).values([
      {id:unitId,eventId,slug:'alpha-team',name:'Alpha team'},
      {id:otherUnit,eventId:otherEvent,slug:'foreign-team',name:'Foreign team'},
    ]);
    const memberships=[
      {id:generateId(),userId:admin,eventId,status:'ACTIVE'},
      {id:generateId(),userId:alpha,eventId,status:'ACTIVE'},
      {id:generateId(),userId:beta,eventId,status:'ACTIVE'},
      {id:generateId(),userId:foreign,eventId:otherEvent,status:'ACTIVE'},
    ];
    await db.insert(eventMemberships).values(memberships);
    await db.insert(membershipUnitAssignments).values([
      {id:generateId(),membershipId:memberships[1]!.id,unitId},
      {id:generateId(),membershipId:memberships[2]!.id,unitId},
      {id:generateId(),membershipId:memberships[3]!.id,unitId:otherUnit},
    ]);
    await db.insert(userPreferences).values({userId:beta,notificationChannels:{inApp:false,email:false}});
    const make=(nonce=generateId())=>({nonce,audience:'UNIT' as const,unitId,kind:'INFO' as const,
      title:'Shift briefing',message:'Report operational status to the EXCON team.'});
    await assert.rejects(service.create(eventId,{id:alpha} as any,make()),ForbiddenException);
    await assert.rejects(service.create(eventId,actor,{...make(),unitId:otherUnit}),/Receiving team is unavailable/);
    const input=make();
    const draft=await service.create(eventId,actor,input,'EXCON_REQUEST_12345');
    assert.equal(draft.status,'DRAFT');
    assert.equal(draft.revision,1);
    assert.deepEqual(await service.create(eventId,actor,input),draft);
    await assert.rejects(service.create(eventId,actor,{...input,message:'Other message'}),ConflictException);
    await assert.rejects(service.revise(otherEvent,draft.id,actor,{...input,revision:1}),/Plan not found/);
    const updated=await service.revise(eventId,draft.id,actor,{
      ...input,revision:1,message:'Updated status report by 12:00.',
    });
    assert.equal(updated.revision,2);
    await assert.rejects(service.revise(eventId,draft.id,actor,{...input,revision:1}),ConflictException);
    const future=new Date(Date.now()+3600_000).toISOString();
    const schedule=await service.schedule(eventId,draft.id,actor,{revision:2,scheduledAt:future});
    assert.equal(schedule.status,'SCHEDULED');
    assert.equal(schedule.revision,3);
    await assert.rejects(service.cancel(otherEvent,draft.id,actor,{revision:3}),/Plan not found/);
    await assert.rejects(service.cancel(eventId,draft.id,actor,{revision:2}),ConflictException);

    // Worker's due-time clock can be controlled without waiting an hour.
    const due=new Date(Date.now()-1000);
    await db.update(exerciseBroadcastPlans).set({scheduledAt:due}).where(eq(exerciseBroadcastPlans.id,draft.id));
    // Never deliver in PREPARATION regardless of how overdue a plan is.
    assert.deepEqual(await dispatchDueExerciseBroadcasts(db,20,new Date()),{sent:0,failed:0,deferred:1});
    await db.update(events).set({status:'ACTIVE'}).where(eq(events.id,eventId));

    const holdId=generateId();
    await db.insert(operationalHolds).values({
      id:holdId,eventId,targetType:'EVENT',module:'ALL',reason:'Operator safety pause',
      startsAt:new Date(Date.now()-10000),createdByUserId:admin,
    });
    assert.equal((await dispatchDueExerciseBroadcasts(db,20,new Date())).deferred,1);
    assert.equal((await db.select().from(notifications).where(eq(notifications.sourceEventId,'exercise.broadcast:'+draft.id))).length,0);
    await db.update(operationalHolds).set({restoredAt:new Date()}).where(eq(operationalHolds.id,holdId));

    const outcome=await Promise.all([
      dispatchDueExerciseBroadcasts(db,20,new Date()),
      dispatchDueExerciseBroadcasts(db,20,new Date()),
    ]);
    assert.equal(outcome.reduce((n,r)=>n+r.sent,0),1);
    const receipts=await db.select().from(notifications).where(eq(notifications.sourceEventId,'exercise.broadcast:'+draft.id));
    assert.equal(receipts.length,1);
    assert.equal(receipts[0]!.userId,alpha);
    assert.equal(receipts[0]!.templateKey,'exercise.broadcast');
    assert.equal((await dispatchDueExerciseBroadcasts(db,20,new Date())).sent,0);
    const [sent]=await db.select().from(exerciseBroadcastPlans).where(eq(exerciseBroadcastPlans.id,draft.id));
    assert.equal(sent!.status,'SENT');assert.equal(sent!.deliveredCount,1);
    await assert.rejects(service.cancel(eventId,draft.id,actor,{revision:sent!.revision}),/already changed or delivered/);

    // Urgent broadcasts are mandatory (even for in-app opt-outs).
    const urgent=await service.create(eventId,actor,{...make(),kind:'URGENT',
      scheduledAt:new Date(Date.now()+3600_000).toISOString()});
    await db.update(exerciseBroadcastPlans).set({scheduledAt:due}).where(eq(exerciseBroadcastPlans.id,urgent.id));
    assert.equal((await dispatchDueExerciseBroadcasts(db)).sent,1);
    const urgentReceipts=await db.select().from(notifications).where(eq(notifications.sourceEventId,'exercise.broadcast:'+urgent.id));
    assert.deepEqual(urgentReceipts.map(r=>r.userId).sort(),[alpha,beta].sort());

    const toCancel=await service.create(eventId,actor,make());
    const cancelled=await service.cancel(eventId,toCancel.id,actor,{revision:1});
    assert.equal(cancelled.status,'CANCELLED');
    assert.equal((await db.select().from(exerciseBroadcastPlans).where(eq(exerciseBroadcastPlans.id,toCancel.id)))[0]!.status,'CANCELLED');

    const closed=await service.create(eventId,actor,{...make(),scheduledAt:new Date(Date.now()+3600_000).toISOString()});
    await db.update(exerciseBroadcastPlans).set({scheduledAt:due}).where(eq(exerciseBroadcastPlans.id,closed.id));
    await db.update(events).set({status:'CLOSED'}).where(eq(events.id,eventId));
    const failed=await dispatchDueExerciseBroadcasts(db);
    assert.equal(failed.failed,1);
    const [closedPlan]=await db.select().from(exerciseBroadcastPlans).where(eq(exerciseBroadcastPlans.id,closed.id));
    assert.equal(closedPlan!.failureCode,'EVENT_CLOSED');
    assert.equal((await db.select().from(notifications).where(eq(notifications.sourceEventId,'exercise.broadcast:'+closed.id))).length,0);

    const sentAudit=await db.select().from(auditEvents).where(and(
      eq(auditEvents.resourceId,draft.id),eq(auditEvents.action,'exercise.broadcast.scheduled.sent')));
    assert.equal(sentAudit.length,1);
    assert(sentAudit[0]?.metadata);
    assert.equal((await service.list(eventId,actor)).length,4);
    await assert.rejects(service.list(eventId,{id:alpha} as any),ForbiddenException);
    assert.equal((await db.select().from(notifications).where(eq(notifications.userId,foreign))).length,0);

    // A backlog from an exercise stuck in PREPARATION must not starve active
    // exercises when the worker asks for only five due schedules per tick.
    await db.update(events).set({status:'PREPARATION'}).where(eq(events.id,eventId));
    const overdue=new Date(Date.now()-60_000);
    await db.insert(exerciseBroadcastPlans).values(Array.from({length:25},(_,i)=>({
      id:generateId(),eventId,createdByUserId:admin,
      kind:'INFO',audience:'ALL',title:'Prepared briefing '+i,
      message:'Waiting for exercise activation.',
      status:'SCHEDULED',scheduledAt:overdue,
    })));
    const another=await service.create(otherEvent,actor,{
      nonce:generateId(),kind:'INFO',audience:'ALL',title:'Active exercise alert',
      message:'This exercise is already live.',
      scheduledAt:new Date(Date.now()+3600_000).toISOString(),
    });
    await db.update(exerciseBroadcastPlans).set({scheduledAt:new Date(Date.now()-30_000)})
      .where(eq(exerciseBroadcastPlans.id,another.id));
    const activeResult=await dispatchDueExerciseBroadcasts(db,5,new Date());
    assert.equal(activeResult.sent,1);
    const activeReceipts=await db.select().from(notifications)
      .where(eq(notifications.sourceEventId,'exercise.broadcast:'+another.id));
    assert.equal(activeReceipts.length,1);
    assert.equal(activeReceipts[0]!.userId,foreign);

  }finally{
    await closeDatabaseConnection();
  }
});

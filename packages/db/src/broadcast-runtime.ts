import { and, asc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { generateId } from '@cyris/shared';
import type { CyrisDatabase } from './client.js';
import {
  auditEvents, eventMemberships, events, exerciseBroadcastPlans, membershipUnitAssignments,
  notifications, organizationalUnits, outboxEvents, userPreferences, users, OutboxStatus,
} from './schema/index.js';
import { isOperationalAutoReleaseHeld } from './scenario-runtime.js';

type Tx = Parameters<Parameters<CyrisDatabase['transaction']>[0]>[0];
export type BroadcastAudience = 'ALL' | 'UNIT';
export type BroadcastKind = 'INFO' | 'UPDATE' | 'INSTRUCTION' | 'URGENT';
const MAX_AUDIENCE = 5000;
const sourcePrefix = 'exercise.broadcast:';

/** Same audience snapshot for immediate and scheduled messages. */
export async function selectExerciseBroadcastRecipients(
  tx: Tx | CyrisDatabase, eventId: string, audience: BroadcastAudience,
  unitId: string | null | undefined, kind: BroadcastKind,
): Promise<Array<{userId: string}>> {
  const rules = [eq(eventMemberships.eventId,eventId),eq(eventMemberships.status,'ACTIVE'),eq(users.status,'ACTIVE')];
  if(audience==='UNIT') {
    if(!unitId) throw new Error('UNIT_REQUIRED');
    rules.push(eq(membershipUnitAssignments.unitId,unitId));
    rules.push(isNull(organizationalUnits.archivedAt));
    rules.push(eq(organizationalUnits.eventId,eventId));
  }
  if(kind!=='URGENT') {
    rules.push(sql`coalesce(${userPreferences.notificationChannels}->>'inApp','true') <> 'false'`);
  }
  const query=tx.selectDistinct({userId:users.id}).from(eventMemberships)
    .innerJoin(users,eq(users.id,eventMemberships.userId))
    .leftJoin(userPreferences,eq(userPreferences.userId,users.id))
    .leftJoin(membershipUnitAssignments,eq(membershipUnitAssignments.membershipId,eventMemberships.id))
    .leftJoin(organizationalUnits,eq(organizationalUnits.id,membershipUnitAssignments.unitId))
    .where(and(...rules)).limit(MAX_AUDIENCE+1);
  const rows=await query;
  if(rows.length>MAX_AUDIENCE)throw new Error('AUDIENCE_TOO_LARGE');
  return rows;
}

/** Atomic in-app receipts for a preapproved broadcast (no SMTP fanout). */
async function deliverScheduled(
  tx: Tx,
  plan: typeof exerciseBroadcastPlans.$inferSelect,
  recipients: Array<{userId:string}>,
  now: Date,
): Promise<void> {
  const severity=plan.kind==='URGENT'?'URGENT':plan.kind==='INSTRUCTION'?'ACTION':'INFO';
  const params={
    title:plan.title,description:plan.message,kind:plan.kind,
    audience:plan.audience,unitId:plan.unitId,senderId:plan.createdByUserId,
  };
  const source=sourcePrefix+plan.id;
  for(let offset=0;offset<recipients.length;offset+=250){
    await tx.insert(notifications).values(recipients.slice(offset,offset+250).map(r=>({
      id:generateId(),userId:r.userId,eventId:plan.eventId,
      type:'EXERCISE_'+plan.kind,severity,templateKey:'exercise.broadcast',
      templateParams:params,actionUrl:'/events/'+plan.eventId+'/overview',
      sourceEventId:source,createdAt:now,
    }))).onConflictDoNothing();
  }
  await tx.update(exerciseBroadcastPlans).set({
    status:'SENT',sentAt:now,deliveredCount:recipients.length,revision:plan.revision+1,updatedAt:now,
  }).where(eq(exerciseBroadcastPlans.id,plan.id));
  await recordAutomatedBroadcastAudit(tx,plan,recipients.length,now,null);
}

/** Append-only audited worker receipt with outbox archival, in the same transaction. */
async function recordAutomatedBroadcastAudit(tx:Tx,plan:typeof exerciseBroadcastPlans.$inferSelect,
  delivered:number,now:Date,failureCode:string|null){
  const auditRow={
    id:generateId(),occurredAt:now,actorUserId:plan.createdByUserId,
    actorType:'SERVICE' as const,eventId:plan.eventId,
    action:failureCode?'exercise.broadcast.scheduled.failed':'exercise.broadcast.scheduled.sent',
    category:'scenario',resourceType:'exercise_broadcast_plan',resourceId:plan.id,
    outcome:failureCode?'FAILURE':'SUCCESS',
    metadata:{
      planId:plan.id,kind:plan.kind,audience:plan.audience,unitId:plan.unitId,
      delivered,failureCode,scheduledAt:plan.scheduledAt?.toISOString()??null,
    },
  };
  await tx.insert(auditEvents).values(auditRow);
  await tx.insert(outboxEvents).values({
    id:generateId(),eventType:'audit.archival',
    payload:{...auditRow,occurredAt:now.toISOString()},
    status:OutboxStatus.PENDING,retryCount:0,createdAt:now,
  });
}

/** Process due real-world-time messages. Safe with multiple worker replicas. */
export async function dispatchDueExerciseBroadcasts(db:CyrisDatabase,limit=20,now=new Date()):Promise<{
  sent:number;failed:number;deferred:number;
}> {
  // Filter blocked/preparation exercises *before* LIMIT: otherwise 20 overdue
  // messages from a paused exercise can starve a separate live event forever.
  const due=await db.select({id:exerciseBroadcastPlans.id}).from(exerciseBroadcastPlans)
    .innerJoin(events,eq(events.id,exerciseBroadcastPlans.eventId))
    .where(and(eq(exerciseBroadcastPlans.status,'SCHEDULED'),
      lte(exerciseBroadcastPlans.scheduledAt,now),
      inArray(events.status,['ACTIVE','CLOSED','ARCHIVED']),
      sql`(${events.status} <> 'ACTIVE' OR NOT EXISTS (
        SELECT 1 FROM exercise_operation_holds held
        WHERE held.event_id=${exerciseBroadcastPlans.eventId}
          AND held.target_type='EVENT'
          AND held.module IN ('ALL','scenario','briefings')
          AND held.restored_at IS NULL
          AND held.starts_at <= ${now.toISOString()}::timestamptz
          AND (held.expires_at IS NULL OR held.expires_at > ${now.toISOString()}::timestamptz)
      ))`))
    .orderBy(asc(exerciseBroadcastPlans.scheduledAt)).limit(Math.min(50,Math.max(1,limit)));
  const result={sent:0,failed:0,deferred:0};
  for(const {id} of due){
    const outcome=await db.transaction(async tx=>{
      const [plan]=await tx.select().from(exerciseBroadcastPlans)
        .where(and(eq(exerciseBroadcastPlans.id,id),eq(exerciseBroadcastPlans.status,'SCHEDULED'),
          lte(exerciseBroadcastPlans.scheduledAt,now)))
        .for('update',{skipLocked:true}).limit(1);
      if(!plan)return 'deferred';
      // Never automatically send while the exercise is preparing, paused by an
      // operational hold, or has an inactive lifecycle. Timing is REAL UTC.
      const [event]=await tx.select({status:events.status}).from(events).where(eq(events.id,plan.eventId)).limit(1);
      if(event?.status==='DRAFT'||event?.status==='PREPARATION')return 'deferred';
      if(event?.status==='ACTIVE' && await isOperationalAutoReleaseHeld(tx,plan.eventId,now))return 'deferred';
      let failureCode:string|null=null;
      if(event?.status!=='ACTIVE')failureCode='EVENT_CLOSED';
      let recipients:Array<{userId:string}>=[];
      if(!failureCode && plan.audience==='UNIT'){
        const [unit]=await tx.select({id:organizationalUnits.id}).from(organizationalUnits).where(and(
          eq(organizationalUnits.id,plan.unitId!),eq(organizationalUnits.eventId,plan.eventId),
          isNull(organizationalUnits.archivedAt))).limit(1);
        if(!unit)failureCode='UNIT_ARCHIVED';
      }
      if(!failureCode) {
        try {
          recipients=await selectExerciseBroadcastRecipients(tx,plan.eventId,
            plan.audience as BroadcastAudience,plan.unitId,plan.kind as BroadcastKind);
          if(recipients.length===0)failureCode='NO_RECIPIENTS';
        }catch(err){
          if((err as Error).message==='AUDIENCE_TOO_LARGE')failureCode='AUDIENCE_TOO_LARGE';
          else throw err;
        }
      }
      if(failureCode){
        await tx.update(exerciseBroadcastPlans).set({
          status:'FAILED',failureCode,updatedAt:now,revision:plan.revision+1,
        }).where(eq(exerciseBroadcastPlans.id,plan.id));
        await recordAutomatedBroadcastAudit(tx,plan,0,now,failureCode);
        return 'failed';
      }
      await deliverScheduled(tx,plan,recipients,now);
      return 'sent';
    });
    result[outcome]++;
  }
  return result;
}

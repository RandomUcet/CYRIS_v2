import {Injectable,ConflictException,NotFoundException,BadRequestException} from '@nestjs/common';
import {and,eq,desc,isNull,gt} from 'drizzle-orm';
import {events,exerciseAdvice,exerciseBlueprints,exerciseBroadcastPlans,organizationalUnits,exerciseJobs,users} from '@cyris/db';
import {Permissions,generateId} from '@cyris/shared';
import {ExerciseAdviceDraftSchema,ExerciseSignalSchema,ExerciseAdviceReviewSchema,ExerciseAdviceHandoffSchema,ExerciseAdviceHandoffInputSchema,ExerciseObserverSnapshotSchema,type ExerciseObserverSnapshot,type ExerciseAdviceHandoffInput,type ExerciseAdviceResult,type ExerciseAdviceDecision,type ExerciseAdviceReview,type StoredExerciseAdvice,type ExerciseSignal} from '@cyris/contracts';
import type {AuthenticatedUser} from '../auth/session.service.js';
import {DatabaseService} from '../database/database.service.js';
import {AuthorizationService} from '../authorization/authorization.service.js';
import {AuditService} from '../audit/audit.service.js';

export function applyAdviceReview(current:readonly ExerciseAdviceReview[],actionCount:number,input:ExerciseAdviceDecision,revision:number,actorId:string,now:string):ExerciseAdviceReview[]{
 if(input.expectedRevision!==revision)throw new ConflictException('Advice changed; reload before reviewing');
 if(input.actionIndex<0||input.actionIndex>=actionCount)throw new BadRequestException('Unknown action');
 return [...current.filter(r=>r.actionIndex!==input.actionIndex),ExerciseAdviceReviewSchema.parse({actionIndex:input.actionIndex,decision:input.decision,note:input.note,reviewedAt:now,reviewedBy:actorId})].sort((a,b)=>a.actionIndex-b.actionIndex);
}
export type ExerciseJobFence={id:string;claimToken:string};
@Injectable()
export class ExerciseAdviceStore{
 constructor(private readonly db:DatabaseService,private readonly auth:AuthorizationService,private readonly audit:AuditService){}
 private authorize(eventId:string,actor:AuthenticatedUser){return this.auth.assertAuthorized({user:actor,permission:Permissions.SCENARIO_MANAGE,context:{eventId}});}
 private map(row:typeof exerciseAdvice.$inferSelect):StoredExerciseAdvice{
  return {...ExerciseAdviceDraftSchema.parse(row.draft),eventId:row.eventId,runId:row.runId,model:row.model,durationMs:row.durationMs,generatedAt:row.generatedAt.toISOString(),observedAt:row.observedAt.toISOString(),blueprintRevision:row.blueprintRevision,mode:row.mode,status:'DRAFT',revision:row.revision,signals:ExerciseSignalSchema.array().parse(row.signals),observations:ExerciseObserverSnapshotSchema.array().max(24).parse(row.observations),reviews:ExerciseAdviceReviewSchema.array().parse(row.reviews),handoffs:ExerciseAdviceHandoffSchema.array().parse(row.handoffs),createdBy:row.createdBy};
 }
 async list(eventId:string,actor:AuthenticatedUser):Promise<StoredExerciseAdvice[]>{
  await this.authorize(eventId,actor);
  return (await this.db.client.select().from(exerciseAdvice).where(eq(exerciseAdvice.eventId,eventId)).orderBy(desc(exerciseAdvice.generatedAt),desc(exerciseAdvice.runId)).limit(20)).map(row=>this.map(row));
 }
 /** Called only after server-side validated inference; no client-supplied draft endpoint. */
 async persist(actor:AuthenticatedUser,result:ExerciseAdviceResult,observedAt:string,signals:ExerciseSignal[],fence?:ExerciseJobFence,observations:ExerciseObserverSnapshot[]=[]):Promise<void>{
  const {eventId,runId,model,durationMs,generatedAt,blueprintRevision,mode,summary,actions,reviewNotes}=result;
  await this.authorize(eventId,actor);
  const draft=ExerciseAdviceDraftSchema.parse({summary,actions,reviewNotes});
  await this.db.client.transaction(async tx=>{
   const [event]=await tx.select({status:events.status}).from(events).where(eq(events.id,eventId)).for('update').limit(1);
   if(!event)throw new NotFoundException('Exercise not found');
   if(['CLOSED','ARCHIVED'].includes(event.status))throw new ConflictException('Exercise is read-only');
   if(blueprintRevision!==null){const [latest]=await tx.select({revision:exerciseBlueprints.revision}).from(exerciseBlueprints).where(eq(exerciseBlueprints.eventId,eventId)).orderBy(desc(exerciseBlueprints.revision)).limit(1);if(latest?.revision!==blueprintRevision)throw new ConflictException('Blueprint changed during inference');}
   if(fence){
    const [account]=await tx.select({status:users.status}).from(users).where(eq(users.id,actor.id)).limit(1);
    if(account?.status!=='ACTIVE')throw new ConflictException('Job owner unavailable');
    await this.authorize(eventId,actor);
    const [job]=await tx.update(exerciseJobs).set({status:'SUCCEEDED',resultRunId:runId,input:null,claimToken:null,leaseUntil:null,updatedAt:new Date(),errorCode:null}).where(and(eq(exerciseJobs.id,fence.id),eq(exerciseJobs.eventId,eventId),eq(exerciseJobs.createdBy,actor.id),eq(exerciseJobs.status,'RUNNING'),eq(exerciseJobs.claimToken,fence.claimToken),gt(exerciseJobs.leaseUntil,new Date()))).returning({id:exerciseJobs.id});
    if(!job)throw new ConflictException('Job claim expired');
   }
   const retainedObservations=ExerciseObserverSnapshotSchema.array().max(24).parse(observations);
   if(retainedObservations.some(s=>s.eventId!==eventId))throw new BadRequestException('Foreign observation');
   await tx.insert(exerciseAdvice).values({eventId,runId,model,durationMs,generatedAt:new Date(generatedAt),observedAt:new Date(observedAt),blueprintRevision,mode,draft,signals:ExerciseSignalSchema.array().parse(signals),observations:retainedObservations,createdBy:actor.id});
   await this.audit.record({txClient:tx,eventId,actorUserId:actor.id,action:'exercise.advice.created',category:'scenario',resourceType:'exercise_advice',resourceId:runId,metadata:{mode,blueprintRevision,actionCount:actions.length}});
  });
 }
 async review(eventId:string,runId:string,actor:AuthenticatedUser,input:ExerciseAdviceDecision):Promise<StoredExerciseAdvice>{
  await this.authorize(eventId,actor);
  return this.db.client.transaction(async tx=>{
   const [event]=await tx.select({status:events.status}).from(events).where(eq(events.id,eventId)).for('update').limit(1);
   if(!event)throw new NotFoundException('Exercise not found');
   if(['CLOSED','ARCHIVED'].includes(event.status))throw new ConflictException('Exercise is read-only');
   const [row]=await tx.select().from(exerciseAdvice).where(and(eq(exerciseAdvice.eventId,eventId),eq(exerciseAdvice.runId,runId))).for('update').limit(1);
   if(!row)throw new NotFoundException('Advice not found');
   if(input.decision==='ACCEPTED'&&row.blueprintRevision!==null){
    const [latest]=await tx.select({revision:exerciseBlueprints.revision}).from(exerciseBlueprints).where(eq(exerciseBlueprints.eventId,eventId)).orderBy(desc(exerciseBlueprints.revision)).limit(1);
    if(latest?.revision!==row.blueprintRevision)throw new ConflictException('Advice uses an outdated blueprint; generate a new draft');
   }
   if(row.handoffs.some(h=>h.actionIndex===input.actionIndex))throw new ConflictException('This action has been handed off; manage the broadcast plan separately');
   const reviews=applyAdviceReview(row.reviews,row.draft.actions.length,input,row.revision,actor.id,new Date().toISOString());
   const [updated]=await tx.update(exerciseAdvice).set({reviews,revision:row.revision+1}).where(and(eq(exerciseAdvice.eventId,eventId),eq(exerciseAdvice.runId,runId),eq(exerciseAdvice.revision,row.revision))).returning();
   if(!updated)throw new ConflictException('Advice changed');
   await this.audit.record({txClient:tx,eventId,actorUserId:actor.id,action:'exercise.advice.reviewed',category:'scenario',resourceType:'exercise_advice',resourceId:runId,metadata:{actionIndex:input.actionIndex,decision:input.decision,revision:updated.revision}});
   return this.map(updated);
  });
 }

 /** Only create an unscheduled team draft. Never copy confidential proposal text or send a message. */
 async handoff(eventId:string,runId:string,actor:AuthenticatedUser,input:ExerciseAdviceHandoffInput):Promise<StoredExerciseAdvice>{
  await this.authorize(eventId,actor);
  const parsed=ExerciseAdviceHandoffInputSchema.safeParse(input);
  if(!parsed.success)throw new BadRequestException('Invalid handoff');
  const request=parsed.data;
  return this.db.client.transaction(async tx=>{
   const [event]=await tx.select({status:events.status}).from(events).where(eq(events.id,eventId)).for('update').limit(1);
   if(!event)throw new NotFoundException('Exercise not found');
   if(event.status!=='ACTIVE')throw new ConflictException('Intervention handoffs require an active exercise');
   const [row]=await tx.select().from(exerciseAdvice).where(and(eq(exerciseAdvice.eventId,eventId),eq(exerciseAdvice.runId,runId))).for('update').limit(1);
   if(!row)throw new NotFoundException('Advice not found');
   if(row.mode!=='INTERVENTION')throw new ConflictException('Only intervention advice can create a hint draft');
   if(row.revision!==request.expectedRevision)throw new ConflictException('Advice changed; reload');
   if(!row.draft.actions[request.actionIndex]||row.reviews.find(r=>r.actionIndex===request.actionIndex)?.decision!=='ACCEPTED')throw new ConflictException('Accept this action before creating a draft');
   if(row.handoffs.some(h=>h.actionIndex===request.actionIndex))throw new ConflictException('A draft was already created for this action');
   if(row.blueprintRevision!==null){
    const [latest]=await tx.select({revision:exerciseBlueprints.revision}).from(exerciseBlueprints).where(eq(exerciseBlueprints.eventId,eventId)).orderBy(desc(exerciseBlueprints.revision)).limit(1);
    if(latest?.revision!==row.blueprintRevision)throw new ConflictException('Advice uses an outdated blueprint');
   }
   const [unit]=await tx.select({id:organizationalUnits.id}).from(organizationalUnits).where(and(eq(organizationalUnits.id,request.unitId),eq(organizationalUnits.eventId,eventId),isNull(organizationalUnits.archivedAt))).limit(1);
   if(!unit)throw new BadRequestException('Receiving team is unavailable');
   const planId=generateId(),now=new Date();
   await tx.insert(exerciseBroadcastPlans).values({id:planId,eventId,createdByUserId:actor.id,kind:'INFO',audience:'UNIT',unitId:unit.id,title:request.title,message:request.message,status:'DRAFT',scheduledAt:null});
   const handoff=ExerciseAdviceHandoffSchema.parse({actionIndex:request.actionIndex,planId,unitId:unit.id,createdAt:now.toISOString(),createdBy:actor.id});
   const [updated]=await tx.update(exerciseAdvice).set({handoffs:[...row.handoffs,handoff],revision:row.revision+1}).where(and(eq(exerciseAdvice.eventId,eventId),eq(exerciseAdvice.runId,runId),eq(exerciseAdvice.revision,row.revision))).returning();
   if(!updated)throw new ConflictException('Advice changed');
   await this.audit.record({txClient:tx,eventId,actorUserId:actor.id,action:'exercise.broadcast.plan.created',category:'scenario',resourceType:'exercise_broadcast_plan',resourceId:planId,metadata:{kind:'INFO',audience:'UNIT',unitId:unit.id,scheduledAt:null}});
   await this.audit.record({txClient:tx,eventId,actorUserId:actor.id,action:'exercise.advice.handoff',category:'scenario',resourceType:'exercise_advice',resourceId:runId,metadata:{actionIndex:request.actionIndex,planId,unitId:unit.id,revision:updated.revision}});
   return this.map(updated);
  });
 }
}

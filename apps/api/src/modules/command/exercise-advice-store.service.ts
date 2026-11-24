import {Injectable,ConflictException,NotFoundException,BadRequestException} from '@nestjs/common';
import {and,eq,desc} from 'drizzle-orm';
import {events,exerciseAdvice,exerciseBlueprints} from '@cyris/db';
import {Permissions} from '@cyris/shared';
import {ExerciseAdviceDraftSchema,ExerciseSignalSchema,ExerciseAdviceReviewSchema,type ExerciseAdviceResult,type ExerciseAdviceDecision,type ExerciseAdviceReview,type StoredExerciseAdvice,type ExerciseSignal} from '@cyris/contracts';
import type {AuthenticatedUser} from '../auth/session.service.js';
import {DatabaseService} from '../database/database.service.js';
import {AuthorizationService} from '../authorization/authorization.service.js';
import {AuditService} from '../audit/audit.service.js';

export function applyAdviceReview(current:readonly ExerciseAdviceReview[],actionCount:number,input:ExerciseAdviceDecision,revision:number,actorId:string,now:string):ExerciseAdviceReview[]{
 if(input.expectedRevision!==revision)throw new ConflictException('Advice changed; reload before reviewing');
 if(input.actionIndex<0||input.actionIndex>=actionCount)throw new BadRequestException('Unknown action');
 return [...current.filter(r=>r.actionIndex!==input.actionIndex),ExerciseAdviceReviewSchema.parse({actionIndex:input.actionIndex,decision:input.decision,note:input.note,reviewedAt:now,reviewedBy:actorId})].sort((a,b)=>a.actionIndex-b.actionIndex);
}
@Injectable()
export class ExerciseAdviceStore{
 constructor(private readonly db:DatabaseService,private readonly auth:AuthorizationService,private readonly audit:AuditService){}
 private authorize(eventId:string,actor:AuthenticatedUser){return this.auth.assertAuthorized({user:actor,permission:Permissions.SCENARIO_MANAGE,context:{eventId}});}
 private map(row:typeof exerciseAdvice.$inferSelect):StoredExerciseAdvice{
  return {...ExerciseAdviceDraftSchema.parse(row.draft),eventId:row.eventId,runId:row.runId,model:row.model,durationMs:row.durationMs,generatedAt:row.generatedAt.toISOString(),observedAt:row.observedAt.toISOString(),blueprintRevision:row.blueprintRevision,mode:row.mode,status:'DRAFT',revision:row.revision,signals:ExerciseSignalSchema.array().parse(row.signals),reviews:ExerciseAdviceReviewSchema.array().parse(row.reviews),createdBy:row.createdBy};
 }
 async list(eventId:string,actor:AuthenticatedUser):Promise<StoredExerciseAdvice[]>{
  await this.authorize(eventId,actor);
  return (await this.db.client.select().from(exerciseAdvice).where(eq(exerciseAdvice.eventId,eventId)).orderBy(desc(exerciseAdvice.generatedAt),desc(exerciseAdvice.runId)).limit(20)).map(row=>this.map(row));
 }
 /** Called only after server-side validated inference; no client-supplied draft endpoint. */
 async persist(actor:AuthenticatedUser,result:ExerciseAdviceResult,observedAt:string,signals:ExerciseSignal[]):Promise<void>{
  const {eventId,runId,model,durationMs,generatedAt,blueprintRevision,mode,summary,actions,reviewNotes}=result;
  await this.authorize(eventId,actor);
  const draft=ExerciseAdviceDraftSchema.parse({summary,actions,reviewNotes});
  await this.db.client.transaction(async tx=>{
   const [event]=await tx.select({status:events.status}).from(events).where(eq(events.id,eventId)).for('update').limit(1);
   if(!event)throw new NotFoundException('Exercise not found');
   if(['CLOSED','ARCHIVED'].includes(event.status))throw new ConflictException('Exercise is read-only');
   if(blueprintRevision!==null){const [latest]=await tx.select({revision:exerciseBlueprints.revision}).from(exerciseBlueprints).where(eq(exerciseBlueprints.eventId,eventId)).orderBy(desc(exerciseBlueprints.revision)).limit(1);if(latest?.revision!==blueprintRevision)throw new ConflictException('Blueprint changed during inference');}
   await tx.insert(exerciseAdvice).values({eventId,runId,model,durationMs,generatedAt:new Date(generatedAt),observedAt:new Date(observedAt),blueprintRevision,mode,draft,signals:ExerciseSignalSchema.array().parse(signals),createdBy:actor.id});
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
   const reviews=applyAdviceReview(row.reviews,row.draft.actions.length,input,row.revision,actor.id,new Date().toISOString());
   const [updated]=await tx.update(exerciseAdvice).set({reviews,revision:row.revision+1}).where(and(eq(exerciseAdvice.eventId,eventId),eq(exerciseAdvice.runId,runId),eq(exerciseAdvice.revision,row.revision))).returning();
   if(!updated)throw new ConflictException('Advice changed');
   await this.audit.record({txClient:tx,eventId,actorUserId:actor.id,action:'exercise.advice.reviewed',category:'scenario',resourceType:'exercise_advice',resourceId:runId,metadata:{actionIndex:input.actionIndex,decision:input.decision,revision:updated.revision}});
   return this.map(updated);
  });
 }
}

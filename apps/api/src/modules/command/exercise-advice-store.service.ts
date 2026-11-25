import {Injectable,ConflictException,NotFoundException,BadRequestException} from '@nestjs/common';
import {and,eq,desc,isNull,gt} from 'drizzle-orm';
import {events,exerciseAdvice,exerciseBlueprints,exerciseBroadcastPlans,organizationalUnits,exerciseJobs,users,scenarioPhases,scenarioInjects,outboxEvents,OutboxStatus} from '@cyris/db';
import {Permissions,generateId} from '@cyris/shared';
import {IdentifierAllocatorService} from '../resources/identifier-allocator.service.js';
import {ExerciseInjectSetupInputSchema,ExerciseInjectSetupReceiptSchema,type ExerciseInjectSetupInput,ExerciseAdviceDraftSchema,ExerciseSignalSchema,ExerciseAdviceReviewSchema,ExerciseAdviceHandoffSchema,ExerciseAdviceHandoffInputSchema,ExerciseObserverSnapshotSchema,ExercisePhaseSetupInputSchema,ExercisePhaseSetupReceiptSchema,ExerciseTeamSetupInputSchema,ExerciseTeamSetupReceiptSchema,type ExerciseTeamSetupInput,type ExercisePhaseSetupInput,type ExerciseObserverSnapshot,type ExerciseAdviceHandoffInput,type ExerciseAdviceResult,type ExerciseAdviceDecision,type ExerciseAdviceReview,type StoredExerciseAdvice,type ExerciseSignal} from '@cyris/contracts';
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
 constructor(private readonly db:DatabaseService,private readonly auth:AuthorizationService,private readonly audit:AuditService,private readonly identifiers:IdentifierAllocatorService=new IdentifierAllocatorService(db)){}
 private authorize(eventId:string,actor:AuthenticatedUser){return this.auth.assertAuthorized({user:actor,permission:Permissions.SCENARIO_MANAGE,context:{eventId}});}
 private map(row:typeof exerciseAdvice.$inferSelect):StoredExerciseAdvice{
  return {...ExerciseAdviceDraftSchema.parse(row.draft),eventId:row.eventId,runId:row.runId,model:row.model,durationMs:row.durationMs,generatedAt:row.generatedAt.toISOString(),observedAt:row.observedAt.toISOString(),blueprintRevision:row.blueprintRevision,mode:row.mode,status:'DRAFT',revision:row.revision,signals:ExerciseSignalSchema.array().parse(row.signals),observations:ExerciseObserverSnapshotSchema.array().max(24).parse(row.observations),reviews:ExerciseAdviceReviewSchema.array().parse(row.reviews),handoffs:ExerciseAdviceHandoffSchema.array().parse(row.handoffs),setupReceipts:ExercisePhaseSetupReceiptSchema.array().parse(row.setupReceipts),teamReceipts:ExerciseTeamSetupReceiptSchema.array().parse(row.teamReceipts),injectReceipts:ExerciseInjectSetupReceiptSchema.array().parse(row.injectReceipts),createdBy:row.createdBy};
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
    const [account]=await tx.select({status:users.status,testExpiresAt:users.testExpiresAt}).from(users).where(eq(users.id,actor.id)).limit(1);
    if(account?.status!=='ACTIVE'||(account.testExpiresAt!=null&&account.testExpiresAt.getTime()<=Date.now()))throw new ConflictException('Job owner unavailable');
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
   if(row.handoffs.some(h=>h.actionIndex===input.actionIndex)||row.setupReceipts.some(h=>h.actionIndex===input.actionIndex)||row.teamReceipts.some(h=>h.actionIndex===input.actionIndex)||row.injectReceipts.some(h=>h.actionIndex===input.actionIndex))throw new ConflictException('This action has been handed off; manage the broadcast plan separately');
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

 /** Apply only neutral phase titles, after explicit review, to a preparation-stage exercise. */
 async setupPhases(eventId:string,runId:string,actor:AuthenticatedUser,input:ExercisePhaseSetupInput):Promise<StoredExerciseAdvice>{
  await this.authorize(eventId,actor);
  const parsed=ExercisePhaseSetupInputSchema.safeParse(input);
  if(!parsed.success)throw new BadRequestException('Invalid phase setup');
  const request=parsed.data;
  return this.db.client.transaction(async tx=>{
   const [event]=await tx.select({status:events.status}).from(events).where(eq(events.id,eventId)).for('update').limit(1);
   if(!event)throw new NotFoundException('Exercise not found');
   if(!['DRAFT','PREPARATION'].includes(event.status))throw new ConflictException('Phase setup requires preparation stage');
   await this.authorize(eventId,actor);
   const [row]=await tx.select().from(exerciseAdvice).where(and(eq(exerciseAdvice.eventId,eventId),eq(exerciseAdvice.runId,runId))).for('update').limit(1);
   if(!row)throw new NotFoundException('Advice not found');
   if(row.mode!=='ARCHITECT'||row.blueprintRevision===null)throw new ConflictException('Saved architect blueprint required');
   if(row.revision!==request.expectedRevision)throw new ConflictException('Advice changed; reload');
   const action=row.draft.actions[request.actionIndex];
   if(action?.module!=='SCENARIO'||!action.phasePlan||row.reviews.find(r=>r.actionIndex===request.actionIndex)?.decision!=='ACCEPTED')throw new ConflictException('Accept a structured phase plan first');
   if(request.titles.length!==action.phasePlan.length)throw new BadRequestException('Review every proposed phase title');
   if(row.setupReceipts.some(r=>r.actionIndex===request.actionIndex))throw new ConflictException('Phase setup already applied');
   const [latest]=await tx.select({revision:exerciseBlueprints.revision}).from(exerciseBlueprints).where(eq(exerciseBlueprints.eventId,eventId)).orderBy(desc(exerciseBlueprints.revision)).limit(1);
   if(latest?.revision!==row.blueprintRevision)throw new ConflictException('Blueprint changed');
   const existing=await tx.select({title:scenarioPhases.title,sequence:scenarioPhases.sequence,code:scenarioPhases.code}).from(scenarioPhases).where(eq(scenarioPhases.eventId,eventId));
   const names=new Set(existing.map(p=>p.title.trim().toLowerCase()));
   if(request.titles.some(t=>names.has(t.toLowerCase())))throw new ConflictException('A phase with this title already exists');
   const sequence=Math.max(0,...existing.map(p=>p.sequence));
   if(sequence+request.titles.length>2147483647)throw new ConflictException('Phase sequence exhausted');
   const phases=request.titles.map((title,i)=>({id:generateId(),eventId,title,code:'AI-'+runId+'-'+request.actionIndex+'-'+(i+1),sequence:sequence+i+1,status:'DRAFT',createdByUserId:actor.id}));
   if(phases.some(p=>existing.some(e=>e.code===p.code)))throw new ConflictException('Phase code already exists');
   await tx.insert(scenarioPhases).values(phases);
   for(const phase of phases)await this.audit.record({txClient:tx,eventId,actorUserId:actor.id,action:'scenario.phase.created',category:'scenario',resourceType:'scenario_phase',resourceId:phase.id,metadata:{code:phase.code,status:'DRAFT',source:'AI_SETUP',runId}});
   const receipt=ExercisePhaseSetupReceiptSchema.parse({actionIndex:request.actionIndex,phaseIds:phases.map(p=>p.id),createdAt:new Date().toISOString(),createdBy:actor.id});
   const [updated]=await tx.update(exerciseAdvice).set({setupReceipts:[...row.setupReceipts,receipt],revision:row.revision+1}).where(and(eq(exerciseAdvice.eventId,eventId),eq(exerciseAdvice.runId,runId),eq(exerciseAdvice.revision,row.revision))).returning();
   if(!updated)throw new ConflictException('Advice changed');
   await this.audit.record({txClient:tx,eventId,actorUserId:actor.id,action:'exercise.advice.phase_setup',category:'scenario',resourceType:'exercise_advice',resourceId:runId,metadata:{actionIndex:request.actionIndex,phaseIds:receipt.phaseIds,revision:updated.revision}});
   return this.map(updated);
  });
 }

 /** Create empty, top-level units with the same authorization and indexing as ordinary unit creation. */
 async setupTeams(eventId:string,runId:string,actor:AuthenticatedUser,input:ExerciseTeamSetupInput):Promise<StoredExerciseAdvice>{
  await this.authorize(eventId,actor);
  await this.auth.assertAuthorized({user:actor,permission:Permissions.UNIT_MANAGE,context:{eventId}});
  const parsed=ExerciseTeamSetupInputSchema.safeParse(input);
  if(!parsed.success)throw new BadRequestException('Invalid team setup');
  const request=parsed.data;
  return this.db.client.transaction(async tx=>{
   const [event]=await tx.select({status:events.status}).from(events).where(eq(events.id,eventId)).for('update').limit(1);
   if(!event)throw new NotFoundException('Exercise not found');
   if(!['DRAFT','PREPARATION'].includes(event.status))throw new ConflictException('Team setup requires preparation stage');
   await this.authorize(eventId,actor);
   await this.auth.assertAuthorized({user:actor,permission:Permissions.UNIT_MANAGE,context:{eventId}});
   const [row]=await tx.select().from(exerciseAdvice).where(and(eq(exerciseAdvice.eventId,eventId),eq(exerciseAdvice.runId,runId))).for('update').limit(1);
   if(!row)throw new NotFoundException('Advice not found');
   if(row.mode!=='ARCHITECT'||row.blueprintRevision===null||row.revision!==request.expectedRevision)throw new ConflictException('Current saved architect draft required');
   const action=row.draft.actions[request.actionIndex];
   if(action?.module!=='COMMAND'||!action.teamPlan||row.reviews.find(r=>r.actionIndex===request.actionIndex)?.decision!=='ACCEPTED')throw new ConflictException('Accept a structured team plan first');
   if(request.teams.length!==action.teamPlan.length)throw new BadRequestException('Review every proposed team');
   if(row.teamReceipts.some(r=>r.actionIndex===request.actionIndex))throw new ConflictException('Team setup already applied');
   const [latest]=await tx.select({revision:exerciseBlueprints.revision}).from(exerciseBlueprints).where(eq(exerciseBlueprints.eventId,eventId)).orderBy(desc(exerciseBlueprints.revision)).limit(1);
   if(latest?.revision!==row.blueprintRevision)throw new ConflictException('Blueprint changed');
   const existing=await tx.select({name:organizationalUnits.name,slug:organizationalUnits.slug}).from(organizationalUnits).where(eq(organizationalUnits.eventId,eventId));
   const names=new Set(existing.map(u=>u.name.trim().toLowerCase())),slugs=new Set(existing.map(u=>u.slug));
   if(request.teams.some(t=>names.has(t.name.toLowerCase())||slugs.has(t.slug)))throw new ConflictException('Team name or slug already exists');
   const units=request.teams.map(t=>({id:generateId(),eventId,name:t.name,slug:t.slug,kind:'TEAM'}));
   const inserted=await tx.insert(organizationalUnits).values(units).onConflictDoNothing().returning({id:organizationalUnits.id});
   if(inserted.length!==units.length)throw new ConflictException('Team slug changed concurrently; no teams created');
   for(const unit of units){
    await this.audit.record({txClient:tx,eventId,actorUserId:actor.id,action:'unit.created',category:'unit',resourceType:'unit',resourceId:unit.id,metadata:{slug:unit.slug,kind:'TEAM',source:'AI_SETUP',runId}});
    await tx.insert(outboxEvents).values({id:generateId(),eventType:'search.upsert',payload:{type:'unit',id:unit.id},status:OutboxStatus.PENDING,retryCount:0});
   }
   const receipt=ExerciseTeamSetupReceiptSchema.parse({actionIndex:request.actionIndex,unitIds:units.map(u=>u.id),createdAt:new Date().toISOString(),createdBy:actor.id});
   const [updated]=await tx.update(exerciseAdvice).set({teamReceipts:[...row.teamReceipts,receipt],revision:row.revision+1}).where(and(eq(exerciseAdvice.eventId,eventId),eq(exerciseAdvice.runId,runId),eq(exerciseAdvice.revision,row.revision))).returning();
   if(!updated)throw new ConflictException('Advice changed');
   await this.audit.record({txClient:tx,eventId,actorUserId:actor.id,action:'exercise.advice.team_setup',category:'scenario',resourceType:'exercise_advice',resourceId:runId,metadata:{actionIndex:request.actionIndex,unitIds:receipt.unitIds,revision:updated.revision}});
   return this.map(updated);
  });
 }
 /** Materialize reviewed controller-only inject drafts, never schedule or release them. */
 async setupInjects(eventId:string,runId:string,actor:AuthenticatedUser,input:ExerciseInjectSetupInput):Promise<StoredExerciseAdvice>{
  await this.authorize(eventId,actor);
  const parsed=ExerciseInjectSetupInputSchema.safeParse(input);
  if(!parsed.success)throw new BadRequestException('Invalid inject setup');
  const request=parsed.data;
  return this.db.client.transaction(async tx=>{
   const [event]=await tx.select({status:events.status}).from(events).where(eq(events.id,eventId)).for('update').limit(1);
   if(!event)throw new NotFoundException('Exercise not found');
   if(!['DRAFT','PREPARATION'].includes(event.status))throw new ConflictException('Inject setup requires preparation stage');
   await this.authorize(eventId,actor);
   const [row]=await tx.select().from(exerciseAdvice).where(and(eq(exerciseAdvice.eventId,eventId),eq(exerciseAdvice.runId,runId))).for('update').limit(1);
   if(!row)throw new NotFoundException('Advice not found');
   if(row.mode!=='ARCHITECT'||row.blueprintRevision===null||row.revision!==request.expectedRevision)throw new ConflictException('Current saved architect draft required');
   const action=row.draft.actions[request.actionIndex];
   if(action?.module!=='SCENARIO'||!action.injectPlan||row.reviews.find(r=>r.actionIndex===request.actionIndex)?.decision!=='ACCEPTED')throw new ConflictException('Accept a structured inject plan first');
   if(request.injects.length!==action.injectPlan.length)throw new BadRequestException('Review every proposed inject');
   if(row.injectReceipts.some(r=>r.actionIndex===request.actionIndex))throw new ConflictException('Inject setup already applied');
   const [latest]=await tx.select({revision:exerciseBlueprints.revision}).from(exerciseBlueprints).where(eq(exerciseBlueprints.eventId,eventId)).orderBy(desc(exerciseBlueprints.revision)).limit(1);
   if(latest?.revision!==row.blueprintRevision)throw new ConflictException('Blueprint changed');
   const existing=await tx.select({title:scenarioInjects.title}).from(scenarioInjects).where(eq(scenarioInjects.eventId,eventId));
   const names=new Set(existing.map(i=>i.title.trim().toLowerCase()));
   if(request.injects.some(i=>names.has(i.title.toLowerCase())))throw new ConflictException('An inject with this title already exists');
   const ids:string[]=[];
   for(const inject of request.injects){
    const id=generateId(),injectNumber=await this.identifiers.allocate(eventId,'scenario_inject','INJ',tx);
    await tx.insert(scenarioInjects).values({id,eventId,injectNumber,title:inject.title,controllerSummary:inject.controllerSummary,status:'DRAFT',triggerType:'MANUAL',releasePolicy:'MANUAL_CONFIRMATION',priority:'NORMAL',phaseId:null,participantTitle:null,participantContent:null,scheduledAt:null,createdByUserId:actor.id});
    ids.push(id);
    await this.audit.record({txClient:tx,eventId,actorUserId:actor.id,action:'scenario.inject.created',category:'scenario',resourceType:'scenario_inject',resourceId:id,metadata:{injectNumber,status:'DRAFT',source:'AI_SETUP',runId}});
   }
   const receipt=ExerciseInjectSetupReceiptSchema.parse({actionIndex:request.actionIndex,injectIds:ids,createdAt:new Date().toISOString(),createdBy:actor.id});
   const [updated]=await tx.update(exerciseAdvice).set({injectReceipts:[...row.injectReceipts,receipt],revision:row.revision+1}).where(and(eq(exerciseAdvice.eventId,eventId),eq(exerciseAdvice.runId,runId),eq(exerciseAdvice.revision,row.revision))).returning();
   if(!updated)throw new ConflictException('Advice changed');
   await this.audit.record({txClient:tx,eventId,actorUserId:actor.id,action:'exercise.advice.inject_setup',category:'scenario',resourceType:'exercise_advice',resourceId:runId,metadata:{actionIndex:request.actionIndex,injectIds:ids,revision:updated.revision}});
   return this.map(updated);
  });
 }

}

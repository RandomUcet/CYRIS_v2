import {InferenceError} from '../ai/structured-output.js';
import {Injectable,Logger,ConflictException,ForbiddenException,NotFoundException,HttpException,type OnModuleInit,type OnModuleDestroy} from '@nestjs/common';
import {and,asc,desc,eq,inArray,lte,sql,count} from 'drizzle-orm';
import {exerciseJobs,events,users,previewTeamAccounts,exerciseBlueprints} from '@cyris/db';
import {ExerciseAdviceInputSchema,type ExerciseJob,type ExerciseJobSubmit} from '@cyris/contracts';
import {Permissions,generateId} from '@cyris/shared';
import {DatabaseService} from '../database/database.service.js';
import {AuthorizationService} from '../authorization/authorization.service.js';
import {ExerciseIntelligenceService} from './exercise-intelligence.service.js';
import type {AuthenticatedUser} from '../auth/session.service.js';

const live=['QUEUED','RUNNING'] as const;
const leaseMs=600000;
const queueLifetime=3600000;
const maxPending=32;
const maxAttempts=3;
export function jobFailure(error:unknown,attempts:number){
 if(error instanceof InferenceError)return {retry:false,code:error.category};
 const status=error instanceof HttpException?error.getStatus():0;
 if(status===429&&attempts<maxAttempts)return {retry:true,code:'CAPACITY'};
 return {retry:false,code:status===429?'CAPACITY':status===403||status===401?'ACCESS_REVOKED':status===409?'CONTEXT_CHANGED':status===503?'SPARK_UNAVAILABLE':status===502?'INVALID_OUTPUT':'GENERATION_FAILED'};
}
@Injectable()
export class ExerciseJobService implements OnModuleInit,OnModuleDestroy{
 private readonly logger=new Logger(ExerciseJobService.name);
 private timer:NodeJS.Timeout|null=null;private running=false;private stopping=false;
 constructor(private readonly db:DatabaseService,private readonly auth:AuthorizationService,private readonly intelligence:ExerciseIntelligenceService){}
 onModuleInit(){this.timer=setInterval(()=>void this.tick(),3000);this.timer.unref();}
 onModuleDestroy(){this.stopping=true;if(this.timer)clearInterval(this.timer);}
 private async authorize(eventId:string,actor:AuthenticatedUser){await this.auth.assertAuthorized({user:actor,permission:Permissions.SCENARIO_MANAGE,context:{eventId}});}
 private map(r:typeof exerciseJobs.$inferSelect):ExerciseJob{return {id:r.id,eventId:r.eventId,mode:r.mode,status:r.status,blueprintRevision:r.blueprintRevision,createdAt:r.createdAt.toISOString(),updatedAt:r.updatedAt.toISOString(),resultRunId:r.resultRunId,errorCode:r.errorCode,attempts:r.attempts,createdBy:r.createdBy};}
 async list(eventId:string,actor:AuthenticatedUser){await this.authorize(eventId,actor);return (await this.db.client.select().from(exerciseJobs).where(eq(exerciseJobs.eventId,eventId)).orderBy(desc(exerciseJobs.createdAt),desc(exerciseJobs.id)).limit(50)).map(r=>this.map(r));}
 async submit(eventId:string,actor:AuthenticatedUser,request:ExerciseJobSubmit){
  await this.authorize(eventId,actor);
  const input=ExerciseAdviceInputSchema.parse(request.input);
  return this.db.client.transaction(async tx=>{
   await tx.execute(sql`select pg_advisory_xact_lock(hashtext('exercise-job-dispatch-v1'))`);
   const [existing]=await tx.select().from(exerciseJobs).where(and(eq(exerciseJobs.eventId,eventId),eq(exerciseJobs.createdBy,actor.id),eq(exerciseJobs.requestId,request.requestId))).limit(1);
   if(existing)return this.map(existing);
   const [event]=await tx.select({status:events.status}).from(events).where(eq(events.id,eventId)).limit(1);
   if(!event)throw new NotFoundException('Exercise not found');
   if(['CLOSED','ARCHIVED'].includes(event.status))throw new ConflictException('Exercise is read-only');
   if(input.blueprintRevision!==undefined){const [latest]=await tx.select({revision:exerciseBlueprints.revision}).from(exerciseBlueprints).where(eq(exerciseBlueprints.eventId,eventId)).orderBy(desc(exerciseBlueprints.revision)).limit(1);if(latest?.revision!==input.blueprintRevision)throw new ConflictException('Blueprint changed');}
   const [mine]=await tx.select({n:count()}).from(exerciseJobs).where(and(eq(exerciseJobs.createdBy,actor.id),inArray(exerciseJobs.status,[...live])));
   const [total]=await tx.select({n:count()}).from(exerciseJobs).where(inArray(exerciseJobs.status,[...live]));
   if((mine?.n??0)>=1||(total?.n??0)>=maxPending)throw new ConflictException('Background job capacity reached');
   const [row]=await tx.insert(exerciseJobs).values({id:generateId(),eventId,createdBy:actor.id,requestId:request.requestId,mode:input.mode,blueprintRevision:input.blueprintRevision??null,input}).returning();
   if(!row)throw Error('Job not stored');return this.map(row);
  });
 }
 async cancel(eventId:string,id:string,actor:AuthenticatedUser){
  await this.authorize(eventId,actor);
  const [row]=await this.db.client.update(exerciseJobs).set({status:'CANCELLED',input:null,updatedAt:new Date(),errorCode:null}).where(and(eq(exerciseJobs.id,id),eq(exerciseJobs.eventId,eventId),eq(exerciseJobs.status,'QUEUED'))).returning();
  if(!row)throw new ConflictException('Only queued jobs can be cancelled');return this.map(row);
 }
 async claim(){
  return this.db.client.transaction(async tx=>{
   await tx.execute(sql`select pg_advisory_xact_lock(hashtext('exercise-job-dispatch-v1'))`);
   const now=new Date();
   await tx.update(exerciseJobs).set({status:'INTERRUPTED',input:null,claimToken:null,leaseUntil:null,errorCode:'LEASE_EXPIRED',updatedAt:now}).where(and(eq(exerciseJobs.status,'RUNNING'),lte(exerciseJobs.leaseUntil,now)));
   await tx.update(exerciseJobs).set({status:'FAILED',input:null,errorCode:'QUEUE_EXPIRED',updatedAt:now}).where(and(eq(exerciseJobs.status,'QUEUED'),lte(exerciseJobs.createdAt,new Date(now.getTime()-queueLifetime))));
   const [active]=await tx.select({id:exerciseJobs.id}).from(exerciseJobs).where(eq(exerciseJobs.status,'RUNNING')).limit(1);
   if(active)return null;
   const [next]=await tx.select().from(exerciseJobs).where(and(eq(exerciseJobs.status,'QUEUED'),lte(exerciseJobs.availableAt,now))).orderBy(asc(exerciseJobs.availableAt),asc(exerciseJobs.createdAt),asc(exerciseJobs.id)).limit(1).for('update',{skipLocked:true});
   if(!next)return null;
   const [row]=await tx.update(exerciseJobs).set({status:'RUNNING',attempts:next.attempts+1,claimToken:generateId(),leaseUntil:new Date(now.getTime()+leaseMs),updatedAt:now,errorCode:null}).where(and(eq(exerciseJobs.id,next.id),eq(exerciseJobs.status,'QUEUED'))).returning();
   return row??null;
  });
 }
 async tick(){
  if(this.running||this.stopping)return;this.running=true;
  try{
   const row=await this.claim();if(!row)return;
   const token=row.claimToken!;
   try{
    if(!row.createdBy)throw new ForbiddenException();
    const [actor]=await this.db.client.select({id:users.id,email:users.email,displayName:users.displayName,status:users.status,testExpiresAt:users.testExpiresAt,preview:previewTeamAccounts.userId}).from(users).leftJoin(previewTeamAccounts,eq(users.id,previewTeamAccounts.userId)).where(eq(users.id,row.createdBy)).limit(1);
    if(!actor||actor.status!=='ACTIVE'||actor.preview||(actor.testExpiresAt!=null&&actor.testExpiresAt.getTime()<=Date.now()))throw new ForbiddenException();
    await this.authorize(row.eventId,actor);
    const [event]=await this.db.client.select({status:events.status}).from(events).where(eq(events.id,row.eventId)).limit(1);
    if(!event||['CLOSED','ARCHIVED'].includes(event.status))throw new ConflictException();
    const input=ExerciseAdviceInputSchema.parse(row.input);
    // Successful draft and job completion are committed atomically by the advice store.
    await this.intelligence.advise(row.eventId,actor,input,{id:row.id,claimToken:token});
   }catch(error){
    const failure=jobFailure(error,row.attempts),now=new Date();
    await this.db.client.update(exerciseJobs).set({status:failure.retry?'QUEUED':'FAILED',input:failure.retry?row.input:null,claimToken:null,leaseUntil:null,errorCode:failure.code,availableAt:new Date(now.getTime()+row.attempts*30000),updatedAt:now}).where(and(eq(exerciseJobs.id,row.id),eq(exerciseJobs.status,'RUNNING'),eq(exerciseJobs.claimToken,token)));
   }
  }catch{this.logger.warn('Exercise job dispatch unavailable; persisted leases recover after expiry');}finally{this.running=false;}
 }
}

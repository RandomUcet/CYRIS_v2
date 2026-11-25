import {Injectable,Logger,ConflictException,ForbiddenException,NotFoundException,HttpException,type OnModuleInit,type OnModuleDestroy} from '@nestjs/common';
import {and,eq,sql,asc} from 'drizzle-orm';
import {scenarioDataBatches,events,users,previewTeamAccounts,exerciseJobs} from '@cyris/db';
import {generateId,Permissions} from '@cyris/shared';
import {DatabaseService} from '../database/database.service.js';
import {AuthorizationService} from '../authorization/authorization.service.js';
import type {AuthenticatedUser} from '../auth/session.service.js';
import {ScenarioDataService} from './scenario-data.service.js';
import {queuedGeneration,finishGenerationPage,failGenerationPage,expireGeneration,isLive,type GenerationJob} from './scenario-generation-state.js';
type Tx=Parameters<Parameters<DatabaseService['client']['transaction']>[0]>[0];
type Row=typeof scenarioDataBatches.$inferSelect;
type Config={brief?:string;prepared?:number;persons:number;organisations:number;locations:number;vehicles:number;devices:number;weapons:number;generationJob?:GenerationJob};
const config=(row:Row)=>row.configuration as Config;
const total=(c:Config)=>c.persons+c.organisations+c.locations+c.vehicles+c.devices+c.weapons;
const state=sql<string>`${scenarioDataBatches.configuration}->'generationJob'->>'state'`;
const lease=sql<number>`(${scenarioDataBatches.configuration}->'generationJob'->>'leaseUntil')::bigint`;
const available=sql<number>`(${scenarioDataBatches.configuration}->'generationJob'->>'availableAt')::bigint`;
const draft=eq(scenarioDataBatches.status,'DRAFT');
@Injectable()
export class ScenarioGenerationService implements OnModuleInit,OnModuleDestroy{
 private readonly logger=new Logger(ScenarioGenerationService.name);
 private timer:NodeJS.Timeout|null=null;private running=false;private stopping=false;
 constructor(private readonly db:DatabaseService,private readonly auth:AuthorizationService,private readonly data:ScenarioDataService){}
 onModuleInit(){this.timer=setInterval(()=>void this.tick(),3000);this.timer.unref();}
 onModuleDestroy(){this.stopping=true;if(this.timer)clearInterval(this.timer);}
 private authorize(eventId:string,user:AuthenticatedUser){return this.auth.assertAuthorized({user,permission:Permissions.SCENARIO_MANAGE,context:{eventId}});}
 private lock(tx:Tx){return tx.execute(sql`select pg_advisory_xact_lock(hashtext('exercise-job-dispatch-v1'))`);}
 private async write(tx:Tx,row:Row,job:GenerationJob){
  await tx.update(scenarioDataBatches).set({configuration:sql`jsonb_set(${scenarioDataBatches.configuration},'{generationJob}',${JSON.stringify(job)}::jsonb,true)`}).where(eq(scenarioDataBatches.id,row.id));
 }
 private async getLocked(tx:Tx,eventId:string,id:string){
  const [row]=await tx.select().from(scenarioDataBatches).where(and(eq(scenarioDataBatches.eventId,eventId),eq(scenarioDataBatches.id,id),draft)).for('update').limit(1);
  if(!row||!config(row).brief)throw new NotFoundException('Spark draft not found');return row;
 }
 async enqueue(eventId:string,id:string,user:AuthenticatedUser){
  await this.authorize(eventId,user);
  await this.db.client.transaction(async tx=>{
   await this.lock(tx);const row=await this.getLocked(tx,eventId,id);const c=config(row);
   if(isLive(c.generationJob)||c.prepared===total(c))return;
   const [event]=await tx.select({status:events.status}).from(events).where(eq(events.id,eventId)).limit(1);
   if(!event||['CLOSED','ARCHIVED'].includes(event.status))throw new ConflictException('Exercise is read-only');
   const [count]=await tx.select({n:sql<number>`count(*)::int`}).from(scenarioDataBatches).where(and(draft,sql`${state} in ('QUEUED','RUNNING')`));
   if((count?.n??0)>=32)throw new ConflictException('Dataset queue capacity reached');
   await this.write(tx,row,queuedGeneration(user.id,Date.now()));
  });return this.data.get(eventId,id,user);
 }
 async pause(eventId:string,id:string,user:AuthenticatedUser){
  await this.authorize(eventId,user);
  await this.db.client.transaction(async tx=>{
   const row=await this.getLocked(tx,eventId,id);const job=config(row).generationJob;
   if(!job||!isLive(job))return;
   await this.write(tx,row,{...job,...(job.state==='RUNNING'?{pauseRequested:true}:{state:'PAUSED'}),updatedAt:Date.now()});
  });return this.data.get(eventId,id,user);
 }
 async claim(){
  return this.db.client.transaction(async tx=>{
   await this.lock(tx);const now=Date.now();
   const expired=await tx.select().from(scenarioDataBatches).where(and(draft,sql`${state}='RUNNING'`,sql`${lease}<=${now}`)).for('update');
   for(const row of expired)await this.write(tx,row,expireGeneration(config(row).generationJob!,now));
   const [active]=await tx.select({id:scenarioDataBatches.id}).from(scenarioDataBatches).where(and(draft,sql`${state}='RUNNING'`)).limit(1);
   const [advice]=await tx.select({id:exerciseJobs.id}).from(exerciseJobs).where(eq(exerciseJobs.status,'RUNNING')).limit(1);
   if(active||advice)return null;
   const [row]=await tx.select().from(scenarioDataBatches).where(and(draft,sql`${state}='QUEUED'`,sql`${available}<=${now}`)).orderBy(asc(available),asc(scenarioDataBatches.createdAt)).limit(1).for('update',{skipLocked:true});
   if(!row)return null;
   const previous=config(row).generationJob!,job:GenerationJob={...previous,state:'RUNNING',attempts:previous.attempts+1,token:generateId(),leaseUntil:now+180000,updatedAt:now,pauseRequested:false};
   await this.write(tx,row,job);return {row,job};
  });
 }
 async tick(){
  if(this.running||this.stopping)return;this.running=true;
  try{
   const claim=await this.claim();if(!claim)return;
   const {row,job}=claim;let error:string|undefined;
   try{
    const [actor]=await this.db.client.select({id:users.id,email:users.email,displayName:users.displayName,status:users.status,testExpiresAt:users.testExpiresAt,preview:previewTeamAccounts.userId}).from(users).leftJoin(previewTeamAccounts,eq(users.id,previewTeamAccounts.userId)).where(eq(users.id,job.actorId)).limit(1);
    if(!actor||actor.status!=='ACTIVE'||actor.preview||(actor.testExpiresAt!=null&&actor.testExpiresAt.getTime()<=Date.now()))throw new ForbiddenException();
    await this.authorize(row.eventId,actor);
    const [event]=await this.db.client.select({status:events.status}).from(events).where(eq(events.id,row.eventId)).limit(1);
    if(!event||['CLOSED','ARCHIVED'].includes(event.status))throw new ConflictException('Exercise is read-only');
    await this.data.advance(row.eventId,row.id,config(row).prepared??0,actor,job.token);
   }catch(e){
    const code=e instanceof HttpException?e.getStatus():0;
    error=code===429?'CAPACITY':code===401||code===403?'ACCESS_REVOKED':code===409?'CONTEXT_CHANGED':code===502?'INVALID_OUTPUT':code===503?'SPARK_UNAVAILABLE':'GENERATION_FAILED';
   }
   await this.db.client.transaction(async tx=>{
    const [current]=await tx.select().from(scenarioDataBatches).where(and(eq(scenarioDataBatches.id,row.id),draft)).for('update').limit(1);
    if(!current)return;const c=config(current),live=c.generationJob;
    if(live?.state!=='RUNNING'||live.token!==job.token)return;
    const now=Date.now();
    await this.write(tx,current,error?failGenerationPage(live,error,now):finishGenerationPage(live,c.prepared===total(c),now));
   });
  }catch{this.logger.warn('Dataset dispatch unavailable; persisted claims recover after expiration');}finally{this.running=false;}
 }
}

import {Injectable,Logger} from '@nestjs/common';
import {loadConfig} from '@cyris/config';
import {getDbClient,events,operationalTasks,resources,scenarioClocks,operationalHolds,exerciseBlueprints,exerciseObservations} from '@cyris/db';
import {and,eq,inArray,isNull,sql} from 'drizzle-orm';
import {Redis} from 'ioredis';
import {exerciseObserverKey,ExerciseObserverSnapshotSchema,observerBucket} from '@cyris/contracts';

@Injectable()
export class ExerciseObserverWorkerService{
 private readonly logger=new Logger(ExerciseObserverWorkerService.name);
 private readonly config=loadConfig();
 private readonly db=getDbClient({url:this.config.DATABASE_URL});
 private readonly redis=new Redis(this.config.REDIS_URL,{enableOfflineQueue:false,maxRetriesPerRequest:1,commandTimeout:1500});
 private running:Promise<void>|null=null;
 private stopping=false;
 constructor(){this.redis.on('error',()=>{});}
 tick():Promise<void>{
  if(this.stopping)return Promise.resolve();
  if(this.running)return this.running;
  this.running=this.observe().catch(()=>this.logger.warn('Exercise observer unavailable; previous samples expire automatically.')).finally(()=>{this.running=null;});
  return this.running;
 }
 private async observe(){
  // Cross-replica rate limit; lease expires even if the worker exits.
  if(await this.redis.set('cyris:exercise-observer:tick:v1','1','PX',50000,'NX')!=='OK')return;
  const now=new Date();
  const reviewHours=sql<number>`coalesce((select ${exerciseBlueprints.reviewAfterHours} from ${exerciseBlueprints} where ${exerciseBlueprints.eventId}=${events.id} order by ${exerciseBlueprints.revision} desc limit 1),12)`;
  const rows=await this.db.select({eventId:events.id,pending:sql<number>`count(${operationalTasks.id})::int`,reviewAfterHours:reviewHours,unchanged:sql<number>`count(*) filter (where ${operationalTasks.updatedAt}<=${now.toISOString()}::timestamptz - (${reviewHours} * interval '1 hour'))::int`,blocked:sql<number>`count(*) filter (where ${operationalTasks.status}='BLOCKED')::int`})
   .from(events)
   .leftJoin(scenarioClocks,eq(scenarioClocks.eventId,events.id))
   .leftJoin(operationalTasks,and(eq(operationalTasks.eventId,events.id),inArray(operationalTasks.status,['OPEN','ACKNOWLEDGED','IN_PROGRESS','BLOCKED']),sql`exists (select 1 from ${resources} where ${resources.id}=${operationalTasks.id} and ${resources.eventId}=${events.id} and ${resources.visibility}='EVENT')`))
   .where(and(eq(events.status,'ACTIVE'),isNull(scenarioClocks.pausedAt),isNull(scenarioClocks.pausedScenarioTime),sql`not exists (select 1 from ${operationalHolds} where ${operationalHolds.eventId}=${events.id} and ${operationalHolds.targetType}='EVENT' and ${operationalHolds.module} in ('ALL','tasks') and ${operationalHolds.restoredAt} is null and ${operationalHolds.startsAt}<=${now.toISOString()}::timestamptz and (${operationalHolds.expiresAt} is null or ${operationalHolds.expiresAt}>${now.toISOString()}::timestamptz))`)).groupBy(events.id);
  if(this.stopping)return;
  // No history of identities or task descriptions; Redis is a disposable derived cache.
  for(let i=0;i<rows.length;i+=100){
   const pipeline=this.redis.pipeline();
   const history:typeof exerciseObservations.$inferInsert[]=[];
   for(const row of rows.slice(i,i+100)){
    const sample=ExerciseObserverSnapshotSchema.parse({...row,observedAt:now.toISOString()});
    pipeline.set(exerciseObserverKey(row.eventId),JSON.stringify(sample),'EX',180);
    history.push({...row,bucketAt:observerBucket(now),observedAt:now});
   }
   await pipeline.exec();
   // First observed value per UTC bucket wins across replicas; no synthetic backfill.
   if(history.length)await this.db.insert(exerciseObservations).values(history).onConflictDoNothing();
  }
 }
 async stop(){this.stopping=true;try{await this.running;}finally{this.redis.disconnect();}}
}

import {Injectable,type OnModuleDestroy} from '@nestjs/common';
import {Redis} from 'ioredis';
import {ConfigService} from '../config/config.service.js';
import {exerciseObserverKey,ExerciseObserverSnapshotSchema,type ExconDashboardResponse,type ExerciseObserverSnapshot} from '@cyris/contracts';
export function validObserverSample(raw:string|null,snapshot:Pick<ExconDashboardResponse,'event'|'scenarioClock'|'holds'>,now=Date.now()):ExerciseObserverSnapshot|null{
 if(!raw||snapshot.event.status!=='ACTIVE'||snapshot.scenarioClock.paused||snapshot.holds.modules.some(m=>m==='ALL'||m==='tasks'))return null;
 try{const parsed=ExerciseObserverSnapshotSchema.parse(JSON.parse(raw)),age=now-Date.parse(parsed.observedAt);
  return parsed.eventId===snapshot.event.id&&age>=-5000&&age<=180000&&parsed.unchanged12h<=parsed.pending&&parsed.blocked<=parsed.pending?parsed:null;
 }catch{return null;}
}
@Injectable()
export class ExerciseObserverReader implements OnModuleDestroy{
 private readonly redis:Redis;
 constructor(config:ConfigService){this.redis=new Redis(config.values.REDIS_URL,{enableOfflineQueue:false,maxRetriesPerRequest:1,commandTimeout:1500});this.redis.on('error',()=>{});}
 async read(snapshot:ExconDashboardResponse){
  try{return validObserverSample(await this.redis.get(exerciseObserverKey(snapshot.event.id)),snapshot);}catch{return null;}
 }
 onModuleDestroy(){this.redis.disconnect();}
}

import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { HttpException, HttpStatus, Injectable, ServiceUnavailableException, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ConfigService } from '../config/config.service.js';

const keyPrefix='cyris:{ai-admission}:';
const keyTtlMs=310_000;
const sharedKeys=['active','regular','wait-regular-order','wait-regular-expiry','wait-support-order','wait-support-expiry','wait-sequence'].map(k=>keyPrefix+k);

// All admission and FIFO mutations are atomic across replicas. Waiting claims
// reserve user/scope uniqueness, not an inference slot. Expired waiters cannot
// block the head of a lane after a crash. No prompt content is stored in Redis.
const acquireSlot=`
local c=redis.call('TIME')
local now=tonumber(c[1])*1000+math.floor(tonumber(c[2])/1000)
local limit=tonumber(ARGV[1])
local regularLimit=tonumber(ARGV[2])
local lane=ARGV[3]
local lease=tonumber(ARGV[4])
local token=ARGV[5]
local ttl=tonumber(ARGV[6])
local wait=tonumber(ARGV[7])
local maxPending=tonumber(ARGV[8])
local initial=ARGV[9]=='1'
redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',now)
redis.call('ZREMRANGEBYSCORE',KEYS[2],'-inf',now)
for i=8,#KEYS do redis.call('ZREMRANGEBYSCORE',KEYS[i],'-inf',now) end
for i=3,5,2 do
  local expired=redis.call('ZRANGEBYSCORE',KEYS[i+1],'-inf',now)
  for _,t in ipairs(expired) do redis.call('ZREM',KEYS[i],t);redis.call('ZREM',KEYS[i+1],t) end
end
local order=lane=='regular' and KEYS[3] or KEYS[5]
local expiry=lane=='regular' and KEYS[4] or KEYS[6]
if initial then
  for i=8,#KEYS do if redis.call('ZCARD',KEYS[i])>0 then return -1 end end
else
  if not redis.call('ZSCORE',expiry,token) then return -2 end
  for i=8,#KEYS do if not redis.call('ZSCORE',KEYS[i],token) then return -2 end end
end
local head=redis.call('ZRANGE',order,0,0)[1]
local capacity=redis.call('ZCARD',KEYS[1])<limit
if lane=='regular' and (redis.call('ZCARD',KEYS[2])>=regularLimit or redis.call('ZCARD',KEYS[5])>0) then capacity=false end
if capacity and ((initial and not head) or (not initial and head==token)) then
  redis.call('ZREM',order,token);redis.call('ZREM',expiry,token)
  redis.call('ZADD',KEYS[1],now+lease,token);redis.call('PEXPIRE',KEYS[1],ttl)
  if lane=='regular' then redis.call('ZADD',KEYS[2],now+lease,token);redis.call('PEXPIRE',KEYS[2],ttl) end
  for i=8,#KEYS do redis.call('ZADD',KEYS[i],now+lease,token);redis.call('PEXPIRE',KEYS[i],ttl) end
  return 1
end
if not initial then return 2 end
if wait<=0 or redis.call('ZCARD',KEYS[3])+redis.call('ZCARD',KEYS[5])>=maxPending then return 0 end
local seq=redis.call('INCR',KEYS[7]);redis.call('PEXPIRE',KEYS[7],ttl)
redis.call('ZADD',order,seq,token);redis.call('PEXPIRE',order,ttl)
redis.call('ZADD',expiry,now+wait,token);redis.call('PEXPIRE',expiry,ttl)
for i=8,#KEYS do redis.call('ZADD',KEYS[i],now+wait,token);redis.call('PEXPIRE',KEYS[i],ttl) end
return 2
`;

export function inferenceTimeoutMs(requested:number):number{
 return Number.isFinite(requested)?Math.max(1000,Math.min(300_000,requested)):60_000;
}

@Injectable()
export class AIAdmissionService implements OnModuleDestroy{
 private readonly redis:Redis;
 private readonly limit:number;
 private readonly maxWaitMs:number;
 private readonly maxPending:number;
 private stopping=false;

 constructor(config:ConfigService){
  this.limit=config.values.CYRIS_AI_MAX_CONCURRENT;
  this.maxWaitMs=config.values.CYRIS_AI_MAX_WAIT_MS??8000;
  this.maxPending=config.values.CYRIS_AI_MAX_PENDING??16;
  this.redis=new Redis(config.values.REDIS_URL,{enableOfflineQueue:false,maxRetriesPerRequest:1,commandTimeout:1500});
  this.redis.on('error',()=>{});
 }

 async run<T>(lane:'regular'|'support',userId:string|null|undefined,timeoutMs:number,work:()=>Promise<T>,exclusiveScope?:string,waitForCapacity=false):Promise<T>{
  if(this.stopping)throw new ServiceUnavailableException('AI is shutting down');
  const keys=[...sharedKeys];
  if(userId)keys.push(keyPrefix+'user:'+userId);
  if(exclusiveScope)keys.push(keyPrefix+'scope:'+exclusiveScope);
  const token=randomUUID(),wait=waitForCapacity?this.maxWaitMs:0;
  const deadline=performance.now()+wait;
  const busy=()=>new HttpException('AI je vytížená. Zkus to za chvíli.',HttpStatus.TOO_MANY_REQUESTS);
  let initial=true;
  try{
   for(;;){
    if(this.stopping)throw new ServiceUnavailableException('AI is shutting down');
    if(!initial&&performance.now()>=deadline)throw busy();
    let state:unknown;
    try{
     state=await this.redis.eval(acquireSlot,keys.length,...keys,this.limit,Math.max(1,this.limit-1),lane,inferenceTimeoutMs(timeoutMs)+5000,token,keyTtlMs,wait,this.maxPending,initial?'1':'0');
    }catch{throw new ServiceUnavailableException('AI je dočasně nedostupná. Zkus to později.');}
    if(state===1){
     if(this.stopping)throw new ServiceUnavailableException('AI is shutting down');
     return await work();
    }
    if(state!==2)throw busy();
    initial=false;
    const remaining=deadline-performance.now();
    if(remaining<=0)throw busy();
    await delay(Math.min(200,remaining));
   }
  }finally{
   // Includes a lost Redis reply: remove our token, not other callers' claims.
   try{
    const release=this.redis.multi();
    for(const key of keys.filter((_,i)=>i!==6))release.zrem(key,token);
    await release.exec();
   }catch{/* lease expiration is the crash fallback */}
  }
 }

 /** Live inference leases and expiring waiters, not GPU utilization. */
 async snapshot():Promise<{limit:number;active:number;regular:number;waiting:number;waitingSupport:number;maxPending:number;maxWaitMs:number}|null>{
  try{
   const values=await this.redis.eval(`local c=redis.call('TIME');local now=tonumber(c[1])*1000+math.floor(tonumber(c[2])/1000);return {redis.call('ZCOUNT',KEYS[1],'('..now,'+inf'),redis.call('ZCOUNT',KEYS[2],'('..now,'+inf'),redis.call('ZCOUNT',KEYS[3],'('..now,'+inf'),redis.call('ZCOUNT',KEYS[4],'('..now,'+inf')}`,4,sharedKeys[0]!,sharedKeys[1]!,sharedKeys[3]!,sharedKeys[5]!);
   if(!Array.isArray(values)||values.length!==4||values.some(v=>!Number.isInteger(v)||v<0))return null;
   return {limit:this.limit,active:Number(values[0]),regular:Number(values[1]),waiting:Number(values[2])+Number(values[3]),waitingSupport:Number(values[3]),maxPending:this.maxPending,maxWaitMs:this.maxWaitMs};
  }catch{return null;}
 }
 onModuleDestroy(){this.stopping=true;this.redis.disconnect();}
}

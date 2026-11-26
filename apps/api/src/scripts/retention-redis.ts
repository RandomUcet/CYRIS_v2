import {createHash} from 'node:crypto';
import {Redis} from 'ioredis';
import {exerciseObserverKey,ExerciseObserverSnapshotSchema} from '@cyris/contracts';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maxKeys=20000;
const aiPrefix='cyris:{ai-admission}:';
const globalPrefixes=['cyris:session:','cyris:user_sessions:','cyris:ratelimit:id:','cyris:ratelimit:ip:','oidc:state:'];
const globalObserver='cyris:exercise-observer:tick:v1';
const observerPrefix='cyris:exercise-observer:v2:';
export function classifyRetentionRedisKey(key:string,eventId:string){
  if(!uuid.test(eventId))throw Error('Invalid exercise ID');
  if(key===exerciseObserverKey(eventId))return 'TARGET_CACHE';
  if(key.startsWith(observerPrefix)&&uuid.test(key.slice(observerPrefix.length)))return 'OTHER_CACHE';
  if(key===globalObserver||globalPrefixes.some(p=>key.startsWith(p)&&key.length>p.length))return 'PRESERVE';
  if(key.startsWith(aiPrefix))return 'AI_ADMISSION';
  if(key.startsWith('bull:'))return 'UNREVIEWED_QUEUE';
  return 'UNKNOWN';
}
const activeAiScript="local c=redis.call('TIME'); local now=tonumber(c[1])*1000+math.floor(tonumber(c[2])/1000); return {redis.call('ZCOUNT',KEYS[1],'('..now,'+inf'),redis.call('ZCOUNT',KEYS[2],'('..now,'+inf'),redis.call('ZCOUNT',KEYS[3],'('..now,'+inf')}";
const compareDelete="local v=redis.call('GET',KEYS[1]); if not v then return 0 end; if v~=ARGV[1] then return -1 end; return redis.call('DEL',KEYS[1])";
export async function inspectRetentionRedis(client:Redis,eventId:string){
  if(!uuid.test(eventId))throw Error('Invalid exercise ID');
  let cursor='0',iterations=0;
  const keys=new Set<string>();
  do{
    const [next,batch]=await client.scan(cursor,'COUNT',500);
    cursor=next;
    for(const key of batch)keys.add(key);
    if(keys.size>maxKeys||++iterations>10000)throw Error('Redis inventory incomplete');
  }while(cursor!=='0');
  const counts={targetCache:0,otherCache:0,preserved:0,aiAdmission:0,unreviewedQueue:0,unknown:0};
  for(const key of keys){
    switch(classifyRetentionRedisKey(key,eventId)){
      case 'TARGET_CACHE':counts.targetCache++;break;
      case 'OTHER_CACHE':counts.otherCache++;break;
      case 'PRESERVE':counts.preserved++;break;
      case 'AI_ADMISSION':counts.aiAdmission++;break;
      case 'UNREVIEWED_QUEUE':counts.unreviewedQueue++;break;
      default:counts.unknown++;
    }
  }
  const raw=await client.get(exerciseObserverKey(eventId));
  if(raw!==null){
    const sample=ExerciseObserverSnapshotSchema.parse(JSON.parse(raw));
    if(sample.eventId!==eventId)throw Error('Observer cache exercise mismatch');
  }
  const active=await client.eval(activeAiScript,3,aiPrefix+'active',aiPrefix+'wait-regular-expiry',aiPrefix+'wait-support-expiry');
  if(!Array.isArray(active)||active.length!==3||active.some(n=>!Number.isSafeInteger(n)||n<0))throw Error('AI admission inventory invalid');
  const aiWork=active.reduce((sum:number,n:number)=>sum+n,0);
  // No tokens, keys, cache data or session payloads in exported inventory.
  const digest=createHash('sha256').update(JSON.stringify([eventId,raw])).digest('hex');
  return {counts,aiWork,digest,raw};
}
/** Internal isolated rehearsal only. No production route.
 * All API/worker writers must be stopped first. Never flush Redis or remove
 * sessions, admission claims, other exercises or unknown queue keys. */
export async function removeRetentionRedisCache(client:Redis,eventId:string,expectedDigest:string){
  const plan=await inspectRetentionRedis(client,eventId);
  if(plan.counts.unknown||plan.counts.unreviewedQueue||plan.aiWork)throw Error('Unreconciled Redis work');
  if(plan.digest!==expectedDigest)throw Error('Stale Redis cache plan');
  if(plan.raw===null)return {removed:0};
  const result=await client.eval(compareDelete,1,exerciseObserverKey(eventId),plan.raw);
  if(result!==1)throw Error('Redis cache changed during removal');
  if(await client.exists(exerciseObserverKey(eventId)))throw Error('Redis cache removal incomplete');
  return {removed:1};
}

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Redis} from 'ioredis';
import {exerciseObserverKey} from '@cyris/contracts';
import {classifyRetentionRedisKey,inspectRetentionRedis,removeRetentionRedisCache} from './retention-redis.js';
const a=randomUUID(),b=randomUUID();
test('Redis retention classifies exact exercise cache without treating sessions or queues as deletable',()=>{
  assert.equal(classifyRetentionRedisKey(exerciseObserverKey(a),a),'TARGET_CACHE');
  assert.equal(classifyRetentionRedisKey(exerciseObserverKey(b),a),'OTHER_CACHE');
  assert.equal(classifyRetentionRedisKey('cyris:session:'+a,a),'PRESERVE');
  assert.equal(classifyRetentionRedisKey('bull:test:wait',a),'UNREVIEWED_QUEUE');
  assert.equal(classifyRetentionRedisKey('unknown:'+a,a),'UNKNOWN');
});
const url=process.env.CYRIS_TEST_REDIS_URL;
const isolated=Boolean(process.env.CYRIS_TEST_DATABASE_ISOLATED==='true'&&url&&/^redis:\/\/127\.0\.0\.1:\d+$/.test(url));
test('real Redis removes only exact observer cache and blocks queues, active AI and stale plans',{skip:!isolated},async()=>{
  // Dedicated logical test DB, never flush or mutate existing keys.
  const client=new Redis(url!,{db:15,maxRetriesPerRequest:1,commandTimeout:3000});
  const session='cyris:session:'+randomUUID(),queue='bull:retention-test:wait',ai='cyris:{ai-admission}:active';
  const keyA=exerciseObserverKey(a),keyB=exerciseObserverKey(b);
  const sample=(eventId:string,pending:number)=>JSON.stringify({eventId,observedAt:new Date().toISOString(),pending,reviewAfterHours:12,unchanged:0,blocked:0});
  let created=false;
  try{
    assert.equal(await client.dbsize(),0,'dedicated Redis DB must be empty');
    created=true;
    await client.mset(keyA,sample(a,1),keyB,sample(b,2),session,'protected');
    const initial=await inspectRetentionRedis(client,a);
    await client.set(keyA,sample(a,3));
    await assert.rejects(removeRetentionRedisCache(client,a,initial.digest),/Stale/);
    const plan=await inspectRetentionRedis(client,a);
    await client.lpush(queue,'job');
    await assert.rejects(removeRetentionRedisCache(client,a,plan.digest),/Unreconciled/);
    await client.del(queue);
    await client.zadd(ai,Date.now()+60000,'lease');
    await assert.rejects(removeRetentionRedisCache(client,a,plan.digest),/Unreconciled/);
    await client.del(ai);
    assert.deepEqual(await removeRetentionRedisCache(client,a,plan.digest),{removed:1});
    assert.equal(await client.exists(keyA),0);
    assert.equal(JSON.parse((await client.get(keyB))!).pending,2);
    assert.equal(await client.get(session),'protected');
    assert.deepEqual(await removeRetentionRedisCache(client,a,(await inspectRetentionRedis(client,a)).digest),{removed:0});
  }finally{if(created)await client.del(keyA,keyB,session,queue,ai);client.disconnect();}
});

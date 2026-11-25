import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import postgres from 'postgres';

const url=process.env.CYRIS_TEST_DATABASE_URL;
const isolated=process.env.CYRIS_TEST_DATABASE_ISOLATED==='true'&&url&&(()=>{try{return ['localhost','127.0.0.1','::1'].includes(new URL(url).hostname)}catch{return false}})();
const ctl=fileURLToPath(new URL('../../../deploy/cyrisctl',import.meta.url));
function cleanupSql(eventId:string,scope:string,expected?:string){
  return execFileSync('python3',['-c','import runpy,sys; m=runpy.run_path(sys.argv[1]); print(m["cleanup_sql"](sys.argv[2],sys.argv[3],*(sys.argv[4:])))',ctl,eventId,scope,...(expected?[expected,'b'.repeat(64)]:[])],{encoding:'utf8'});
}
test('actual host cleanup SQL is scoped, rollback-only by default, stale-safe and audited',{
  skip:!isolated&&'Requires verified isolated PostgreSQL',
},async()=>{
  const client=postgres(url!,{max:1,prepare:false});
  const a=randomUUID(),b=randomUUID(),user=randomUUID(),task=randomUUID(),linked=randomUUID(),other=randomUUID(),note=randomUUID(),unread=randomUUID(),foreignNote=randomUUID(),link=randomUUID(),court=randomUUID(),request=randomUUID(),priorAudit=randomUUID();
  async function run(scope:string,eventId:string,expected?:string){
    const conn=await client.reserve();
    try{
      const output=await conn.unsafe(cleanupSql(eventId,scope,expected)).simple();
      const sets=Array.isArray(output)&&Array.isArray(output[0])?output:[output];
      for(const set of sets){
        const row=(set as unknown as Array<{json_build_object?:{eventId:string;count:number;digest:string;blockers:string[]}}>)[0];
        if(row?.json_build_object)return row.json_build_object;
      }
      throw new Error('No cleanup plan returned');
    }catch(err){await conn.unsafe('ROLLBACK').simple();throw err;}
    finally{conn.release();}
  }
  try{
    await client`insert into users(id,email,display_name) values(${user},${user+'@example.invalid'},'Fixture')`;
    await client`insert into events(id,slug,name,status) values(${a},${a},'Cleanup fixture','ARCHIVED'),(${b},${b},'Other exercise','ARCHIVED')`;
    for(const [id,event] of [[task,a],[linked,a],[other,b]] as const){
      await client`insert into resources(id,event_id,resource_type) values(${id},${event},'operational_task')`;
      await client`insert into operational_tasks(id,event_id,task_number,title,status,source_type,created_by_user_id) values(${id},${event},${id},'Fixture','COMPLETED','MANUAL',${user})`;
    }
    await client`insert into resource_relationships(id,event_id,source_resource_id,target_resource_id,relationship_type) values(${link},${a},${linked},${task},'RELATED')`;
    assert.equal((await run('terminal-tasks',a)).count,0);
    await client`delete from resource_relationships where id=${link}`;
    await client`update operational_tasks set status='OPEN' where id=${linked}`;
    await client`insert into notifications(id,event_id,user_id,type,template_key,read_at) values(${note},${a},${user},'TEST','test',now()),(${unread},${a},${user},'TEST','test',null),(${foreignNote},${b},${user},'TEST','test',now())`;
    // A legacy FK reference from another domain must block execution, never cascade.
    await client`insert into resources(id,event_id,resource_type) values(${court},${a},'court_case')`;
    await client`insert into court_cases(id,event_id,court_case_number,title) values(${court},${a},'CRT-CLEANUP','Fixture')`;
    await client`insert into court_requests(id,event_id,court_case_id,kind,subject,details,requested_by_user_id,linked_resource_id)
      values(${request},${a},${court},'OTHER','Legacy reference','Must remain protected',${user},${task})`;
    const blocked=await run('terminal-tasks',a);
    assert.equal(blocked.count,1);assert.ok(blocked.blockers.some(x=>x.includes('court_requests')));
    await assert.rejects(run('terminal-tasks',a,blocked.digest),/Cleanup refused/);
    await client`delete from court_requests where id=${request}`;
    await client`insert into audit_events(id,event_id,actor_type,action,category) values(${priorAudit},${a},'SYSTEM','fixture.prior','administration')`;
    const plan=await run('terminal-tasks',a);
    assert.equal(plan.count,1);assert.deepEqual(plan.blockers,[]);
    assert.equal((await client`select id from operational_tasks where id=${task}`).length,1);
    await assert.rejects(run('terminal-tasks',a,'0'.repeat(64)),/Cleanup refused/);
    await client`update events set status='ACTIVE' where id=${a}`;
    await assert.rejects(run('terminal-tasks',a,(await run('terminal-tasks',a)).digest),/Cleanup refused/);
    await client`update events set status='ARCHIVED' where id=${a}`;
    const current=await run('terminal-tasks',a);
    await run('terminal-tasks',a,current.digest);
    assert.equal((await client`select id from operational_tasks where id=${task}`).length,0);
    assert.equal((await client`select id from operational_tasks where id in (${linked},${other})`).length,2);
    assert.equal((await client`select id from outbox_events where event_type='search.delete' and payload->>'id'=${task}`).length,1);
    const notices=await run('read-notifications',a);
    assert.equal(notices.count,1);
    await run('read-notifications',a,notices.digest);
    assert.equal((await client`select id from notifications where id=${note}`).length,0);
    assert.equal((await client`select id from notifications where id in (${unread},${foreignNote})`).length,2);
    assert.equal((await client`select id from audit_events where event_id=${a} and action='event.cleanup.executed'`).length,2);
    assert.equal((await client`select id from users where id=${user}`).length,1);
    assert.equal((await client`select id from audit_events where id=${priorAudit} and event_id=${a}`).length,1);
  }finally{
    await client`delete from outbox_events where payload->>'id'=${task}`.catch(()=>undefined);
    await client`delete from audit_events where event_id in (${a},${b})`.catch(()=>undefined);
    await client`delete from events where id in (${a},${b})`.catch(()=>undefined);
    await client`delete from users where id=${user}`.catch(()=>undefined);
    await client.end();
  }
});

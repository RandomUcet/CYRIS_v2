import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import postgres from 'postgres';
import {drizzle} from 'drizzle-orm/postgres-js';
import {migrate} from 'drizzle-orm/postgres-js/migrator';

const enabled=process.env.CYRIS_TEST_RETENTION_UPGRADE==='true';
const folder=fileURLToPath(new URL('../migrations',import.meta.url));
const url=process.env.CYRIS_TEST_DATABASE_URL;
const baselines=[
  {version:'2.4.22',count:35,last:'0034_legal_library',database:'cyris_upgrade_2422'},
  {version:'2.5.1',count:42,last:'0041_exercise_inject_setup',database:'cyris_upgrade_251'},
] as const;
for(const baseline of baselines)test('populated schema upgrade from '+baseline.version+' preserves exercise and immutable audit',{skip:!enabled},async()=>{
  if(process.env.CYRIS_TEST_DATABASE_ISOLATED!=='true'||!url)throw Error('Dedicated isolated upgrade database required');
  const target=new URL(url);
  if(!['127.0.0.1','localhost'].includes(target.hostname)||target.pathname!=='/cyris_test')throw Error('Unexpected CI database');
  target.pathname='/'+baseline.database;
  const client=postgres(target.toString(),{max:1,prepare:false});
  const temp=await mkdtemp(join(tmpdir(),'cyris-upgrade-'));
  try{
    const existing=await client`SELECT tablename FROM pg_tables WHERE schemaname='public'`;
    assert.equal(existing.length,0,'upgrade DB must be empty');
    const journal=JSON.parse(await readFile(join(folder,'meta','_journal.json'),'utf8')) as {entries:{tag:string;idx:number}[]};
    const entries=journal.entries.slice(0,baseline.count);
    assert.equal(entries.length,baseline.count);
    assert.equal(entries.at(-1)?.tag,baseline.last);
    await mkdir(join(temp,'meta'));
    await writeFile(join(temp,'meta','_journal.json'),JSON.stringify({...journal,entries}));
    for(const entry of entries)await copyFile(join(folder,entry.tag+'.sql'),join(temp,entry.tag+'.sql'));
    const db=drizzle(client);
    await migrate(db,{migrationsFolder:temp});
    assert.equal((await client`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`)[0]?.n,baseline.count);
    const a=randomUUID(),b=randomUUID(),user=randomUUID(),unit=randomUUID(),doc=randomUUID(),audit=randomUUID();
    await client`INSERT INTO events(id,slug,name,status) VALUES(${a},${a},'Upgrade fixture','ARCHIVED'),(${b},${b},'Other fixture','ACTIVE')`;
    await client`INSERT INTO users(id,email,display_name) VALUES(${user},${user+'@example.invalid'},'Shared user')`;
    await client`INSERT INTO event_memberships(id,event_id,user_id) VALUES(gen_random_uuid(),${a},${user}),(gen_random_uuid(),${b},${user})`;
    await client`INSERT INTO organizational_units(id,event_id,name,slug) VALUES(${unit},${a},'Team','team')`;
    await client`INSERT INTO resources(id,event_id,resource_type) VALUES(${doc},${a},'document')`;
    await client`INSERT INTO documents(id,event_id,title,original_filename,mime_type,byte_size,object_key,sha256) VALUES(${doc},${a},'Original report','report.txt','text/plain',3,${'documents/'+a+'/report'},${'a'.repeat(64)})`;
    await client`INSERT INTO audit_events(id,event_id,actor_type,action,category,metadata) VALUES(${audit},${a},'SYSTEM','upgrade.fixture','administration','{"fixture":true}'::jsonb)`;
    const before=await client`SELECT to_jsonb(e) AS event,to_jsonb(a) AS audit,to_jsonb(d) AS document FROM events e JOIN audit_events a ON a.event_id=e.id JOIN documents d ON d.event_id=e.id WHERE e.id=${a}`;
    const membershipBefore=await client`SELECT to_jsonb(m) AS membership FROM event_memberships m WHERE user_id=${user} ORDER BY id`;
    await migrate(db,{migrationsFolder:folder});
    await migrate(db,{migrationsFolder:folder});
    assert.equal((await client`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`)[0]?.n,journal.entries.length);
    assert.deepEqual(await client`SELECT to_jsonb(e) AS event,to_jsonb(a) AS audit,to_jsonb(d) AS document FROM events e JOIN audit_events a ON a.event_id=e.id JOIN documents d ON d.event_id=e.id WHERE e.id=${a}`,before);
    assert.deepEqual(await client`SELECT to_jsonb(m) AS membership FROM event_memberships m WHERE user_id=${user} ORDER BY id`,membershipBefore);
    assert.equal((await client`SELECT id FROM organizational_units WHERE id=${unit}`).length,1);
    assert.equal((await client`SELECT id FROM events WHERE id=${b}`).length,1);
    await assert.rejects(client`UPDATE audit_events SET action='changed' WHERE id=${audit}`,/immutable/i);
    await assert.rejects(client`INSERT INTO audit_events(id,event_id,actor_type,action,category) VALUES(gen_random_uuid(),${randomUUID()},'SYSTEM','bad','administration')`,/existing exercise/);
    assert.equal((await client`SELECT event_id FROM removed_exercise_receipts`).length,0);
  }finally{await client.end();await rm(temp,{recursive:true,force:true});}
});

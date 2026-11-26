import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {hash,argon2id} from 'argon2';
import {getDbClient,closeDatabaseConnection,sql,addMissingEventTemplates} from '@cyris/db';
import {bootstrapSystem} from './system-bootstrap.js';

async function main(){
  const url=process.env.DATABASE_URL;
  const output=process.env.CYRIS_BROWSER_FIXTURE_PATH;
  const password=process.env.CYRIS_BROWSER_FIXTURE_PASSWORD;
  if(process.env.GITHUB_ACTIONS!=='true'||process.env.CYRIS_TEST_DATABASE_ISOLATED!=='true'||!url||!output||!password)throw Error('Isolated CI browser fixture required');
  const parsed=new URL(url);
  if(parsed.hostname!=='127.0.0.1'||parsed.pathname!=='/cyris_browser_smoke')throw Error('Unexpected browser fixture database');
  const db=getDbClient();
  if((await db.execute(sql`SELECT id FROM events LIMIT 1`)).length||(await db.execute(sql`SELECT id FROM users LIMIT 1`)).length)throw Error('Browser fixture database must be empty');
  await bootstrapSystem(db,{});
  const event=randomUUID(),archived=randomUUID(),foreign=randomUUID(),admin=randomUUID(),participant=randomUUID(),membership=randomUUID(),role=randomUUID(),team=randomUUID(),task=randomUUID(),foreignTask=randomUUID();
  const adminEmail='browser-admin@example.invalid',participantEmail='browser-participant@example.invalid';
  const requester=randomUUID(),[analyst,lead]=[randomUUID(),randomUUID()].sort() as [string,string],usb=randomUUID();
  const requesterEmail='browser-bps@example.invalid',analystEmail='browser-cyber@example.invalid',leadEmail='browser-cyber-lead@example.invalid';
  let bpsUnit='',cyberUnit='';
  const passwordHash=await hash(password,{type:argon2id,memoryCost:65536,timeCost:3,parallelism:4});
  await db.transaction(async tx=>{
    await tx.execute(sql`INSERT INTO events(id,slug,name,status,default_locale) VALUES
      (${event},'browser-active','Browser active exercise','ACTIVE','en'),
      (${archived},'browser-archived','Browser archived exercise','ARCHIVED','en'),
      (${foreign},'browser-other','Browser unrelated exercise','ACTIVE','en')`);
    for(const [id,email,name] of [[admin,adminEmail,'Browser Administrator'],[participant,participantEmail,'Browser Participant'],[requester,requesterEmail,'Browser BPS investigator'],[analyst,analystEmail,'Browser forensic analyst'],[lead,leadEmail,'Browser forensic lead']] as const){
      await tx.execute(sql`INSERT INTO users(id,email,display_name) VALUES(${id},${email},${name})`);
      await tx.execute(sql`INSERT INTO user_identities(id,user_id,provider_type,provider_subject,password_hash) VALUES(gen_random_uuid(),${id},'LOCAL',${email},${passwordHash})`);
      await tx.execute(sql`INSERT INTO user_preferences(user_id,locale) VALUES(${id},'en')`);
    }
    await tx.execute(sql`INSERT INTO role_assignments(id,role_id,user_id) SELECT gen_random_uuid(),id,${admin} FROM roles WHERE slug='platform-admin' AND event_id IS NULL`);
    await addMissingEventTemplates(tx,event);
    const [bps]=await tx.execute(sql`SELECT id FROM organizational_units WHERE event_id=${event} AND slug='bezpecnostne-pravni-sluzby'`);
    const [cyber]=await tx.execute(sql`SELECT id FROM organizational_units WHERE event_id=${event} AND slug='kyberneticky-forenzni-tym'`);
    if(!bps?.id||!cyber?.id)throw Error('Canonical team fixtures missing');
    bpsUnit=String(bps.id);cyberUnit=String(cyber.id);
    for(const [id,unit,slug] of [[requester,bpsUnit,'team-bps-operator'],[analyst,cyberUnit,'team-cyber-forensic-operator'],[lead,cyberUnit,'team-digital-forensic-lead']] as const){
      const member=randomUUID();
      await tx.execute(sql`INSERT INTO event_memberships(id,event_id,user_id) VALUES(${member},${event},${id})`);
      await tx.execute(sql`INSERT INTO membership_unit_assignments(id,membership_id,unit_id) VALUES(gen_random_uuid(),${member},${unit})`);
      await tx.execute(sql`INSERT INTO role_assignments(id,role_id,membership_id,unit_id) SELECT gen_random_uuid(),id,${member},${unit} FROM roles WHERE event_id=${event} AND slug=${slug}`);
    }
    await tx.execute(sql`INSERT INTO resources(id,event_id,resource_type,visibility,owning_unit_id,owner_user_id) VALUES(${usb},${event},'evidence','EVENT',${bpsUnit},${requester})`);
    await tx.execute(sql`INSERT INTO evidence(id,evidence_number,title,description,evidence_type,status,owning_unit_id,current_holder_id) VALUES(${usb},'EV-BROWSER-USB','Browser USB sample','Private source detail for access test','DIGITAL','SECURED',${bpsUnit},${requester})`);
    await tx.execute(sql`INSERT INTO organizational_units(id,event_id,name,slug) VALUES(${team},${event},'Browser investigation team','investigation')`);
    await tx.execute(sql`INSERT INTO event_memberships(id,event_id,user_id) VALUES(${membership},${event},${participant})`);
    await tx.execute(sql`INSERT INTO membership_unit_assignments(id,membership_id,unit_id) VALUES(gen_random_uuid(),${membership},${team})`);
    await tx.execute(sql`INSERT INTO roles(id,event_id,name,slug) VALUES(${role},${event},'Browser participant','participant')`);
    for(const permission of ['event.read','task.read','task.create'])await tx.execute(sql`INSERT INTO role_permissions(id,role_id,permission_key,scope) VALUES(gen_random_uuid(),${role},${permission},'EVENT')`);
    await tx.execute(sql`INSERT INTO role_assignments(id,role_id,membership_id) VALUES(gen_random_uuid(),${role},${membership})`);
    await tx.execute(sql`INSERT INTO resources(id,event_id,resource_type,visibility) VALUES(${task},${event},'operational_task','EVENT'),(${foreignTask},${foreign},'operational_task','EVENT')`);
    await tx.execute(sql`INSERT INTO operational_tasks(id,event_id,task_number,title,status,source_type,assigned_user_id,created_by_user_id) VALUES
      (${task},${event},'BROWSER-001','Browser assigned report review','OPEN','MANUAL',${participant},${participant}),
      (${foreignTask},${foreign},'BROWSER-002','Foreign hidden report','OPEN','MANUAL',${admin},${admin})`);
    await tx.execute(sql`INSERT INTO organizational_units(id,event_id,name,slug) VALUES(gen_random_uuid(),${archived},'Archived team','archived-team')`);
    await tx.execute(sql`INSERT INTO audit_events(id,event_id,actor_type,action,category) VALUES(gen_random_uuid(),${archived},'SYSTEM','browser.fixture','administration')`);
  });
  await writeFile(output,JSON.stringify({event,archived,foreign,adminEmail,participantEmail,requesterEmail,analystEmail,leadEmail,analyst,bpsUnit,cyberUnit,usb}),{mode:0o600,flag:'wx'});
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Fixture failed');process.exitCode=1;}).finally(closeDatabaseConnection);

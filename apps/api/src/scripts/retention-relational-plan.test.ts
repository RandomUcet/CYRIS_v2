import 'reflect-metadata';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {getDbClient,closeDatabaseConnection,sql} from '@cyris/db';
import {inspectRelationalRetention,retentionAction} from './retention-relational-plan.js';
import {requireVerifiedIsolatedDatabase} from '../regression/isolated-postgres-harness.js';
test('reset and full removal retain the immutable audit',()=>{
  assert.equal(retentionAction('roles','reset'),'KEEP');
  assert.equal(retentionAction('roles','remove'),'DELETE');
  assert.equal(retentionAction('audit_events','remove'),'KEEP');
  assert.throws(()=>retentionAction('users','remove'));
});
const url=requireVerifiedIsolatedDatabase();
test('relational planner inspects migrated tables and cross-event FK links',{skip:!url&&'Requires verified isolated PostgreSQL'},async()=>{
  const db=getDbClient({url:url!,max:1});
  const a=randomUUID(),b=randomUUID(),u=randomUUID(),p=randomUUID(),q=randomUUID(),link=randomUUID(),audit=randomUUID();
  const rollback=new Error('fixture rollback');
  try{
    await db.transaction(async tx=>{
      await tx.execute(sql`insert into events(id,slug,name,status) values(${a},${a},'A','ARCHIVED'),(${b},${b},'B','ARCHIVED')`);
      await tx.execute(sql`insert into organizational_units(id,event_id,name,slug) values(${u},${a},'Team','team')`);
      await tx.execute(sql`insert into resources(id,event_id,resource_type) values(${p},${a},'person'),(${q},${b},'person')`);
      await tx.execute(sql`insert into audit_events(id,event_id,action,category) values(${audit},${a},'fixture','fixture')`);
      const clean=await inspectRelationalRetention(tx,a);
      assert.deepEqual(clean.missingTables,[]);assert.deepEqual(clean.unsupportedTables,[]);
      assert.deepEqual(clean.conflicts,[]);
      assert.deepEqual(clean.tables.find(t=>t.table==='organizational_units'),{table:'organizational_units',count:1,reset:'KEEP',remove:'DELETE'});
      assert.equal(clean.auditRows,1);assert.equal(clean.executable,false);
      await tx.execute(sql`insert into resource_relationships(id,event_id,source_resource_id,target_resource_id,relationship_type) values(${link},${b},${q},${p},'RELATED')`);
      const acl=randomUUID(),activity=randomUUID(),badActivity=randomUUID(),globalRole=randomUUID(),user=randomUUID(),member=randomUUID(),badGrant=randomUUID();
      await tx.execute(sql`INSERT INTO resource_access_control(id,resource_id,principal_type,principal_id) VALUES(${acl},${q},'UNIT',${u})`);
      await tx.execute(sql`INSERT INTO activity_events(id,event_id,activity_type,title,related_resource_ids) VALUES
        (${activity},${b},'TEST','Foreign JSON',${JSON.stringify([p])}::jsonb),
        (${badActivity},${a},'TEST','Malformed JSON','{}'::jsonb)`);
      await tx.execute(sql`INSERT INTO users(id,email,display_name) VALUES(${user},${user+'@example.invalid'},'Fixture')`);
      await tx.execute(sql`INSERT INTO event_memberships(id,event_id,user_id) VALUES(${member},${a},${user})`);
      await tx.execute(sql`INSERT INTO roles(id,name,slug) VALUES(${globalRole},'Platform fixture',${globalRole})`);
      await tx.execute(sql`INSERT INTO role_assignments(id,role_id,membership_id) VALUES(${badGrant},${globalRole},${member})`);
      const extended=await inspectRelationalRetention(tx,a);
      assert.ok(extended.conflicts.some(c=>c.constraint==='principal_id (polymorphic ACL)'&&c.count===1));
      assert.ok(extended.conflicts.some(c=>c.constraint==='related_resource_ids (JSON)'&&c.count===2));
      assert.ok(extended.conflicts.some(c=>c.child==='public.role_assignments'&&c.parent==='public.event_memberships'));
      await tx.execute(sql`DELETE FROM resource_access_control WHERE id=${acl}`);
      await tx.execute(sql`DELETE FROM activity_events WHERE id IN (${activity},${badActivity})`);
      await tx.execute(sql`DELETE FROM role_assignments WHERE id=${badGrant}`);
      const resolved=await inspectRelationalRetention(tx,a);
      assert.ok(!resolved.conflicts.some(c=>c.constraint.includes('polymorphic ACL')||c.constraint.includes('(JSON)')||c.child==='public.role_assignments'));
      const unknown='retention_unknown_'+randomUUID().replaceAll('-','');
      await tx.execute(sql.raw('CREATE TABLE public."'+unknown+'" (id uuid PRIMARY KEY,event_id uuid REFERENCES public.events(id))'));
      const blocked=await inspectRelationalRetention(tx,a);
      assert.ok(blocked.unknownTables.includes(unknown));
      assert.ok(blocked.conflicts.some(c=>c.child==='public.resource_relationships'&&c.parent==='public.resources'&&c.count===1));
      assert.equal((await tx.execute(sql`select id from resources where id in (${p},${q})`)).length,2);
      throw rollback;
    });
  }catch(err){if(err!==rollback)throw err;}finally{await closeDatabaseConnection();}
});

import 'reflect-metadata';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {getDbClient,closeDatabaseConnection,sql} from '@cyris/db';
import {inspectRelationalRetention,retentionAction} from './retention-relational-plan.js';
import {requireVerifiedIsolatedDatabase} from '../regression/isolated-postgres-harness.js';
test('reset keeps configuration and full removal detaches audit',()=>{
  assert.equal(retentionAction('roles','reset'),'KEEP');
  assert.equal(retentionAction('roles','remove'),'DELETE');
  assert.equal(retentionAction('audit_events','remove'),'DETACH_AUDIT');
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

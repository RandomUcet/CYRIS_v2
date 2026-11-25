import 'reflect-metadata';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {getDbClient,closeDatabaseConnection,sql} from '@cyris/db';
import {requireVerifiedIsolatedDatabase} from '../regression/isolated-postgres-harness.js';
import {inspectRetentionOutbox,removeRetentionOutbox} from './retention-outbox.js';
const url=requireVerifiedIsolatedDatabase();
test('isolated PostgreSQL outbox cleanup rejects stale or ambiguous work and preserves audit and other exercises',{skip:!url},async()=>{
  const db=getDbClient({url:url!,max:1}),a=randomUUID(),b=randomUUID(),ra=randomUUID(),rb=randomUUID(),unit=randomUUID();
  const ids=Array.from({length:9},()=>randomUUID());
  const rollback=new Error('rollback outbox fixture');
  try{await db.transaction(async tx=>{
    // Regression suites run sequentially but other fixtures can leave queued
    // records with deleted targets. Hold the table lock throughout and verify
    // that these existing ambiguous rows block apply before isolating fixtures.
    await tx.execute(sql`LOCK TABLE outbox_events IN SHARE ROW EXCLUSIVE MODE`);
    const prior=await inspectRetentionOutbox(tx,a,'reset');
    if(prior.blocked.length){
      const before=await tx.execute<{id:string}>(sql`SELECT id FROM outbox_events ORDER BY id`);
      // No exercise exists yet; after creating it, assert the same blockers.
      await tx.execute(sql`INSERT INTO events(id,slug,name,status) VALUES(${a},${a},'Temporary guard fixture','ARCHIVED')`);
      const guarded=await inspectRetentionOutbox(tx,a,'reset');
      assert.deepEqual(guarded.blocked,prior.blocked);
      await assert.rejects(removeRetentionOutbox(tx,a,'reset',guarded.digest),/Unresolved/);
      assert.deepEqual(await tx.execute<{id:string}>(sql`SELECT id FROM outbox_events ORDER BY id`),before);
      await tx.execute(sql`DELETE FROM events WHERE id=${a}`);
    }
    // Test-only isolation inside the transaction that always rolls back.
    // Do not modify the production planner to ignore unknown work.
    const preexisting=await tx.execute<{id:string}>(sql`SELECT id FROM outbox_events ORDER BY id`);
    await tx.execute(sql`DELETE FROM outbox_events`);
    await tx.execute(sql`INSERT INTO events(id,slug,name,status) VALUES(${a},${a},'A','ARCHIVED'),(${b},${b},'B','ARCHIVED')`);
    await tx.execute(sql`INSERT INTO resources(id,event_id,resource_type) VALUES(${ra},${a},'document'),(${rb},${b},'document')`);
    await tx.execute(sql`INSERT INTO organizational_units(id,event_id,name,slug) VALUES(${unit},${a},'Team','team')`);
    const insert=async(id:string,eventType:string,status:string,payload:object)=>tx.execute(sql`INSERT INTO outbox_events(id,event_type,status,payload) VALUES(${id},${eventType},${status},${JSON.stringify(payload)}::jsonb)`);
    await insert(ids[0]!,'search.upsert','PENDING',{type:'document',id:ra});
    await insert(ids[1]!,'document.extract_text','FAILED',{documentId:ra,objectKey:'fixture'});
    await insert(ids[2]!,'search.upsert','PENDING',{type:'document',id:rb});
    await insert(ids[3]!,'audit.archival','PENDING',{eventId:a});
    await insert(ids[4]!,'search.upsert','PENDING',{type:'unit',id:unit});
    await insert(ids[5]!,'search.delete','PROCESSED',{type:'document',id:ra});
    const baseline=await inspectRetentionOutbox(tx,a,'reset');
    assert.deepEqual([...baseline.removable].sort(),[ids[0],ids[1]].sort());
    assert.ok(baseline.kept.includes(ids[4]!));
    await insert(ids[6]!,'search.upsert','PROCESSING',{type:'document',id:ra});
    await assert.rejects(removeRetentionOutbox(tx,a,'reset',baseline.digest),/Stale/);
    let plan=await inspectRetentionOutbox(tx,a,'reset');
    assert.ok(plan.blocked.includes(ids[6]!));
    await assert.rejects(removeRetentionOutbox(tx,a,'reset',plan.digest),/Unresolved/);
    await tx.execute(sql`DELETE FROM outbox_events WHERE id=${ids[6]}`);
    await insert(ids[7]!,'search.upsert','PENDING',{type:'document',id:rb,eventId:a});
    await insert(ids[8]!,'unknown.future.job','PENDING',{eventId:a});
    plan=await inspectRetentionOutbox(tx,a,'reset');
    assert.ok(plan.blocked.includes(ids[7]!)&&plan.blocked.includes(ids[8]!));
    await assert.rejects(removeRetentionOutbox(tx,a,'reset',plan.digest),/Unresolved/);
    await tx.execute(sql`DELETE FROM outbox_events WHERE id IN (${ids[7]},${ids[8]})`);
    // Other pre-existing unresolved rows must also block the operation. In the
    // isolated fixture no unrelated unclassifiable active work may be present.
    plan=await inspectRetentionOutbox(tx,a,'reset');
    assert.deepEqual(plan.blocked,[]);
    assert.deepEqual(await removeRetentionOutbox(tx,a,'reset',plan.digest),{removed:2});
    const full=await inspectRetentionOutbox(tx,a,'remove');
    assert.deepEqual(full.removable,[ids[4]]);
    assert.deepEqual(await removeRetentionOutbox(tx,a,'remove',full.digest),{removed:1});
    const remaining=await tx.execute<{id:string}>(sql`SELECT id FROM outbox_events WHERE id IN (${ids[0]},${ids[1]},${ids[2]},${ids[3]},${ids[4]},${ids[5]})`);
    assert.deepEqual(remaining.map(x=>x.id).sort(),[ids[2],ids[3],ids[5]].sort());
    assert.ok(preexisting.every(row=>!remaining.some(x=>x.id===row.id)));
    throw rollback;
  });}catch(e){if(e!==rollback)throw e;}finally{await closeDatabaseConnection();}
});

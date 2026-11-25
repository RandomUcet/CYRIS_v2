
import 'reflect-metadata';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {getDbClient,closeDatabaseConnection,sql,type CyrisDatabase} from '@cyris/db';
import {inspectRelationalRetention,retentionOwnershipPredicate,childFirstRetentionOrder} from './retention-relational-plan.js';
import {recordRemovedExerciseReceipt} from './retention-audit-receipt.js';
import {requireVerifiedIsolatedDatabase} from '../regression/isolated-postgres-harness.js';

type Tx=Parameters<Parameters<CyrisDatabase['transaction']>[0]>[0];
const url=requireVerifiedIsolatedDatabase();
const q=(name:string)=>'"'+name.replaceAll('"','""')+'"';
/** Deliberately test-only. No production route, CLI, recovery token or commit path.
 * The enclosing transaction always rolls back. A successful rehearsal proves
 * relational behavior only; it is not authorization to remove external objects.
 */
async function executeRehearsal(tx:Tx,eventId:string,profile:'reset'|'remove'){
  const [event]=await tx.execute<{status:string}>(sql`SELECT status FROM events WHERE id=${eventId}::uuid`);
  if(event?.status!=='ARCHIVED')throw new Error('Exercise must be archived');
  const plan=await inspectRelationalRetention(tx,eventId);
  if(plan.unknownTables.length||plan.missingTables.length||plan.unsupportedTables.length||plan.conflicts.length)throw new Error('Unsafe relational inventory');
  const deletion=plan.tables.filter(t=>t[profile]==='DELETE');
  const names=deletion.map(t=>t.table);
  const edges=await tx.execute<{child:string;parent:string}>(sql`SELECT ct.relname AS child,pt.relname AS parent
    FROM pg_constraint c JOIN pg_class ct ON ct.oid=c.conrelid JOIN pg_class pt ON pt.oid=c.confrelid
    JOIN pg_namespace cn ON cn.oid=ct.relnamespace JOIN pg_namespace pn ON pn.oid=pt.relnamespace
    WHERE c.contype='f' AND cn.nspname='public' AND pn.nspname='public'`);
  const order=childFirstRetentionOrder(names,[...edges]);
  let removed=0;
  if(profile==='remove')await recordRemovedExerciseReceipt(tx,eventId);
  for(const table of order){
    // Child rows are deleted before their ownership parent; explicit count checks
    // reject accidental cascades or schema mismatch rather than counting them twice.
    const expected=deletion.find(t=>t.table===table)!.count;
    const [result]=await tx.execute<{count:number}>(sql.raw('WITH removed AS (DELETE FROM public.'+q(table)+' r WHERE '+retentionOwnershipPredicate(table,eventId)+' RETURNING 1) SELECT count(*)::integer AS count FROM removed'));
    if(Number(result?.count??-1)!==expected)throw new Error('Unexpected affected rows: '+table);
    removed+=expected;
  }
  assert.equal(removed,profile==='reset'?plan.resetRows:plan.removeRows);
  return {removed,order};
}
test('child-first order blocks cycles and does not duplicate self-references',()=>{
  assert.deepEqual(childFirstRetentionOrder(['events','resources','documents'],[{child:'resources',parent:'events'},{child:'documents',parent:'resources'},{child:'resources',parent:'resources'}]),['documents','resources','events']);
  assert.throws(()=>childFirstRetentionOrder(['a','b'],[{child:'a',parent:'b'},{child:'b',parent:'a'}]),/cyclic/);
  assert.throws(()=>retentionOwnershipPredicate('users',randomUUID()),/Unclassified/);
  assert.throws(()=>retentionOwnershipPredicate('events','not a uuid'),/Invalid/);
});
test('real relational reset and full removal execute in disposable PostgreSQL and roll back',{
  skip:!url&&'Requires verified isolated PostgreSQL',
},async()=>{
  const db=getDbClient({url:url!,max:1});
  const a=randomUUID(),b=randomUUID(),user=randomUUID(),unit=randomUUID(),unitB=randomUUID(),role=randomUUID(),membership=randomUUID(),assignment=randomUUID(),permission=randomUUID(),membershipB=randomUUID(),task=randomUUID(),taskB=randomUUID(),note=randomUUID(),audit=randomUUID(),foreignAudit=randomUUID(),link=randomUUID();
  const rollback=new Error('always roll back rehearsal');
  try{
    await db.transaction(async tx=>{
      await tx.execute(sql`INSERT INTO users(id,email,display_name) VALUES(${user},${user+'@example.invalid'},'Shared test operator')`);
      await tx.execute(sql`INSERT INTO events(id,slug,name,status) VALUES(${a},${a},'Reset fixture','ARCHIVED'),(${b},${b},'Unrelated fixture','ARCHIVED')`);
      await tx.execute(sql`INSERT INTO organizational_units(id,event_id,name,slug) VALUES(${unit},${a},'Team A','team-a'),(${unitB},${b},'Team B','team-b')`);
      await tx.execute(sql`INSERT INTO event_memberships(id,event_id,user_id) VALUES(${membership},${a},${user}),(${membershipB},${b},${user})`);
      await tx.execute(sql`INSERT INTO membership_unit_assignments(id,membership_id,unit_id) VALUES(${assignment},${membership},${unit})`);
      await tx.execute(sql`INSERT INTO roles(id,event_id,name,slug) VALUES(${role},${a},'Fixture role','fixture-role')`);
      await tx.execute(sql`INSERT INTO role_permissions(id,role_id,permission_key,scope) VALUES(${permission},${role},'registry.read','EVENT')`);
      await tx.execute(sql`INSERT INTO role_assignments(id,role_id,membership_id,unit_id) VALUES(gen_random_uuid(),${role},${membership},${unit})`);
      await tx.execute(sql`INSERT INTO resources(id,event_id,resource_type,owning_unit_id) VALUES(${task},${a},'operational_task',${unit}),(${taskB},${b},'operational_task',${unitB})`);
      await tx.execute(sql`INSERT INTO operational_tasks(id,event_id,task_number,title,status,source_type,created_by_user_id) VALUES(${task},${a},'TASK-RESET','Fixture','COMPLETED','MANUAL',${user}),(${taskB},${b},'TASK-OTHER','Other','OPEN','MANUAL',${user})`);
      await tx.execute(sql`INSERT INTO notifications(id,event_id,user_id,type,template_key) VALUES(${note},${a},${user},'TEST','test')`);
      await tx.execute(sql`INSERT INTO audit_events(id,event_id,action,category) VALUES(${audit},${a},'fixture.a','fixture'),(${foreignAudit},${b},'fixture.b','fixture')`);
      const beforeB=await inspectRelationalRetention(tx,b);
      const auditBefore=await tx.execute<{body:unknown}>(sql`SELECT to_jsonb(a) AS body FROM audit_events a WHERE id=${audit}`);
      // Cross-event reference must refuse the entire operation before mutation.
      await tx.execute(sql`INSERT INTO resource_relationships(id,event_id,source_resource_id,target_resource_id,relationship_type) VALUES(${link},${b},${taskB},${task},'RELATED')`);
      await assert.rejects(executeRehearsal(tx,a,'reset'),/Unsafe relational inventory/);
      assert.equal((await tx.execute(sql`SELECT id FROM resources WHERE id=${task}`)).length,1);
      await tx.execute(sql`DELETE FROM resource_relationships WHERE id=${link}`);
      await tx.execute(sql`UPDATE events SET status='ACTIVE' WHERE id=${a}`);
      await assert.rejects(executeRehearsal(tx,a,'reset'),/archived/);
      await tx.execute(sql`UPDATE events SET status='ARCHIVED' WHERE id=${a}`);
      const reset=await executeRehearsal(tx,a,'reset');
      assert.ok(reset.removed>=3);
      const afterReset=await inspectRelationalRetention(tx,a);
      assert.equal(afterReset.resetRows,0);
      for(const table of ['events','organizational_units','roles','role_permissions','role_assignments','event_memberships','membership_unit_assignments','audit_events'])
        assert.equal(afterReset.tables.find(t=>t.table===table)?.count,1,table);
      assert.deepEqual((await inspectRelationalRetention(tx,b)).tables,beforeB.tables);
      await assert.rejects(tx.transaction(async sub=>{
        await sub.execute(sql`DELETE FROM events WHERE id=${a}`);
      }),/matching archived removal receipt/);
      await assert.rejects(tx.transaction(async sub=>{
        await recordRemovedExerciseReceipt(sub,a);
        await sub.execute(sql`SET CONSTRAINTS removed_exercise_receipt_requires_removal IMMEDIATE`);
      }),/same transaction/);
      await assert.rejects(tx.transaction(async sub=>{
        await sub.execute(sql`INSERT INTO removed_exercise_receipts(event_id,slug,name,audit_count) VALUES(gen_random_uuid(),'missing','Missing',0)`);
      }),/matching live archived exercise/);
      await assert.rejects(tx.transaction(async sub=>{
        await sub.execute(sql`INSERT INTO removed_exercise_receipts(event_id,slug,name,audit_count) VALUES(${a},${a},'Reset fixture',999)`);
      }),/audit count does not match/);
      const removal=await executeRehearsal(tx,a,'remove');
      assert.ok(removal.removed>=7);
      assert.equal(removal.order.at(-1),'events');
      assert.equal((await tx.execute(sql`SELECT id FROM events WHERE id=${a}`)).length,0);
      assert.equal((await tx.execute(sql`SELECT id FROM users WHERE id=${user}`)).length,1);
      assert.deepEqual((await inspectRelationalRetention(tx,b)).tables,beforeB.tables);
      const [detached]=await tx.execute<{eventId:string|null;body:unknown}>(sql`SELECT event_id AS "eventId",to_jsonb(a) AS body FROM audit_events a WHERE id=${audit}`);
      assert.equal(detached?.eventId,a);assert.deepEqual(detached?.body,auditBefore[0]?.body);
      const [receipt]=await tx.execute<{eventId:string;slug:string;auditCount:number}>(sql`SELECT event_id AS "eventId",slug,audit_count AS "auditCount" FROM removed_exercise_receipts WHERE event_id=${a}`);
      assert.equal(receipt?.eventId,a);assert.equal(receipt?.slug,a);assert.equal(receipt?.auditCount,1);
      await tx.execute(sql`SET CONSTRAINTS removed_exercise_receipt_requires_removal IMMEDIATE`);
      await assert.rejects(tx.transaction(async sub=>{
        await sub.execute(sql`INSERT INTO events(id,slug,name) VALUES(${a},${a},'Reused')`);
      }),/Historical exercise identity cannot be reused/);
      await assert.rejects(tx.transaction(async sub=>{
        await sub.execute(sql`UPDATE audit_events SET event_id=${b} WHERE id=${audit}`);
      }),/Audit events are immutable/);
      await assert.rejects(tx.transaction(async sub=>{
        await sub.execute(sql`INSERT INTO audit_events(id,event_id,action,category) VALUES(gen_random_uuid(),${a},'late','fixture')`);
      }),/existing exercise/);
      // Explicit exception forces rollback even when every assertion passes.
      throw rollback;
    });
  }catch(err){if(err!==rollback)throw err;}
  finally{await closeDatabaseConnection();}
});

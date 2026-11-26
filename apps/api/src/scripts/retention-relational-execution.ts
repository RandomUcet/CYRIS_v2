import {sql,type CyrisDatabase} from '@cyris/db';
import {inspectRelationalRetention,retentionOwnershipPredicate,childFirstRetentionOrder} from './retention-relational-plan.js';
import {recordRemovedExerciseReceipt} from './retention-audit-receipt.js';
import {inspectRetentionOutbox,removeRetentionOutbox} from './retention-outbox.js';
import {recordRetentionCommit,readRetentionCommit,type RetentionCommitIdentity} from './retention-commit-witness.js';
type Tx=Parameters<Parameters<CyrisDatabase['transaction']>[0]>[0];
const q=(name:string)=>'"'+name.replaceAll('"','""')+'"';
/** Deliberately test-only. No production route, CLI, recovery token or commit path.
 * The caller must use a disposable database; no production caller exists. A successful rehearsal proves
 * relational behavior only; it is not authorization to remove external objects.
 */
export async function executeRehearsal(tx:Tx,eventId:string,profile:'reset'|'remove'){
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
  if(removed!==(profile==='reset'?plan.resetRows:plan.removeRows))throw Error('Unexpected total affected rows');
  return {removed,order};
}
/** Test-only combined transaction; never remove canonical rows before resolving
 * pending outbox ownership. A failed relational phase rolls back the outbox
 * phase too. The host must eventually provide independent writer isolation. */
export async function executeCombinedRehearsal(tx:Tx,identity:RetentionCommitIdentity){
  const {eventId,profile}=identity;
  return tx.transaction(async sub=>{
    if(await readRetentionCommit(sub,identity))throw Error('Retention operation already recorded');
    const plan=await inspectRetentionOutbox(sub,eventId,profile);
    const outbox=await removeRetentionOutbox(sub,eventId,profile,plan.digest);
    await recordRetentionCommit(sub,identity);
    const relational=await executeRehearsal(sub,eventId,profile);
    return {...relational,outboxRemoved:outbox.removed};
  });
}

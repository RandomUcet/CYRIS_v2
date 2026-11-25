import {sql,type CyrisDatabase} from '@cyris/db';
type Tx=Parameters<Parameters<CyrisDatabase['transaction']>[0]>[0];

/** Internal transaction building block, not authorization to delete data.
 * Lock the event before counting audit rows; insert and removal must commit
 * together (enforced by deferred constraint trigger).
 */
export async function recordRemovedExerciseReceipt(tx:Tx,eventId:string){
  const [event]=await tx.execute<{id:string}>(sql`SELECT id FROM events WHERE id=${eventId}::uuid AND status='ARCHIVED' FOR UPDATE`);
  if(!event)throw new Error('An archived exercise is required for a removal receipt');
  const [row]=await tx.execute<{eventId:string;slug:string;name:string;auditCount:number}>(sql`
    INSERT INTO removed_exercise_receipts(event_id,slug,name,audit_count)
    SELECT e.id,e.slug,e.name,(SELECT count(*)::integer FROM audit_events a WHERE a.event_id=e.id)
    FROM events e WHERE e.id=${eventId}::uuid AND e.status='ARCHIVED'
    RETURNING event_id AS "eventId",slug,name,audit_count AS "auditCount"
  `);
  if(!row)throw new Error('An archived exercise is required for a removal receipt');
  return row;
}

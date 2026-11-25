import {sql,type CyrisDatabase} from '@cyris/db';
type Tx=Parameters<Parameters<CyrisDatabase['transaction']>[0]>[0];
export type RetentionCommitIdentity={installationId:string;operationId:string;eventId:string;profile:'reset'|'remove';planDigest:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const action='event.retention.relational.commit';
function validate(c:RetentionCommitIdentity){
  if(!c||![c.installationId,c.operationId,c.eventId].every(x=>typeof x==='string'&&uuid.test(x))
    ||!['reset','remove'].includes(c.profile)||!/^[0-9a-f]{64}$/.test(c.planDigest))throw Error('Invalid retention commit identity');
}
function metadata(c:RetentionCommitIdentity){
  validate(c);
  return JSON.stringify({version:1,installationId:c.installationId,operationId:c.operationId,profile:c.profile,planDigest:c.planDigest});
}
/** Read only from the authoritative PostgreSQL instance. A matching immutable
 * audit row is a witness for the relational transaction, NOT proof that S3,
 * Redis, Typesense or a recovery-media backup completed. */
export async function readRetentionCommit(tx:Tx,c:RetentionCommitIdentity){
  const meta=metadata(c);
  const [row]=await tx.execute<{matches:boolean}>(sql`
    SELECT (event_id=${c.eventId}::uuid AND action=${action} AND category='administration'
      AND actor_type='SYSTEM' AND outcome='SUCCESS' AND resource_type='event'
      AND resource_id=${c.eventId} AND metadata=${meta}::jsonb) IS TRUE AS matches
    FROM audit_events WHERE id=${c.operationId}::uuid
  `);
  if(!row)return false;
  if(!row.matches)throw Error('Retention commit identity collision');
  return true;
}
/** Internal transaction building block. Call before relational deletion in the
 * SAME transaction; if any subsequent phase fails, the witness and archive
 * message must roll back with it. No production caller or standalone route.
 * The operation UUID is the immutable audit ID, not a mutable progress flag. */
export async function recordRetentionCommit(tx:Tx,c:RetentionCommitIdentity){
  const meta=metadata(c);
  if(await readRetentionCommit(tx,c))throw Error('Retention operation already recorded');
  const [event]=await tx.execute<{id:string}>(sql`
    SELECT id FROM events WHERE id=${c.eventId}::uuid AND status='ARCHIVED' FOR UPDATE
  `);
  if(!event)throw Error('Exercise must be archived');
  const rows=await tx.execute<{id:string}>(sql`
    WITH witness AS (
      INSERT INTO audit_events(id,event_id,actor_type,action,category,resource_type,resource_id,outcome,metadata)
      VALUES(${c.operationId}::uuid,${c.eventId}::uuid,'SYSTEM',${action},'administration','event',${c.eventId},'SUCCESS',${meta}::jsonb)
      RETURNING *
    )
    INSERT INTO outbox_events(id,event_type,status,payload)
    SELECT id,'audit.archival','PENDING',jsonb_build_object(
      'id',id,'eventId',event_id,'actorType',actor_type,'actorUserId',actor_user_id,
      'action',action,'category',category,'resourceType',resource_type,'resourceId',resource_id,
      'outcome',outcome,'metadata',metadata,'occurredAt',occurred_at)
    FROM witness RETURNING id
  `);
  if(rows.length!==1||rows[0]?.id!==c.operationId)throw Error('Retention commit witness incomplete');
}

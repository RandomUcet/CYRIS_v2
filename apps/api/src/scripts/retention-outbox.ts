import {createHash} from 'node:crypto';
import {sql,type CyrisDatabase} from '@cyris/db';
type Tx=Parameters<Parameters<CyrisDatabase['transaction']>[0]>[0];
type Profile='reset'|'remove';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ROWS=20000;
const active=['PENDING','FAILED','PROCESSING'];
type Entry={id:string;eventType:string;status:string;payloadText:string;owner:string|null;resolved:boolean;entityType:string|null;declaredEvent:string|null;targetId:string|null};

/** Ownership is resolved from live canonical identities before deletion.
 * No payload-only claim, prefix match or generic resource ID is sufficient.
 * Audit archival is deliberately excluded regardless of exercise. */
export async function inspectRetentionOutbox(tx:Tx,eventId:string,profile:Profile){
  if(!uuid.test(eventId)||!['reset','remove'].includes(profile))throw Error('Invalid outbox scope');
  const rows=await tx.execute<Entry>(sql`
    WITH candidates AS (
      SELECT o.id,o.event_type,o.status,o.payload,
        CASE WHEN o.event_type='document.extract_text' THEN 'document'
          WHEN o.event_type IN ('search.upsert','search.delete') THEN lower(o.payload->>'type') END AS raw_type,
        CASE WHEN o.event_type='document.extract_text' THEN o.payload->>'documentId'
          WHEN o.event_type IN ('search.upsert','search.delete') THEN o.payload->>'id' END AS target_id
      FROM outbox_events o WHERE o.status IN ('PENDING','FAILED','PROCESSING')
        AND o.event_type<>'audit.archival'
      ORDER BY o.id LIMIT ${MAX_ROWS+1}
    ), typed AS (
      SELECT *,CASE raw_type WHEN 'task' THEN 'operational_task' WHEN 'indicator' THEN 'technical_indicator'
        WHEN 'medical' THEN 'medical_encounter' ELSE raw_type END AS entity_type
      FROM candidates
    )
    SELECT t.id,t.event_type AS "eventType",t.status,t.payload::text AS "payloadText",
      t.entity_type AS "entityType",t.payload->>'eventId' AS "declaredEvent",t.target_id AS "targetId",
      coalesce(e.id,u.event_id,ro.event_id,r.event_id) AS owner,
      (e.id IS NOT NULL OR u.id IS NOT NULL OR ro.id IS NOT NULL OR r.id IS NOT NULL) AS resolved
    FROM typed t
    LEFT JOIN events e ON t.entity_type='event' AND e.id::text=t.target_id
    LEFT JOIN organizational_units u ON t.entity_type='unit' AND u.id::text=t.target_id
    LEFT JOIN roles ro ON t.entity_type='role' AND ro.id::text=t.target_id
    LEFT JOIN resources r ON t.entity_type IN ('person','organisation','location','vehicle','device','weapon','licence',
      'incident','case','evidence','lab_analysis','document','forensic_analysis','technical_indicator','court_case','operational_task','medical_encounter')
      AND r.id::text=t.target_id AND lower(r.resource_type)=t.entity_type
    ORDER BY t.id
  `);
  if(rows.length>MAX_ROWS)throw Error('Outbox inventory limit exceeded');
  const removable:string[]=[],blocked:string[]=[],kept:string[]=[];
  for(const row of rows){
    if(!row.resolved||(row.declaredEvent!==null&&row.declaredEvent!==row.owner)){
      blocked.push(row.id);continue;
    }
    if(row.owner!==eventId)continue;
    if(row.status==='PROCESSING'){blocked.push(row.id);continue;}
    if(profile==='reset'&&['event','unit','role'].includes(row.entityType??'')){kept.push(row.id);continue;}
    // Only known supported work with a canonical target and inactive status.
    if(!active.includes(row.status)){blocked.push(row.id);continue;}
    removable.push(row.id);
  }
  // Digest includes all observed active non-audit rows and exact payloads, not
  // merely counts. The digest is internal; payloads are never returned to UI.
  const digest=createHash('sha256').update(JSON.stringify([eventId,profile,rows])).digest('hex');
  return {digest,removable,blocked,kept};
}

/** Isolated rehearsal building block. External workers and API writers MUST
 * be stopped before any eventual host use. The DB lock alone cannot stop a
 * worker that already fetched a row or an external search request.
 * No route/CLI calls this function. */
export async function removeRetentionOutbox(tx:Tx,eventId:string,profile:Profile,expectedDigest:string){
  if(!/^[0-9a-f]{64}$/.test(expectedDigest))throw Error('Invalid outbox digest');
  await tx.execute(sql`LOCK TABLE outbox_events IN SHARE ROW EXCLUSIVE MODE`);
  const [event]=await tx.execute<{status:string}>(sql`SELECT status FROM events WHERE id=${eventId}::uuid FOR UPDATE`);
  if(event?.status!=='ARCHIVED')throw Error('Exercise must be archived');
  const plan=await inspectRetentionOutbox(tx,eventId,profile);
  if(plan.digest!==expectedDigest)throw Error('Stale outbox plan');
  if(plan.blocked.length)throw Error('Unresolved or processing outbox work');
  if(!plan.removable.length)return {removed:0};
  const ids=sql.join(plan.removable.map(id=>sql`${id}::uuid`),sql`,`);
  const deleted=await tx.execute<{id:string}>(sql`DELETE FROM outbox_events
    WHERE id IN (${ids}) AND event_type<>'audit.archival' AND status IN ('PENDING','FAILED') RETURNING id`);
  if(deleted.length!==plan.removable.length)throw Error('Unexpected outbox deletion count');
  return {removed:deleted.length};
}

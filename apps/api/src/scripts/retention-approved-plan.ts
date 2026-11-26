import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {sql,type CyrisDatabase} from '@cyris/db';
import {inspectRelationalRetention,retentionOwnershipPredicate} from './retention-relational-plan.js';
import {inspectRetentionOutbox} from './retention-outbox.js';
import {executeCombinedRehearsal} from './retention-relational-execution.js';
import {validateRecoveryManifest,type RecoveryObject} from './retention-object-recovery.js';
import type {RecoveryContext} from './retention-recovery-manifest.js';

type Tx=Parameters<Parameters<CyrisDatabase['transaction']>[0]>[0];
type Scope=Omit<RecoveryContext,'planDigest'>;
type ApprovedPlan={scope:Scope;slug:string;issuedAt:number;expiresAt:number;inventoryDigest:string;objectDigest:string;authorization:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const hex=/^[0-9a-f]{64}$/;
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const quote=(v:string)=>'"'+v.replaceAll('"','""')+'"';
const MAX_ROWS=20000;
const TTL=5*60*1000;
function canonical(scope:Scope):Scope{
  if(!scope||![scope.installationId,scope.operationId,scope.eventId].every(x=>typeof x==='string'&&uuid.test(x))
    ||!['reset','remove'].includes(scope.profile)||typeof scope.sourceBucket!=='string'||typeof scope.recoveryBucket!=='string'
    ||!scope.sourceBucket||!scope.recoveryBucket||scope.sourceBucket===scope.recoveryBucket)throw Error('Invalid approved scope');
  return {installationId:scope.installationId,operationId:scope.operationId,eventId:scope.eventId,profile:scope.profile,sourceBucket:scope.sourceBucket,recoveryBucket:scope.recoveryBucket};
}
function objectDigest(scope:Scope,objects:readonly RecoveryObject[]){
  validateRecoveryManifest(scope.operationId,objects.map(o=>o.key),objects);
  return digest(objects.map(o=>[o.key,o.backupKey,o.size,o.sha256,o.etag,o.contentType??null]));
}
function payload(p:Omit<ApprovedPlan,'authorization'>){
  return [1,canonical(p.scope),p.slug,p.issuedAt,p.expiresAt,p.inventoryDigest,p.objectDigest];
}
function authenticate(p:Omit<ApprovedPlan,'authorization'>,key:Uint8Array){
  if(key.byteLength!==32)throw Error('Approval key must be 32 bytes');
  return createHmac('sha256',key).update('CYRIS retention approval v1\0').update(JSON.stringify(payload(p))).digest('hex');
}
export function verifyRetentionApproval(p:ApprovedPlan,scope:Scope,objects:readonly RecoveryObject[],confirmedSlug:string,key:Uint8Array,now=Date.now()):RecoveryContext{
  if(!p||!Number.isSafeInteger(p.issuedAt)||!Number.isSafeInteger(p.expiresAt)||p.issuedAt>now||p.expiresAt<=now
    ||p.expiresAt-p.issuedAt!==TTL||typeof p.inventoryDigest!=='string'||!hex.test(p.inventoryDigest)
    ||typeof p.objectDigest!=='string'||!hex.test(p.objectDigest)||typeof p.authorization!=='string'||!hex.test(p.authorization)
    ||typeof p.slug!=='string'||!p.slug||p.slug!==confirmedSlug)throw Error('Invalid or expired retention approval');
  if(JSON.stringify(canonical(p.scope))!==JSON.stringify(canonical(scope))||p.objectDigest!==objectDigest(scope,objects))throw Error('Retention approval scope changed');
  if(!timingSafeEqual(Buffer.from(authenticate(p,key),'hex'),Buffer.from(p.authorization,'hex')))throw Error('Retention approval authentication failed');
  return {...canonical(scope),planDigest:digest(payload(p))};
}

/** Fingerprint exact rows rather than only counts; raw record content never
 * leaves PostgreSQL. The caller must hold independent writer isolation. */
async function inventory(tx:Tx,scope:Scope,objects:readonly RecoveryObject[],lock:boolean){
  scope=canonical(scope);
  if(lock)await tx.execute(sql`LOCK TABLE outbox_events IN SHARE ROW EXCLUSIVE MODE`);
  const [event]=await tx.execute<{slug:string;status:string}>(sql`SELECT slug,status FROM events WHERE id=${scope.eventId}::uuid`);
  if(event?.status!=='ARCHIVED')throw Error('Exercise must be archived');
  let plan=await inspectRelationalRetention(tx,scope.eventId);
  const safe=()=>{if(plan.unknownTables.length||plan.missingTables.length||plan.unsupportedTables.length||plan.conflicts.length)throw Error('Unsafe relational inventory');};
  safe();
  if(lock){
    // Bound table names to the already classified planner, never to request input.
    // The lock is a second line of defense, not proof external writers are stopped.
    await tx.execute(sql.raw('LOCK TABLE '+plan.tables.map(t=>'public.'+quote(t.table)).sort().join(',')+' IN SHARE ROW EXCLUSIVE MODE'));
    plan=await inspectRelationalRetention(tx,scope.eventId);safe();
  }
  const [lockedEvent]=await tx.execute<{slug:string;status:string}>(sql`SELECT slug,status FROM events WHERE id=${scope.eventId}::uuid`);
  if(lockedEvent?.status!=='ARCHIVED'||lockedEvent.slug!==event.slug)throw Error('Exercise changed');
  if(plan.tables.reduce((n,t)=>n+t.count,0)>MAX_ROWS)throw Error('Approval inventory exceeds row limit');
  const stamps=[];
  for(const t of [...plan.tables].sort((a,b)=>a.table.localeCompare(b.table))){
    const rows=await tx.execute<{stamp:string}>(sql.raw('SELECT encode(sha256(convert_to(to_jsonb(r)::text,\'UTF8\')),\'hex\') AS stamp FROM public.'+quote(t.table)+' r WHERE '+retentionOwnershipPredicate(t.table,scope.eventId)+' ORDER BY stamp LIMIT '+(MAX_ROWS+1)));
    if(rows.length!==t.count)throw Error('Relational inventory changed');
    stamps.push([t.table,t[scope.profile],rows.map(r=>r.stamp)]);
  }
  const outbox=await inspectRetentionOutbox(tx,scope.eventId,scope.profile);
  if(outbox.blocked.length)throw Error('Unresolved outbox work');
  const [background]=await tx.execute<{count:number}>(sql`SELECT (
    (SELECT count(*) FROM exercise_jobs WHERE event_id=${scope.eventId}::uuid AND status IN ('QUEUED','RUNNING'))+
    (SELECT count(*) FROM scenario_data_batches WHERE event_id=${scope.eventId}::uuid AND status='GENERATING')+
    (SELECT count(*) FROM forensic_acquisitions a JOIN forensic_analyses f ON f.id=a.analysis_id
       WHERE f.event_id=${scope.eventId}::uuid AND nullif(trim(a.storage_reference),'') IS NOT NULL)
  )::integer AS count`);
  if(!background||background.count)throw Error('Unreconciled external or background work');
  // Check every known object reference from the current DB, including other
  // exercises. The source bucket for documents is the installation's default
  // bucket supplied by the trusted host, not an arbitrary request parameter.
  const refs=await tx.execute<{eventId:string;bucket:string;key:string}>(sql`SELECT * FROM (
    SELECT event_id AS "eventId",${scope.sourceBucket}::text AS bucket,object_key AS key FROM documents
    UNION ALL SELECT d.event_id,${scope.sourceBucket}::text,v.object_key FROM document_versions v JOIN documents d ON d.id=v.document_id
    UNION ALL SELECT r.event_id,m.bucket,m.object_key FROM registry_media m JOIN resources r ON r.id=m.resource_id
    UNION ALL SELECT event_id,bucket,object_key FROM scenario_draft_media
  ) refs LIMIT ${MAX_ROWS+1}`);
  if(refs.length>MAX_ROWS)throw Error('Object reference inventory exceeds limit');
  const wanted=new Set(objects.map(o=>o.key));
  const target=new Set<string>();
  for(const ref of refs){
    if(ref.eventId===scope.eventId){
      if(ref.bucket!==scope.sourceBucket||!wanted.has(ref.key))throw Error('Recovery object selection changed');
      target.add(ref.key);
    }else if(ref.bucket===scope.sourceBucket&&wanted.has(ref.key))throw Error('Shared recovery object');
  }
  if(target.size!==wanted.size)throw Error('Recovery object selection changed');
  return {slug:lockedEvent.slug,inventoryDigest:digest([stamps,outbox.digest]),objectDigest:objectDigest(scope,objects)};
}

/** Rehearsal only. Signing is not proof of recovery-media independence, host
 * isolation or authorization. No production route or key provisioning. */
export async function approveRetentionRehearsal(tx:Tx,scope:Scope,objects:readonly RecoveryObject[],key:Uint8Array,now=Date.now()):Promise<ApprovedPlan>{
  const data=await inventory(tx,scope,objects,false);
  const p={scope:canonical(scope),...data,issuedAt:now,expiresAt:now+TTL};
  return {...p,authorization:authenticate(p,key)};
}
export async function executeApprovedRetentionRehearsal(tx:Tx,scope:Scope,objects:readonly RecoveryObject[],approval:ApprovedPlan,confirmedSlug:string,key:Uint8Array){
  return tx.transaction(async sub=>{
    const context=verifyRetentionApproval(approval,scope,objects,confirmedSlug,key);
    const current=await inventory(sub,scope,objects,true);
    if(current.slug!==approval.slug||current.inventoryDigest!==approval.inventoryDigest||current.objectDigest!==approval.objectDigest)throw Error('Stale retention approval');
    // Check expiry again after potentially lengthy locking and inventory.
    verifyRetentionApproval(approval,scope,objects,confirmedSlug,key);
    return executeCombinedRehearsal(sub,context);
  });
}

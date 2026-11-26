import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {sql,type CyrisDatabase} from '@cyris/db';
import {inspectRelationalRetention,retentionOwnershipPredicate} from './retention-relational-plan.js';
import {inspectRetentionOutbox} from './retention-outbox.js';
import {executeCombinedRehearsal} from './retention-relational-execution.js';
import {validateRecoveryManifest,inspectRecoveryProgress,selectRecoveryObjects,type RecoveryObject} from './retention-object-recovery.js';
import {loadRecoveryManifest,type RecoveryContext} from './retention-recovery-manifest.js';
import {ListObjectsV2Command,type S3Client} from '@aws-sdk/client-s3';
import type {Redis} from 'ioredis';
import {inspectRetentionRedis} from './retention-redis.js';
import type {ObjectReference,ListedObject} from './retention-inventory-core.js';

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
  // Verify stored byte size and hash for current and historical documents;
  // media without a stored checksum must at least have the exact byte size.
  const metadata=await tx.execute<{key:string;size:string;sha:string|null}>(sql`
    SELECT object_key AS key,byte_size::text AS size,sha256 AS sha FROM documents WHERE event_id=${scope.eventId}::uuid
    UNION ALL SELECT v.object_key,v.byte_size::text,v.sha256 FROM document_versions v JOIN documents d ON d.id=v.document_id WHERE d.event_id=${scope.eventId}::uuid
    UNION ALL SELECT m.object_key,m.byte_size::text,NULL::text FROM registry_media m JOIN resources r ON r.id=m.resource_id WHERE r.event_id=${scope.eventId}::uuid
    UNION ALL SELECT object_key,byte_size::text,NULL::text FROM scenario_draft_media WHERE event_id=${scope.eventId}::uuid
  `);
  const staged=new Map(objects.map(o=>[o.key,o]));
  for(const m of metadata){
    const obj=staged.get(m.key);
    if(!obj||!/^\d+$/.test(m.size)||Number(m.size)!==obj.size||(m.sha!==null&&m.sha!==obj.sha256))throw Error('Stored object metadata differs from recovery bytes');
  }
  return {slug:lockedEvent.slug,inventoryDigest:digest([stamps,outbox.digest]),objectDigest:objectDigest(scope,objects)};
}

/** Rehearsal only. Signing is not proof of recovery-media independence, host
 * isolation or authorization. No production route or key provisioning. */
export async function approveRetentionRehearsal(tx:Tx,scope:Scope,objects:readonly RecoveryObject[],key:Uint8Array,now=Date.now()):Promise<ApprovedPlan>{
  const data=await inventory(tx,scope,objects,false);
  const p={scope:canonical(scope),...data,issuedAt:now,expiresAt:now+TTL};
  return {...p,authorization:authenticate(p,key)};
}
type RecoveryPreflight={root:string;manifestKey:Uint8Array;source:S3Client;recovery:S3Client;redis:Redis;auditBucket:string};
/** Re-read the actual object namespace, not an assumed list assembled from
 * database references. The archive bucket can never be a deletion source
 * or recovery destination. All external writers must already be isolated. */
async function verifyActualObjectSelection(tx:Tx,scope:Scope,objects:readonly RecoveryObject[],preflight:RecoveryPreflight){
  if(!preflight.auditBucket||[scope.sourceBucket,scope.recoveryBucket].includes(preflight.auditBucket))throw Error('Protected recovery bucket');
  const refs=await tx.execute<ObjectReference>(sql`SELECT * FROM (
    SELECT event_id AS "eventId",${scope.sourceBucket}::text AS bucket,object_key AS key,'document' AS source FROM documents
    UNION ALL SELECT d.event_id,${scope.sourceBucket}::text,v.object_key,'version' FROM document_versions v JOIN documents d ON d.id=v.document_id
    UNION ALL SELECT r.event_id,m.bucket,m.object_key,'registry' FROM registry_media m JOIN resources r ON r.id=m.resource_id
    UNION ALL SELECT event_id,bucket,object_key,'draft' FROM scenario_draft_media
  ) refs LIMIT ${MAX_ROWS+1}`);
  const ids=await tx.execute<{id:string}>(sql`SELECT id FROM resources WHERE event_id=${scope.eventId}::uuid LIMIT ${MAX_ROWS+1}`);
  if(refs.length>MAX_ROWS||ids.length>MAX_ROWS)throw Error('Object inventory exceeds limit');
  const listed:ListedObject[]=[];
  let scanned=0;
  for(const prefix of ['documents/'+scope.eventId+'/','scenario-drafts/'+scope.eventId+'/','registry/']){
    let token:string|undefined;
    do{
      const page=await preflight.source.send(new ListObjectsV2Command({Bucket:scope.sourceBucket,Prefix:prefix,ContinuationToken:token,MaxKeys:1000}),{abortSignal:AbortSignal.timeout(15000)});
      for(const item of page.Contents??[]){
        if(++scanned>MAX_ROWS||!item.Key)throw Error('Incomplete object listing');
        listed.push({bucket:scope.sourceBucket,key:item.Key});
      }
      const next=page.NextContinuationToken;
      if(page.IsTruncated&&(!next||next===token))throw Error('Incomplete object listing');
      token=page.IsTruncated?next:undefined;
    }while(token);
  }
  const selected=selectRecoveryObjects({eventId:scope.eventId,refs:[...refs],listed,resourceIds:new Set(ids.map(x=>x.id)),bucket:scope.sourceBucket,auditBucket:preflight.auditBucket,listingComplete:true});
  if(JSON.stringify(selected)!==JSON.stringify(objects.map(o=>o.key).sort()))throw Error('Actual object selection changed');
  const states=await inspectRecoveryProgress(preflight.source,preflight.recovery,scope.sourceBucket,scope.recoveryBucket,objects);
  if(states.some((state,i)=>state.state!=='PRESENT'||state.etag!==objects[i]?.etag))throw Error('Original object missing or changed before commit');
}
export async function executeApprovedRetentionRehearsal(tx:Tx,context:RecoveryContext,approval:ApprovedPlan,confirmedSlug:string,key:Uint8Array,preflight:RecoveryPreflight){
  return tx.transaction(async sub=>{
    // Require a re-opened authenticated on-disk manifest, not a caller's
    // mutable staged object array. Validate again under the relational locks.
    const manifest=await loadRecoveryManifest(preflight.root,context,preflight.manifestKey);
    const verified=verifyRetentionApproval(approval,context,manifest.objects,confirmedSlug,key);
    if(verified.planDigest!==context.planDigest)throw Error('Recovery approval digest mismatch');
    const current=await inventory(sub,context,manifest.objects,true);
    if(current.slug!==approval.slug||current.inventoryDigest!==approval.inventoryDigest||current.objectDigest!==approval.objectDigest)throw Error('Stale retention approval');
    const redisPlan=await inspectRetentionRedis(preflight.redis,context.eventId);
    if(redisPlan.counts.unknown||redisPlan.counts.unreviewedQueue||redisPlan.aiWork)throw Error('Unreconciled Redis work before commit');
    await verifyActualObjectSelection(sub,context,manifest.objects,preflight);
    // Check expiry again after locking, listing and byte verification.
    verifyRetentionApproval(approval,context,manifest.objects,confirmedSlug,key);
    return executeCombinedRehearsal(sub,verified);
  });
}

import {createHash} from 'node:crypto';
import {GetBucketVersioningCommand,GetObjectCommand,HeadObjectCommand,PutObjectCommand,DeleteObjectCommand,type S3Client} from '@aws-sdk/client-s3';
import {belongsToEventNamespace,objectIdentity,type ObjectReference,type ListedObject} from './retention-inventory-core.js';

type ObjectStore=Pick<S3Client,'send'>;
export type RecoveryObject={key:string;sha256:string;size:number;etag:string;backupKey:string;contentType?:string};
const MAX_BYTES=16*1024*1024;
const hash=(data:Uint8Array)=>createHash('sha256').update(data).digest('hex');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Exact ownership allowlist; no deletion from prefix listing alone. */
export function selectRecoveryObjects(input:{eventId:string;refs:readonly ObjectReference[];listed:readonly ListedObject[];
  resourceIds:ReadonlySet<string>;bucket:string;auditBucket:string;listingComplete:boolean}){
  const {eventId,refs,listed,resourceIds,bucket,auditBucket,listingComplete}=input;
  if(!uuid.test(eventId)||!bucket||bucket===auditBucket||!listingComplete)throw Error('Incomplete or protected inventory');
  const target=new Set<string>(),foreign=new Set<string>();
  for(const r of refs){
    const id=objectIdentity(r.bucket,r.key);
    if(r.eventId!==eventId){foreign.add(id);continue;}
    if(r.bucket!==bucket||!belongsToEventNamespace(r.key,eventId,resourceIds))throw Error('Unmanaged object reference');
    target.add(id);
  }
  const actual=new Map(listed.filter(r=>r.bucket===bucket&&belongsToEventNamespace(r.key,eventId,resourceIds)).map(r=>[objectIdentity(r.bucket,r.key),r.key]));
  for(const id of target)if(foreign.has(id)||!actual.has(id))throw Error('Shared or missing object');
  for(const id of actual.keys())if(!target.has(id))throw Error('Unreviewed namespace object');
  if(target.size>2000)throw Error('Recovery batch too large');
  return [...target].map(id=>actual.get(id)!).sort();
}

async function assertUnversioned(client:ObjectStore,bucket:string){
  const state=await client.send(new GetBucketVersioningCommand({Bucket:bucket}));
  if(state.Status)throw Error('Versioned or suspended bucket requires separate procedure');
}
async function read(client:ObjectStore,bucket:string,key:string,etag?:string){
  const result=await client.send(new GetObjectCommand({Bucket:bucket,Key:key,IfMatch:etag}));
  if(!result.Body||!result.ETag||result.ContentLength===undefined||result.ContentLength>MAX_BYTES){
    // Abort the body instead of draining an unexpectedly large response.
    const body=result.Body as unknown as {destroy?:()=>void}|undefined;body?.destroy?.();
    throw Error('Object is too large or cannot be verified');
  }
  const bytes=await result.Body.transformToByteArray();
  if(bytes.length!==result.ContentLength||bytes.length>MAX_BYTES)throw Error('Object length mismatch');
  // Metadata-rich/encrypted/object-locked objects are not yet covered by this
  // deliberately narrow restore implementation.
  if(Object.keys(result.Metadata??{}).length||result.ServerSideEncryption||result.ObjectLockMode||result.TagCount||result.ContentEncoding||result.ContentDisposition||result.ContentLanguage||result.CacheControl||result.Expires)throw Error('Object metadata requires separate restore support');
  return {bytes,etag:result.ETag,contentType:result.ContentType};
}

/** Internal isolated rehearsal building block, not a production command.
 * The caller must hold exclusive writer isolation and persist the manifest
 * outside the source service before invoking any removal. */
export async function stageRecoveryObjects(client:ObjectStore,recovery:ObjectStore,sourceBucket:string,recoveryBucket:string,operationId:string,keys:readonly string[]){
  if(!uuid.test(operationId)||sourceBucket===recoveryBucket||new Set(keys).size!==keys.length||keys.length>2000)throw Error('Invalid recovery batch');
  await assertUnversioned(client,sourceBucket);await assertUnversioned(recovery,recoveryBucket);
  const manifest:RecoveryObject[]=[];
  let total=0;
  for(const [i,key] of keys.entries()){
    const head=await client.send(new HeadObjectCommand({Bucket:sourceBucket,Key:key}));
    if(!head.ETag||head.ContentLength===undefined||head.ContentLength>MAX_BYTES)throw Error('Object exceeds recovery bounds');
    total+=head.ContentLength;
    if(total>128*1024*1024)throw Error('Recovery batch exceeds byte budget');
    const original=await read(client,sourceBucket,key,head.ETag);
    const backupKey='retention/'+operationId+'/'+i;
    await recovery.send(new PutObjectCommand({Bucket:recoveryBucket,Key:backupKey,Body:original.bytes,ContentType:original.contentType,IfNoneMatch:'*'}));
    const copy=await read(recovery,recoveryBucket,backupKey);
    const sha256=hash(original.bytes);
    if(hash(copy.bytes)!==sha256||copy.contentType!==original.contentType)throw Error('Recovery verification failed');
    manifest.push({key,sha256,size:original.bytes.length,etag:original.etag,backupKey,contentType:original.contentType});
  }
  return manifest;
}

/** Explicit object removal with complete preflight and per-object conditional
 * deletion. Requires independent durable manifest/recovery proof and writer
 * isolation from the future orchestrator. Not wired to a production route. */
export async function removeStagedObjects(client:ObjectStore,recovery:ObjectStore,sourceBucket:string,recoveryBucket:string,manifest:readonly RecoveryObject[]){
  if(sourceBucket===recoveryBucket||new Set(manifest.map(x=>x.key)).size!==manifest.length)throw Error('Invalid manifest');
  await assertUnversioned(client,sourceBucket);await assertUnversioned(recovery,recoveryBucket);
  for(const m of manifest){
    const copy=await read(recovery,recoveryBucket,m.backupKey);
    const current=await read(client,sourceBucket,m.key,m.etag);
    if(hash(copy.bytes)!==m.sha256||hash(current.bytes)!==m.sha256||copy.bytes.length!==m.size||current.bytes.length!==m.size||copy.contentType!==m.contentType||current.contentType!==m.contentType)throw Error('Stale or invalid recovery manifest');
  }
  for(const m of manifest)await client.send(new DeleteObjectCommand({Bucket:sourceBucket,Key:m.key,IfMatch:m.etag}));
}

/** Restore only absent keys. Never overwrite new objects. */
export async function restoreStagedObjects(client:ObjectStore,recovery:ObjectStore,sourceBucket:string,recoveryBucket:string,manifest:readonly RecoveryObject[]){
  if(sourceBucket===recoveryBucket)throw Error('Invalid restore destination');
  await assertUnversioned(client,sourceBucket);
  for(const m of manifest){
    const copy=await read(recovery,recoveryBucket,m.backupKey);
    if(hash(copy.bytes)!==m.sha256||copy.bytes.length!==m.size||copy.contentType!==m.contentType)throw Error('Invalid backup');
    await client.send(new PutObjectCommand({Bucket:sourceBucket,Key:m.key,Body:copy.bytes,ContentType:m.contentType,IfNoneMatch:'*'}));
    const restored=await read(client,sourceBucket,m.key);
    if(hash(restored.bytes)!==m.sha256||restored.contentType!==m.contentType)throw Error('Restore verification failed');
  }
}

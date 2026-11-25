import { S3Client,HeadObjectCommand,ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Client as TypesenseClient } from 'typesense';
import {loadConfig} from '@cyris/config';
import {getDbClient,closeDatabaseConnection,sql,GLOBAL_SEARCH_COLLECTION} from '@cyris/db';
import {classifyRetentionObjects,objectIdentity,belongsToEventNamespace,type ObjectReference,type ListedObject} from './retention-inventory-core.js';
import {inspectRelationalRetention} from './retention-relational-plan.js';
import {RetentionInventoryReportSchema} from '@cyris/contracts';

const MAX_REFERENCES=20000,MAX_LISTED=20000,MAX_HEAD=2000;
const validId=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function main(){
  const eventId=process.argv[2]?.toLowerCase();
  if(process.argv.length!==3||!eventId||!validId.test(eventId))throw new Error('Expected one exercise UUID');
  const cfg=loadConfig(),db=getDbClient({max:1});
  // All database reads share one read-only snapshot. Object/index checks afterward are
  // observations, not an atomic deletion plan. No writes or bucket creation occur.
  const snapshot=await db.transaction(async tx=>{
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`);
    const [event]=await tx.execute<{id:string;slug:string;status:string}>(sql`select id,slug,status from events where id=${eventId}::uuid`);
    if(!event)throw new Error('Exercise not found');
    const refs=await tx.execute<ObjectReference>(sql`select * from (
      select d.event_id as "eventId",${cfg.S3_BUCKET}::text as bucket,d.object_key as key,'document' as source from documents d
      union all select d.event_id,${cfg.S3_BUCKET}::text,v.object_key,'version' from document_versions v join documents d on d.id=v.document_id
      union all select r.event_id,m.bucket,m.object_key,'registry' from registry_media m join resources r on r.id=m.resource_id
      union all select event_id,bucket,object_key,'draft' from scenario_draft_media
    ) refs limit ${MAX_REFERENCES+1} `);
    const ids=await tx.execute<{id:string}>(sql`select id from resources where event_id=${eventId}::uuid limit ${MAX_REFERENCES+1}`);
    const [jobs]=await tx.execute<{exerciseJobs:number;scenarioBatches:number;forensicReferences:number;eventOutbox:number;unclassifiedOutbox:number}>(sql`select 
      (select count(*)::integer from exercise_jobs where event_id=${eventId}::uuid and status in ('QUEUED','RUNNING')) as "exerciseJobs",
      (select count(*)::integer from scenario_data_batches where event_id=${eventId}::uuid and status='GENERATING') as "scenarioBatches",
      (select count(*)::integer from forensic_acquisitions a join forensic_analyses f on f.id=a.analysis_id where f.event_id=${eventId}::uuid and nullif(trim(a.storage_reference),'') is not null) as "forensicReferences",
      (select count(*)::integer from outbox_events o where o.status in ('PENDING','PROCESSING','FAILED') and
        (o.payload->>'eventId'=${eventId} or exists(select 1 from resources r where r.event_id=${eventId}::uuid and r.id::text in (o.payload->>'id',o.payload->>'resourceId',o.payload->>'documentId')))) as "eventOutbox",
      (select count(*)::integer from outbox_events o where o.status in ('PENDING','PROCESSING','FAILED') and
        not (coalesce(o.payload->>'eventId','')<>''
        or exists(select 1 from resources r where r.id::text in (o.payload->>'id',o.payload->>'resourceId',o.payload->>'documentId')))) as "unclassifiedOutbox"
    `);
    const relational=await inspectRelationalRetention(tx,eventId);
    return {event,refs:[...refs],ids:[...ids],jobs,relational};
  });
  const blockers:string[]=[];
  if(snapshot.refs.length>MAX_REFERENCES||snapshot.ids.length>MAX_REFERENCES)throw new Error('Inventory cap exceeded; use a larger reviewed offline inventory');
  const resourceIds=new Set(snapshot.ids.map(x=>x.id)),refs=snapshot.refs;
  const s3=new S3Client({endpoint:cfg.S3_ENDPOINT,region:cfg.S3_REGION,forcePathStyle:true,
    credentials:{accessKeyId:cfg.S3_ACCESS_KEY,secretAccessKey:cfg.S3_SECRET_KEY},maxAttempts:2});
  const listed:ListedObject[]=[],present=new Set<string>(),missing=new Set<string>(),unknown=new Set<string>();
  let listingComplete=true,scanned=0;
  try{
    // Registry object namespace is resource-based, not event-based. Only IDs
    // confirmed in this event's snapshot are attributable. Scan is bounded.
    for(const prefix of ['documents/'+eventId+'/','scenario-drafts/'+eventId+'/','registry/']){
      if(cfg.S3_BUCKET===cfg.S3_AUDIT_BUCKET){listingComplete=false;break;}
      let token:string|undefined;
      do{
        const response=await s3.send(new ListObjectsV2Command({Bucket:cfg.S3_BUCKET,Prefix:prefix,ContinuationToken:token,MaxKeys:1000}),{abortSignal:AbortSignal.timeout(15000)});
        for(const obj of response.Contents??[]){
          scanned++;
          if(obj.Key&&belongsToEventNamespace(obj.Key,eventId,resourceIds)){
            listed.push({bucket:cfg.S3_BUCKET,key:obj.Key});
            present.add(objectIdentity(cfg.S3_BUCKET,obj.Key));
          }
        }
        if(scanned>=MAX_LISTED){listingComplete=false;break;}
        const next=response.NextContinuationToken;
        if(response.IsTruncated&&(!next||next===token)){listingComplete=false;break;}
        token=response.IsTruncated?next:undefined;
      }while(token);
      if(!listingComplete)break;
    }
  }catch{listingComplete=false;}
  if(!listingComplete)blockers.push('OBJECT_LIST_INCOMPLETE');
  const target=new Map<string,ObjectReference>();
  for(const ref of refs)if(ref.eventId===eventId)target.set(objectIdentity(ref.bucket,ref.key),ref);
  // Head verifies exact referenced objects not seen by namespace listing.
  // Never probe audit or arbitrary buckets stored in database rows.
  const pending=[...target].filter(([id])=>!present.has(id));
  for(let i=0;i<pending.length;i+=8){
    await Promise.all(pending.slice(i,i+8).map(async ([id,ref],offset)=>{
      if(i+offset>=MAX_HEAD||ref.bucket!==cfg.S3_BUCKET||ref.bucket===cfg.S3_AUDIT_BUCKET||!ref.key){unknown.add(id);return;}
      try{
        await s3.send(new HeadObjectCommand({Bucket:ref.bucket,Key:ref.key}),{abortSignal:AbortSignal.timeout(10000)});
        present.add(id);
      }catch(err){
        const e=err as {name?:string;$metadata?:{httpStatusCode?:number}};
        if(e.$metadata?.httpStatusCode===404||e.name==='NotFound'||e.name==='NoSuchKey')missing.add(id);
        else unknown.add(id);
      }
    }));
  }
  s3.destroy();
  const storage=classifyRetentionObjects(eventId,refs,listed,resourceIds,cfg.S3_BUCKET,cfg.S3_AUDIT_BUCKET,present,missing,unknown);
  if(storage.sharedObjects||storage.foreignOwnedNamespaceObjects)blockers.push('SHARED_OR_FOREIGN_OBJECTS');
  if(storage.protectedBucket||storage.outsideNamespace)blockers.push('UNMANAGED_OBJECT_REFERENCES');
  if(storage.missingObjects||storage.unverifiedObjects)blockers.push('MISSING_OR_UNVERIFIED_OBJECTS');
  if(storage.unreferencedNamespaceObjects)blockers.push('UNREFERENCED_OBJECTS_REQUIRE_REVIEW');
  if(snapshot.jobs?.forensicReferences)blockers.push('FORENSIC_EXTERNAL_REFERENCES');
  if(snapshot.jobs?.exerciseJobs||snapshot.jobs?.scenarioBatches||snapshot.jobs?.eventOutbox||snapshot.jobs?.unclassifiedOutbox)blockers.push('BACKGROUND_WORK_REQUIRES_RECONCILIATION');
  let indexedDocuments:number|null=null;
  try{
    const search=new TypesenseClient({nodes:[{host:cfg.TYPESENSE_HOST,port:cfg.TYPESENSE_PORT,protocol:'http'}],apiKey:cfg.TYPESENSE_API_KEY,connectionTimeoutSeconds:5,numRetries:0});
    const res=await search.collections(GLOBAL_SEARCH_COLLECTION).documents().search({q:'*',query_by:'title',filter_by:'eventId:='+eventId,per_page:1,include_fields:'id'});
    indexedDocuments=res.found;
  }catch{blockers.push('SEARCH_INDEX_UNAVAILABLE');}
  // Redis and externally managed forensic storage have not been reconciled.
  // Never advertise a complete deletion plan from this inspection.
  blockers.push('REDIS_AND_EXTERNAL_RECONCILIATION_PENDING');
  const result=RetentionInventoryReportSchema.parse({eventId,status:snapshot.event.status,generatedAt:new Date().toISOString(),
    mode:'READ_ONLY',listingComplete,storage,indexedDocuments,background:snapshot.jobs,relational:snapshot.relational,blockers});
  console.log(JSON.stringify(result,null,2));
}
main().catch(()=>{console.error('Retention inventory failed or exceeded its safety limits; no data was modified.');process.exitCode=1;}).finally(()=>closeDatabaseConnection());

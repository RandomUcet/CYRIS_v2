import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {mkdtemp,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {getDbClient,closeDatabaseConnection,sql,GLOBAL_SEARCH_COLLECTION,cyrisGlobalCollectionSchema,defaultSearchProjectionRegistry} from '@cyris/db';
import {exerciseObserverKey} from '@cyris/contracts';
import {Redis} from 'ioredis';
import {Client as TypesenseClient} from 'typesense';
import {S3Client,CreateBucketCommand,PutObjectCommand,GetObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {executeCombinedRehearsal} from './retention-relational-execution.js';
import {selectRecoveryObjects,stageRecoveryObjects} from './retention-object-recovery.js';
import {persistRecoveryManifest,type RecoveryContext} from './retention-recovery-manifest.js';
import {finishCommittedRetention} from './retention-finish.js';
import {readRetentionCommit} from './retention-commit-witness.js';
import {requireVerifiedIsolatedDatabase} from '../regression/isolated-postgres-harness.js';
const url=requireVerifiedIsolatedDatabase();
const s3url=process.env.CYRIS_TEST_S3_ENDPOINT,searchUrl=process.env.CYRIS_TEST_TYPESENSE_ENDPOINT,redisUrl=process.env.CYRIS_TEST_REDIS_URL;
const loopback=(v:string|undefined)=>Boolean(v&&/^http:\/\/127\.0\.0\.1:\d+$/.test(v));
const enabled=Boolean(process.env.CYRIS_TEST_RETENTION_COMMITTED==='true'&&url&&new URL(url).pathname==='/cyris_retention_committed'&&loopback(s3url)&&loopback(searchUrl)&&redisUrl&&/^redis:\/\/127\.0\.0\.1:\d+$/.test(redisUrl));
test('committed cross-service reset resumes after interrupted object deletion and preserves unrelated exercise',{skip:!enabled},async()=>{
  const db=getDbClient({url:url!,max:1});
  const redis=new Redis(redisUrl!,{db:14,maxRetriesPerRequest:1,commandTimeout:3000});
  const search=new TypesenseClient({nodes:[{host:'127.0.0.1',port:Number(new URL(searchUrl!).port),protocol:'http'}],apiKey:'cyris-test-search-only',connectionTimeoutSeconds:5,numRetries:0});
  const source=new S3Client({endpoint:s3url!,region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:'cyris-test-only',secretAccessKey:'local-ci-storage-only'},maxAttempts:1});
  const a=randomUUID(),b=randomUUID(),unit=randomUUID(),doc=randomUUID(),foreignDoc=randomUUID(),outbox=randomUUID(),otherOutbox=randomUUID();
  const keys=['documents/'+a+'/one','documents/'+a+'/two'],foreignKey='documents/'+b+'/other';
  const context:RecoveryContext={installationId:randomUUID(),operationId:randomUUID(),eventId:a,profile:'reset',sourceBucket:'cyris-committed-source',recoveryBucket:'cyris-committed-backup',planDigest:'a'.repeat(64)};
  const root=await mkdtemp(join(await realpath(tmpdir()),'cyris-committed-')),secret=randomBytes(32),cacheA=exerciseObserverKey(a),cacheB=exerciseObserverKey(b),session='cyris:session:'+randomUUID();
  let redisOwned=false;
  try{
    assert.equal(await redis.dbsize(),0);redisOwned=true;
    await source.send(new CreateBucketCommand({Bucket:context.sourceBucket}));
    await source.send(new CreateBucketCommand({Bucket:context.recoveryBucket}));
    await search.collections().create(cyrisGlobalCollectionSchema);
    await db.transaction(async tx=>{
      await tx.execute(sql`INSERT INTO events(id,slug,name,status) VALUES(${a},${a},'Reset fixture','ARCHIVED'),(${b},${b},'Other fixture','ARCHIVED')`);
      await tx.execute(sql`INSERT INTO organizational_units(id,event_id,name,slug) VALUES(${unit},${a},'Team','team')`);
      await tx.execute(sql`INSERT INTO resources(id,event_id,resource_type) VALUES(${doc},${a},'document'),(${foreignDoc},${b},'document')`);
      for(const [id,eventId,objectKey] of [[doc,a,keys[0]!],[foreignDoc,b,foreignKey]] as const){
        await tx.execute(sql`INSERT INTO documents(id,event_id,title,original_filename,mime_type,byte_size,object_key,sha256) VALUES(${id},${eventId},'Report','report.txt','text/plain',${Buffer.byteLength(objectKey)},${objectKey},${createHash('sha256').update(objectKey).digest('hex')})`);
      }
      await tx.execute(sql`INSERT INTO document_versions(id,document_id,version_number,object_key,filename,mime_type,byte_size,sha256) VALUES(gen_random_uuid(),${doc},1,${keys[1]!},'old.txt','text/plain',${Buffer.byteLength(keys[1]!)},${createHash('sha256').update(keys[1]!).digest('hex')})`);
      for(const [id,target] of [[outbox,doc],[otherOutbox,foreignDoc]])await tx.execute(sql`INSERT INTO outbox_events(id,event_type,status,payload) VALUES(${id},'search.upsert','PENDING',${JSON.stringify({type:'document',id:target})}::jsonb)`);
    });
    for(const Key of [...keys,foreignKey])await source.send(new PutObjectCommand({Bucket:context.sourceBucket,Key,Body:Key,ContentType:'text/plain'}));
    for(const projection of await defaultSearchProjectionRegistry.listAllDocuments(db))await search.collections(GLOBAL_SEARCH_COLLECTION).documents().upsert(projection);
    const sample=(eventId:string)=>JSON.stringify({eventId,observedAt:new Date().toISOString(),pending:1,reviewAfterHours:12,unchanged:0,blocked:0});
    await redis.mset(cacheA,sample(a),cacheB,sample(b),session,'fixture');
    const selected=selectRecoveryObjects({eventId:a,refs:[...keys.map(key=>({eventId:a,key,bucket:context.sourceBucket,source:'document' as const})),{eventId:b,key:foreignKey,bucket:context.sourceBucket,source:'document'}],listed:[...keys,foreignKey].map(key=>({key,bucket:context.sourceBucket})),resourceIds:new Set([doc]),bucket:context.sourceBucket,auditBucket:'audit',listingComplete:true});
    await persistRecoveryManifest(root,context,selected,await stageRecoveryObjects(source,source,context.sourceBucket,context.recoveryBucket,context.operationId,selected),secret);
    const args={db,redis,search,source,recovery:source,root,context,key:secret};
    await assert.rejects(finishCommittedRetention(args),/commit not proven/);
    assert.equal(await redis.exists(cacheA),1);
    const committed=await db.transaction(tx=>executeCombinedRehearsal(tx,context));
    assert.equal(committed.outboxRemoved,1);
    assert.equal(await db.transaction(tx=>readRetentionCommit(tx,context)),true);
    // Simulated interruption after the real PostgreSQL commit and first S3 delete.
    await source.send(new DeleteObjectCommand({Bucket:context.sourceBucket,Key:keys[0]!}));
    const result=await finishCommittedRetention(args);
    assert.deepEqual(result.objects,{removedNow:1,alreadyAbsent:1});
    assert.deepEqual(result.cache,{removed:1});
    assert.equal(result.index.rebuilt,2);
    assert.equal((await finishCommittedRetention(args)).objects.removedNow,0);
    for(const Key of keys)await assert.rejects(source.send(new GetObjectCommand({Bucket:context.sourceBucket,Key})));
    assert.equal(await (await source.send(new GetObjectCommand({Bucket:context.sourceBucket,Key:foreignKey}))).Body!.transformToString(),foreignKey);
    assert.equal(await redis.get(session),'fixture');assert.equal(await redis.exists(cacheB),1);
    assert.equal((await db.execute(sql`SELECT id FROM documents WHERE id=${foreignDoc}`)).length,1);
    assert.equal((await db.execute(sql`SELECT id FROM outbox_events WHERE id=${otherOutbox}`)).length,1);
    assert.equal((await db.execute(sql`SELECT id FROM organizational_units WHERE id=${unit}`)).length,1);
    assert.equal((await db.execute(sql`SELECT id FROM documents WHERE id=${doc}`)).length,0);
    await search.collections(GLOBAL_SEARCH_COLLECTION).documents('document:'+foreignDoc).retrieve();
    await assert.rejects(search.collections(GLOBAL_SEARCH_COLLECTION).documents('document:'+doc).retrieve());
  }finally{if(redisOwned)await redis.del(cacheA,cacheB,session);redis.disconnect();source.destroy();await rm(root,{recursive:true,force:true});await closeDatabaseConnection();}
});

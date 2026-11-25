import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {S3Client,CreateBucketCommand,DeleteBucketCommand,PutObjectCommand,GetObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {selectRecoveryObjects,stageRecoveryObjects,removeStagedObjects,restoreStagedObjects,resumeStagedRemoval,resumeStagedRestore,validateRecoveryManifest} from './retention-object-recovery.js';

const event=randomUUID(),other=randomUUID(),resource=randomUUID();
const key='documents/'+event+'/file',foreign='documents/'+other+'/file';
test('recovery selection rejects shared, missing, protected and unknown objects',()=>{
  const base={eventId:event,refs:[{eventId:event,key,bucket:'store',source:'document'}],listed:[{key,bucket:'store'}],resourceIds:new Set([resource]),bucket:'store',auditBucket:'audit',listingComplete:true};
  assert.deepEqual(selectRecoveryObjects(base),[key]);
  assert.throws(()=>selectRecoveryObjects({...base,refs:[...base.refs,{eventId:other,key,bucket:'store',source:'document'}]}),/Shared/);
  assert.throws(()=>selectRecoveryObjects({...base,listed:[]}),/missing/);
  assert.throws(()=>selectRecoveryObjects({...base,listed:[...base.listed,{key:key+'-unknown',bucket:'store'}]}),/Unreviewed/);
  assert.throws(()=>selectRecoveryObjects({...base,auditBucket:'store'}),/protected/);
  assert.throws(()=>selectRecoveryObjects({...base,listingComplete:false}),/Incomplete/);
  assert.throws(()=>selectRecoveryObjects({...base,refs:[{...base.refs[0]!,key:foreign}]}),/Unmanaged/);
});
const endpoint=process.env.CYRIS_TEST_S3_ENDPOINT;
const isolated=process.env.CYRIS_TEST_S3_ISOLATED==='true'&&Boolean(endpoint&&/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint));
test('actual MinIO objects are staged, conditionally removed, and restored with byte verification',{skip:!isolated},async()=>{
  const client=new S3Client({endpoint:endpoint!,region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:'cyris-test-only',secretAccessKey:'local-ci-storage-only'},maxAttempts:1});
  const source='retention-source-'+randomUUID(),backup='retention-backup-'+randomUUID();
  const operation=randomUUID(),backupKey='retention/'+operation+'/0';
  try{
    await client.send(new CreateBucketCommand({Bucket:source}));
    await client.send(new CreateBucketCommand({Bucket:backup}));
    await client.send(new PutObjectCommand({Bucket:source,Key:key,Body:'first content',ContentType:'text/plain'}));
    await client.send(new PutObjectCommand({Bucket:source,Key:foreign,Body:'unrelated',ContentType:'text/plain'}));
    const manifest=await stageRecoveryObjects(client,client,source,backup,operation,[key]);
    assert.equal(manifest.length,1);
    await client.send(new PutObjectCommand({Bucket:source,Key:key,Body:'changed',ContentType:'text/plain'}));
    await assert.rejects(removeStagedObjects(client,client,source,backup,manifest));
    assert.equal(await (await client.send(new GetObjectCommand({Bucket:source,Key:key}))).Body!.transformToString(),'changed');
    await client.send(new PutObjectCommand({Bucket:source,Key:key,Body:'first content',ContentType:'text/plain'}));
    await removeStagedObjects(client,client,source,backup,manifest);
    await assert.rejects(client.send(new GetObjectCommand({Bucket:source,Key:key})));
    assert.equal(await (await client.send(new GetObjectCommand({Bucket:source,Key:foreign}))).Body!.transformToString(),'unrelated');
    await restoreStagedObjects(client,client,source,backup,manifest);
    assert.equal(await (await client.send(new GetObjectCommand({Bucket:source,Key:key}))).Body!.transformToString(),'first content');
    await assert.rejects(restoreStagedObjects(client,client,source,backup,manifest));
    await client.send(new PutObjectCommand({Bucket:backup,Key:backupKey,Body:'corrupt',ContentType:'text/plain'}));
    await assert.rejects(removeStagedObjects(client,client,source,backup,manifest),/invalid recovery manifest/);
    assert.equal(await (await client.send(new GetObjectCommand({Bucket:source,Key:key}))).Body!.transformToString(),'first content');
  }finally{
    for(const [Bucket,Key] of [[source,key],[source,foreign],[backup,backupKey]] as const)await client.send(new DeleteObjectCommand({Bucket,Key})).catch(()=>{});
    for(const Bucket of [source,backup])await client.send(new DeleteBucketCommand({Bucket})).catch(()=>{});
    client.destroy();
  }
});

test('manifest rejects substituted object identity, backup key and invalid size',()=>{
  const operation=randomUUID(),entry={key,backupKey:'retention/'+operation+'/0',sha256:'a'.repeat(64),size:3,etag:'"etag"'};
  assert.doesNotThrow(()=>validateRecoveryManifest(operation,[key],[entry]));
  assert.throws(()=>validateRecoveryManifest(operation,[foreign],[entry]),/manifest entry/);
  assert.throws(()=>validateRecoveryManifest(operation,[key],[{...entry,backupKey:'unrelated'}]),/manifest entry/);
  assert.throws(()=>validateRecoveryManifest(operation,[key],[{...entry,size:-1}]),/manifest entry/);
});
test('interrupted MinIO removal and restore reconcile actual object state without overwriting replacements',{skip:!isolated},async()=>{
  const client=new S3Client({endpoint:endpoint!,region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:'cyris-test-only',secretAccessKey:'local-ci-storage-only'},maxAttempts:1});
  const source='retention-source-'+randomUUID(),backup='retention-backup-'+randomUUID(),operation=randomUUID();
  const keys=[key,key+'-second'];
  try{
    await client.send(new CreateBucketCommand({Bucket:source}));
    await client.send(new CreateBucketCommand({Bucket:backup}));
    for(const Key of [...keys,foreign])await client.send(new PutObjectCommand({Bucket:source,Key,Body:Key,ContentType:'text/plain'}));
    const manifest=await stageRecoveryObjects(client,client,source,backup,operation,keys);
    // Simulate interruption after one successful deletion, before local progress was persisted.
    await client.send(new DeleteObjectCommand({Bucket:source,Key:keys[0]!}));
    await client.send(new PutObjectCommand({Bucket:source,Key:keys[1]!,Body:'replacement',ContentType:'text/plain'}));
    await assert.rejects(resumeStagedRemoval(client,client,source,backup,operation,keys,manifest),/Stale original/);
    await client.send(new PutObjectCommand({Bucket:source,Key:keys[1]!,Body:keys[1]!,ContentType:'text/plain'}));
    assert.deepEqual(await resumeStagedRemoval(client,client,source,backup,operation,keys,manifest),{removedNow:1,alreadyAbsent:1});
    assert.deepEqual(await resumeStagedRemoval(client,client,source,backup,operation,keys,manifest),{removedNow:0,alreadyAbsent:2});
    // Simulate interrupted restore and a conflicting replacement.
    await client.send(new PutObjectCommand({Bucket:source,Key:keys[0]!,Body:'replacement',ContentType:'text/plain'}));
    await assert.rejects(resumeStagedRestore(client,client,source,backup,operation,keys,manifest),/Stale original/);
    await client.send(new PutObjectCommand({Bucket:source,Key:keys[0]!,Body:keys[0]!,ContentType:'text/plain'}));
    assert.deepEqual(await resumeStagedRestore(client,client,source,backup,operation,keys,manifest),{restoredNow:1,alreadyPresent:1});
    assert.deepEqual(await resumeStagedRestore(client,client,source,backup,operation,keys,manifest),{restoredNow:0,alreadyPresent:2});
    for(const Key of [...keys,foreign])assert.equal(await (await client.send(new GetObjectCommand({Bucket:source,Key}))).Body!.transformToString(),Key);
  }finally{
    for(const Key of [...keys,foreign])await client.send(new DeleteObjectCommand({Bucket:source,Key})).catch(()=>{});
    for(const i of keys.keys())await client.send(new DeleteObjectCommand({Bucket:backup,Key:'retention/'+operation+'/'+i})).catch(()=>{});
    for(const Bucket of [source,backup])await client.send(new DeleteBucketCommand({Bucket})).catch(()=>{});
    client.destroy();
  }
});

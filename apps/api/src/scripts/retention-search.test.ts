import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Client as TypesenseClient} from 'typesense';
import {GLOBAL_SEARCH_COLLECTION,cyrisGlobalCollectionSchema} from '@cyris/db';
import type {SearchDocument} from '@cyris/contracts';
import {validateRetentionSearchProjection,reconcileRetentionSearch} from './retention-search.js';
const event=randomUUID(),other=randomUUID();
const doc=(eventId:string,resourceType:string,canonicalId:string):SearchDocument=>({
  id:resourceType+':'+canonicalId,canonicalId,resourceType,eventId,title:'Fixture '+resourceType,
  subtitle:'',content:'',normalizedContent:'fixture',identifiers:[],tags:[],status:'ACTIVE',
  requiredPermission:'registry.read',visibility:'EVENT',unitIds:[],ownerUserId:'',assignedUserIds:[],
  route:'/',createdAt:1,updatedAt:1,
} as SearchDocument);
const retained=[doc(event,'event',event),doc(event,'unit',randomUUID()),doc(event,'role',randomUUID())];
const stale=doc(event,'person',randomUUID()),foreign=doc(other,'event',other),global=doc('','role',randomUUID());
test('retention search rejects cross-event, domain, missing event and malformed projections',()=>{
  assert.equal(validateRetentionSearchProjection(event,'reset',retained).length,3);
  assert.throws(()=>validateRetentionSearchProjection(event,'reset',[...retained,foreign]),/Invalid retained/);
  assert.throws(()=>validateRetentionSearchProjection(event,'reset',[...retained,stale]),/Invalid retained/);
  assert.throws(()=>validateRetentionSearchProjection(event,'reset',[]),/requires/);
  assert.throws(()=>validateRetentionSearchProjection(event,'remove',retained),/no projections/);
  assert.throws(()=>validateRetentionSearchProjection('x || true','remove',[]),/Invalid search/);
});
const endpoint=process.env.CYRIS_TEST_TYPESENSE_ENDPOINT;
const isolated=process.env.CYRIS_TEST_TYPESENSE_ISOLATED==='true'&&Boolean(endpoint&&/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint));
test('actual Typesense reset and removal reconcile scoped documents and preserve unrelated and global data',{skip:!isolated},async()=>{
  const port=Number(new URL(endpoint!).port);
  const client=new TypesenseClient({nodes:[{host:'127.0.0.1',port,protocol:'http'}],apiKey:'cyris-test-search-only',connectionTimeoutSeconds:5,numRetries:0});
  await client.collections().create(cyrisGlobalCollectionSchema);
  try{
    const collection=client.collections(GLOBAL_SEARCH_COLLECTION);
    for(const d of [...retained,stale,foreign,global])await collection.documents().upsert(d);
    const collision=doc(other,'unit',randomUUID());
    await collection.documents().upsert(collision);
    await assert.rejects(reconcileRetentionSearch(client,event,'reset',[...retained,{...collision,eventId:event}]),/Foreign search projection collision/);
    assert.equal((await collection.documents(collision.id).retrieve() as Record<string,unknown>).eventId,other);
    assert.equal((await collection.documents(stale.id).retrieve() as Record<string,unknown>).eventId,event);
    await collection.documents(collision.id).delete();
    const foreignBefore=await collection.documents(foreign.id).retrieve();
    const globalBefore=await collection.documents(global.id).retrieve();
    assert.deepEqual(await reconcileRetentionSearch(client,event,'reset',retained),{removed:4,rebuilt:3});
    await assert.rejects(collection.documents(stale.id).retrieve());
    assert.deepEqual(await reconcileRetentionSearch(client,event,'reset',retained),{removed:3,rebuilt:3});
    assert.deepEqual(await reconcileRetentionSearch(client,event,'remove',[]),{removed:3,rebuilt:0});
    assert.deepEqual(await reconcileRetentionSearch(client,event,'remove',[]),{removed:0,rebuilt:0});
    assert.deepEqual(await collection.documents(foreign.id).retrieve(),foreignBefore);
    assert.deepEqual(await collection.documents(global.id).retrieve(),globalBefore);
  }finally{await client.collections(GLOBAL_SEARCH_COLLECTION).delete();}
});

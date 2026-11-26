import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyRetentionObjects,objectIdentity,belongsToEventNamespace,type ObjectReference} from './retention-inventory-core.js';
const event='event-a',other='event-b',bucket='storage',audit='audit',ids=new Set(['res-a']);
test('object inventory deduplicates versions and preserves foreign and audit references',()=>{
  const ref=(eventId:string,key:string,bucketName=bucket):ObjectReference=>({eventId,key,bucket:bucketName,source:'test'});
  const key='documents/event-a/d/v1/file',shared='scenario-drafts/event-a/b/x',foreign='documents/event-a/foreign',orphan='registry/res-a/orphan';
  const refs=[ref(event,key),ref(event,key),ref(event,shared),ref(other,shared),ref(other,foreign),
    ref(event,'private-audit',audit),ref(event,'registry/res-a/missing')];
  const result=classifyRetentionObjects(event,refs,[key,shared,foreign,orphan,'registry/res-b/orphan','documents/event-b/x'].map(key=>({bucket,key})),ids,bucket,audit,
    new Set([objectIdentity(bucket,key),objectIdentity(bucket,shared)]),new Set([objectIdentity(bucket,'registry/res-a/missing')]),new Set([objectIdentity(audit,'private-audit')]));
  assert.deepEqual(result,{references:5,uniqueObjects:4,sharedObjects:1,outsideNamespace:1,protectedBucket:1,
    presentObjects:2,missingObjects:1,unverifiedObjects:1,unreferencedNamespaceObjects:1,foreignOwnedNamespaceObjects:1});
  assert.equal(belongsToEventNamespace('documents/event-ab/other',event,ids),false);
  assert.equal(belongsToEventNamespace('registry/res-ab/x',event,ids),false);
  assert.equal(belongsToEventNamespace('registry/res-a/x',event,ids),true);
});
test('missing listing never implies missing objects or permission to delete',()=>{
  const refs=[{eventId:event,bucket,key:'documents/event-a/x',source:'document'}];
  const result=classifyRetentionObjects(event,refs,[],ids,bucket,audit,new Set(),new Set(),new Set());
  assert.equal(result.unverifiedObjects,1);assert.equal(result.missingObjects,0);
});

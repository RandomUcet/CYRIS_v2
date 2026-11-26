import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {EventRetentionPlan,RetentionInventoryReport,RetentionRelationalInventory} from '@cyris/contracts';
import {compareRetentionSnapshots} from './retention-review.js';
const relational:RetentionRelationalInventory={mode:'READ_ONLY',tables:[{table:'events',count:1,reset:'KEEP',remove:'DELETE'},{table:'documents',count:2,reset:'DELETE',remove:'DELETE'}],unknownTables:[],missingTables:[],unsupportedTables:[],checkedForeignKeys:2,conflicts:[],resetRows:2,removeRows:3,auditRows:0,executable:false,unresolved:['RECOVERY_AND_EXECUTION_GATE']};
const plan:EventRetentionPlan={eventId:'a',status:'ARCHIVED',generatedAt:'2026-11-26T00:00:00Z',relational};
const host:RetentionInventoryReport={eventId:'a',status:'ARCHIVED',generatedAt:plan.generatedAt,mode:'READ_ONLY',listingComplete:true,relational,storage:{references:0,uniqueObjects:0,sharedObjects:0,outsideNamespace:0,protectedBucket:0,presentObjects:0,missingObjects:0,unverifiedObjects:0,unreferencedNamespaceObjects:0,foreignOwnedNamespaceObjects:0},indexedDocuments:0,background:{exerciseJobs:0,scenarioBatches:0,forensicReferences:0,eventOutbox:0,unclassifiedOutbox:0},blockers:['REDIS_AND_EXTERNAL_RECONCILIATION_PENDING']};
test('snapshot comparison checks scope, status, row counts, actions and dependency blockers',()=>{
  assert.equal(compareRetentionSnapshots('a',null,host),'MISSING');
  assert.equal(compareRetentionSnapshots('a',plan,{...host,relational:undefined}),'LEGACY');
  assert.equal(compareRetentionSnapshots('b',plan,host),'MISMATCH');
  assert.equal(compareRetentionSnapshots('a',plan,{...host,status:'ACTIVE'}),'MISMATCH');
  assert.equal(compareRetentionSnapshots('a',plan,{...host,relational:{...relational,tables:[...relational.tables].reverse()}}),'MATCH');
  assert.equal(compareRetentionSnapshots('a',plan,{...host,relational:{...relational,tables:relational.tables.map(t=>({...t,count:t.count+1}))}}),'MISMATCH');
  assert.equal(compareRetentionSnapshots('a',plan,{...host,relational:{...relational,conflicts:[{child:'a',parent:'b',constraint:'fk',count:1}]}}),'MISMATCH');
  assert.equal(compareRetentionSnapshots('a',plan,{...host,relational:{...relational,unknownTables:['unknown']}}),'MISMATCH');
  assert.equal(compareRetentionSnapshots('a',plan,host),'MATCH');
});

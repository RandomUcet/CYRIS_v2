import 'reflect-metadata';
import assert from 'node:assert/strict';
import {eq} from 'drizzle-orm';
import {getDbClient,closeDatabaseConnection,users,events,resources,evidence,auditEvents} from '@cyris/db';
import {generateId} from '@cyris/shared';
import {AuditService} from '../modules/audit/audit.service.js';
import type {DatabaseService} from '../modules/database/database.service.js';
import {requireVerifiedIsolatedDatabase,skipWithoutVerifiedDatabase} from './isolated-postgres-harness.js';

skipWithoutVerifiedDatabase('audit resolves current canonical labels without rewriting events or broadening reader access',async()=>{
 const db=getDbClient({url:requireVerifiedIsolatedDatabase()!});
 const rollback=new Error('ROLLBACK_AUDIT_LABELS');
 try{await db.transaction(async tx=>{
  const service=new AuditService({client:tx} as unknown as DatabaseService);
  const actor=generateId(),a=generateId(),b=generateId(),target=generateId(),foreign=generateId();
  await tx.insert(users).values({id:actor,email:actor+'@example.test',displayName:'Fixture audit actor',status:'ACTIVE'});
  await tx.insert(events).values([{id:a,name:'Audit A',slug:a},{id:b,name:'Audit B',slug:b}]);
  await tx.insert(resources).values([{id:target,eventId:a,resourceType:'evidence',visibility:'RESTRICTED'},{id:foreign,eventId:b,resourceType:'evidence',visibility:'EVENT'}]);
  await tx.insert(evidence).values([{id:target,title:'Fixture retained evidence',evidenceNumber:'E-TEST-1',evidenceType:'OTHER',currentHolderType:'STORAGE',currentHolderId:'Vault'},{id:foreign,title:'Foreign evidence',evidenceNumber:'E-TEST-2',evidenceType:'OTHER',currentHolderType:'STORAGE',currentHolderId:'Vault'}]);
  const base={eventId:a,actorUserId:actor,action:'evidence.updated',category:'evidence',resourceType:'evidence',metadata:{fixture:true}};
  const valid=generateId(),badEvent=generateId(),badType=generateId(),legacy=generateId();
  await tx.insert(auditEvents).values([{...base,id:valid,resourceId:target,outcome:'FAILURE'},{...base,id:badEvent,resourceId:foreign},{...base,id:badType,resourceType:'case',resourceId:target},{...base,id:legacy,resourceId:'legacy-code'}]);
  const rows=await service.list({eventId:a,limit:20},true);
  assert.equal(rows.total,4);
  const item=rows.items.find(x=>x.id===valid)!;
  assert.equal(item.actorDisplayName,'Fixture audit actor');
  assert.equal(item.resourceDisplayName,'E-TEST-1 · Fixture retained evidence');
  for(const id of [badEvent,badType,legacy])assert.equal(rows.items.find(x=>x.id===id)?.resourceDisplayName,null);
  assert.equal((await service.getById(valid,true))?.resourceDisplayName,item.resourceDisplayName);
  assert.equal((await service.getById(valid,false))?.resourceDisplayName,null);
  assert.deepEqual((await service.list({eventId:a,outcome:'FAILURE',q:'Fixture audit actor'},true)).items.map(x=>x.id),[valid]);
  await tx.update(evidence).set({title:'Renamed evidence'}).where(eq(evidence.id,target));
  assert.equal((await service.getById(valid,true))?.resourceDisplayName,'E-TEST-1 · Renamed evidence');
  const [stored]=await tx.select().from(auditEvents).where(eq(auditEvents.id,valid));
  assert.deepEqual(stored?.metadata,{fixture:true});assert.equal(stored?.resourceId,target);
  throw rollback;
 });}catch(e){if(e!==rollback)throw e;}finally{await closeDatabaseConnection();}
});

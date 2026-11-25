import 'reflect-metadata';
import assert from 'node:assert/strict';
import {NotFoundException} from '@nestjs/common';
import {eq} from 'drizzle-orm';
import {getDbClient,closeDatabaseConnection,events,users,eventMemberships,roles,roleAssignments,rolePermissions,resources,persons,organisations,devices} from '@cyris/db';
import {generateId,Permissions} from '@cyris/shared';
import {DatabaseService} from '../modules/database/database.service.js';
import {AuthorizationService} from '../modules/authorization/authorization.service.js';
import {ResourceAccessService} from '../modules/resources/resource-access.service.js';
import {RegistryService} from '../modules/registry/registry.service.js';
import type {AuthenticatedUser} from '../modules/auth/session.service.js';
import {requireVerifiedIsolatedDatabase,skipWithoutVerifiedDatabase} from './isolated-postgres-harness.js';

skipWithoutVerifiedDatabase('canonical picker filters types and hides inaccessible or foreign labels without search index',async()=>{
 const db=getDbClient({url:requireVerifiedIsolatedDatabase()!});
 const rollback=new Error('ROLLBACK_PICKER_FIXTURES');
 try{await db.transaction(async tx=>{
  const database={client:tx} as unknown as DatabaseService;
  const auth=new AuthorizationService(database),access=new ResourceAccessService(database,auth);
  const registry=new RegistryService(database,{} as never,access,{} as never,{} as never,{} as never,{} as never,{} as never);
  const user:AuthenticatedUser={id:generateId(),displayName:'Picker operator',email:generateId()+'@example.test',status:'ACTIVE'};
  const a=generateId(),b=generateId(),member=generateId(),role=generateId();
  await tx.insert(users).values(user);
  await tx.insert(events).values([{id:a,name:'Picker A',slug:a},{id:b,name:'Picker B',slug:b}]);
  await tx.insert(eventMemberships).values({id:member,eventId:a,userId:user.id,status:'ACTIVE'});
  await tx.insert(roles).values({id:role,eventId:a,name:'Registry reader',slug:role});
  await tx.insert(rolePermissions).values([{roleId:role,permissionKey:Permissions.REGISTRY_READ,scope:'EVENT'},{roleId:role,permissionKey:Permissions.EVENT_READ,scope:'EVENT'}]);
  await tx.insert(roleAssignments).values({roleId:role,membershipId:member});
  const person=generateId(),org=generateId(),device=generateId(),hidden=generateId(),foreign=generateId(),wildcard=generateId();
  await tx.insert(resources).values([
   {id:person,eventId:a,resourceType:'person',visibility:'EVENT'},
   {id:org,eventId:a,resourceType:'organisation',visibility:'EVENT'},
   {id:device,eventId:a,resourceType:'device',visibility:'EVENT'},
   {id:hidden,eventId:a,resourceType:'device',visibility:'SCENARIO'},
   {id:foreign,eventId:b,resourceType:'device',visibility:'EVENT'},
   {id:wildcard,eventId:a,resourceType:'person',visibility:'EVENT'},
  ]);
  await tx.insert(persons).values([{id:person,displayName:'Fixture shared person'},{id:wildcard,displayName:'Fixture literal %_'}]);
  await tx.insert(organisations).values({id:org,name:'Fixture shared organisation'});
  await tx.insert(devices).values([{id:device,label:'Fixture shared device'},{id:hidden,label:'Fixture shared hidden'},{id:foreign,label:'Fixture shared foreign'}]);
  const find=(types:'devices'|'persons'|'persons,organisations',q='Fixture shared')=>registry.searchPicker(a,{q,types,limit:20},user);
  assert.deepEqual((await find('devices')).map(x=>x.id),[device]);
  assert.deepEqual((await find('persons,organisations')).map(x=>x.id).sort(),[person,org].sort());
  assert.deepEqual((await find('persons','%_')).map(x=>x.id),[wildcard]);
  assert.equal((await registry.resolvePicker(a,device,user)).label,'Fixture shared device');
  assert.equal((await registry.resolvePicker(a,org,user)).entityType,'organisations');
  for(const id of [hidden,foreign,generateId()])await assert.rejects(registry.resolvePicker(a,id,user),NotFoundException);
  await tx.delete(roleAssignments).where(eq(roleAssignments.membershipId,member));
  assert.deepEqual(await find('devices'),[]);
  await assert.rejects(registry.resolvePicker(a,device,user),NotFoundException);
  throw rollback;
 });}catch(error){if(error!==rollback)throw error;}finally{await closeDatabaseConnection();}
});

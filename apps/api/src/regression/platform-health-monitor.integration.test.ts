import 'reflect-metadata';
import assert from 'node:assert/strict';
import {eq,and} from 'drizzle-orm';
import {getDbClient,closeDatabaseConnection,users,events,roles,roleAssignments,rolePermissions,eventMemberships,notifications} from '@cyris/db';
import {generateId,Permissions} from '@cyris/shared';
import {HealthMonitorService} from '../modules/health/health-monitor.service.js';
import {NotificationsService} from '../modules/notifications/notifications.service.js';
import {AuthorizationService} from '../modules/authorization/authorization.service.js';
import type {DatabaseService} from '../modules/database/database.service.js';
import {requireVerifiedIsolatedDatabase,skipWithoutVerifiedDatabase} from './isolated-postgres-harness.js';
skipWithoutVerifiedDatabase('platform monitor deduplicates alerts and hides them after admin revocation',async()=>{
 const db=getDbClient({url:requireVerifiedIsolatedDatabase()!});
 const rollback=new Error('ROLLBACK_HEALTH_MONITOR');
 try{await db.transaction(async tx=>{
  const database={client:tx} as unknown as DatabaseService;
  const admin=generateId(),ordinary=generateId(),disabled=generateId(),eventId=generateId(),role=generateId(),member=generateId(),eventRole=generateId();
  await tx.insert(users).values([{id:admin,email:admin+'@test.invalid',displayName:'Monitor admin',status:'ACTIVE'},{id:ordinary,email:ordinary+'@test.invalid',displayName:'Member',status:'ACTIVE'},{id:disabled,email:disabled+'@test.invalid',displayName:'Disabled admin',status:'DISABLED'}]);
  await tx.insert(events).values({id:eventId,name:'Monitor exercise',slug:eventId});
  await tx.insert(eventMemberships).values({id:member,eventId,userId:ordinary,status:'ACTIVE'});
  await tx.insert(roles).values([{id:role,name:'Platform admin',slug:role},{id:eventRole,eventId,name:'Exercise organizer',slug:eventRole}]);
  await tx.insert(rolePermissions).values([{roleId:role,permissionKey:Permissions.PLATFORM_MANAGE,scope:'PLATFORM'},{roleId:eventRole,permissionKey:Permissions.COMMAND_READ,scope:'EVENT'}]);
  await tx.insert(roleAssignments).values([{roleId:role,userId:admin},{roleId:role,userId:disabled},{roleId:eventRole,membershipId:member}]);
  const health={getReadiness:async()=>({response:{dependencies:{redis:{status:'down'},postgres:{status:'up'},typesense:{status:'up'},storage:{status:'up'}}}})};
  const one=new HealthMonitorService(health as never,database),two=new HealthMonitorService(health as never,database);
  const get=(userId:string)=>tx.select().from(notifications).where(and(eq(notifications.userId,userId),eq(notifications.type,'PLATFORM_HEALTH')));
  await one.tick();assert.equal((await get(admin)).length,0);
  await one.tick();await one.tick();await two.tick();await two.tick();
  assert.equal((await get(admin)).length,1);
  assert.equal((await get(ordinary)).length,0);assert.equal((await get(disabled)).length,0);
  const svc=new NotificationsService(database,{} as never,{} as never,{} as never,new AuthorizationService(database));
  assert.equal((await svc.getNotifications(admin,eventId)).newItems.filter(x=>x.templateKey==='platform.health.degraded').length,1);
  await tx.delete(roleAssignments).where(eq(roleAssignments.userId,admin));
  assert.equal((await svc.getNotifications(admin,eventId)).newItems.filter(x=>x.templateKey==='platform.health.degraded').length,0);
  assert.equal((await svc.markAllRead(admin,eventId)).updatedCount,0);
  throw rollback;
 });}catch(e){if(e!==rollback)throw e;}finally{await closeDatabaseConnection();}
});

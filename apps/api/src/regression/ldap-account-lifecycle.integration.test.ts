import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException, ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { auditEvents, closeDatabaseConnection, events, getDbClient, integrations, roleAssignments,
  rolePermissions, roles, userIdentities, users } from '@cyris/db';
import { LdapAccountStatusChangeSchema, LdapTeamAccountQuerySchema } from '@cyris/contracts';
import { generateId, Permissions } from '@cyris/shared';
import { AuditService } from '../modules/audit/audit.service.js';
import { AuthorizationService } from '../modules/authorization/authorization.service.js';
import { PermissionsGuard } from '../modules/authorization/guards/permissions.guard.js';
import { SessionService } from '../modules/auth/session.service.js';
import { DatabaseService } from '../modules/database/database.service.js';
import { LdapAccountLifecycleService } from '../modules/integrations/ldap-account-lifecycle.service.js';
import { LdapTeamsService } from '../modules/integrations/ldap-teams.service.js';
import { LdapTeamsController } from '../modules/integrations/ldap-teams.controller.js';
import { requireVerifiedIsolatedDatabase } from './isolated-postgres-harness.js';

test('LDAP account lifecycle input is explicit and requires a reason',()=>{
  assert.equal(LdapAccountStatusChangeSchema.safeParse({enabled:false,reason:'short'}).success,false);
  assert.equal(LdapAccountStatusChangeSchema.safeParse({enabled:'false',reason:'employee left'}).success,false);
  assert.equal(LdapAccountStatusChangeSchema.safeParse({enabled:true,reason:'approved restoration',extra:true}).success,false);
  assert.equal(LdapAccountStatusChangeSchema.safeParse({enabled:false,reason:'offboarding verified'}).success,true);
});

test('global LDAP list accepts no exercise but still validates assignment filters',()=>{
  assert.equal(LdapTeamAccountQuerySchema.safeParse({q:'staff@example.test',status:'DISABLED'}).success,true);
  assert.equal(LdapTeamAccountQuerySchema.safeParse({eventId:'not-a-uuid'}).success,false);
  assert.equal(LdapTeamAccountQuerySchema.safeParse({page:'2'}).data?.page,2);
  assert.equal(LdapTeamAccountQuerySchema.safeParse({page:'0'}).success,false);
  assert.equal(LdapTeamAccountQuerySchema.safeParse({page:'1001'}).success,false);
  assert.equal(LdapTeamAccountQuerySchema.safeParse({}).data?.page,1);
});

const url=requireVerifiedIsolatedDatabase();
test('LDAP operator deactivate/reactivate is audited, session-safe and denies privileged or mixed accounts',
  {skip:!url},async()=>{
    const db=getDbClient({url:url!,max:4});
    const database={client:db} as DatabaseService;
    const audit=new AuditService(database);
    const revoked:string[]=[];
    const sessions={revokeAllUserSessions:async(id:string)=>{revoked.push(id);}} as SessionService;
    const lifecycle=new LdapAccountLifecycleService(database,audit,sessions);
    const actorId=generateId(), targetId=generateId(), privilegedId=generateId(), mixedId=generateId(), providerId=generateId(), eventId=generateId();
    const identityId=generateId(), privilegedIdentityId=generateId(), mixedIdentityId=generateId(), actorIdentityId=generateId();
    const adminRoleId=generateId();
    const actor={id:actorId,email:actorId+'@example.test',displayName:'Operator',status:'ACTIVE'};
    try{
      await db.insert(users).values([
        actor,{id:targetId,email:targetId+'@example.test',displayName:'Participant'},
        {id:privilegedId,email:privilegedId+'@example.test',displayName:'Privileged'},
        {id:mixedId,email:mixedId+'@example.test',displayName:'Mixed'},
      ]);
      await db.insert(events).values({id:eventId,slug:eventId,name:'LDAP status exercise'});
      await db.insert(roles).values({id:adminRoleId,slug:adminRoleId,name:'Lifecycle test admin'});
      await db.insert(rolePermissions).values({roleId:adminRoleId,permissionKey:Permissions.PLATFORM_MANAGE,scope:'PLATFORM'});
      await db.insert(roleAssignments).values({userId:actorId,roleId:adminRoleId});
      await db.insert(integrations).values({id:providerId,name:'Lifecycle LDAP',category:'LDAP',providerType:'LDAP_ACTIVE_DIRECTORY',enabled:true,config:{}});
      const meta={providerId};
      await db.insert(userIdentities).values([
        {id:actorIdentityId,userId:actorId,providerType:'LDAP',providerSubject:'ldap:'+actorIdentityId,metadata:meta},
        {id:identityId,userId:targetId,providerType:'LDAP',providerSubject:'ldap:'+identityId,metadata:meta},
        {id:privilegedIdentityId,userId:privilegedId,providerType:'LDAP',providerSubject:'ldap:'+privilegedIdentityId,metadata:meta},
        {id:mixedIdentityId,userId:mixedId,providerType:'LDAP',providerSubject:'ldap:'+mixedIdentityId,metadata:meta},
        {id:generateId(),userId:mixedId,providerType:'OIDC',providerSubject:'oidc:'+mixedIdentityId},
      ]);
      await db.insert(roleAssignments).values({userId:privilegedId,roleId:adminRoleId});
      const directory=new LdapTeamsService(database,audit);
      const guard=new PermissionsGuard(new Reflector(),new AuthorizationService(database),audit);
      const context=(user:typeof actor)=>({
        getHandler:()=>LdapTeamsController.prototype.changeAccountStatus,
        getClass:()=>LdapTeamsController,
        switchToHttp:()=>({getRequest:()=>({user,headers:{},params:{identityId}})}),
      } as unknown as ExecutionContext);
      assert.equal(await guard.canActivate(context(actor)),true);
      await assert.rejects(guard.canActivate(context({...actor,id:targetId})),ForbiddenException);
      assert.equal((await directory.listAccounts(eventId,targetId+'@example.test')).accounts[0]?.userStatus,'ACTIVE');
      const global=(await directory.listAccounts(undefined,targetId+'@example.test')).accounts;
      assert.equal(global.length,1,'LDAP directory browsing does not depend on selecting a workspace');
      assert.equal(global[0]?.providerEnabled,true,'LDAP provider availability must be visible to administrators');
      assert.equal(global[0]?.lastLoginAt,null,'never-signed-in profiles must be distinguishable');
      assert.equal(global[0]?.membershipStatus,null,'global view does not inherit exercise membership data');
      assert.deepEqual(global[0]?.units,[]);
      assert.equal((await directory.listAccounts(undefined,targetId+'@example.test',false,undefined,2)).accounts.length,0);
      assert.equal((await directory.listAccounts(undefined,targetId+'@example.test',false,undefined,1)).hasMore,false);
      await assert.rejects(directory.listAccounts(undefined,undefined,true),
        'unassigned filter requires an explicit event scope');
      await assert.rejects(lifecycle.setEnabled(actorIdentityId,{enabled:false,reason:'Audit self-lockout prevention'},actor),ConflictException);
      const disable={enabled:false,reason:'Participant offboarding approved'};
      const first=await lifecycle.setEnabled(identityId,disable,actor);
      assert.equal((await directory.listAccounts(eventId,targetId+'@example.test',false,'DISABLED')).accounts[0]?.userStatus,'DISABLED');
      assert.equal((await directory.listAccounts(eventId,targetId+'@example.test',false,'ACTIVE')).accounts.length,0);
      assert.deepEqual({status:first.status,changed:first.changed},{status:'DISABLED',changed:true});
      /* Account disabled above and visible in the disabled-only search. */
      assert.deepEqual(revoked,[targetId]);
      assert.equal((await db.select({status:users.status}).from(users).where(eq(users.id,targetId)))[0]?.status,'DISABLED');
      assert.equal((await lifecycle.setEnabled(identityId,disable,actor)).changed,false);
      assert.deepEqual(revoked,[targetId]);
      await assert.rejects(lifecycle.setEnabled(privilegedIdentityId,disable,actor),ConflictException);
      await assert.rejects(lifecycle.setEnabled(mixedIdentityId,disable,actor),ConflictException);
      const nonAdmin={...actor,id:targetId,status:'ACTIVE'};
      await assert.rejects(lifecycle.setEnabled(identityId,{enabled:true,reason:'Reinstatement approved'},nonAdmin),ForbiddenException);
      const enable=await lifecycle.setEnabled(identityId,{enabled:true,reason:'Reinstatement approved'},actor);
      assert.equal(enable.status,'ACTIVE');
      assert.equal(enable.changed,true);
      assert.equal((await lifecycle.setEnabled(identityId,{enabled:true,reason:'Reinstatement approved'},actor)).changed,false);
      assert.deepEqual(revoked,[targetId],'reactivation never revokes newly created sessions');
      const actions=await db.select({action:auditEvents.action}).from(auditEvents)
        .where(eq(auditEvents.resourceId,targetId));
      assert.deepEqual(actions.map(x=>x.action).sort(),[
        'identity.ldap.account.disabled','identity.ldap.account.reactivated',
      ]);
      const auditSearch=await audit.list({resourceId:targetId,q:'REACTIVATED',page:1,limit:10},true);
      assert.equal(auditSearch.total,1,'case-insensitive search queries the persisted audit table');
      assert.equal(auditSearch.items[0]?.action,'identity.ldap.account.reactivated');
      assert.equal((await audit.list({resourceId:targetId,q:'%%%',page:1,limit:10},true)).total,0,
        'percent signs are literal text rather than SQL search wildcards');
      // Deleting the external provider must not hide existing CYRIS records or
      // prevent a platform administrator from disabling a compromised identity.
      await db.delete(integrations).where(eq(integrations.id,providerId));
      const orphan=(await directory.listAccounts(undefined,targetId+'@example.test')).accounts[0];
      assert.equal(orphan?.providerMissing,true);
      assert.equal(orphan?.providerEnabled,false);
      assert.equal(orphan?.userStatus,'ACTIVE');
      assert.equal((await lifecycle.setEnabled(identityId,{
        enabled:false,reason:'Directory provider removed; disable orphan',
      },actor)).status,'DISABLED');
      assert.equal((await directory.listAccounts(undefined,targetId+'@example.test',false,'DISABLED'))
        .accounts[0]?.providerMissing,true);
    }finally{await closeDatabaseConnection();}
  });

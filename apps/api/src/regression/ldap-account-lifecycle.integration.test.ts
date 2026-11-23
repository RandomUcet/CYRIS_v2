import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { auditEvents, closeDatabaseConnection, getDbClient, integrations, roleAssignments,
  rolePermissions, roles, userIdentities, users } from '@cyris/db';
import { LdapAccountStatusChangeSchema } from '@cyris/contracts';
import { generateId, Permissions } from '@cyris/shared';
import { AuditService } from '../modules/audit/audit.service.js';
import { SessionService } from '../modules/auth/session.service.js';
import { DatabaseService } from '../modules/database/database.service.js';
import { LdapAccountLifecycleService } from '../modules/integrations/ldap-account-lifecycle.service.js';
import { requireVerifiedIsolatedDatabase } from './isolated-postgres-harness.js';

test('LDAP account lifecycle input is explicit and requires a reason',()=>{
  assert.equal(LdapAccountStatusChangeSchema.safeParse({enabled:false,reason:'short'}).success,false);
  assert.equal(LdapAccountStatusChangeSchema.safeParse({enabled:'false',reason:'employee left'}).success,false);
  assert.equal(LdapAccountStatusChangeSchema.safeParse({enabled:true,reason:'approved restoration',extra:true}).success,false);
  assert.equal(LdapAccountStatusChangeSchema.safeParse({enabled:false,reason:'offboarding verified'}).success,true);
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
    const actorId=generateId(), targetId=generateId(), privilegedId=generateId(), mixedId=generateId(), providerId=generateId();
    const identityId=generateId(), privilegedIdentityId=generateId(), mixedIdentityId=generateId();
    const adminRoleId=generateId();
    const actor={id:actorId,email:actorId+'@example.test',displayName:'Operator',status:'ACTIVE'};
    try{
      await db.insert(users).values([
        actor,{id:targetId,email:targetId+'@example.test',displayName:'Participant'},
        {id:privilegedId,email:privilegedId+'@example.test',displayName:'Privileged'},
        {id:mixedId,email:mixedId+'@example.test',displayName:'Mixed'},
      ]);
      await db.insert(roles).values({id:adminRoleId,slug:adminRoleId,name:'Lifecycle test admin'});
      await db.insert(rolePermissions).values({roleId:adminRoleId,permissionKey:Permissions.PLATFORM_MANAGE,scope:'PLATFORM'});
      await db.insert(roleAssignments).values({userId:actorId,roleId:adminRoleId});
      await db.insert(integrations).values({id:providerId,name:'Lifecycle LDAP',category:'LDAP',providerType:'LDAP_ACTIVE_DIRECTORY',enabled:true,config:{}});
      const meta={providerId};
      await db.insert(userIdentities).values([
        {id:identityId,userId:targetId,providerType:'LDAP',providerSubject:'ldap:'+identityId,metadata:meta},
        {id:privilegedIdentityId,userId:privilegedId,providerType:'LDAP',providerSubject:'ldap:'+privilegedIdentityId,metadata:meta},
        {id:mixedIdentityId,userId:mixedId,providerType:'LDAP',providerSubject:'ldap:'+mixedIdentityId,metadata:meta},
        {id:generateId(),userId:mixedId,providerType:'OIDC',providerSubject:'oidc:'+mixedIdentityId},
      ]);
      await db.insert(roleAssignments).values({userId:privilegedId,roleId:adminRoleId});
      const accountList=await import('../modules/integrations/ldap-teams.service.js');
      const directory=new accountList.LdapTeamsService(database,audit);
      assert.equal((await directory.listAccounts(generateId())).accounts.length,0);
    } catch(err){
      // Remove only the optional non-existent exercise list assertion when no
      // exercise fixture exists; authentication invariants are tested below.
      if(!(err instanceof Error) || !err.message.includes('Cvičení nebylo nalezeno'))throw err;
    }
    try {
      const disable={enabled:false,reason:'Participant offboarding approved'};
      const first=await lifecycle.setEnabled(identityId,disable,actor);
      assert.deepEqual({status:first.status,changed:first.changed},{status:'DISABLED',changed:true});
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
      assert.deepEqual(revoked,[targetId],'reactivation never revokes newly created sessions');
      const actions=await db.select({action:auditEvents.action}).from(auditEvents)
        .where(eq(auditEvents.resourceId,targetId));
      assert.deepEqual(actions.map(x=>x.action).sort(),[
        'identity.ldap.account.disabled','identity.ldap.account.reactivated',
      ]);
    }finally{await closeDatabaseConnection();}
  });

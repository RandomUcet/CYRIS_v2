import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { LdapTeamAccount } from '@cyris/contracts';
import { ldapAccountAction, isLdapStatusConfirmationValid } from './ldap-account-policy.js';

function account(overrides:Partial<LdapTeamAccount>={}):LdapTeamAccount {
  return {
    identityId:'id',userId:'user',email:'user@example.test',displayName:'User',providerName:'LDAP',
    userStatus:'ACTIVE',platformAdmin:false,otherLoginMethods:false,
    membershipStatus:'ACTIVE',units:[],assignment:{mode:'DIRECTORY'},...overrides,
  };
}

test('LDAP lifecycle UX blocks self, global admins and mixed sign-ins',()=>{
  assert.equal(ldapAccountAction(account(),'actor'),'DISABLE');
  assert.equal(ldapAccountAction(account({userId:'actor'}),'actor'),'SELF');
  assert.equal(ldapAccountAction(account({platformAdmin:true}),'actor'),'ADMIN');
  assert.equal(ldapAccountAction(account({otherLoginMethods:true}),'actor'),'MULTI_LOGIN');
  assert.equal(ldapAccountAction(account({userStatus:'DISABLED'}),'actor'),'ENABLE');
  assert.equal(ldapAccountAction(account({userStatus:'DISABLED',otherLoginMethods:true}),'actor'),'MULTI_LOGIN');
});

test('LDAP lifecycle confirmation requires exact email and sufficient audit reason',()=>{
  assert.equal(isLdapStatusConfirmationValid('user@example.test','USER@EXAMPLE.TEST','Operator approved offboarding'),true);
  assert.equal(isLdapStatusConfirmationValid('user@example.test','other@example.test','Operator approved offboarding'),false);
  assert.equal(isLdapStatusConfirmationValid('user@example.test','user@example.test','short'),false);
  assert.equal(isLdapStatusConfirmationValid('user@example.test','user@example.test','x'.repeat(501)),false);
});

test('admin access UI exposes distinct tabs and LDAP lifecycle actions',()=>{
  const page=readFileSync(new URL('../app/admin/users/page.tsx',import.meta.url),'utf8');
  const directory=readFileSync(new URL('../components/admin/LdapTeamAssignments.tsx',import.meta.url),'utf8');
  for(const tab of ['participants','ldap','admins'])assert.ok(page.includes("tab==='"+tab+"'"));
  for(const name of ['setLdapAccountEnabled','listLdapTeamAccounts','ldapAccountAction',
    'isLdapStatusConfirmationValid','onClick={()=>{setAction(lifecycle)'])assert.ok(directory.includes(name),name);
  assert.ok(directory.includes("setStatus(e.target.value as StatusFilter)"));
  assert.ok(directory.includes("account.userStatus==='ACTIVE'"));
});

test('everywhere EXCON composer requires server audience preview and a human confirmation',()=>{
  const bar=readFileSync(new URL('../components/layout/TopBar.tsx',import.meta.url),'utf8');
  const drawer=readFileSync(new URL('../components/layout/QuickBroadcastDrawer.tsx',import.meta.url),'utf8');
  assert.ok(bar.includes('<QuickBroadcastDrawer'));
  assert.ok(bar.includes("hasPermission('scenario.manage',event.id)"));
  assert.ok(drawer.includes('useDialogAccessibility(open,requestClose)'));
  assert.ok(drawer.includes("previewExerciseBroadcastAudience"));
  assert.ok(drawer.includes("setStep('REVIEW')"));
  assert.ok(drawer.includes("step!=='REVIEW'"));
  assert.ok(drawer.includes("canSendNow"));
  assert.ok(drawer.includes("sendExerciseBroadcast"));
  assert.ok(drawer.includes("createExerciseBroadcastPlan"));
  assert.ok(drawer.includes("sendNonce.current??=crypto.randomUUID()"));
  assert.ok(drawer.includes("draftNonce.current??=crypto.randomUUID()"));
  assert.ok(drawer.includes("if(!requestClose())e.preventDefault()"));
});


test('identity provider manager can edit OIDC without overwriting hidden configuration',()=>{
  const page=readFileSync(new URL('../app/admin/settings/identity/page.tsx',import.meta.url),'utf8');
  assert.ok(page.includes('openOidc(p)'),'existing OIDC providers need an edit action');
  assert.ok(page.includes('id:editingOidc?.id'),'OIDC edits must preserve provider identity');
  for(const option of ['scopes','allowedEmailDomains','claimMappings']){
    assert.ok(page.includes('previousConfig?.'+option),'OIDC edit should preserve '+option);
  }
  for(const field of ['oidc-name','oidc-issuer','oidc-client','oidc-secret']){
    assert.ok(page.includes('htmlFor="'+field+'"'),'accessible OIDC label: '+field);
    assert.ok(page.includes('id="'+field+'"'),'OIDC control: '+field);
  }
  assert.ok(page.includes('disabled={Boolean(providerBusy)||Boolean(testingId)}'));
  assert.ok(page.includes('href="/admin/users"'));
});

test('exercise membership pause is distinct from global account deactivation',()=>{
  const page=readFileSync(new URL('../app/admin/users/page.tsx',import.meta.url),'utf8');
  const api=readFileSync(new URL('./api-client.ts',import.meta.url),'utf8');
  assert.ok(page.includes('pauseMembership(member)'));
  assert.ok(page.includes('activateMembership(member.eventId, member.id)'));
  assert.ok(page.includes('deactivateMembership(member.eventId,member.id)'));
  assert.ok(page.includes('Účet CYRIS zůstane aktivní.'));
  assert.ok(api.includes("status: 'INACTIVE'"));
  assert.ok(api.includes("status: 'ACTIVE'"));
});

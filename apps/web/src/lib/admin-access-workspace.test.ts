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

test('global LDAP account list works without exercise while event-team assignment stays scoped',()=>{
  const page=readFileSync(new URL('../app/admin/users/page.tsx',import.meta.url),'utf8');
  const directory=readFileSync(new URL('../components/admin/LdapTeamAssignments.tsx',import.meta.url),'utf8');
  const client=readFileSync(new URL('./api-client.ts',import.meta.url),'utf8');
  assert.ok(page.includes("key={currentEvent?.id??'global'}"),'global LDAP list should mount without an exercise');
  assert.ok(page.includes("disabled={tab!=='ldap'}"),'LDAP view should allow clearing selected event');
  assert.ok(directory.includes('event?:EventResponse'),'account editor must accept no event');
  assert.ok(directory.includes('event?.id,query.trim()'),'global list must omit eventId');
  assert.ok(directory.includes('disabled={saving||!event}'),'team filters are event-scoped');
  assert.ok(directory.includes('if (busy || !event || !canAssign'),'team changes require explicit event');
  assert.ok(client.includes('if(eventId)params.set(\'eventId\',eventId)'));
  assert.ok(client.includes("page: String(page)"),'account endpoint must request the selected page');
  assert.ok(directory.includes("const [page,setPage]=useState(1)"));
  assert.ok(directory.includes("setPage(p=>Math.min(1000,p+1))"));
  assert.ok(directory.includes("setPage(p=>Math.max(1,p-1))"));
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

test('LDAP admin details explain provider outages separately from account disablement',()=>{
  const directory=readFileSync(new URL('../components/admin/LdapTeamAssignments.tsx',import.meta.url),'utf8');
  assert.ok(directory.includes("account.providerEnabled===false"));
  assert.ok(directory.includes("account.lastLoginAt ? formatTime(account.lastLoginAt)"));
  assert.ok(directory.includes("setAccounts([]);setHasMore(false);setSelected('')"));
});

test('provider editor keeps LDAP Save/Cancel accessible with long group mappings',()=>{
  const provider=readFileSync(new URL('../app/admin/settings/identity/LdapProviderForm.tsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../components/admin/LdapTeams.module.css',import.meta.url),'utf8');
  assert.ok(provider.includes("styles.ldapEditorDialog"));
  assert.ok(provider.includes('className={styles.ldapEditorBody}'));
  assert.ok(provider.includes('className={styles.ldapEditorFooter}'));
  assert.ok(css.includes('.ldapEditorDialog[open]'));
  assert.ok(css.includes('.ldapEditorBody{display:grid;gap:17px;min-height:0;overflow-y:auto'));
  assert.ok(css.includes('.ldapEditorFooter{display:flex'));
  assert.ok(provider.includes("if (!saving) onClose()"),'form must not be dismissed during save');
  assert.ok(provider.includes('className={styles.full+\' \'+styles.ldapAttributes}'));
  assert.ok(!provider.includes('<details className={styles.full}>'),
    'required LDAP attributes should not be hidden in a collapsed details element');
  assert.ok(css.includes('.ldapAttributes{display:grid;gap:9px;'));
});

test('access management handles network failures and confirms command or membership changes',()=>{
  const users=readFileSync(new URL('../app/admin/users/page.tsx',import.meta.url),'utf8');
  const admins=readFileSync(new URL('../components/admin/PlatformAdministrators.tsx',import.meta.url),'utf8');
  assert.ok(users.includes('}).catch(err => {'),'participant fetch needs a network catch');
  assert.ok(users.includes("setChangingRole(true);"),'role operations still available');
  assert.ok(users.includes("if (!window.confirm(operation + target"),'exercise-command grant requires confirmation');
  assert.ok(users.includes("if (!window.confirm(tr("),'membership activation requires confirmation');
  assert.ok(admins.includes("if (active) setLoading(false)"),'spinner must stop even if the admin API throws');
  assert.ok(admins.includes("} catch (err) {"),'platform admin role updates need error feedback');
  assert.ok(admins.includes("cs ? 'Zkusit znovu' : 'Retry'"));
});

test('account audit drilldown uses server resource ID filtering and paginated history',()=>{
  const directory=readFileSync(new URL('../components/admin/LdapTeamAssignments.tsx',import.meta.url),'utf8');
  const audit=readFileSync(new URL('../app/admin/audit/page.tsx',import.meta.url),'utf8');
  const api=readFileSync(new URL('./api-client.ts',import.meta.url),'utf8');
  assert.ok(directory.includes("href={'/admin/audit?resourceId='+encodeURIComponent(account.userId)}"));
  assert.ok(audit.includes("new URLSearchParams(window.location.search).get('resourceId')"));
  assert.ok(audit.includes("resourceId: resourceFilter || undefined"));
  assert.ok(audit.includes("if (resourceFilter===null) return"),'avoid unfiltered load on direct-link mount');
  assert.ok(audit.includes('const request = ++auditRequest.current'), 'audit queries need an in-flight request guard');
  assert.ok(audit.includes('if (request !== auditRequest.current) return'));
  assert.ok(audit.includes('if (request === auditRequest.current) setLoading(false)'));
  assert.ok(audit.includes('page,'),'audit history must use backend pages');
  assert.ok(audit.includes("setPage(value=>value+1)"));
  assert.ok(api.includes("params.set('resourceId', filters.resourceId)"));
  assert.ok(api.includes("params.set('page', String(filters.page))"));
});

test('LDAP group mappings expose whole-exercise role scope explicitly',()=>{
  const provider=readFileSync(new URL('../app/admin/settings/identity/LdapProviderForm.tsx',import.meta.url),'utf8');
  assert.ok(provider.includes('checked={rule.allowEventWide}'));
  assert.ok(provider.includes("onChange={e => editRule(rule.key, { allowEventWide:e.target.checked, unitSlug:'' })}"));
  assert.ok(provider.includes('allowEventWide={rule.allowEventWide}'));
  assert.ok(provider.includes('Role platí pro celé cvičení'));
  assert.ok(provider.includes('if (result.ok) onSaved();'));
  assert.ok(provider.includes("catch (err)"));
});

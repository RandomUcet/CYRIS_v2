import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legalRoleTemplates, canonicalUnits } from './event-templates.js';
import { Permissions, PermissionScopes } from '@cyris/shared';
import { UnitCapabilityKeys } from '@cyris/contracts';
test('Prosecutor and judge have separate exercise permissions; court decisions stay judicial',()=>{
  const bySlug=new Map(legalRoleTemplates.map(r=>[r.slug,new Set(r.permissions.map(p=>p.key))]));
  const prosecutor=bySlug.get('statni-zastupce')!;
  const judge=bySlug.get('soudce')!;
  const liaison=bySlug.get('legal-expert-liaison')!;
  assert.ok(prosecutor.has(Permissions.COURT_CHARGE_MANAGE));
  assert.ok(prosecutor.has(Permissions.COURT_REQUEST_CREATE));
  assert.equal(prosecutor.has(Permissions.COURT_DECISION_CREATE),false);
  assert.equal(prosecutor.has(Permissions.COURT_EXHIBIT_DECIDE),false);
  assert.ok(judge.has(Permissions.COURT_DECISION_CREATE));
  assert.ok(judge.has(Permissions.COURT_EXHIBIT_DECIDE));
  assert.equal(judge.has(Permissions.COURT_CHARGE_MANAGE),false);
  assert.equal(judge.has(Permissions.COURT_REQUEST_RESPOND),true);
  assert.ok(liaison.has(Permissions.COURT_REQUEST_RESPOND));
  for(const role of legalRoleTemplates){
    assert.ok(role.permissions.every(p=>p.scope===PermissionScopes.EVENT));
    assert.equal(role.permissions.some(p=>String(p.key)===Permissions.PLATFORM_MANAGE),false);
  }
  assert.ok(canonicalUnits.some(u=>u.slug==='soudni-senat'&&
    u.capabilities.includes(UnitCapabilityKeys.COURT_PROCEEDINGS)));
});

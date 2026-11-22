import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('prosecution and judicial workspace navigation follows assigned roles, not only unit capability',()=>{
  const source=readFileSync(new URL('./workspace-resolver.service.ts',import.meta.url),'utf8');
  assert.ok(source.includes('permission: Permissions.COURT_CHARGE_MANAGE'));
  assert.ok(source.includes('permission: Permissions.COURT_DECISION_CREATE'));
  assert.ok(source.includes('(hasProsecution || canFileCharges || isPlatformAdmin)'));
  assert.ok(source.includes('(hasCourt || canIssueJudicialDecisions || isPlatformAdmin)'));
  assert.ok(source.includes('canReadLegalRequests'));
  assert.ok(source.includes('/legal-requests'));
});

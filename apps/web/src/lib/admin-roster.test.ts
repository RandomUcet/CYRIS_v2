import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import type { MembershipResponse } from '@cyris/contracts';
import { filterRoster, rosterCounts, rosterStatus } from './admin-roster.js';

function member(id: string, status: string, accountStatus: string | null, teams: string[]): MembershipResponse {
  return { id, status, user: accountStatus ? { status: accountStatus, displayName: 'Jiří Novák', email: id + '@example.test' } : null,
    units: teams.map(team => ({ id: team, name: 'Krizový štáb' })), roles: [{ name: 'Vyšetřovatel' }] } as unknown as MembershipResponse;
}

test('roster search is Czech-accent insensitive and matches multiple words across fields', () => {
  const members = [member('alpha', 'ACTIVE', 'ACTIVE', ['a']), member('beta', 'ACTIVE', 'ACTIVE', [])];
  assert.deepEqual(filterRoster(members, 'JIRI  krizovy vysetrovatel', 'ALL', 'ALL').map(row => row.id), ['alpha']);
  assert.deepEqual(filterRoster(members, 'beta@', 'ALL', 'NONE').map(row => row.id), ['beta']);
  assert.deepEqual(filterRoster(members, 'jiri', 'ALL', 'b'), []);
});

test('roster distinguishes disabled or missing accounts from inactive exercise memberships', () => {
  const members = [member('active', 'ACTIVE', 'ACTIVE', ['a']), member('inactive', 'INACTIVE', 'ACTIVE', ['a']), member('disabled', 'ACTIVE', 'DISABLED', []), member('missing', 'ACTIVE', null, [])];
  assert.equal(rosterStatus(members[2]!), 'ACCOUNT_UNAVAILABLE');
  assert.deepEqual(rosterCounts(members), { active: 1, inactive: 1, unavailable: 2, withoutTeam: 2 });
  assert.deepEqual(filterRoster(members, '', 'INACTIVE', 'ALL').map(row => row.id), ['inactive']);
  assert.deepEqual(filterRoster(members, '', 'ACCOUNT_UNAVAILABLE', 'NONE').map(row => row.id), ['disabled', 'missing']);
});

test('participant page gates list, preview and async operations by current exercise scope', () => {
  const page = readFileSync(new URL('../app/admin/users/page.tsx', import.meta.url), 'utf8');
  assert.ok(page.includes('loadedScope === scope && loadedRevision === revision'));
  assert.ok(page.includes('rosterReady ? memberships : []'));
  assert.ok(page.includes('member.eventId === currentEvent.id'));
  assert.ok(page.includes('target&&rosterReady&&target.eventId===eventId'));
  assert.ok(page.includes('eventId: member.eventId, targetUserId: member.userId'));
  assert.ok(page.includes('if (scopeRef.current !== scope) return;'));
  assert.ok(page.includes('if (operationRef.current) return null;'));
  assert.ok(page.includes('disabled={loadingEvents || mutationBusy}'));
});

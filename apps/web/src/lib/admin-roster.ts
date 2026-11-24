import type { MembershipResponse } from '@cyris/contracts';

export type RosterStatus = 'ACTIVE' | 'INACTIVE' | 'ACCOUNT_UNAVAILABLE';
export type RosterStatusFilter = 'ALL' | RosterStatus;
type RosterMember = Pick<MembershipResponse, 'user' | 'status' | 'units' | 'roles'>;

export function rosterStatus(member: RosterMember): RosterStatus {
  if (member.user?.status !== 'ACTIVE') return 'ACCOUNT_UNAVAILABLE';
  return member.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE';
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

export function filterRoster<T extends RosterMember>(members: readonly T[], query: string, status: RosterStatusFilter, team: string): T[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return members.filter(member => {
    if (status !== 'ALL' && rosterStatus(member) !== status) return false;
    if (team === 'NONE' ? member.units.length !== 0 : team !== 'ALL' && !member.units.some(unit => unit.id === team)) return false;
    const text = normalize([member.user?.displayName, member.user?.email, ...member.units.map(unit => unit.name), ...member.roles.map(role => role.name)].join(' '));
    return terms.every(term => text.includes(term));
  });
}

export function rosterCounts(members: readonly RosterMember[]) {
  const result = { active: 0, inactive: 0, unavailable: 0, withoutTeam: 0 };
  for (const member of members) {
    const status = rosterStatus(member);
    if (status === 'ACTIVE') result.active++;
    else if (status === 'INACTIVE') result.inactive++;
    else result.unavailable++;
    if (!member.units.length) result.withoutTeam++;
  }
  return result;
}

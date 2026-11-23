import type { LdapTeamAccount } from '@cyris/contracts';

/** The server independently enforces all account lifecycle boundaries. */
export type LdapAccountAction = 'ENABLE' | 'DISABLE' | 'SELF' | 'ADMIN' | 'MULTI_LOGIN';

export function ldapAccountAction(account: Pick<LdapTeamAccount,
  'userId' | 'userStatus' | 'platformAdmin' | 'otherLoginMethods'>,
  actorId: string,
): LdapAccountAction {
  if (account.otherLoginMethods) return 'MULTI_LOGIN';
  if (account.userStatus === 'DISABLED') return 'ENABLE';
  if (account.userId === actorId) return 'SELF';
  if (account.platformAdmin) return 'ADMIN';
  return 'DISABLE';
}

export function isLdapStatusConfirmationValid(
  expectedEmail: string,
  confirmation: string,
  reason: string,
): boolean {
  const len = reason.trim().length;
  return confirmation.trim().toLowerCase() === expectedEmail.toLowerCase() &&
    len >= 8 && len <= 500;
}

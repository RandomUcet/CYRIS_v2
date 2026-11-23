import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import {
  userIdentities, users, UserStatus,
} from '@cyris/db';
import { Permissions, PermissionScopes } from '@cyris/shared';
import type { LdapAccountStatusChange } from '@cyris/contracts';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { SessionService } from '../auth/session.service.js';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';

/**
 * Platform administration is deliberately restricted to explicit platform grants.
 * Event-scoped exercise command roles never authorize account lifecycle changes.
 */
export const platformAdminGrant = sql<boolean>`exists (
  select 1 from role_assignments ra
  join roles r on r.id = ra.role_id
  join role_permissions rp on rp.role_id = r.id
  where ra.user_id = ${users.id} and ra.membership_id is null and ra.unit_id is null
    and r.event_id is null and rp.permission_key = ${Permissions.PLATFORM_MANAGE}
    and rp.scope = ${PermissionScopes.PLATFORM}
)`;

@Injectable()
export class LdapAccountLifecycleService {
  private readonly logger = new Logger(LdapAccountLifecycleService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
  ) {}

  async setEnabled(identityId: string, input: LdapAccountStatusChange, actor: AuthenticatedUser) {
    const changed = await this.database.client.transaction(async tx => {
      // Lock administration operations so the actor's rights are checked again
      // even if another administrator was concurrently changing platform grants.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cyris.platform-admins'))`);
      const [administrator] = await tx.select({ id: users.id }).from(users)
        .where(and(eq(users.id, actor.id), eq(users.status, UserStatus.ACTIVE), platformAdminGrant)).limit(1);
      if (!administrator) throw new ForbiddenException('Platform administrator permission required');

      const [account] = await tx.select({ userId: users.id, status: users.status, email: users.email })
        .from(userIdentities)
        .innerJoin(users, eq(users.id, userIdentities.userId))
        .where(and(eq(userIdentities.id, identityId), eq(userIdentities.providerType, 'LDAP')))
        .for('update', { of: users }).limit(1);
      if (!account) throw new NotFoundException('LDAP account not found');

      // A LDAP identity is a login method, but "DISABLED" is a global user state.
      // Prevent collateral lockout of mixed-authentication and multi-directory accounts.
      const identities = await tx.select({ id: userIdentities.id, provider: userIdentities.providerType })
        .from(userIdentities).where(eq(userIdentities.userId, account.userId));
      if (identities.length !== 1 || identities[0]?.id !== identityId) {
        throw new ConflictException('Account uses multiple sign-in methods; review identities before changing global status');
      }

      const targetStatus = input.enabled ? UserStatus.ACTIVE : UserStatus.DISABLED;
      if (account.status === targetStatus) return { userId: account.userId, status: targetStatus, changed: false };

      if (!input.enabled) {
        if (account.userId === actor.id) throw new ConflictException('You cannot deactivate your own account');
        // Administrators must be explicitly demoted first; do not silently
        // disable break-glass / platform-management accounts.
        const [grant] = await tx.select({ id: users.id }).from(users)
          .where(and(eq(users.id, account.userId), platformAdminGrant)).limit(1);
        if (grant) throw new ConflictException('Revoke platform administrator access before deactivating this account');
      }

      await tx.update(users).set({ status: targetStatus, updatedAt: new Date() })
        .where(eq(users.id, account.userId));
      await this.audit.record({
        action: input.enabled ? 'identity.ldap.account.reactivated' : 'identity.ldap.account.disabled',
        category: 'identity', actorUserId: actor.id,
        resourceType: 'user', resourceId: account.userId,
        metadata: { identityId, reason: input.reason, source: 'administrator' },
        changes: { from: account.status, to: targetStatus }, txClient: tx,
      });
      return { userId: account.userId, status: targetStatus, changed: true };
    });
    if (changed.changed && changed.status === UserStatus.DISABLED) {
      // Status is checked on EVERY session validation. Redis revocation is an
      // additional immediate cleanup; a Redis outage must never undo the DB lockout.
      try { await this.sessions.revokeAllUserSessions(changed.userId); }
      catch { this.logger.warn('LDAP account disabled, Redis session cleanup will occur during session validation'); }
    }
    return changed;
  }
}

import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { roleAssignments, rolePermissions, roles, userIdentities, users } from '@cyris/db';
import { Permissions, PermissionScopes } from '@cyris/shared';
import type { PlatformAdminAccount } from '@cyris/contracts';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';

// Correlated with the outer user. Match the platform scope used by AuthorizationService.
const admin = sql<boolean>`exists (
  select 1 from role_assignments a join roles r on r.id = a.role_id
  join role_permissions p on p.role_id = r.id
  where a.user_id = users.id and a.membership_id is null and a.unit_id is null and r.event_id is null
    and p.permission_key = ${Permissions.PLATFORM_MANAGE} and p.scope = ${PermissionScopes.PLATFORM}
)`;
const ldap = sql<boolean>`exists (
  select 1 from user_identities i where i.user_id = users.id and i.provider_type = 'LDAP'
)`;
const fields = { id: users.id, email: users.email, displayName: users.displayName, status: users.status, ldap, admin };

@Injectable()
export class PlatformAdminsService {
  constructor(private readonly database: DatabaseService, private readonly audit: AuditService) {}

  async list(q: string): Promise<{ accounts: PlatformAdminAccount[]; hasMore: boolean }> {
    const query = this.database.client.select(fields).from(users);
    if (!q) return { accounts: await query.where(admin).orderBy(users.displayName, users.id), hasMore: false };
    const rows = await query.where(and(ldap, eq(users.status, 'ACTIVE'),
      sql`(strpos(lower(${users.displayName}), lower(${q})) > 0 or strpos(lower(${users.email}), lower(${q})) > 0)`))
      .orderBy(users.displayName, users.id).limit(26);
    return { accounts: rows.slice(0, 25), hasMore: rows.length > 25 };
  }

  async set(userId: string, enabled: boolean, actorUserId: string) {
    return this.database.client.transaction(async tx => {
      // Serialize changes, then recheck the actor in case another admin just revoked their grant.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cyris.platform-admins'))`);
      const [actor] = await tx.select({ id: users.id }).from(users)
        .where(and(eq(users.id, actorUserId), eq(users.status, 'ACTIVE'), admin));
      if (!actor) throw new ForbiddenException();
      if (!enabled && actorUserId === userId) throw new ConflictException('Vlastní roli správce nelze odebrat.');
      const [target] = await tx.select(fields).from(users).where(eq(users.id, userId)).for('update');
      if (!target?.ldap) throw new NotFoundException('LDAP účet nebyl nalezen.');
      if (enabled && target.status !== 'ACTIVE') throw new ConflictException('Účet je deaktivovaný.');
      if (enabled === target.admin) return { ok: true };
      if (enabled) {
        const [otherIdentity] = await tx.select({ id: userIdentities.id }).from(userIdentities)
          .where(and(eq(userIdentities.userId, userId), ne(userIdentities.providerType, 'LDAP'))).limit(1);
        if (otherIdentity) throw new ConflictException('Použijte samostatný LDAP účet. Tento účet má také jiný způsob přihlášení.');
      }
      const [role] = await tx.select({ id: roles.id }).from(roles)
        .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
        .where(and(isNull(roles.eventId), eq(roles.slug, 'platform-admin'),
          eq(rolePermissions.permissionKey, Permissions.PLATFORM_MANAGE), eq(rolePermissions.scope, PermissionScopes.PLATFORM)));
      if (!role) throw new ConflictException('V systému chybí základní role správce platformy.');
      if (enabled) await tx.insert(roleAssignments).values({ userId, roleId: role.id });
      else {
        await tx.delete(roleAssignments).where(and(eq(roleAssignments.userId, userId), eq(roleAssignments.roleId, role.id),
          isNull(roleAssignments.membershipId), isNull(roleAssignments.unitId)));
        const [remaining] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, userId), admin));
        if (remaining) throw new ConflictException('Účet má oprávnění správce také z jiné platformní role.');
      }
      await this.audit.record({ action: enabled ? 'platform.admin.granted' : 'platform.admin.revoked', category: 'authorization',
        actorUserId, resourceType: 'user', resourceId: userId, changes: { from: !enabled, to: enabled }, txClient: tx });
      return { ok: true };
    });
  }
}

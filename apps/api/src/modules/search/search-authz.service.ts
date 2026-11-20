import { Injectable, Logger } from '@nestjs/common';
import { eq, and, isNull } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import {
  roles,
  rolePermissions,
  roleAssignments,
  eventMemberships,
  membershipUnitAssignments,
  MembershipStatus,
} from '@cyris/db';
import { Permissions, PermissionScopes } from '@cyris/shared';

import { privateControlTypes, resourceTypesForModule } from '../disruptions/module-resources.js';
import { requestModuleImpacts } from '../disruptions/request-impacts.js';

export interface SearchFilterContext {
  typeFilter?: string;
  eventFilter?: string;
}

@Injectable()
export class SearchAuthzService {
  private readonly logger = new Logger(SearchAuthzService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Resolves the user's active permissions and memberships from canonical PostgreSQL state
   * and derives a secure Typesense filter_by string.
   *
   * If the user has zero discoverable access, returns null (meaning search should return 0 results immediately).
   */
  async buildTypesenseFilter(
    user: AuthenticatedUser,
    context?: SearchFilterContext
  ): Promise<string | null> {
    if (!user || user.status !== 'ACTIVE') {
      return null;
    }

    const db = this.databaseService.client;

    // 1. Resolve Platform-Level Roles (direct User assignments)
    const platformAssignments = await db
      .select({
        roleId: roleAssignments.roleId,
        permissionKey: rolePermissions.permissionKey,
        scope: rolePermissions.scope,
      })
      .from(roleAssignments)
      .innerJoin(roles, eq(roleAssignments.roleId, roles.id))
      .innerJoin(rolePermissions, eq(roles.id, rolePermissions.roleId))
      .where(and(eq(roleAssignments.userId, user.id), isNull(roleAssignments.membershipId), isNull(roleAssignments.unitId), isNull(roles.eventId)));

    const isPlatformAdmin = platformAssignments.some(
      (a) =>
        a.permissionKey === Permissions.PLATFORM_MANAGE &&
        a.scope === PermissionScopes.PLATFORM
    );

    // If platform admin: can discover everything across CYRIS
    if (isPlatformAdmin) {
      const adminClauses: string[] = [];
      if (context?.typeFilter) {
        adminClauses.push(`resourceType:=${context.typeFilter}`);
      }
      if (context?.eventFilter) {
        adminClauses.push(`eventId:=${context.eventFilter}`);
      }
      return adminClauses.length > 0 ? adminClauses.join(' && ') : '';
    }

    // 2. Collect discoverable sub-clauses for non-admin user
    const accessClauses: string[] = [];

    // Platform-scoped permissions
    const platformPermKeys = platformAssignments
      .filter((a) => a.scope === PermissionScopes.PLATFORM)
      .map((a) => a.permissionKey);

    if (platformPermKeys.length > 0) {
      accessClauses.push(
        `(visibility:PLATFORM && requiredPermission:[${platformPermKeys.join(',')}])`
      );
    }

    // 3. Resolve Event-Scoped Memberships & Unit Assignments
    const activeMemberships = await db
      .select({
        id: eventMemberships.id,
        eventId: eventMemberships.eventId,
      })
      .from(eventMemberships)
      .where(
        and(
          eq(eventMemberships.userId, user.id),
          eq(eventMemberships.status, MembershipStatus.ACTIVE)
        )
      );

    const eventExclusions: string[] = [];
    for (const membership of activeMemberships) {
      if (context?.eventFilter && membership.eventId !== context.eventFilter) continue;
      const impacts = await requestModuleImpacts(db, membership.eventId, user);
      const hiddenTypes = [...impacts].filter(([, mode]) => mode === 'UNAVAILABLE')
        .flatMap(([module]) => resourceTypesForModule(module));
      if (hiddenTypes.length) {
        eventExclusions.push(`(eventId:!=${membership.eventId} || resourceType:!=[${hiddenTypes.join(',')}])`);
      }
      // Fetch role assignments for this membership
      const roleRows = await db
        .select({
          permissionKey: rolePermissions.permissionKey,
          scope: rolePermissions.scope,
          unitId: roleAssignments.unitId,
        })
        .from(roleAssignments)
        .innerJoin(roles, eq(roleAssignments.roleId, roles.id))
        .innerJoin(rolePermissions, eq(roles.id, rolePermissions.roleId))
        .where(and(eq(roleAssignments.membershipId, membership.id), eq(roles.eventId, membership.eventId), isNull(roleAssignments.userId)));

      if (roleRows.length === 0) {
        continue;
      }

      // Event-scoped permissions (applies event-wide)
      const eventScopedPerms = roleRows
        .filter(
          (r) =>
            r.scope === PermissionScopes.EVENT
        )
        .map((r) => r.permissionKey);

      // Unit-scoped permissions
      const unitScopedPerms = roleRows.filter(
        (r) => r.scope === PermissionScopes.UNIT
      );

      // Check event-level resources (e.g. event itself, event-wide roles)
      if (eventScopedPerms.length > 0) {
        accessClauses.push(
          `(eventId:=${membership.eventId} && visibility:[PLATFORM, EVENT] && requiredPermission:[${eventScopedPerms.join(',') + ',event.read'}])`
        );
        // If user has event-scoped unit.read or case.read, they can see ALL units in the event
        accessClauses.push(
          `(eventId:=${membership.eventId} && visibility:UNIT && requiredPermission:[${eventScopedPerms.join(',')}])`
        );
      }

      // Check assigned units for unit-scoped permissions
      if (unitScopedPerms.length > 0) {
        // Fetch explicit unit assignments
        const unitAssignments = await db
          .select({ unitId: membershipUnitAssignments.unitId })
          .from(membershipUnitAssignments)
          .where(eq(membershipUnitAssignments.membershipId, membership.id));

        const explicitUnitIds = unitAssignments.map((u) => u.unitId);
        // Keep each permission bound to its own unit. Combining all grants and
        // all memberships would leak one team's rights into another team.
        for (const grant of unitScopedPerms) {
          const accessibleUnitIds = grant.unitId ? [grant.unitId] : explicitUnitIds;
          if (!accessibleUnitIds.length) continue;
          accessClauses.push(
            `(eventId:=${membership.eventId} && visibility:UNIT && requiredPermission:[${grant.permissionKey}] && unitIds:[${accessibleUnitIds.join(',')}])`
          );
        }
      }
    }

    if (accessClauses.length === 0) {
      // User has zero discoverable permissions or active memberships
      return null;
    }

    let filter = [`(${accessClauses.join(' || ')})`, `resourceType:!=[${privateControlTypes.join(',')}]`, ...eventExclusions].join(' && ');

    if (context?.typeFilter) {
      filter = `${filter} && resourceType:=${context.typeFilter}`;
    }
    if (context?.eventFilter) {
      filter = `${filter} && eventId:=${context.eventFilter}`;
    }

    return filter;
  }
}

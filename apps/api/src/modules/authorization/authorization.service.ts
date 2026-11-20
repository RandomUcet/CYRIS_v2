import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
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
  users,
} from '@cyris/db';
import {
  Permissions,
  PermissionScopes,
  type PermissionKey,
  type PermissionScope,
} from '@cyris/shared';

export interface AuthorizeParams {
  user: AuthenticatedUser;
  permission: PermissionKey;
  context?: {
    eventId?: string;
    unitId?: string;
    resourceOwnerId?: string;
    resourceAssigneeId?: string;
  };
}

@Injectable()
export class AuthorizationService {
  private readonly logger = new Logger(AuthorizationService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Central server-side policy evaluation boundary.
   * Denies by default. Resolves platform assignments, event memberships,
   * role assignments, and permission scope matching.
   */
  async authorize(params: AuthorizeParams): Promise<boolean> {
    const { user, permission, context } = params;
    if (!user || user.status !== 'ACTIVE') {
      return false;
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
      .where(and(
        eq(roleAssignments.userId, user.id), isNull(roleAssignments.membershipId),
        isNull(roleAssignments.unitId), isNull(roles.eventId),
      ));

    for (const assignment of platformAssignments) {
      // Universal platform administrative power
      if (
        assignment.permissionKey === Permissions.PLATFORM_MANAGE &&
        assignment.scope === PermissionScopes.PLATFORM
      ) {
        return true;
      }

      // Explicit platform permission matching
      if (
        assignment.permissionKey === permission &&
        assignment.scope === PermissionScopes.PLATFORM
      ) {
        return true;
      }
    }

    // 2. Resolve Event-Scoped Roles (via EventMembership)
    if (context?.eventId) {
      // Must have active event membership
      const [membership] = await db
        .select({
          id: eventMemberships.id,
          status: eventMemberships.status,
        })
        .from(eventMemberships)
        .where(
          and(
            eq(eventMemberships.eventId, context.eventId),
            eq(eventMemberships.userId, user.id)
          )
        )
        .limit(1);

      if (!membership || membership.status !== MembershipStatus.ACTIVE) {
        return false;
      }

      // Query roles assigned to this event membership
      const eventRoleAssignments = await db
        .select({
          roleId: roleAssignments.roleId,
          assignmentUnitId: roleAssignments.unitId,
          permissionKey: rolePermissions.permissionKey,
          scope: rolePermissions.scope,
        })
        .from(roleAssignments)
        .innerJoin(roles, eq(roleAssignments.roleId, roles.id))
        .innerJoin(rolePermissions, eq(roles.id, rolePermissions.roleId))
        .where(and(
          eq(roleAssignments.membershipId, membership.id),
          eq(roles.eventId, context.eventId), isNull(roleAssignments.userId),
        ));

      for (const ra of eventRoleAssignments) {
        if (ra.permissionKey !== permission || ra.permissionKey === Permissions.PLATFORM_MANAGE || ra.scope === PermissionScopes.PLATFORM) {
          continue;
        }

        // Platform permissions can only be granted through a platform role.
        if (ra.scope === PermissionScopes.EVENT) {
          return true;
        }

        // Scope: UNIT applies if unit context matches assigned unit
        if (ra.scope === PermissionScopes.UNIT && context.unitId) {
          if (ra.assignmentUnitId) {
            if (ra.assignmentUnitId === context.unitId) return true;
            continue;
          }

          // Check if operator belongs to this unit via membership_unit_assignments
          const [unitAssignment] = await db
            .select({ id: membershipUnitAssignments.id })
            .from(membershipUnitAssignments)
            .where(
              and(
                eq(membershipUnitAssignments.membershipId, membership.id),
                eq(membershipUnitAssignments.unitId, context.unitId)
              )
            )
            .limit(1);

          if (unitAssignment) {
            return true;
          }
        }

        // Scope: OWN (Resource owner check)
        if (
          ra.scope === PermissionScopes.OWN &&
          context.resourceOwnerId === user.id
        ) {
          return true;
        }

        // Scope: ASSIGNED (Resource assignee check)
        if (
          ra.scope === PermissionScopes.ASSIGNED &&
          context.resourceAssigneeId === user.id
        ) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Module availability, not authorization to read or mutate a resource.
   * An ASSIGNED grant makes a member eligible to receive work and see service
   * status before an assignment exists. Resource access still uses authorize /
   * ResourceAccessService with the actual owner and assignment.
   */
  async hasEventCapability(params: {
    user: AuthenticatedUser;
    permission: PermissionKey;
    eventId: string;
    unitId?: string;
    resourceScopes: readonly ('OWN' | 'ASSIGNED')[];
    requireUnitMembership?: boolean;
  }): Promise<boolean> {
    const { user, permission, eventId, unitId, resourceScopes } = params;
    if (!user || user.status !== 'ACTIVE') return false;
    const db = this.databaseService.client;
    const [membership] = await db.select({ id: eventMemberships.id })
      .from(eventMemberships)
      .innerJoin(users, eq(users.id, eventMemberships.userId))
      .where(and(
        eq(eventMemberships.eventId, eventId),
        eq(eventMemberships.userId, user.id),
        eq(eventMemberships.status, MembershipStatus.ACTIVE),
        eq(users.status, 'ACTIVE'),
      )).limit(1);
    if (!membership) return false;
    const unitRows = await db.select({ unitId: membershipUnitAssignments.unitId })
      .from(membershipUnitAssignments)
      .where(eq(membershipUnitAssignments.membershipId, membership.id));
    const unitIds = unitRows.map((row) => row.unitId);
    if (params.requireUnitMembership && (!unitId || !unitIds.includes(unitId))) return false;
    if (await this.authorize({ user, permission })) return true;
    const grants = await db.select({ scope: rolePermissions.scope, unitId: roleAssignments.unitId })
      .from(roleAssignments)
      .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .where(and(
        eq(roleAssignments.membershipId, membership.id), eq(rolePermissions.permissionKey, permission),
        eq(roles.eventId, eventId), isNull(roleAssignments.userId),
      ));
    return grants.some((grant) => {
      // A role explicitly attached to a unit cannot confer capabilities elsewhere.
      if (unitId && grant.unitId && grant.unitId !== unitId) return false;
      if (grant.scope === PermissionScopes.EVENT) return true;
      if (grant.scope === PermissionScopes.UNIT) {
        return unitId
          ? grant.unitId === unitId || (!grant.unitId && unitIds.includes(unitId))
          : grant.unitId ? unitIds.includes(grant.unitId) : unitIds.length > 0;
      }
      return resourceScopes.some((scope) => grant.scope === scope);
    });
  }

  /**
   * Asserts permission or throws ForbiddenException.
   */
  async assertAuthorized(params: AuthorizeParams): Promise<void> {
    const isAllowed = await this.authorize(params);
    if (!isAllowed) {
      this.logger.warn(
        `Access denied for user '${params.user.id}' on permission '${params.permission}' in context ${JSON.stringify(
          params.context
        )}`
      );
      throw new ForbiddenException(
        `Forbidden: Missing permission '${params.permission}' for the requested resource.`
      );
    }
  }
}

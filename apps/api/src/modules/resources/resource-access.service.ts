import { Injectable, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { eq, and, or, inArray } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import {
  resources,
  resourceAccessControl,
  resourceAssignments,
  eventMemberships,
  membershipUnitAssignments,
  roleAssignments,
  roles,
  rolePermissions,
  operationalTasks,
  MembershipStatus,
  ResourceVisibility,
} from '@cyris/db';
import {
  Permissions,
  PermissionScopes,
  type PermissionKey,
} from '@cyris/shared';

@Injectable()
export class ResourceAccessService {
  private readonly logger = new Logger(ResourceAccessService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly authzService: AuthorizationService
  ) {}

  /**
   * Central canonical boundary for resource access and authorization.
   * Resolves event membership, organizational unit, ownership, assignment,
   * RESTRICTED / SCENARIO status, and permission scope matching.
   */
  async canAccessResource(
    user: AuthenticatedUser,
    resourceId: string,
    permission: PermissionKey,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    txClient?: any
  ): Promise<boolean> {
    if (!user || user.status !== 'ACTIVE') {
      return false;
    }

    const db = txClient || this.databaseService.client;

    // 1. Platform Admin universal power
    const isPlatformAdmin = await this.authzService.authorize({
      user,
      permission: Permissions.PLATFORM_MANAGE,
    });
    if (isPlatformAdmin) {
      return true;
    }

    // 2. Fetch resource metadata
    const [resource] = await db
      .select({
        id: resources.id,
        eventId: resources.eventId,
        visibility: resources.visibility,
        owningUnitId: resources.owningUnitId,
        ownerUserId: resources.ownerUserId,
      })
      .from(resources)
      .where(eq(resources.id, resourceId))
      .limit(1);

    if (!resource) {
      return false;
    }

    // 3. Resolve active Event Membership
    const [membership] = await db
      .select({
        id: eventMemberships.id,
        status: eventMemberships.status,
      })
      .from(eventMemberships)
      .where(
        and(
          eq(eventMemberships.eventId, resource.eventId),
          eq(eventMemberships.userId, user.id)
        )
      )
      .limit(1);

    if (!membership || membership.status !== MembershipStatus.ACTIVE) {
      return false;
    }

    // 4. Resolve User's Unit Memberships in this event
    const unitAssignments = await db
      .select({ unitId: membershipUnitAssignments.unitId })
      .from(membershipUnitAssignments)
      .where(eq(membershipUnitAssignments.membershipId, membership.id));

    const userUnitIds = unitAssignments.map((u: { unitId: string }) => u.unitId);

    // 5. Resolve Operator's Roles & Permissions for this Event Membership
    const eventRoleRows = await db
      .select({
        roleId: roleAssignments.roleId,
        assignmentUnitId: roleAssignments.unitId,
        permissionKey: rolePermissions.permissionKey,
        scope: rolePermissions.scope,
      })
      .from(roleAssignments)
      .innerJoin(roles, eq(roleAssignments.roleId, roles.id))
      .innerJoin(rolePermissions, eq(roles.id, rolePermissions.roleId))
      .where(eq(roleAssignments.membershipId, membership.id));

    // 6. Evaluate Visibility Models: SCENARIO and RESTRICTED
    if (resource.visibility === ResourceVisibility.SCENARIO) {
      const hasScenarioAuth = eventRoleRows.some(
        (r: { permissionKey: string }) =>
          r.permissionKey === Permissions.SCENARIO_SECRET_READ ||
          r.permissionKey === Permissions.SCENARIO_READ ||
          r.permissionKey === Permissions.PLATFORM_MANAGE
      );

      if (!hasScenarioAuth) {
        // Controlled disclosure check: explicit access grants to user or user's unit
        const explicitGrants = await db
          .select({ principalType: resourceAccessControl.principalType, principalId: resourceAccessControl.principalId })
          .from(resourceAccessControl)
          .where(eq(resourceAccessControl.resourceId, resource.id));

        const userHasExplicitGrant = explicitGrants.some(
          (g: { principalType: string; principalId: string }) =>
            (g.principalType === 'USER' && g.principalId === user.id) ||
            (g.principalType === 'UNIT' && userUnitIds.includes(g.principalId))
        );

        if (!userHasExplicitGrant) {
          return false;
        }
      }
    }

    if (resource.visibility === ResourceVisibility.RESTRICTED) {
      const isOwner = resource.ownerUserId === user.id;
      if (!isOwner) {
        // Check explicit access grants
        const explicitGrants = await db
          .select({ principalType: resourceAccessControl.principalType, principalId: resourceAccessControl.principalId })
          .from(resourceAccessControl)
          .where(eq(resourceAccessControl.resourceId, resource.id));

        const userHasExplicitGrant = explicitGrants.some(
          (g: { principalType: string; principalId: string }) =>
            (g.principalType === 'USER' && g.principalId === user.id) ||
            (g.principalType === 'UNIT' && userUnitIds.includes(g.principalId))
        );

        if (!userHasExplicitGrant) {
          return false;
        }
      }
    }

    if (resource.visibility === ResourceVisibility.UNIT) {
      const isMemberOfOwningUnit = resource.owningUnitId ? userUnitIds.includes(resource.owningUnitId) : false;
      const isOwner = resource.ownerUserId === user.id;
      const isPlatformManager = eventRoleRows.some(
        (r: { permissionKey: string }) => r.permissionKey === Permissions.PLATFORM_MANAGE
      );

      if (!isMemberOfOwningUnit && !isOwner && !isPlatformManager) {
        // Check explicit access grants
        const explicitGrants = await db
          .select({ principalType: resourceAccessControl.principalType, principalId: resourceAccessControl.principalId })
          .from(resourceAccessControl)
          .where(eq(resourceAccessControl.resourceId, resource.id));

        const userHasExplicitGrant = explicitGrants.some(
          (g: { principalType: string; principalId: string }) =>
            (g.principalType === 'USER' && g.principalId === user.id) ||
            (g.principalType === 'UNIT' && userUnitIds.includes(g.principalId))
        );

        if (!userHasExplicitGrant) {
          return false;
        }
      }
    }

    // Check if operator has the required permission under an applicable scope
    for (const ra of eventRoleRows) {
      if (ra.permissionKey !== permission) {
        continue;
      }

      // Scope: EVENT or PLATFORM applies across the entire event
      if (
        ra.scope === PermissionScopes.EVENT ||
        ra.scope === PermissionScopes.PLATFORM
      ) {
        return true;
      }

      // Scope: UNIT applies if user belongs to the owning unit
      if (ra.scope === PermissionScopes.UNIT) {
        if (resource.owningUnitId && (userUnitIds.includes(resource.owningUnitId) || ra.assignmentUnitId === resource.owningUnitId)) {
          return true;
        }
      }

      // Scope: OWN applies if user is the resource owner
      if (ra.scope === PermissionScopes.OWN && resource.ownerUserId === user.id) {
        return true;
      }

      // Scope: ASSIGNED applies if resource is explicitly assigned to user or user's unit
      if (ra.scope === PermissionScopes.ASSIGNED) {
        const isAssigned = await this.isResourceAssignedToUser(
          db,
          resource.id,
          user.id,
          userUnitIds
        );
        if (isAssigned) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Asserts that user has access or throws NotFoundException (if resource does not exist)
   * or ForbiddenException (if access is denied).
   */
  async assertCanAccessResource(
    user: AuthenticatedUser,
    resourceId: string,
    permission: PermissionKey,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    txClient?: any
  ): Promise<void> {
    const db = txClient || this.databaseService.client;
    const [res] = await db
      .select({ id: resources.id })
      .from(resources)
      .where(eq(resources.id, resourceId))
      .limit(1);

    if (!res) {
      throw new NotFoundException(`Resource '${resourceId}' not found`);
    }

    const isAllowed = await this.canAccessResource(user, resourceId, permission, txClient);
    if (!isAllowed) {
      this.logger.warn(
        `Access denied: User '${user.id}' lacks permission '${permission}' for resource '${resourceId}'`
      );
      throw new ForbiddenException(`Forbidden: Missing permission '${permission}' for requested resource.`);
    }
  }

  /**
   * Checks whether a resource has an active assignment matching the user or any of the user's units.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async isResourceAssignedToUser(db: any, resourceId: string, userId: string, unitIds: string[]): Promise<boolean> {
    const conditions = [
      eq(resourceAssignments.resourceId, resourceId),
      unitIds.length > 0
        ? or(
            eq(resourceAssignments.userId, userId),
            inArray(resourceAssignments.unitId, unitIds)
          )
        : eq(resourceAssignments.userId, userId),
    ];

    const [assignment] = await db
      .select({ id: resourceAssignments.id })
      .from(resourceAssignments)
      .where(and(...conditions))
      .limit(1);

    if (assignment) return true;

    const [task] = await db
      .select({
        id: operationalTasks.id,
        assignedUserId: operationalTasks.assignedUserId,
        assignedUnitId: operationalTasks.assignedUnitId,
      })
      .from(operationalTasks)
      .where(eq(operationalTasks.id, resourceId))
      .limit(1);

    return Boolean(
      task &&
      (task.assignedUserId === userId ||
        (task.assignedUnitId !== null && unitIds.includes(task.assignedUnitId)))
    );
  }
}

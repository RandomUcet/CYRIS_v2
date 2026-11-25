import { activeUnitGrant } from '../authorization/active-unit-grants.js';
import { Injectable, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { eq, and, isNull, ne } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import {
  resources,
  resourceAccessControl,
  resourceAssignments,
  eventMemberships,
  membershipUnitAssignments,
  organizationalUnits,
  roleAssignments,
  roles,
  rolePermissions,
  operationalTasks,labAnalyses,
  MembershipStatus,
  ResourceVisibility,
} from '@cyris/db';
import {
  Permissions,
  PermissionScopes,
  type PermissionKey,
} from '@cyris/shared';
import { assignmentMatchesPrincipal } from './resource-assignment-predicate.js';

import { privateControlTypes, serviceModuleForResourceType } from '../disruptions/module-resources.js';
import { requestModuleImpacts } from '../disruptions/request-impacts.js';

@Injectable()
export class ResourceAccessService {
  private readonly logger = new Logger(ResourceAccessService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly authzService: AuthorizationService
  ) {}

  async getModuleImpacts(eventId: string, user: AuthenticatedUser) {
    const impacts = await requestModuleImpacts(this.databaseService.client, eventId, user);
    if (impacts.size && await this.authzService.authorize({ user, permission: Permissions.PLATFORM_MANAGE })) {
      return new Map() as Awaited<ReturnType<typeof requestModuleImpacts>>;
    }
    return impacts;
  }

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
        resourceType: resources.resourceType,
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

    if (privateControlTypes.includes(resource.resourceType)) return false;
    const module = serviceModuleForResourceType(resource.resourceType);
    if (module && (await requestModuleImpacts(db, resource.eventId, user)).get(module) === 'UNAVAILABLE') return false;

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
      .innerJoin(organizationalUnits,eq(organizationalUnits.id,membershipUnitAssignments.unitId))
      .where(and(eq(membershipUnitAssignments.membershipId,membership.id),eq(organizationalUnits.eventId,resource.eventId),isNull(organizationalUnits.archivedAt)));

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
      .where(and(
        eq(roleAssignments.membershipId, membership.id),
        eq(roles.eventId, resource.eventId),
        isNull(roleAssignments.userId),
        ne(rolePermissions.scope, PermissionScopes.PLATFORM),
      ));

    const isAssigned = await this.isResourceAssignedToUser(db, resource.id, resource.eventId, user.id, userUnitIds);
    // Exercise organizers have an explicit laboratory correction capability;
    // this does not grant any other domain permission or scenario access.
    const canCorrectLaboratory = resource.resourceType === 'lab_analysis' &&
      await this.authzService.authorize({ user, permission: Permissions.LAB_CORRECT, context: { eventId: resource.eventId } });

    // 6. Evaluate Visibility Models: SCENARIO and RESTRICTED
    if (resource.visibility === ResourceVisibility.SCENARIO) {
      const context = { eventId: resource.eventId, unitId: resource.owningUnitId ?? undefined,
        resourceOwnerId: resource.ownerUserId ?? undefined, resourceAssigneeId: isAssigned ? user.id : undefined };
      const hasScenarioAuth = await this.authzService.authorize({ user, permission: Permissions.SCENARIO_SECRET_READ, context })
        || await this.authzService.authorize({ user, permission: Permissions.SCENARIO_READ, context });

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
      if (!isOwner && !isAssigned && !canCorrectLaboratory) {
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
      const isPlatformManager = false; // Platform authority was checked separately above.

      if (!isMemberOfOwningUnit && !isOwner && !isPlatformManager && !isAssigned && !canCorrectLaboratory) {
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

    // A requester may follow their own laboratory request, not browse the lab queue.
    // Membership, module availability and private visibility checks above still apply.
    if(resource.resourceType==='lab_analysis'&&permission===Permissions.LAB_READ&&resource.ownerUserId===user.id){
      const [request]=await db.select({requester:labAnalyses.requestedByUserId,unit:labAnalyses.requestedFromUnitId}).from(labAnalyses).where(eq(labAnalyses.id,resource.id)).limit(1);
      if(request?.requester===user.id&&await this.authzService.authorize({user,permission:Permissions.LAB_REQUEST,context:{eventId:resource.eventId,unitId:request.unit??undefined,resourceOwnerId:user.id}}))return true;
    }

    // Check if operator has the required permission under an applicable scope
    const activeUnits = new Set<string>(userUnitIds);
    for (const ra of eventRoleRows) {
      if (!activeUnitGrant(ra.assignmentUnitId,activeUnits)) continue;
      if (ra.permissionKey !== permission) {
        continue;
      }

      // Scope: EVENT or PLATFORM applies across the entire event
      if (ra.scope === PermissionScopes.EVENT) {
        return true;
      }

      // Scope: UNIT applies if user belongs to the owning unit
      if (ra.scope === PermissionScopes.UNIT) {
        if (resource.owningUnitId && (ra.assignmentUnitId
          ? ra.assignmentUnitId === resource.owningUnitId
          : userUnitIds.includes(resource.owningUnitId))) {
          return true;
        }
      }

      // Scope: OWN applies if user is the resource owner
      if (ra.scope === PermissionScopes.OWN && resource.ownerUserId === user.id) {
        return true;
      }

      // Scope: ASSIGNED applies if resource is explicitly assigned to user or user's unit
      if (ra.scope === PermissionScopes.ASSIGNED) {
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
  private async isResourceAssignedToUser(db: any, resourceId: string, eventId: string, userId: string, unitIds: string[]): Promise<boolean> {
    const assignments = await db
      .select({
        userId: resourceAssignments.userId,
        unitId: resourceAssignments.unitId,
      })
      .from(resourceAssignments)
      .where(and(eq(resourceAssignments.resourceId, resourceId), eq(resourceAssignments.eventId, eventId)));

    if (assignments.some((assignment: { userId: string | null; unitId: string | null }) =>
      assignmentMatchesPrincipal(assignment, userId, unitIds)
    )) {
      return true;
    }

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
      assignmentMatchesPrincipal({ userId: task.assignedUserId, unitId: task.assignedUnitId }, userId, unitIds)
    );
  }
}

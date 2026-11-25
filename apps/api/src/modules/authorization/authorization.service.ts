import { activeUnitGrant } from './active-unit-grants.js';
import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import {
  roles,
  rolePermissions,
  roleAssignments,
  eventMemberships,
  membershipUnitAssignments,
  organizationalUnits,
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

      const activeUnits = new Set((await db.select({id:membershipUnitAssignments.unitId})
        .from(membershipUnitAssignments).innerJoin(organizationalUnits,eq(organizationalUnits.id,membershipUnitAssignments.unitId))
        .where(and(eq(membershipUnitAssignments.membershipId,membership.id),eq(organizationalUnits.eventId,context.eventId),isNull(organizationalUnits.archivedAt))))
        .map(row=>row.id));
      for (const ra of eventRoleAssignments) {
        if (!activeUnitGrant(ra.assignmentUnitId,activeUnits)) continue;
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

          if (activeUnits.has(context.unitId)) return true;
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
    const {permission,...context}=params;
    return (await this.eventCapabilities({...context,permissions:[permission]})).has(permission);
  }

  /** Batch capability checks for a single effective identity and exercise.
   * No cross-request cache: revocation, unit membership and DB user status are checked anew.
   * These are availability grants, not permission to access individual records. */
  async eventCapabilities(params:{
    user:AuthenticatedUser;
    permissions:readonly PermissionKey[];
    eventId:string;
    unitId?:string;
    resourceScopes:readonly ('OWN'|'ASSIGNED')[];
    requireUnitMembership?:boolean;
  }):Promise<ReadonlySet<PermissionKey>>{
    const {user,eventId,unitId,resourceScopes}=params;
    const requested=[...new Set(params.permissions)];
    const allowed=new Set<PermissionKey>();
    if(!user||user.status!=='ACTIVE'||!requested.length)return allowed;
    const db=this.databaseService.client;
    const [membership]=await db.select({id:eventMemberships.id})
      .from(eventMemberships).innerJoin(users,eq(users.id,eventMemberships.userId))
      .where(and(eq(eventMemberships.eventId,eventId),eq(eventMemberships.userId,user.id),
        eq(eventMemberships.status,MembershipStatus.ACTIVE),eq(users.status,'ACTIVE'))).limit(1);
    if(!membership)return allowed;
    const [unitRows,platformGrants,grants]=await Promise.all([
      db.select({unitId:membershipUnitAssignments.unitId}).from(membershipUnitAssignments)
        .innerJoin(organizationalUnits,eq(organizationalUnits.id,membershipUnitAssignments.unitId))
        .where(and(eq(membershipUnitAssignments.membershipId,membership.id),eq(organizationalUnits.eventId,eventId),isNull(organizationalUnits.archivedAt))),
      db.select({permissionKey:rolePermissions.permissionKey,scope:rolePermissions.scope})
        .from(roleAssignments).innerJoin(roles,eq(roleAssignments.roleId,roles.id))
        .innerJoin(rolePermissions,eq(roles.id,rolePermissions.roleId))
        .where(and(eq(roleAssignments.userId,user.id),isNull(roleAssignments.membershipId),
          isNull(roleAssignments.unitId),isNull(roles.eventId),eq(rolePermissions.scope,PermissionScopes.PLATFORM),
          inArray(rolePermissions.permissionKey,[...new Set([...requested,Permissions.PLATFORM_MANAGE])]))),
      db.select({permissionKey:rolePermissions.permissionKey,scope:rolePermissions.scope,unitId:roleAssignments.unitId})
        .from(roleAssignments).innerJoin(roles,eq(roles.id,roleAssignments.roleId))
        .innerJoin(rolePermissions,eq(rolePermissions.roleId,roles.id))
        .where(and(eq(roleAssignments.membershipId,membership.id),inArray(rolePermissions.permissionKey,requested),
          eq(roles.eventId,eventId),isNull(roleAssignments.userId))),
    ]);
    const unitIds=new Set(unitRows.map(row=>row.unitId));
    if(params.requireUnitMembership&&(!unitId||!unitIds.has(unitId)))return allowed;
    if(platformGrants.some(row=>row.permissionKey===Permissions.PLATFORM_MANAGE))return new Set(requested);
    const platformKeys=new Set(platformGrants.map(row=>row.permissionKey));
    for(const permission of requested)if(platformKeys.has(permission))allowed.add(permission);
    const requestedKeys=new Set<string>(requested);
    for(const grant of grants){
      if(!requestedKeys.has(grant.permissionKey)||!activeUnitGrant(grant.unitId,unitIds))continue;
      if(unitId&&grant.unitId&&grant.unitId!==unitId)continue;
      const matches=grant.scope===PermissionScopes.EVENT||
        (grant.scope===PermissionScopes.UNIT
          ? (unitId?grant.unitId===unitId||(!grant.unitId&&unitIds.has(unitId))
            :grant.unitId?unitIds.has(grant.unitId):unitIds.size>0)
          :resourceScopes.some(scope=>grant.scope===scope));
      if(matches)allowed.add(grant.permissionKey as PermissionKey);
    }
    return allowed;
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

import { activeUnitGrant } from '../authorization/active-unit-grants.js';
import { Injectable, Logger } from '@nestjs/common';
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
} from '@cyris/db';
import { Permissions, PermissionScopes } from '@cyris/shared';

import { privateControlTypes, resourceTypesForModule } from '../disruptions/module-resources.js';
import { requestModuleImpacts } from '../disruptions/request-impacts.js';

/** A caller-supplied literal may never become Typesense filter syntax. */
export function validSearchFilterLiteral(value:string|undefined):boolean {
  return value===undefined||/^[a-zA-Z0-9_-]{1,128}$/.test(value);
}

// Hide legacy laboratory documents containing working findings until safely reindexed.
export const SAFE_LAB_SEARCH_FILTER='(resourceType:!=lab_analysis || (visibility:=EVENT && tags:=lab-safe-v1))';

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
    if (!user || user.status !== 'ACTIVE'||!validSearchFilterLiteral(context?.typeFilter)||!validSearchFilterLiteral(context?.eventFilter)) {
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
      const adminClauses: string[] = [SAFE_LAB_SEARCH_FILTER];
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

    const memberships=activeMemberships.filter(m=>!context?.eventFilter||m.eventId===context.eventFilter);
    const membershipIds=memberships.map(m=>m.id);
    const allRoles=membershipIds.length?await db.select({membershipId:roleAssignments.membershipId,eventId:roles.eventId,
      permissionKey:rolePermissions.permissionKey,scope:rolePermissions.scope,unitId:roleAssignments.unitId})
      .from(roleAssignments).innerJoin(roles,eq(roleAssignments.roleId,roles.id))
      .innerJoin(rolePermissions,eq(roles.id,rolePermissions.roleId))
      .where(and(inArray(roleAssignments.membershipId,membershipIds),isNull(roleAssignments.userId))):[];
    const rolesByMembership=new Map<string,typeof allRoles>();
    const eventByMembership=new Map(memberships.map(m=>[m.id,m.eventId]));
    for(const row of allRoles){
      if(!row.membershipId||eventByMembership.get(row.membershipId)!==row.eventId)continue;
      const rows=rolesByMembership.get(row.membershipId)??[];rows.push(row);rolesByMembership.set(row.membershipId,rows);
    }
    const unitMembershipIds=[...rolesByMembership].filter(([,rows])=>rows.some(r=>r.scope===PermissionScopes.UNIT||r.unitId)).map(([id])=>id);
    const allUnits=unitMembershipIds.length?await db.select({membershipId:membershipUnitAssignments.membershipId,unitId:membershipUnitAssignments.unitId})
      .from(membershipUnitAssignments).innerJoin(organizationalUnits,eq(organizationalUnits.id,membershipUnitAssignments.unitId))
      .innerJoin(eventMemberships,eq(eventMemberships.id,membershipUnitAssignments.membershipId))
      .where(and(inArray(membershipUnitAssignments.membershipId,unitMembershipIds),eq(organizationalUnits.eventId,eventMemberships.eventId),isNull(organizationalUnits.archivedAt))):[];
    const unitsByMembership=new Map<string,string[]>();
    for(const row of allUnits){const ids=unitsByMembership.get(row.membershipId)??[];ids.push(row.unitId);unitsByMembership.set(row.membershipId,ids);}
    const eventExclusions: string[] = [];
    for (const membership of memberships) {
      const impacts = await requestModuleImpacts(db, membership.eventId, user);
      const hiddenTypes = [...impacts].filter(([, mode]) => mode === 'UNAVAILABLE')
        .flatMap(([module]) => resourceTypesForModule(module));
      if (hiddenTypes.length) {
        eventExclusions.push(`(eventId:!=${membership.eventId} || resourceType:!=[${hiddenTypes.join(',')}])`);
      }
      const activeUnits=new Set(unitsByMembership.get(membership.id)??[]);
      const roleRows=(rolesByMembership.get(membership.id)??[]).filter(row=>activeUnitGrant(row.unitId,activeUnits));

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
        const explicitUnitIds=unitsByMembership.get(membership.id)??[];
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

    let filter = [SAFE_LAB_SEARCH_FILTER,`(${accessClauses.join(' || ')})`, `resourceType:!=[${privateControlTypes.join(',')}]`, ...eventExclusions].join(' && ');

    if (context?.typeFilter) {
      filter = `${filter} && resourceType:=${context.typeFilter}`;
    }
    if (context?.eventFilter) {
      filter = `${filter} && eventId:=${context.eventFilter}`;
    }

    return filter;
  }
}

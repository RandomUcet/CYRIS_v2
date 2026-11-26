import { Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { addMissingEventTemplates, canonicalTeamRoleProfiles, and, eq, events, isNull, organizationalUnits, membershipUnitAssignments, eventMemberships, roles, roleAssignments, rolePermissions, users } from '@cyris/db';
import { canonicalTeamRoleSlugs, type TeamRoleReviewItem } from '@cyris/contracts';
import { Permissions, PermissionScopes } from '@cyris/shared';
import { AuditService } from '../audit/audit.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AuthGuard, type CyrisRequest } from '../auth/guards/auth.guard.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator.js';
import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';
import { DatabaseService } from '../database/database.service.js';
import { SearchIndexerService } from '../search/search-indexer.service.js';

@Controller('events/:eventId/team-templates')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermission(Permissions.PLATFORM_MANAGE, PermissionScopes.PLATFORM)
export class EventTemplatesController {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly indexer: SearchIndexerService,
  ) {}

  /** Read-only catalog/assignment review: never infer effective resource ACL. */
  @Get('review')
  async review(@Param('eventId',ParseUUIDPipe) eventId:string):Promise<TeamRoleReviewItem[]>{
    const db=this.database.client;
    const [event]=await db.select({id:events.id}).from(events).where(eq(events.id,eventId)).limit(1);
    if(!event)throw new NotFoundException('Exercise not found.');
    const [units,definitions,grants,members,bindings]=await Promise.all([
      db.select({id:organizationalUnits.id,slug:organizationalUnits.slug,name:organizationalUnits.name}).from(organizationalUnits).where(and(eq(organizationalUnits.eventId,eventId),isNull(organizationalUnits.archivedAt))),
      db.select({id:roles.id,slug:roles.slug}).from(roles).where(eq(roles.eventId,eventId)),
      db.select({roleId:rolePermissions.roleId,key:rolePermissions.permissionKey,scope:rolePermissions.scope}).from(rolePermissions).innerJoin(roles,eq(roles.id,rolePermissions.roleId)).where(eq(roles.eventId,eventId)),
      db.select({membershipId:eventMemberships.id,unitId:membershipUnitAssignments.unitId}).from(eventMemberships).innerJoin(users,eq(users.id,eventMemberships.userId)).innerJoin(membershipUnitAssignments,eq(membershipUnitAssignments.membershipId,eventMemberships.id)).where(and(eq(eventMemberships.eventId,eventId),eq(eventMemberships.status,'ACTIVE'),eq(users.status,'ACTIVE'))),
      db.select({membershipId:roleAssignments.membershipId,roleId:roleAssignments.roleId,unitId:roleAssignments.unitId}).from(roleAssignments).innerJoin(roles,eq(roles.id,roleAssignments.roleId)).innerJoin(eventMemberships,eq(eventMemberships.id,roleAssignments.membershipId)).where(and(eq(roles.eventId,eventId),eq(eventMemberships.eventId,eventId),isNull(roleAssignments.userId))),
    ]);
    const result:TeamRoleReviewItem[]=[];
    for(const unit of units){
      const teamMembers=new Set(members.filter(m=>m.unitId===unit.id).map(m=>m.membershipId));
      for(const slug of canonicalTeamRoleSlugs[unit.slug]??[]){
        const profile=canonicalTeamRoleProfiles.find(p=>p.slug===slug);
        if(!profile)continue; // existing specialist roles are not rewritten here
        const role=definitions.find(r=>r.slug===slug);
        const expected=new Set(profile.permissions.map(p=>p.key+':'+p.scope));
        const actual=new Set(grants.filter(g=>g.roleId===role?.id).map(g=>g.key+':'+g.scope));
        const assigned=new Set(bindings.filter(b=>b.roleId===role?.id&&b.unitId===unit.id&&b.membershipId&&teamMembers.has(b.membershipId)).map(b=>b.membershipId));
        result.push({unitId:unit.id,unitSlug:unit.slug,unitName:unit.name,roleSlug:slug,roleName:profile.name,rolePresent:!!role,
          memberCount:teamMembers.size,unitBoundCount:assigned.size,missing:[...expected].filter(g=>!actual.has(g)).sort(),additional:[...actual].filter(g=>!expected.has(g)).sort()});
      }
    }
    return result.sort((a,b)=>a.unitName.localeCompare(b.unitName)||a.roleName.localeCompare(b.roleName));
  }

  @Post()
  @HttpCode(200)
  initialize(@Param('eventId', ParseUUIDPipe) eventId: string, @CurrentUser() actor: AuthenticatedUser, @Req() request: CyrisRequest) {
    return this.database.client.transaction(async tx => {
      const [event] = await tx.select({ id: events.id }).from(events).where(eq(events.id, eventId)).for('key share');
      if (!event) throw new NotFoundException('Exercise not found.');
      const result = await addMissingEventTemplates(tx, eventId, unitId => this.indexer.emitSearchUpsert('unit', unitId, tx));
      await this.audit.record({
        eventId, action: 'event.team_templates.initialized', category: 'event',
        actorUserId: actor.id, resourceType: 'event', resourceId: eventId, requestId: request.id,
        metadata: { unitsCreated: result.unitsCreated, rolesCreated: result.rolesCreated }, txClient: tx,
      });
      return result;
    });
  }
}

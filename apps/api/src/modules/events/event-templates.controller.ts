import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { addMissingEventTemplates, canonicalTeamRoleProfiles, events, organizationalUnits, membershipUnitAssignments, eventMemberships, roles, roleAssignments, rolePermissions, users } from '@cyris/db';
import { and, eq, gt, inArray, isNull, or, asc } from 'drizzle-orm';
import { canonicalTeamRoleSlugs, AssignTeamOperatorProfileSchema, type TeamRoleReviewItem } from '@cyris/contracts';
import { AuthorizationService } from '../authorization/authorization.service.js';
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
    private readonly authorization: AuthorizationService,
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
      db.select({membershipId:eventMemberships.id,unitId:membershipUnitAssignments.unitId,displayName:users.displayName}).from(eventMemberships).innerJoin(users,eq(users.id,eventMemberships.userId)).innerJoin(membershipUnitAssignments,eq(membershipUnitAssignments.membershipId,eventMemberships.id)).where(and(eq(eventMemberships.eventId,eventId),eq(eventMemberships.status,'ACTIVE'),eq(users.status,'ACTIVE'),or(isNull(users.testExpiresAt),gt(users.testExpiresAt,new Date())))),
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
          memberCount:teamMembers.size,unitBoundCount:assigned.size,primary:canonicalTeamRoleSlugs[unit.slug]?.[0]===slug,
          eligibleMembers:members.filter(m=>m.unitId===unit.id&&!assigned.has(m.membershipId)).map(({membershipId,displayName})=>({membershipId,displayName})).sort((a,b)=>a.displayName.localeCompare(b.displayName)||a.membershipId.localeCompare(b.membershipId)),missing:[...expected].filter(g=>!actual.has(g)).sort(),additional:[...actual].filter(g=>!expected.has(g)).sort()});
      }
    }
    return result.sort((a,b)=>a.unitName.localeCompare(b.unitName)||a.roleName.localeCompare(b.roleName));
  }

  /** Explicit, additive repair only for exact canonical operator roles. No leader or
   * custom grants, no inferred account memberships, no automatic changes to old roles. */
  @Post('assign-operators')
  @HttpCode(200)
  async assignOperators(@Param('eventId',ParseUUIDPipe) eventId:string,@Body() body:unknown,@CurrentUser() actor:AuthenticatedUser,@Req() request:CyrisRequest){
    await this.authorization.assertAuthorized({user:actor,permission:Permissions.PLATFORM_MANAGE});
    const parsed=AssignTeamOperatorProfileSchema.safeParse(body);
    if(!parsed.success)throw new BadRequestException('Select one team and 1–100 distinct active members.');
    const {unitId,roleSlug,membershipIds}=parsed.data;
    return this.database.client.transaction(async tx=>{
      const [event]=await tx.select({id:events.id,status:events.status}).from(events).where(eq(events.id,eventId)).for('update').limit(1);
      if(!event)throw new NotFoundException('Exercise not found');
      if(['CLOSED','ARCHIVED'].includes(event.status))throw new ConflictException('Exercise is read-only');
      // Serialize against the existing role edit/assignment path.
      const matching=await tx.select({id:roles.id}).from(roles).where(and(eq(roles.eventId,eventId),eq(roles.slug,roleSlug))).for('update').limit(2);
      if(matching.length!==1)throw new ConflictException('Initialize the unique standard role first');
      const role=matching[0]!;
      const [unit]=await tx.select({slug:organizationalUnits.slug}).from(organizationalUnits).where(and(eq(organizationalUnits.eventId,eventId),eq(organizationalUnits.id,unitId),isNull(organizationalUnits.archivedAt))).for('update').limit(1);
      if(!unit)throw new BadRequestException('Team is unavailable in this exercise');
      if(canonicalTeamRoleSlugs[unit.slug]?.[0]!==roleSlug)throw new BadRequestException('Only the primary operator profile of this team can be assigned here');
      const profile=canonicalTeamRoleProfiles.find(p=>p.slug===roleSlug);
      if(!profile)throw new BadRequestException('Unknown operator profile');
      const grants=await tx.select({key:rolePermissions.permissionKey,scope:rolePermissions.scope}).from(rolePermissions).where(eq(rolePermissions.roleId,role.id));
      const expected=new Set(profile.permissions.map(p=>p.key+':'+p.scope));
      if(grants.length!==expected.size||grants.some(g=>!expected.has(g.key+':'+g.scope)))throw new ConflictException('Role definition changed; review its permissions before assignment');
      const members=await tx.select({id:eventMemberships.id,userId:eventMemberships.userId})
        .from(eventMemberships).innerJoin(users,eq(users.id,eventMemberships.userId)).innerJoin(membershipUnitAssignments,eq(membershipUnitAssignments.membershipId,eventMemberships.id))
        .where(and(eq(eventMemberships.eventId,eventId),eq(eventMemberships.status,'ACTIVE'),eq(users.status,'ACTIVE'),or(isNull(users.testExpiresAt),gt(users.testExpiresAt,new Date())),eq(membershipUnitAssignments.unitId,unitId),inArray(eventMemberships.id,membershipIds)))
        .orderBy(asc(eventMemberships.id)).for('update');
      if(members.length!==membershipIds.length)throw new ConflictException('Selected membership changed; refresh the review');
      const existing=await tx.select({membershipId:roleAssignments.membershipId}).from(roleAssignments).where(and(eq(roleAssignments.roleId,role.id),eq(roleAssignments.unitId,unitId),isNull(roleAssignments.userId),inArray(roleAssignments.membershipId,membershipIds)));
      const assigned=new Set(existing.map(x=>x.membershipId));
      let created=0;
      for(const member of members){
        if(assigned.has(member.id))continue;
        const [row]=await tx.insert(roleAssignments).values({roleId:role.id,membershipId:member.id,unitId,userId:null}).returning({id:roleAssignments.id});
        await this.audit.record({eventId,action:'role.assigned',category:'role',actorUserId:actor.id,resourceType:'role_assignment',resourceId:row!.id,requestId:request.id,
          metadata:{roleId:role.id,roleSlug,userId:member.userId,membershipId:member.id,unitId,source:'team-profile-review'},txClient:tx});
        created++;
      }
      return {created,alreadyAssigned:members.length-created};
    });
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

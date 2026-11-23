import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Put, Query, UseGuards } from '@nestjs/common';
import { LdapAccountStatusChangeSchema, LdapTeamAccountQuerySchema, LdapTeamAssignmentSchema } from '@cyris/contracts';
import { Permissions, PermissionScopes } from '@cyris/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator.js';
import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';
import { LdapTeamsService } from './ldap-teams.service.js';
import { LdapAccountLifecycleService } from './ldap-account-lifecycle.service.js';

@Controller('admin/settings/identity/ldap/accounts')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermission(Permissions.PLATFORM_MANAGE, PermissionScopes.PLATFORM)
export class LdapTeamsController {
  constructor(private readonly teams: LdapTeamsService, private readonly lifecycle: LdapAccountLifecycleService) {}

  @Get()
  list(@Query() query: unknown) {
    const parsed = LdapTeamAccountQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('Vyberte cvičení a zadejte platné vyhledávání.');
    const { eventId, q, unassigned, status, page } = parsed.data;
    return this.teams.listAccounts(eventId, q, unassigned === 'true', status, page);
  }

  @Patch(':identityId/status')
  changeAccountStatus(@Param('identityId', ParseUUIDPipe) identityId: string,
    @Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const parsed = LdapAccountStatusChangeSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Status and a reason (8–500 characters) are required');
    return this.lifecycle.setEnabled(identityId, parsed.data, actor);
  }

  @Put(':identityId/events/:eventId')
  assign(@Param('identityId', ParseUUIDPipe) identityId: string, @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const parsed = LdapTeamAssignmentSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Vyberte platný způsob přiřazení, tým a roli.');
    return this.teams.assign(identityId, eventId, parsed.data, actor.id);
  }
}

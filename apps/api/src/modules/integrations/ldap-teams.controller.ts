import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Put, Query, UseGuards } from '@nestjs/common';
import { LdapTeamAccountQuerySchema, LdapTeamAssignmentSchema } from '@cyris/contracts';
import { Permissions, PermissionScopes } from '@cyris/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator.js';
import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';
import { LdapTeamsService } from './ldap-teams.service.js';

@Controller('admin/settings/identity/ldap/accounts')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermission(Permissions.PLATFORM_MANAGE, PermissionScopes.PLATFORM)
export class LdapTeamsController {
  constructor(private readonly teams: LdapTeamsService) {}

  @Get()
  list(@Query() query: unknown) {
    const parsed = LdapTeamAccountQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('Vyberte cvičení a zadejte platné vyhledávání.');
    const { eventId, q, unassigned } = parsed.data;
    return this.teams.listAccounts(eventId, q, unassigned === 'true');
  }

  @Put(':identityId/events/:eventId')
  assign(@Param('identityId', ParseUUIDPipe) identityId: string, @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const parsed = LdapTeamAssignmentSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Vyberte platný způsob přiřazení, tým a roli.');
    return this.teams.assign(identityId, eventId, parsed.data, actor.id);
  }
}

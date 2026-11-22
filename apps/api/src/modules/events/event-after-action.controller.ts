import { Controller, Get, Header, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { Permissions, PermissionScopes } from '@cyris/shared';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { EventAfterActionService } from './event-after-action.service.js';

@Controller('events/:eventId')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermission(Permissions.PLATFORM_MANAGE, PermissionScopes.PLATFORM)
export class EventAfterActionController {
  constructor(private readonly reports: EventAfterActionService) {}
  @Get('after-action-report')
  @Header('Cache-Control','private, no-store')
  report(@Param('eventId',ParseUUIDPipe) eventId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.reports.report(eventId, actor);
  }
  @Get('purge-preview')
  @Header('Cache-Control','private, no-store')
  purgePreview(@Param('eventId',ParseUUIDPipe) eventId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.reports.purgePreview(eventId, actor);
  }
}

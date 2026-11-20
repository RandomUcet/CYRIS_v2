import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Put, Query, UseGuards } from '@nestjs/common';
import { PlatformAdminSearchSchema, PlatformAdminChangeSchema } from '@cyris/contracts';
import { Permissions, PermissionScopes } from '@cyris/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator.js';
import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';
import { PlatformAdminsService } from './platform-admins.service.js';

@Controller('admin/platform-administrators')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermission(Permissions.PLATFORM_MANAGE, PermissionScopes.PLATFORM)
export class PlatformAdminsController {
  constructor(private readonly admins: PlatformAdminsService) {}

  @Get()
  list(@Query('q') value?: string) {
    const query = PlatformAdminSearchSchema.safeParse(value ?? '');
    if (!query.success) throw new BadRequestException('Neplatný hledaný výraz.');
    return this.admins.list(query.data);
  }

  @Put(':userId')
  set(@Param('userId', ParseUUIDPipe) userId: string, @Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const parsed = PlatformAdminChangeSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Neplatná změna role.');
    return this.admins.set(userId, parsed.data.enabled, actor.id);
  }
}

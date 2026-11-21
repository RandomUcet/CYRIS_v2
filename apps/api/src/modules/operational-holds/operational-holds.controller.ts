import { BadRequestException, Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { CreateOperationalHoldSchema, RestoreOperationalHoldSchema } from '@cyris/contracts';
import { Permissions, PermissionScopes } from '@cyris/shared';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator.js';
import { OperationalHoldsService } from './operational-holds.service.js';

@Controller('events/:eventId/operational-holds')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermission(Permissions.PLATFORM_MANAGE, PermissionScopes.PLATFORM)
export class OperationalHoldsController {
  constructor(private readonly holds: OperationalHoldsService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(@Param('eventId', ParseUUIDPipe) eventId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.holds.list(eventId, user);
  }
  @Post()
  create(@Param('eventId', ParseUUIDPipe) eventId: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = CreateOperationalHoldSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid hold');
    return this.holds.create(eventId, parsed.data, user);
  }
  @Post(':holdId/restore')
  restore(@Param('eventId', ParseUUIDPipe) eventId: string, @Param('holdId', ParseUUIDPipe) holdId: string,
    @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = RestoreOperationalHoldSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid restore');
    return this.holds.restore(eventId, holdId, parsed.data, user);
  }
}

@Controller('events/:eventId')
@UseGuards(AuthGuard)
export class OperationalHoldCurrentController {
  constructor(private readonly holds: OperationalHoldsService) {}
  @Get('operational-holds/current')
  @Header('Cache-Control', 'private, no-store')
  current(@Param('eventId', ParseUUIDPipe) eventId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.holds.current(eventId, user);
  }
}

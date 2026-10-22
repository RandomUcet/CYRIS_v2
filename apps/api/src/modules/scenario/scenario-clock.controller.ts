import { BadRequestException, Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator.js';
import { Permissions, PermissionScopes } from '@cyris/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { ScenarioClockService } from './scenario-clock.service.js';

@Controller('events/:eventId/scenario/clock')
@UseGuards(AuthGuard, PermissionsGuard)
export class ScenarioClockController {
  constructor(private readonly clockService: ScenarioClockService) {}

  @Get()
  @RequirePermission(Permissions.SCENARIO_READ, PermissionScopes.EVENT)
  get(@Param('eventId') eventId: string) {
    return this.clockService.getState(eventId);
  }

  @Patch()
  @RequirePermission(Permissions.SCENARIO_MANAGE, PermissionScopes.EVENT)
  update(
    @Param('eventId') eventId: string,
    @Body() body: { action: 'SET_TIME' | 'PAUSE' | 'RESUME' | 'ADVANCE'; scenarioTime?: string; minutes?: number },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (body.action === 'SET_TIME' && body.scenarioTime) return this.clockService.setTime(eventId, body.scenarioTime, user.id);
    if (body.action === 'PAUSE') return this.clockService.pause(eventId, user.id);
    if (body.action === 'RESUME') return this.clockService.resume(eventId, user.id);
    if (body.action === 'ADVANCE') return this.clockService.advance(eventId, body.minutes ?? 5, user.id);
    throw new BadRequestException('Clock action requires SET_TIME with scenarioTime, PAUSE, RESUME, or ADVANCE');
  }
}

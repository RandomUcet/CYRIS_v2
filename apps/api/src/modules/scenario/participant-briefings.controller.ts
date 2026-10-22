import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator.js';
import { Permissions, PermissionScopes } from '@cyris/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { ScenarioBriefingsService } from './scenario-briefings.service.js';
import type { ParticipantBriefingsListResponse } from '@cyris/contracts';

@Controller('events/:eventId/briefings')
@UseGuards(AuthGuard, PermissionsGuard)
export class ParticipantBriefingsController {
  constructor(private readonly briefingsService: ScenarioBriefingsService) {}

  @Get()
  @RequirePermission(Permissions.BRIEFING_READ, PermissionScopes.EVENT)
  async getBriefings(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ParticipantBriefingsListResponse> {
    return this.briefingsService.getBriefingsForUser(eventId, user);
  }

  @Post(':deliveryId/read')
  @RequirePermission(Permissions.BRIEFING_READ, PermissionScopes.EVENT)
  async markAsRead(
    @Param('eventId') eventId: string,
    @Param('deliveryId') deliveryId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<{ success: boolean }> {
    await this.briefingsService.markAsRead(eventId, deliveryId, user);
    return { success: true };
  }

  @Post(':deliveryId/acknowledge')
  @RequirePermission(Permissions.BRIEFING_ACKNOWLEDGE, PermissionScopes.EVENT)
  async acknowledge(
    @Param('eventId') eventId: string,
    @Param('deliveryId') deliveryId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<{ success: boolean }> {
    await this.briefingsService.acknowledgeBriefing(eventId, deliveryId, user);
    return { success: true };
  }
}

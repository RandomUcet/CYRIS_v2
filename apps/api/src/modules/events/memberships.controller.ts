import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { EventsService } from './events.service.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator.js';
import { Permissions, PermissionScopes } from '@cyris/shared';
import {
  AddMembershipRequestSchema,
  UpdateMembershipRequestSchema,
} from '@cyris/contracts';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import type { CyrisRequest } from '../auth/guards/auth.guard.js';
import { Req } from '@nestjs/common';

@Controller('events/:eventId/memberships')
@UseGuards(AuthGuard, PermissionsGuard)
export class MembershipsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  @RequirePermission(Permissions.MEMBERSHIP_READ, PermissionScopes.EVENT)
  async listMemberships(@Param('eventId') eventId: string) {
    return this.eventsService.listMemberships(eventId);
  }

  @Post()
  @RequirePermission(Permissions.MEMBERSHIP_MANAGE, PermissionScopes.EVENT)
  async addMembership(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: CyrisRequest
  ) {
    const parse = AddMembershipRequestSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.errors[0]?.message ?? 'Invalid membership payload');
    }
    const requestId = (req.headers['x-request-id'] as string) || req.id;
    return this.eventsService.addMembership(eventId, parse.data, user.id, requestId);
  }

  @Patch(':membershipId')
  @RequirePermission(Permissions.MEMBERSHIP_MANAGE, PermissionScopes.EVENT)
  async updateMembership(
    @Param('eventId') eventId: string,
    @Param('membershipId') membershipId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: CyrisRequest
  ) {
    const parse = UpdateMembershipRequestSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.errors[0]?.message ?? 'Invalid payload');
    }
    const requestId = (req.headers['x-request-id'] as string) || req.id;
    return this.eventsService.updateMembership(eventId, membershipId, parse.data, user.id, requestId);
  }
}

import {
  Controller,
  Get,
  Post,
  Put,
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
  CreateUnitRequestSchema,
  UpdateUnitRequestSchema,
  AssignMembershipUnitRequestSchema,
  SetUnitCapabilitiesRequestSchema,
} from '@cyris/contracts';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import type { CyrisRequest } from '../auth/guards/auth.guard.js';
import { Req } from '@nestjs/common';

@Controller('events/:eventId/units')
@UseGuards(AuthGuard, PermissionsGuard)
export class UnitsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  @RequirePermission(Permissions.UNIT_READ, PermissionScopes.EVENT)
  async listUnits(@Param('eventId') eventId: string) {
    return this.eventsService.listUnits(eventId);
  }

  @Post()
  @RequirePermission(Permissions.UNIT_MANAGE, PermissionScopes.EVENT)
  async createUnit(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: CyrisRequest
  ) {
    const parse = CreateUnitRequestSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.errors[0]?.message ?? 'Invalid unit payload');
    }
    const requestId = req.id;
    return this.eventsService.createUnit(eventId, parse.data, user.id, requestId);
  }

  @Patch(':unitId')
  @RequirePermission(Permissions.UNIT_MANAGE, PermissionScopes.EVENT)
  async updateUnit(
    @Param('eventId') eventId: string,
    @Param('unitId') unitId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: CyrisRequest
  ) {
    const parse = UpdateUnitRequestSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.errors[0]?.message ?? 'Invalid payload');
    }
    const requestId = req.id;
    return this.eventsService.updateUnit(eventId, unitId, parse.data, user.id, requestId);
  }

  @Post(':unitId/memberships')
  @RequirePermission(Permissions.UNIT_MANAGE, PermissionScopes.EVENT)
  async assignMembershipToUnit(
    @Param('eventId') eventId: string,
    @Param('unitId') unitId: string,
    @Body() body: unknown
  ) {
    const parse = AssignMembershipUnitRequestSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.errors[0]?.message ?? 'Invalid payload');
    }
    return this.eventsService.assignMembershipToUnit(eventId, unitId, parse.data.membershipId);
  }

  @Get(':unitId/capabilities')
  @RequirePermission(Permissions.UNIT_READ, PermissionScopes.EVENT)
  async getUnitCapabilities(
    @Param('eventId') eventId: string,
    @Param('unitId') unitId: string
  ) {
    return this.eventsService.getUnitCapabilities(eventId, unitId);
  }

  @Put(':unitId/capabilities')
  @RequirePermission(Permissions.UNIT_MANAGE, PermissionScopes.EVENT)
  async setUnitCapabilities(
    @Param('eventId') eventId: string,
    @Param('unitId') unitId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: CyrisRequest
  ) {
    const parse = SetUnitCapabilitiesRequestSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(
        parse.error.errors[0]?.message ?? 'Invalid capabilities payload'
      );
    }
    const requestId = req.id;
    return this.eventsService.setUnitCapabilities(
      eventId,
      unitId,
      parse.data.capabilityKeys,
      user.id,
      requestId
    );
  }
}


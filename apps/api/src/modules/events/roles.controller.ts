import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
  CreateRoleRequestSchema,
  UpdateRoleRequestSchema,
  AssignRoleRequestSchema,
} from '@cyris/contracts';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import type { CyrisRequest } from '../auth/guards/auth.guard.js';
import { Req } from '@nestjs/common';

@Controller('events/:eventId/roles')
@UseGuards(AuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  @RequirePermission(Permissions.ROLE_READ, PermissionScopes.EVENT)
  async listRoles(@Param('eventId') eventId: string) {
    return this.eventsService.listRoles(eventId);
  }

  @Post()
  @RequirePermission(Permissions.ROLE_MANAGE, PermissionScopes.EVENT)
  async createRole(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: CyrisRequest
  ) {
    const parse = CreateRoleRequestSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.errors[0]?.message ?? 'Invalid role payload');
    }
    const requestId = (req.headers['x-request-id'] as string) || req.id;
    return this.eventsService.createRole(eventId, parse.data, user.id, requestId);
  }

  @Patch(':roleId')
  @RequirePermission(Permissions.ROLE_MANAGE, PermissionScopes.EVENT)
  async updateRole(
    @Param('eventId') eventId: string,
    @Param('roleId') roleId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: CyrisRequest
  ) {
    const parse = UpdateRoleRequestSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.errors[0]?.message ?? 'Invalid payload');
    }
    const requestId = (req.headers['x-request-id'] as string) || req.id;
    return this.eventsService.updateRole(eventId, roleId, parse.data, user.id, requestId);
  }

  @Post('assign')
  @RequirePermission(Permissions.ROLE_MANAGE, PermissionScopes.EVENT)
  async assignRole(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: CyrisRequest
  ) {
    const parse = AssignRoleRequestSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.errors[0]?.message ?? 'Invalid assignment payload');
    }
    const requestId = (req.headers['x-request-id'] as string) || req.id;
    return this.eventsService.assignRole(eventId, parse.data, user.id, requestId);
  }

  @Delete('assignments/:assignmentId')
  @RequirePermission(Permissions.ROLE_MANAGE, PermissionScopes.EVENT)
  async revokeRole(
    @Param('eventId') eventId: string,
    @Param('assignmentId') assignmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: CyrisRequest
  ) {
    const requestId = (req.headers['x-request-id'] as string) || req.id;
    return this.eventsService.revokeRole(eventId, assignmentId, user.id, requestId);
  }
}

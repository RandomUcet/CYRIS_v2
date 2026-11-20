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
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { Permissions, PermissionScopes } from '@cyris/shared';
import {
  CreateEventRequestSchema,
  UpdateEventRequestSchema,
  DuplicateEventRequestSchema,
} from '@cyris/contracts';

import type { CyrisRequest } from '../auth/guards/auth.guard.js';
import { Req } from '@nestjs/common';

@Controller('events')
@UseGuards(AuthGuard, PermissionsGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  async listEvents(@CurrentUser() user: AuthenticatedUser,@Req() req:CyrisRequest) {
    const events=await this.eventsService.listEvents(user);
    return req.viewAs ? events.filter(e=>e.id===req.viewAs!.eventId) : events;
  }

  @Post()
  @RequirePermission(Permissions.EVENT_CREATE, PermissionScopes.PLATFORM)
  async createEvent(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: CyrisRequest
  ) {
    const parse = CreateEventRequestSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.errors[0]?.message ?? 'Invalid event payload');
    }
    const requestId = (req.headers['x-request-id'] as string) || req.id;
    return this.eventsService.createEvent(parse.data, user.id, requestId);
  }

  @Get(':eventId')
  @RequirePermission(Permissions.EVENT_READ, PermissionScopes.EVENT)
  async getEvent(@Param('eventId') eventId: string) {
    return this.eventsService.getEvent(eventId);
  }

  @Patch(':eventId')
  @RequirePermission(Permissions.EVENT_UPDATE, PermissionScopes.EVENT)
  async updateEvent(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: CyrisRequest
  ) {
    const parse = UpdateEventRequestSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.errors[0]?.message ?? 'Invalid update payload');
    }
    const requestId = (req.headers['x-request-id'] as string) || req.id;
    return this.eventsService.updateEvent(eventId, parse.data, user.id, requestId);
  }

  @Post(':eventId/duplicate')
  @RequirePermission(Permissions.EVENT_CREATE, PermissionScopes.PLATFORM)
  async duplicateEvent(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: CyrisRequest
  ) {
    const parse = DuplicateEventRequestSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.errors[0]?.message ?? 'Invalid duplicate payload');
    }
    const requestId = (req.headers['x-request-id'] as string) || req.id;
    return this.eventsService.duplicateEvent(eventId, parse.data, user.id, requestId);
  }

  @Post(':eventId/archive')
  @RequirePermission(Permissions.EVENT_ARCHIVE, PermissionScopes.EVENT)
  async archiveEvent(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: CyrisRequest
  ) {
    const requestId = (req.headers['x-request-id'] as string) || req.id;
    return this.eventsService.archiveEvent(eventId, user.id, requestId);
  }
}

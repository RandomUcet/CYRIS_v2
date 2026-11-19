import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import {
  CreateDisruptionRequestSchema,
  RestoreDisruptionRequestSchema,
} from '@cyris/contracts';
import { DisruptionsService } from './disruptions.service.js';

@Controller('events/:eventId/disruptions')
@UseGuards(AuthGuard)
export class DisruptionsController {
  constructor(private readonly disruptionsService: DisruptionsService) {}

  @Get()
  list(@Param('eventId') eventId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.disruptionsService.listOperator(eventId, user);
  }

  @Get('status')
  status(@Param('eventId') eventId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.disruptionsService.getParticipantStatus(eventId, user);
  }

  @Post()
  async start(@Param('eventId') eventId: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = CreateDisruptionRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid disruption payload');
    return this.disruptionsService.start(eventId, parsed.data, user);
  }

  @Post(':disruptionId/restore')
  async restore(
    @Param('eventId') eventId: string,
    @Param('disruptionId') disruptionId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const parsed = RestoreDisruptionRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid restoration payload');
    return this.disruptionsService.restore(eventId, disruptionId, parsed.data, user);
  }
}

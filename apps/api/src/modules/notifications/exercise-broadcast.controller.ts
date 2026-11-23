import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ExerciseBroadcastAudienceQuerySchema, ExerciseBroadcastRequestSchema } from '@cyris/contracts';
import { AuthGuard, type CyrisRequest } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { ExerciseBroadcastService } from './exercise-broadcast.service.js';

@Controller('events/:eventId/notifications')
@UseGuards(AuthGuard)
export class ExerciseBroadcastController {
  constructor(private readonly service: ExerciseBroadcastService) {}

  @Get('audience')
  preview(@Param('eventId', ParseUUIDPipe) eventId: string, @CurrentUser() actor: AuthenticatedUser,
    @Query() query: unknown) {
    const parsed = ExerciseBroadcastAudienceQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('Invalid broadcast audience');
    return this.service.preview(eventId, actor, parsed.data);
  }

  @Get('broadcasts')
  history(@Param('eventId', ParseUUIDPipe) eventId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.history(eventId, actor);
  }

  @Post('broadcasts')
  send(@Param('eventId', ParseUUIDPipe) eventId: string, @CurrentUser() actor: AuthenticatedUser,
    @Body() body: unknown, @Req() req: CyrisRequest) {
    const parsed = ExerciseBroadcastRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid broadcast');
    return this.service.send(eventId, actor, parsed.data, req.id);
  }
}

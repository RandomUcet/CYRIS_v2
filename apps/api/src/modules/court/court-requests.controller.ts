import { BadRequestException, Body, Controller, Get, Header, Param,
  ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { CreateCourtRequestSchema, ReplyCourtRequestSchema } from '@cyris/contracts';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { CourtRequestsService } from './court-requests.service.js';

@Controller('events/:eventId/court/:courtCaseId/requests')
@UseGuards(AuthGuard)
export class CourtRequestsController {
  constructor(private readonly requests: CourtRequestsService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(@Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('courtCaseId', ParseUUIDPipe) caseId: string,
    @CurrentUser() user: AuthenticatedUser) {
    return this.requests.list(eventId, caseId, user);
  }
  @Post()
  create(@Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('courtCaseId', ParseUUIDPipe) caseId: string,
    @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const input = CreateCourtRequestSchema.safeParse(body);
    if (!input.success) throw new BadRequestException(input.error.errors[0]?.message ?? 'Invalid request');
    return this.requests.create(eventId, caseId, input.data, user);
  }
  @Post(':requestId/reply')
  reply(@Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('courtCaseId', ParseUUIDPipe) caseId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const input = ReplyCourtRequestSchema.safeParse(body);
    if (!input.success) throw new BadRequestException(input.error.errors[0]?.message ?? 'Invalid response');
    return this.requests.reply(eventId, caseId, requestId, input.data, user);
  }
}

import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { ExconDashboardService } from './excon-dashboard.service.js';

@Controller('events/:eventId/command/excon')
@UseGuards(AuthGuard)
export class ExconDashboardController {
  constructor(private readonly dashboard:ExconDashboardService) {}

  @Get()
  overview(@Param('eventId',ParseUUIDPipe) eventId:string,@CurrentUser() actor:AuthenticatedUser) {
    return this.dashboard.overview(eventId,actor);
  }
}

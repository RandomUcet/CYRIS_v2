import { Controller, Get, Post, Body, BadRequestException, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { ExconDashboardService } from './excon-dashboard.service.js';
import { ExerciseIntelligenceService } from './exercise-intelligence.service.js';
import { ExerciseAdviceInputSchema } from '@cyris/contracts';

@Controller('events/:eventId/command/excon')
@UseGuards(AuthGuard)
export class ExconDashboardController {
  constructor(private readonly dashboard:ExconDashboardService,private readonly intelligence:ExerciseIntelligenceService) {}

  @Get('intelligence')
  intelligenceOverview(@Param('eventId',ParseUUIDPipe) eventId:string,@CurrentUser() actor:AuthenticatedUser){
    return this.intelligence.overview(eventId,actor);
  }

  @Post('intelligence/advice')
  advice(@Param('eventId',ParseUUIDPipe) eventId:string,@CurrentUser() actor:AuthenticatedUser,@Body() body:unknown){
    const input=ExerciseAdviceInputSchema.safeParse(body);
    if(!input.success)throw new BadRequestException('Invalid exercise intelligence request');
    return this.intelligence.advise(eventId,actor,input.data);
  }

  @Get()
  overview(@Param('eventId',ParseUUIDPipe) eventId:string,@CurrentUser() actor:AuthenticatedUser) {
    return this.dashboard.overview(eventId,actor);
  }
}

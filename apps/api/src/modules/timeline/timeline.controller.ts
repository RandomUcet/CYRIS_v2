import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { TimelineService } from './timeline.service.js';
import { TimelineQueryFiltersSchema } from '@cyris/contracts';

@Controller()
@UseGuards(AuthGuard)
export class TimelineController {
  constructor(private readonly timelineService: TimelineService) {}

  @Get('events/:eventId/timeline')
  async getEventTimeline(
    @Param('eventId') eventId: string,
    @Query() query: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parsed = TimelineQueryFiltersSchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid timeline query');
    }
    return this.timelineService.getEventTimeline(eventId, parsed.data, user);
  }

  @Get('resources/:resourceId/timeline')
  async getResourceTimeline(
    @Param('resourceId') resourceId: string,
    @Query() query: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parsed = TimelineQueryFiltersSchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid timeline query');
    }
    return this.timelineService.getResourceTimeline(resourceId, parsed.data, user);
  }

  @Get('cases/:caseId/timeline')
  async getCaseTimeline(
    @Param('caseId') caseId: string,
    @Query() query: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parsed = TimelineQueryFiltersSchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid timeline query');
    }
    return this.timelineService.getCaseTimeline(caseId, parsed.data, user);
  }
}

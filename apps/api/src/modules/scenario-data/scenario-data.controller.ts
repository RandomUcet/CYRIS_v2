import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { ScenarioDataService } from './scenario-data.service.js';
import { ScenarioDataRequestSchema } from '@cyris/contracts';

@Controller('events/:eventId/scenario-data')
@UseGuards(AuthGuard)
export class ScenarioDataController {
  constructor(private readonly service: ScenarioDataService) {}

  @Post('preview')
  preview(@Param('eventId') eventId: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = ScenarioDataRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid scenario data configuration');
    return this.service.preview(eventId, parsed.data, user);
  }

  @Get('batches')
  list(@Param('eventId') eventId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.list(eventId, user);
  }

  @Get('batches/:batchId')
  get(@Param('eventId') eventId: string, @Param('batchId') batchId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.get(eventId, batchId, user);
  }

  @Post('generate')
  generate(@Param('eventId') eventId: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = ScenarioDataRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid scenario data configuration');
    return this.service.generate(eventId, parsed.data, user);
  }

  @Post('batches/:batchId/cleanup')
  cleanup(@Param('eventId') eventId: string, @Param('batchId') batchId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.cleanup(eventId, batchId, user);
  }
}

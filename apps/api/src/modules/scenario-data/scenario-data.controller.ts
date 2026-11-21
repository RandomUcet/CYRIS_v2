import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { ScenarioDataService } from './scenario-data.service.js';
import { ScenarioDraftPosition, ScenarioDataRequestSchema, SparkDraftRequestSchema, ScenarioBatchMediaQuerySchema } from '@cyris/contracts';

@Controller('events/:eventId/scenario-data')
@UseGuards(AuthGuard)
export class ScenarioDataController {
  constructor(private readonly service: ScenarioDataService) { }

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

  @Get('batches/:batchId/records')
  batchRecords(
    @Param('eventId', ParseUUIDPipe) eventId:string,
    @Param('batchId', ParseUUIDPipe) batchId:string,
    @Query() query:unknown,
    @CurrentUser() user:AuthenticatedUser
  ) {
    const parsed=ScenarioBatchMediaQuerySchema.safeParse(query);
    if(!parsed.success) throw new BadRequestException('Invalid generated-record page');
    return this.service.listBatchRecords(eventId,batchId,parsed.data,user);
  }

  @Post('spark-drafts')
  startDraft(@Param('eventId') eventId: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const request = SparkDraftRequestSchema.safeParse(body);
    if (!request.success) throw new BadRequestException('Enter a scenario brief and valid counts.');
    return this.service.startDraft(eventId, request.data, user);
  }

  @Post('batches/:batchId/advance')
  advance(@Param('eventId') eventId: string, @Param('batchId') batchId: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const request = ScenarioDraftPosition.safeParse(body);
    if (!request.success) throw new BadRequestException('Invalid draft position');
    return this.service.advance(eventId, batchId, request.data.prepared, user);
  }

  @Post('batches/:batchId/publish')
  publish(@Param('eventId') eventId: string, @Param('batchId') batchId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.publish(eventId, batchId, user);
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

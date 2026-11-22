import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, Res, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import type { FastifyReply } from 'fastify';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { ScenarioDataService } from './scenario-data.service.js';
import { ScenarioDraftMediaService } from './scenario-draft-media.service.js';
import { ScenarioDraftPosition, ScenarioDataRequestSchema, SparkDraftRequestSchema, ScenarioBatchMediaQuerySchema,
  ScenarioDraftRecordListQuerySchema, ScenarioDraftMediaUploadSchema, ScenarioDraftMediaImageQuerySchema } from '@cyris/contracts';

@Controller('events/:eventId/scenario-data')
@UseGuards(AuthGuard)
export class ScenarioDataController {
  constructor(private readonly service: ScenarioDataService, private readonly draftMedia: ScenarioDraftMediaService) { }

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

  /** These routes are scoped to scenario managers with registry-update rights. */
  @Get('batches/:batchId/draft-records')
  draftRecords(@Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = ScenarioDraftRecordListQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('Invalid draft record page');
    return this.draftMedia.listRecords(eventId, batchId, parsed.data, user);
  }

  @Get('batches/:batchId/draft-media')
  draftMediaList(@Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('batchId', ParseUUIDPipe) batchId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.draftMedia.listMedia(eventId, batchId, user);
  }

  @Get('batches/:batchId/draft-image')
  async draftImage(@Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Query() query: unknown, @CurrentUser() user: AuthenticatedUser, @Res() reply: FastifyReply) {
    const parsed = ScenarioDraftMediaImageQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('Invalid draft image selector');
    const image = await this.draftMedia.download(eventId, batchId, parsed.data, user);
    reply.header('Content-Type', image.mimeType);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Cache-Control', 'private, no-store');
    reply.header('Content-Disposition', 'inline');
    return reply.send(Buffer.from(image.body));
  }

  @Post('batches/:batchId/draft-media')
  draftImageUpload(@Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = ScenarioDraftMediaUploadSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid draft image');
    return this.draftMedia.upload(eventId, batchId, parsed.data, user);
  }

  @Delete('batches/:batchId/draft-media')
  draftImageRemove(@Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('batchId', ParseUUIDPipe) batchId: string, @Query() query: unknown,
    @CurrentUser() user: AuthenticatedUser) {
    const parsed = ScenarioDraftMediaImageQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('Invalid draft image selector');
    return this.draftMedia.remove(eventId, batchId, parsed.data, user);
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

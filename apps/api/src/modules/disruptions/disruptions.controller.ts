import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import {
  CreateDisruptionRequestSchema,
  RestoreDisruptionRequestSchema,
  CreateRecoveryObjectiveRequestSchema,
  RecoveryObjectiveReviewRequestSchema,
  RecoveryObjectiveRestoreRequestSchema,
  RecoveryReportRequestSchema,
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

  @Get('recovery-objectives')
  listRecoveryObjectives(@Param('eventId') eventId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.disruptionsService.listRecoveryObjectives(eventId, user);
  }

  @Post('recovery-objectives')
  async createRecoveryObjective(@Param('eventId') eventId: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = CreateRecoveryObjectiveRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid recovery objective payload');
    return this.disruptionsService.createRecoveryObjective(eventId, parsed.data, user);
  }

  @Post('recovery-objectives/:objectiveId/publish')
  async publishRecoveryObjective(@Param('eventId') eventId: string, @Param('objectiveId') objectiveId: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = RecoveryObjectiveRestoreRequestSchema.pick({ expectedRevision: true }).safeParse(body);
    if (!parsed.success) throw new BadRequestException('A valid expectedRevision is required');
    return this.disruptionsService.publishRecoveryObjective(eventId, objectiveId, parsed.data.expectedRevision, user);
  }

  @Post('recovery-objectives/:objectiveId/review')
  async reviewRecoveryObjective(@Param('eventId') eventId: string, @Param('objectiveId') objectiveId: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = RecoveryObjectiveReviewRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid recovery review payload');
    return this.disruptionsService.reviewRecoveryObjective(eventId, objectiveId, parsed.data, user);
  }

  @Post('recovery-objectives/:objectiveId/restore')
  async restoreRecoveryObjective(@Param('eventId') eventId: string, @Param('objectiveId') objectiveId: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = RecoveryObjectiveRestoreRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid recovery restore payload');
    return this.disruptionsService.restoreFromRecoveryObjective(eventId, objectiveId, parsed.data, user);
  }

  @Get('recovery-objectives/:objectiveId/reports')
  listRecoveryReports(@Param('eventId') eventId: string, @Param('objectiveId') objectiveId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.disruptionsService.listRecoveryReports(eventId, objectiveId, user);
  }

  @Post('recovery-objectives/:objectiveId/reports')
  async submitRecoveryReport(@Param('eventId') eventId: string, @Param('objectiveId') objectiveId: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = RecoveryReportRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid recovery report payload');
    return this.disruptionsService.submitRecoveryReport(eventId, objectiveId, parsed.data, user);
  }
}

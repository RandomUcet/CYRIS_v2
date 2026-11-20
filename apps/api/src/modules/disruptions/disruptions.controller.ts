import { BadRequestException, Body, Controller, Get, Header, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
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
  CreateRecoveryArtifactRequestSchema,
} from '@cyris/contracts';
import { DisruptionsService } from './disruptions.service.js';
import { Permissions, PermissionScopes } from '@cyris/shared';
import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator.js';

@Controller('events/:eventId/disruptions')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermission(Permissions.PLATFORM_MANAGE, PermissionScopes.PLATFORM)
export class DisruptionsController {
  constructor(private readonly disruptionsService: DisruptionsService) {}

  @Get()
  list(@Param('eventId') eventId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.disruptionsService.listOperator(eventId, user);
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

  @Get('recovery-objectives/:objectiveId/artifacts')
  listRecoveryArtifacts(@Param('eventId') eventId: string, @Param('objectiveId') objectiveId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.disruptionsService.listRecoveryArtifacts(eventId, objectiveId, user);
  }

  @Post('recovery-objectives/:objectiveId/artifacts')
  async createRecoveryArtifact(@Param('eventId') eventId: string, @Param('objectiveId') objectiveId: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = CreateRecoveryArtifactRequestSchema.safeParse({ ...(body as Record<string, unknown>), objectiveId });
    if (!parsed.success) throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid recovery artifact payload');
    return this.disruptionsService.createRecoveryArtifact(eventId, parsed.data, user);
  }

  @Post('recovery-objectives/:objectiveId/artifacts/:artifactId/publish')
  async publishRecoveryArtifact(@Param('eventId') eventId: string, @Param('objectiveId') objectiveId: string, @Param('artifactId') artifactId: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = RecoveryObjectiveRestoreRequestSchema.pick({ expectedRevision: true }).safeParse(body);
    if (!parsed.success) throw new BadRequestException('A valid expectedRevision is required');
    return this.disruptionsService.publishRecoveryArtifact(eventId, objectiveId, artifactId, parsed.data.expectedRevision, user);
  }

  @Get('recovery-objectives/:objectiveId/artifacts/:artifactId/download')
  async downloadRecoveryArtifact(@Param('eventId') eventId: string, @Param('objectiveId') objectiveId: string, @Param('artifactId') artifactId: string, @CurrentUser() user: AuthenticatedUser, @Res() reply: FastifyReply) {
    const file = await this.disruptionsService.downloadRecoveryArtifact(eventId, objectiveId, artifactId, user);
    reply.header('Content-Type', 'text/plain; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${file.filename}"`);
    return reply.send(file.body);
  }
}


@Controller('events/:eventId')
@UseGuards(AuthGuard)
export class ServiceStatusController {
  constructor(private readonly service: DisruptionsService) {}

  @Get(['service-status', 'disruptions/service-status'])
  @Header('Cache-Control', 'private, no-store')
  status(@Param('eventId') eventId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.getServiceStatus(eventId, user);
  }

  @Get('disruptions/status')
  @Header('Cache-Control', 'private, no-store')
  taskStatus(@Param('eventId') eventId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.getParticipantStatus(eventId, user);
  }
}

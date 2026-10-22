import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { EvaluationService } from './evaluation.service.js';
import {
  CreateEvaluationObjectiveRequestSchema,
  UpdateEvaluationObjectiveRequestSchema,
  CreateEvaluationCriterionRequestSchema,
  CreateEvaluationObservationRequestSchema,
  UpdateEvaluationObservationRequestSchema,
  LockEvaluationRequestSchema,
  PublishEvaluationRequestSchema,
  EvaluationQueryFiltersSchema,
  type EvaluationObjectiveItem,
  type EvaluationCriterionItem,
  type EvaluationObservationItem,
  type AfterActionReviewResponse,
} from '@cyris/contracts';

@Controller('events/:eventId/evaluation')
@UseGuards(AuthGuard)
export class EvaluationController {
  constructor(private readonly evaluationService: EvaluationService) {}

  @Get('after-action')
  async getAfterAction(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<AfterActionReviewResponse> {
    return this.evaluationService.getAfterActionReview(eventId, user);
  }

  @Get('objectives')
  async listObjectives(
    @Param('eventId') eventId: string,
    @Query('status') status: string | undefined,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<EvaluationObjectiveItem[]> {
    return this.evaluationService.listObjectives(eventId, { status }, user);
  }

  @Post('objectives')
  async createObjective(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<EvaluationObjectiveItem> {
    const dto = CreateEvaluationObjectiveRequestSchema.parse(body);
    return this.evaluationService.createObjective(eventId, dto, user);
  }

  @Get('objectives/:objectiveId')
  async getObjective(
    @Param('eventId') eventId: string,
    @Param('objectiveId') objectiveId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<EvaluationObjectiveItem> {
    return this.evaluationService.getObjective(eventId, objectiveId, user);
  }

  @Patch('objectives/:objectiveId')
  async updateObjective(
    @Param('eventId') eventId: string,
    @Param('objectiveId') objectiveId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<EvaluationObjectiveItem> {
    const dto = UpdateEvaluationObjectiveRequestSchema.parse(body);
    return this.evaluationService.updateObjective(eventId, objectiveId, dto, user);
  }

  @Post('objectives/:objectiveId/criteria')
  async createCriterion(
    @Param('eventId') eventId: string,
    @Param('objectiveId') objectiveId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<EvaluationCriterionItem> {
    const dto = CreateEvaluationCriterionRequestSchema.parse(body);
    return this.evaluationService.createCriterion(eventId, objectiveId, dto, user);
  }

  @Get('observations')
  async listObservations(
    @Param('eventId') eventId: string,
    @Query() query: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<EvaluationObservationItem[]> {
    const filters = EvaluationQueryFiltersSchema.parse(query || {});
    return this.evaluationService.listObservations(eventId, filters, user);
  }

  @Post('observations')
  async createObservation(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<EvaluationObservationItem> {
    const dto = CreateEvaluationObservationRequestSchema.parse(body);
    return this.evaluationService.createObservation(eventId, dto, user);
  }

  @Patch('observations/:observationId')
  async updateObservation(
    @Param('eventId') eventId: string,
    @Param('observationId') observationId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<EvaluationObservationItem> {
    const dto = UpdateEvaluationObservationRequestSchema.parse(body);
    return this.evaluationService.updateObservation(eventId, observationId, dto, user);
  }

  @Post('lock')
  async lockEvaluation(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<{ status: string; message: string }> {
    const dto = LockEvaluationRequestSchema.parse(body);
    return this.evaluationService.lockEvaluation(eventId, dto, user);
  }

  @Post('publish')
  async publishEvaluation(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<{ status: string; message: string }> {
    const dto = PublishEvaluationRequestSchema.parse(body);
    return this.evaluationService.publishEvaluation(eventId, dto, user);
  }
}

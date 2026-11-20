import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { LaboratoryService } from './laboratory.service.js';
import {
  CreateLabAnalysisRequestSchema,
  UpdateLabAnalysisRequestSchema,
  ReassignLabAnalysisRequestSchema,
  CorrectLabAnalysisRequestSchema,
} from '@cyris/contracts';
import { Permissions, PermissionScopes } from '@cyris/shared';
import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator.js';

@Controller('events/:eventId/lab')
@UseGuards(AuthGuard, PermissionsGuard)
export class LaboratoryController {
  constructor(private readonly laboratoryService: LaboratoryService) {}

  @Get()
  async listAnalyses(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.laboratoryService.listAnalyses(eventId, user);
  }

  @Get('units')
  async listLaboratoryUnits(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.laboratoryService.listLaboratoryUnits(eventId, user);
  }

  @Get('units/:unitId/workers')
  async listEligibleWorkers(
    @Param('eventId') eventId: string,
    @Param('unitId') unitId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.laboratoryService.listEligibleWorkers(eventId, unitId, user);
  }

  @Post()
  async createAnalysis(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parsed = CreateLabAnalysisRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid lab analysis payload');
    }
    return this.laboratoryService.createAnalysis(eventId, parsed.data, user);
  }

  @Get(':analysisId')
  async getAnalysis(
    @Param('eventId') eventId: string,
    @Param('analysisId') analysisId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.laboratoryService.getAnalysisDetail(eventId, analysisId, user);
  }

  @Patch(':analysisId')
  async updateAnalysis(
    @Param('eventId') eventId: string,
    @Param('analysisId') analysisId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parsed = UpdateLabAnalysisRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid lab analysis update');
    }
    return this.laboratoryService.updateAnalysis(eventId, analysisId, parsed.data, user);
  }

  @Post(':analysisId/reassign')
  async reassignAnalysis(
    @Param('eventId') eventId: string,
    @Param('analysisId') analysisId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parsed = ReassignLabAnalysisRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid reassignment payload');
    }
    return this.laboratoryService.reassignAnalysis(eventId, analysisId, parsed.data, user);
  }

  @Post(':analysisId/correct')
  async correctAnalysis(
    @Param('eventId') eventId: string,
    @Param('analysisId') analysisId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parsed = CorrectLabAnalysisRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid correction payload');
    }
    return this.laboratoryService.correctAnalysis(eventId, analysisId, parsed.data, user);
  }
}

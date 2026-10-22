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
import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator.js';
import { Permissions, PermissionScopes } from '@cyris/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { ScenarioPhasesService } from './scenario-phases.service.js';
import {
  CreateScenarioPhaseSchema,
  UpdateScenarioPhaseSchema,
  type ScenarioPhaseResponse,
} from '@cyris/contracts';

@Controller('events/:eventId/scenario/phases')
@UseGuards(AuthGuard, PermissionsGuard)
export class ScenarioPhasesController {
  constructor(private readonly phasesService: ScenarioPhasesService) {}

  @Get()
  @RequirePermission(Permissions.SCENARIO_READ, PermissionScopes.EVENT)
  async listPhases(@Param('eventId') eventId: string): Promise<ScenarioPhaseResponse[]> {
    return this.phasesService.listPhases(eventId);
  }

  @Post()
  @RequirePermission(Permissions.SCENARIO_MANAGE, PermissionScopes.EVENT)
  async createPhase(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ScenarioPhaseResponse> {
    const parse = CreateScenarioPhaseSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.flatten());
    }
    return this.phasesService.createPhase(eventId, parse.data, user.id);
  }

  @Patch(':phaseId')
  @RequirePermission(Permissions.SCENARIO_MANAGE, PermissionScopes.EVENT)
  async updatePhase(
    @Param('eventId') eventId: string,
    @Param('phaseId') phaseId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ScenarioPhaseResponse> {
    const parse = UpdateScenarioPhaseSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.flatten());
    }
    return this.phasesService.updatePhase(eventId, phaseId, parse.data, user.id);
  }

  @Post('reorder')
  @RequirePermission(Permissions.SCENARIO_MANAGE, PermissionScopes.EVENT)
  async reorderPhases(
    @Param('eventId') eventId: string,
    @Body() body: { phaseIds: string[] },
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ScenarioPhaseResponse[]> {
    if (!body?.phaseIds || !Array.isArray(body.phaseIds)) {
      throw new BadRequestException('phaseIds array required');
    }
    return this.phasesService.reorderPhases(eventId, body.phaseIds, user.id);
  }
}

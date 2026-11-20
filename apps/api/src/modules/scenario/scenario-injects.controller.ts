import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator.js';
import { Permissions, PermissionScopes } from '@cyris/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { ScenarioInjectsService } from './scenario-injects.service.js';
import { ScenarioReleaseService } from './scenario-release.service.js';
import {
  CreateScenarioInjectSchema,
  UpdateScenarioInjectSchema,
  ScenarioInjectTranslationInputSchema,
  OverrideReleaseScenarioInjectSchema,
  type ScenarioInjectResponse,
  type ScenarioControlRunSheet,
  type AudiencePreviewResponse,
} from '@cyris/contracts';

@Controller('events/:eventId/scenario')
@UseGuards(AuthGuard, PermissionsGuard)
export class ScenarioInjectsController {
  constructor(
    private readonly injectsService: ScenarioInjectsService,
    private readonly releaseService: ScenarioReleaseService,
    private readonly authz: AuthorizationService,
  ) {}

  private allowPlatformConditions(user: AuthenticatedUser) {
    return this.authz.authorize({ user, permission: Permissions.PLATFORM_MANAGE });
  }

  @Get('control')
  @RequirePermission(Permissions.SCENARIO_READ, PermissionScopes.EVENT)
  async getControlRunSheet(@Param('eventId') eventId: string, @CurrentUser() user: AuthenticatedUser): Promise<ScenarioControlRunSheet> {
    return this.injectsService.getControlRunSheet(eventId, await this.allowPlatformConditions(user));
  }

  @Get('injects')
  @RequirePermission(Permissions.SCENARIO_READ, PermissionScopes.EVENT)
  async listInjects(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('phaseId') phaseId?: string
  ): Promise<ScenarioInjectResponse[]> {
    return this.injectsService.listInjects(eventId, phaseId, await this.allowPlatformConditions(user));
  }

  @Get('injects/:injectId')
  @RequirePermission(Permissions.SCENARIO_READ, PermissionScopes.EVENT)
  async getInject(
    @Param('eventId') eventId: string,
    @Param('injectId') injectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ScenarioInjectResponse> {
    return this.injectsService.getInject(eventId, injectId, await this.allowPlatformConditions(user));
  }

  @Post('injects')
  @RequirePermission(Permissions.SCENARIO_MANAGE, PermissionScopes.EVENT)
  async createInject(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ScenarioInjectResponse> {
    const parse = CreateScenarioInjectSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.flatten());
    }
    return this.injectsService.createInject(eventId, parse.data, user.id, await this.allowPlatformConditions(user));
  }

  @Patch('injects/:injectId')
  @RequirePermission(Permissions.SCENARIO_MANAGE, PermissionScopes.EVENT)
  async updateInject(
    @Param('eventId') eventId: string,
    @Param('injectId') injectId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ScenarioInjectResponse> {
    const parse = UpdateScenarioInjectSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.flatten());
    }
    return this.injectsService.updateInject(eventId, injectId, parse.data, user.id, await this.allowPlatformConditions(user));
  }

  @Post('injects/:injectId/release')
  @RequirePermission(Permissions.SCENARIO_RELEASE, PermissionScopes.EVENT)
  async releaseInject(
    @Param('eventId') eventId: string,
    @Param('injectId') injectId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.releaseService.executeRelease(eventId, injectId, 'MANUAL', user.id);
  }

  @Post('injects/:injectId/override-release')
  @RequirePermission(Permissions.SCENARIO_OVERRIDE, PermissionScopes.EVENT)
  async overrideReleaseInject(
    @Param('eventId') eventId: string,
    @Param('injectId') injectId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parse = OverrideReleaseScenarioInjectSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.flatten());
    }
    return this.releaseService.executeRelease(
      eventId,
      injectId,
      'OVERRIDE',
      user.id,
      parse.data.overrideReason,
      await this.allowPlatformConditions(user),
    );
  }

  @Post('injects/:injectId/cancel')
  @RequirePermission(Permissions.SCENARIO_MANAGE, PermissionScopes.EVENT)
  async cancelInject(
    @Param('eventId') eventId: string,
    @Param('injectId') injectId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ScenarioInjectResponse> {
    return this.injectsService.cancelInject(eventId, injectId, user.id, await this.allowPlatformConditions(user));
  }

  @Get('injects/:injectId/audience-preview')
  @RequirePermission(Permissions.SCENARIO_READ, PermissionScopes.EVENT)
  async getAudiencePreview(
    @Param('eventId') eventId: string,
    @Param('injectId') injectId: string,
    @Query('unitId') unitId?: string,
    @Query('userId') userId?: string
  ): Promise<AudiencePreviewResponse> {
    return this.injectsService.getAudiencePreview(eventId, injectId, { unitId, userId });
  }

  @Get('injects/:injectId/translations')
  @RequirePermission(Permissions.SCENARIO_READ, PermissionScopes.EVENT)
  async getTranslations(
    @Param('eventId') eventId: string,
    @Param('injectId') injectId: string
  ) {
    return this.injectsService.getTranslations(eventId, injectId);
  }

  @Post('injects/:injectId/translations')
  @RequirePermission(Permissions.SCENARIO_MANAGE, PermissionScopes.EVENT)
  async addTranslation(
    @Param('eventId') eventId: string,
    @Param('injectId') injectId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parse = ScenarioInjectTranslationInputSchema.safeParse(body);
    if (!parse.success) throw new BadRequestException(parse.error.flatten());
    return this.injectsService.addOrUpdateTranslation(eventId, injectId, parse.data, user.id, await this.allowPlatformConditions(user));
  }
}

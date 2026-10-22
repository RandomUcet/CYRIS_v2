import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ResourceService } from './resource.service.js';
import { ActivityService } from './activity.service.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { Permissions, PermissionScopes } from '@cyris/shared';
import {
  CreateRelationshipRequestSchema,
  CreateActivityEventRequestSchema,
  type ResourceItem,
  type ResourceRelationshipItem,
  type ActivityEventItem,
} from '@cyris/contracts';

@Controller('events/:eventId')
@UseGuards(AuthGuard, PermissionsGuard)
export class ResourcesController {
  constructor(
    private readonly resourceService: ResourceService,
    private readonly activityService: ActivityService
  ) {}

  @Post('resources')
  @RequirePermission(Permissions.EVENT_READ, PermissionScopes.EVENT)
  async registerResource(
    @Param('eventId') eventId: string,
    @Body('resourceType') resourceType: string,
    @Body('id') id?: string
  ): Promise<ResourceItem> {
    if (!resourceType || typeof resourceType !== 'string') {
      throw new BadRequestException('resourceType is required');
    }
    return this.resourceService.registerResource(eventId, resourceType, id ? { id } : undefined);
  }

  @Get('resources/:resourceId')
  @RequirePermission(Permissions.EVENT_READ, PermissionScopes.EVENT)
  async getResource(@Param('resourceId') resourceId: string): Promise<ResourceItem> {
    const resource = await this.resourceService.getResource(resourceId);
    if (!resource) {
      throw new NotFoundException(`Resource '${resourceId}' not found`);
    }
    return resource;
  }

  @Post('resources/:sourceResourceId/relationships')
  @RequirePermission(Permissions.EVENT_READ, PermissionScopes.EVENT)
  async createRelationship(
    @Param('eventId') eventId: string,
    @Param('sourceResourceId') sourceResourceId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ResourceRelationshipItem> {
    const parse = CreateRelationshipRequestSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.errors[0]?.message ?? 'Invalid relationship payload');
    }

    return this.resourceService.createRelationship({
      eventId,
      sourceResourceId,
      targetResourceId: parse.data.targetResourceId,
      relationshipType: parse.data.relationshipType,
      createdByUserId: user.id,
      metadata: parse.data.metadata,
    });
  }

  @Get('relationships')
  @RequirePermission(Permissions.EVENT_READ, PermissionScopes.EVENT)
  async listEventRelationships(
    @Param('eventId') eventId: string
  ): Promise<ResourceRelationshipItem[]> {
    return this.resourceService.listEventRelationships(eventId);
  }

  @Get('resources/:resourceId/relationships')
  @RequirePermission(Permissions.EVENT_READ, PermissionScopes.EVENT)
  async listRelationships(
    @Param('resourceId') resourceId: string
  ): Promise<ResourceRelationshipItem[]> {
    return this.resourceService.listRelationships(resourceId);
  }


  @Delete('resources/relationships/:relationshipId')
  @RequirePermission(Permissions.EVENT_READ, PermissionScopes.EVENT)
  async removeRelationship(
    @Param('relationshipId') relationshipId: string
  ): Promise<{ success: boolean }> {
    await this.resourceService.removeRelationship(relationshipId);
    return { success: true };
  }

  @Post('activity')
  @RequirePermission(Permissions.EVENT_READ, PermissionScopes.EVENT)
  async recordActivity(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ActivityEventItem> {
    const parse = CreateActivityEventRequestSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.errors[0]?.message ?? 'Invalid activity payload');
    }

    return this.activityService.recordActivity({
      eventId,
      resourceId: parse.data.resourceId,
      activityType: parse.data.activityType,
      actorUserId: user.id,
      title: parse.data.title,
      summary: parse.data.summary,
      metadata: parse.data.metadata,
      visibility: parse.data.visibility,
    });
  }

  @Get('activity')
  @RequirePermission(Permissions.EVENT_READ, PermissionScopes.EVENT)
  async getActivityFeed(
    @Param('eventId') eventId: string,
    @Query('resourceId') resourceId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ): Promise<ActivityEventItem[]> {
    return this.activityService.getActivityFeed({
      eventId,
      resourceId,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }
}

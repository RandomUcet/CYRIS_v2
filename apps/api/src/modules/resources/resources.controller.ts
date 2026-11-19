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
import { ResourceAccessService } from './resource-access.service.js';

@Controller('events/:eventId')
@UseGuards(AuthGuard, PermissionsGuard)
export class ResourcesController {
  constructor(
    private readonly resourceService: ResourceService,
    private readonly activityService: ActivityService,
    private readonly resourceAccessService: ResourceAccessService
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
  async getResource(
    @Param('eventId') eventId: string,
    @Param('resourceId') resourceId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ResourceItem> {
    const resource = await this.resourceService.getResource(resourceId);
    if (!resource || resource.eventId !== eventId) {
      throw new NotFoundException(`Resource '${resourceId}' not found`);
    }
    await this.resourceAccessService.assertCanAccessResource(user, resourceId, Permissions.REGISTRY_READ);
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

    await this.resourceAccessService.assertCanAccessResource(
      user,
      sourceResourceId,
      Permissions.REGISTRY_RELATIONSHIP_MANAGE
    );
    await this.resourceAccessService.assertCanAccessResource(
      user,
      parse.data.targetResourceId,
      Permissions.REGISTRY_RELATIONSHIP_MANAGE
    );

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
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ResourceRelationshipItem[]> {
    const relationships = await this.resourceService.listEventRelationships(eventId);
    const permitted: ResourceRelationshipItem[] = [];
    for (const relationship of relationships) {
      const sourceAllowed = await this.resourceAccessService.canAccessResource(
        user,
        relationship.sourceResourceId,
        Permissions.REGISTRY_READ
      );
      const targetAllowed = await this.resourceAccessService.canAccessResource(
        user,
        relationship.targetResourceId,
        Permissions.REGISTRY_READ
      );
      if (sourceAllowed && targetAllowed) permitted.push(relationship);
    }
    return permitted;
  }

  @Get('resources/:resourceId/relationships')
  @RequirePermission(Permissions.EVENT_READ, PermissionScopes.EVENT)
  async listRelationships(
    @Param('resourceId') resourceId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ResourceRelationshipItem[]> {
    const resource = await this.resourceService.getResource(resourceId);
    if (!resource || resource.eventId !== eventId) {
      throw new NotFoundException(`Resource '${resourceId}' not found`);
    }
    await this.resourceAccessService.assertCanAccessResource(
      user,
      resourceId,
      Permissions.REGISTRY_READ
    );
    const relationships = await this.resourceService.listRelationships(resourceId);
    const permitted: ResourceRelationshipItem[] = [];
    for (const relationship of relationships) {
      const sourceAllowed = await this.resourceAccessService.canAccessResource(
        user,
        relationship.sourceResourceId,
        Permissions.REGISTRY_READ
      );
      const targetAllowed = await this.resourceAccessService.canAccessResource(
        user,
        relationship.targetResourceId,
        Permissions.REGISTRY_READ
      );
      if (sourceAllowed && targetAllowed) permitted.push(relationship);
    }
    return permitted;
  }


  @Delete('resources/relationships/:relationshipId')
  @RequirePermission(Permissions.EVENT_READ, PermissionScopes.EVENT)
  async removeRelationship(
    @Param('eventId') eventId: string,
    @Param('relationshipId') relationshipId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<{ success: boolean }> {
    const relationship = await this.resourceService.getRelationship(relationshipId);
    if (!relationship || relationship.eventId !== eventId) {
      throw new NotFoundException(`Relationship '${relationshipId}' not found`);
    }
    await this.resourceAccessService.assertCanAccessResource(
      user,
      relationship.sourceResourceId,
      Permissions.REGISTRY_RELATIONSHIP_MANAGE
    );
    await this.resourceAccessService.assertCanAccessResource(
      user,
      relationship.targetResourceId,
      Permissions.REGISTRY_RELATIONSHIP_MANAGE
    );
    await this.resourceService.removeRelationship(relationshipId, user.id);
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

    if (parse.data.resourceId) {
      const resource = await this.resourceService.getResource(parse.data.resourceId);
      if (!resource || resource.eventId !== eventId) {
        throw new BadRequestException('Activity resource must belong to this exercise');
      }
      await this.resourceAccessService.assertCanAccessResource(
        user,
        parse.data.resourceId,
        Permissions.TIMELINE_READ
      );
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
    @CurrentUser() user: AuthenticatedUser,
    @Query('resourceId') resourceId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ): Promise<ActivityEventItem[]> {
    if (resourceId) {
      const resource = await this.resourceService.getResource(resourceId);
      if (!resource || resource.eventId !== eventId) {
        throw new NotFoundException(`Resource '${resourceId}' not found`);
      }
      await this.resourceAccessService.assertCanAccessResource(
        user,
        resourceId,
        Permissions.TIMELINE_READ
      );
    }
    return this.activityService.getActivityFeed({
      eventId,
      resourceId,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }
}

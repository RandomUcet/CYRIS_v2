import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ResourceService } from './resource.service.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import {
  CreateRelationshipRequestSchema,
  type ResourceRelationshipItem,
} from '@cyris/contracts';
import { Permissions } from '@cyris/shared';
import { ResourceAccessService } from './resource-access.service.js';

@Controller('resources')
@UseGuards(AuthGuard)
export class RootResourcesController {
  constructor(
    private readonly resourceService: ResourceService,
    private readonly resourceAccessService: ResourceAccessService
  ) {}

  @Get(':resourceId/relationships')
  async listRelationships(
    @Param('resourceId') resourceId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ResourceRelationshipItem[]> {
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

  @Post(':sourceResourceId/relationships')
  async createRelationship(
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
      sourceResourceId,
      targetResourceId: parse.data.targetResourceId,
      relationshipType: parse.data.relationshipType,
      createdByUserId: user.id,
      metadata: parse.data.metadata,
    });
  }
}

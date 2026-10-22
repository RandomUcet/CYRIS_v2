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

@Controller('resources')
@UseGuards(AuthGuard)
export class RootResourcesController {
  constructor(private readonly resourceService: ResourceService) {}

  @Get(':resourceId/relationships')
  async listRelationships(
    @Param('resourceId') resourceId: string
  ): Promise<ResourceRelationshipItem[]> {
    return this.resourceService.listRelationships(resourceId);
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

    return this.resourceService.createRelationship({
      sourceResourceId,
      targetResourceId: parse.data.targetResourceId,
      relationshipType: parse.data.relationshipType,
      createdByUserId: user.id,
      metadata: parse.data.metadata,
    });
  }
}

import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { WorkspaceResolverService } from './workspace-resolver.service.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';

@Controller('events/:eventId/workspace')
@UseGuards(AuthGuard)
export class WorkspaceController {
  constructor(private readonly workspaceResolverService: WorkspaceResolverService) {}

  @Get()
  async getResolvedWorkspace(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.workspaceResolverService.resolveWorkspace(user, eventId);
  }
}

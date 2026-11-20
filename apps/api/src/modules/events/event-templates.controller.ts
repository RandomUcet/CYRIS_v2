import { Controller, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { addMissingEventTemplates, eq, events } from '@cyris/db';
import { Permissions, PermissionScopes } from '@cyris/shared';
import { AuditService } from '../audit/audit.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AuthGuard, type CyrisRequest } from '../auth/guards/auth.guard.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator.js';
import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';
import { DatabaseService } from '../database/database.service.js';
import { SearchIndexerService } from '../search/search-indexer.service.js';

@Controller('events/:eventId/team-templates')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermission(Permissions.PLATFORM_MANAGE, PermissionScopes.PLATFORM)
export class EventTemplatesController {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly indexer: SearchIndexerService,
  ) {}

  @Post()
  @HttpCode(200)
  initialize(@Param('eventId', ParseUUIDPipe) eventId: string, @CurrentUser() actor: AuthenticatedUser, @Req() request: CyrisRequest) {
    return this.database.client.transaction(async tx => {
      const [event] = await tx.select({ id: events.id }).from(events).where(eq(events.id, eventId)).for('key share');
      if (!event) throw new NotFoundException('Exercise not found.');
      const result = await addMissingEventTemplates(tx, eventId, unitId => this.indexer.emitSearchUpsert('unit', unitId, tx));
      await this.audit.record({
        eventId, action: 'event.team_templates.initialized', category: 'event',
        actorUserId: actor.id, resourceType: 'event', resourceId: eventId, requestId: request.id,
        metadata: { unitsCreated: result.unitsCreated, rolesCreated: result.rolesCreated }, txClient: tx,
      });
      return result;
    });
  }
}

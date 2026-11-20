import { Module } from '@nestjs/common';
import { EventsController } from './events.controller.js';
import { EventTemplatesController } from './event-templates.controller.js';
import { MembershipsController } from './memberships.controller.js';
import { UnitsController } from './units.controller.js';
import { RolesController } from './roles.controller.js';
import { WorkspaceController } from './workspace.controller.js';
import { EventsService } from './events.service.js';
import { WorkspaceResolverService } from './workspace-resolver.service.js';

@Module({
  controllers: [
    EventsController,
    EventTemplatesController,
    MembershipsController,
    UnitsController,
    RolesController,
    WorkspaceController,
  ],
  providers: [EventsService, WorkspaceResolverService],
  exports: [EventsService, WorkspaceResolverService],
})
export class EventsModule {}


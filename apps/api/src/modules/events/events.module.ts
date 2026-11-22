import { Module } from '@nestjs/common';
import { EventsController } from './events.controller.js';
import { EventTemplatesController } from './event-templates.controller.js';
import { MembershipsController } from './memberships.controller.js';
import { UnitsController } from './units.controller.js';
import { RolesController } from './roles.controller.js';
import { WorkspaceController } from './workspace.controller.js';
import { EventsService } from './events.service.js';
import { EventAfterActionService } from './event-after-action.service.js';
import { EventAfterActionController } from './event-after-action.controller.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { WorkspaceResolverService } from './workspace-resolver.service.js';

@Module({
  imports: [AuthorizationModule],
  controllers: [
    EventsController,
    EventAfterActionController,
    EventTemplatesController,
    MembershipsController,
    UnitsController,
    RolesController,
    WorkspaceController,
  ],
  providers: [EventsService, WorkspaceResolverService, EventAfterActionService],
  exports: [EventsService, WorkspaceResolverService],
})
export class EventsModule {}


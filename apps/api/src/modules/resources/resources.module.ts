import { Global, Module } from '@nestjs/common';
import { ResourceService } from './resource.service.js';
import { ActivityService } from './activity.service.js';
import { ResourceAccessService } from './resource-access.service.js';
import { ResourceAssignmentService } from './resource-assignment.service.js';
import { IdentifierAllocatorService } from './identifier-allocator.service.js';
import { ResourcesController } from './resources.controller.js';
import { RootResourcesController } from './root-resources.controller.js';
import { DatabaseModule } from '../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Global()
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [ResourcesController, RootResourcesController],
  providers: [
    ResourceService,
    ActivityService,
    ResourceAccessService,
    ResourceAssignmentService,
    IdentifierAllocatorService,
  ],
  exports: [
    ResourceService,
    ActivityService,
    ResourceAccessService,
    ResourceAssignmentService,
    IdentifierAllocatorService,
  ],
})
export class ResourcesModule {}

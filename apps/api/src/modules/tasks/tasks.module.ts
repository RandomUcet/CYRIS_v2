import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service.js';
import { TasksController } from './tasks.controller.js';
import { DatabaseModule } from '../database/database.module.js';
import { ResourcesModule } from '../resources/resources.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { SearchModule } from '../search/search.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { DisruptionsModule } from '../disruptions/disruptions.module.js';

@Module({
  imports: [
    DatabaseModule,
    ResourcesModule,
    AuditModule,
    SearchModule,
    AuthModule,
    AuthorizationModule,
    DisruptionsModule,
  ],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}

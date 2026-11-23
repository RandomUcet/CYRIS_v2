import { Module } from '@nestjs/common';
import { CommandService } from './command.service.js';
import { CommandController } from './command.controller.js';
import { ExconDashboardController } from './excon-dashboard.controller.js';
import { ExconDashboardService } from './excon-dashboard.service.js';
import { DatabaseModule } from '../database/database.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { MedicalModule } from '../medical/medical.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { InvestigationModule } from '../investigation/investigation.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { ResourcesModule } from '../resources/resources.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [
    DatabaseModule,
    TasksModule,
    MedicalModule,
    DocumentsModule,
    InvestigationModule,
    AuditModule,
    ResourcesModule,
    AuthModule,
  ],
  controllers: [CommandController, ExconDashboardController],
  providers: [CommandService, ExconDashboardService],
  exports: [CommandService],
})
export class CommandModule {}

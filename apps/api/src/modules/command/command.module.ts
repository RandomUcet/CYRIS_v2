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
import { AIModule } from '../ai/ai.module.js';
import { ExerciseIntelligenceService } from './exercise-intelligence.service.js';
import { ExerciseObserverReader } from './exercise-observer-reader.service.js';
import { ExerciseAdviceStore } from './exercise-advice-store.service.js';
import { ExerciseJobService } from './exercise-job.service.js';
import { ExerciseBlueprintService } from './exercise-blueprint.service.js';

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
    AIModule,
  ],
  controllers: [CommandController, ExconDashboardController],
  providers: [CommandService, ExconDashboardService, ExerciseIntelligenceService, ExerciseObserverReader, ExerciseBlueprintService, ExerciseAdviceStore, ExerciseJobService],
  exports: [CommandService],
})
export class CommandModule {}

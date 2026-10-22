import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { ResourcesModule } from '../resources/resources.module.js';
import { ScenarioPhasesService } from './scenario-phases.service.js';
import { ScenarioInjectsService } from './scenario-injects.service.js';
import { ScenarioConditionEvaluatorService } from './scenario-condition-evaluator.service.js';
import { ScenarioReleaseService } from './scenario-release.service.js';
import { ScenarioBriefingsService } from './scenario-briefings.service.js';
import { ScenarioSchedulerService } from './scenario-scheduler.service.js';
import { ScenarioPhasesController } from './scenario-phases.controller.js';
import { ScenarioInjectsController } from './scenario-injects.controller.js';
import { ParticipantBriefingsController } from './participant-briefings.controller.js';
import { ScenarioClockService } from './scenario-clock.service.js';
import { ScenarioClockController } from './scenario-clock.controller.js';

@Module({
  imports: [DatabaseModule, AuditModule, ResourcesModule],
  controllers: [
    ScenarioPhasesController,
    ScenarioInjectsController,
    ParticipantBriefingsController,
    ScenarioClockController,
  ],
  providers: [
    ScenarioPhasesService,
    ScenarioInjectsService,
    ScenarioConditionEvaluatorService,
    ScenarioReleaseService,
    ScenarioBriefingsService,
    ScenarioSchedulerService,
    ScenarioClockService,
  ],
  exports: [
    ScenarioPhasesService,
    ScenarioInjectsService,
    ScenarioConditionEvaluatorService,
    ScenarioReleaseService,
    ScenarioBriefingsService,
    ScenarioClockService,
  ],
})
export class ScenarioModule {}

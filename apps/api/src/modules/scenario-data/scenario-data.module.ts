import { AIModule } from '../ai/ai.module.js';
import { Module } from '@nestjs/common';
import { ScenarioDataController } from './scenario-data.controller.js';
import { ScenarioDataService } from './scenario-data.service.js';
import { DatabaseModule } from '../database/database.module.js';
import { ResourcesModule } from '../resources/resources.module.js';
import { SearchModule } from '../search/search.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';

@Module({
  imports: [AIModule, DatabaseModule, ResourcesModule, SearchModule, AuditModule, AuthorizationModule],
  controllers: [ScenarioDataController],
  providers: [ScenarioDataService],
})
export class ScenarioDataModule {}

import { Module } from '@nestjs/common';
import { AIModule } from '../ai/ai.module.js';
import { LegalLibraryController } from './legal-library.controller.js';
import { LegalLibraryService } from './legal-library.service.js';
import { DatabaseModule } from '../database/database.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { ResourcesModule } from '../resources/resources.module.js';
import { CourtService } from './court.service.js';
import { CourtController } from './court.controller.js';
import { CourtRequestsController, CourtRequestInboxController } from './court-requests.controller.js';
import { CourtRequestsService } from './court-requests.service.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';

@Module({
  imports: [DatabaseModule, AuditModule, ResourcesModule, AuthorizationModule, AIModule],
  controllers: [CourtController, CourtRequestsController, CourtRequestInboxController, LegalLibraryController],
  providers: [CourtService, CourtRequestsService, LegalLibraryService],
  exports: [CourtService],
})
export class CourtModule {}

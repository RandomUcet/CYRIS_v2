import { Module } from '@nestjs/common';
import { ConfigModule } from './modules/config/config.module.js';
import { DatabaseModule } from './modules/database/database.module.js';
import { StorageModule } from './modules/storage/storage.module.js';
import { SearchModule } from './modules/search/search.module.js';
import { QueueModule } from './modules/queue/queue.module.js';
import { MailModule } from './modules/mail/mail.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { AuthorizationModule } from './modules/authorization/authorization.module.js';
import { EventsModule } from './modules/events/events.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { ResourcesModule } from './modules/resources/resources.module.js';
import { RegistryModule } from './modules/registry/registry.module.js';
import { InvestigationModule } from './modules/investigation/investigation.module.js';
import { EvidenceModule } from './modules/evidence/evidence.module.js';
import { LaboratoryModule } from './modules/laboratory/laboratory.module.js';
import { TimelineModule } from './modules/timeline/timeline.module.js';
import { IntegrationsModule } from './modules/integrations/integrations.module.js';
import { AIModule } from './modules/ai/ai.module.js';
import { ScenarioModule } from './modules/scenario/scenario.module.js';
import { DocumentsModule } from './modules/documents/documents.module.js';
import { ForensicsModule } from './modules/forensics/forensics.module.js';
import { CourtModule } from './modules/court/court.module.js';
import { TasksModule } from './modules/tasks/tasks.module.js';
import { MedicalModule } from './modules/medical/medical.module.js';
import { EvaluationModule } from './modules/evaluation/evaluation.module.js';
import { CommandModule } from './modules/command/command.module.js';
import { DisruptionsModule } from './modules/disruptions/disruptions.module.js';
import { PreferencesModule } from './modules/preferences/preferences.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { ScenarioDataModule } from './modules/scenario-data/scenario-data.module.js';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    StorageModule,
    SearchModule,
    QueueModule,
    MailModule,
    HealthModule,
    AuthModule,
    AuthorizationModule,
    AuditModule,
    EventsModule,
    ResourcesModule,
    RegistryModule,
    InvestigationModule,
    EvidenceModule,
    LaboratoryModule,
    TimelineModule,
    IntegrationsModule,
    AIModule,
    ScenarioModule,
    DocumentsModule,
    ForensicsModule,
    CourtModule,
    TasksModule,
    MedicalModule,
    EvaluationModule,
    CommandModule,
    DisruptionsModule,
    PreferencesModule,
    NotificationsModule,
    ScenarioDataModule,
  ],
})
export class AppModule {}

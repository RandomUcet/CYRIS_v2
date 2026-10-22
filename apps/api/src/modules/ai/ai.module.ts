import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { ConfigModule } from '../config/config.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { IntegrationsModule } from '../integrations/integrations.module.js';
import { ResourcesModule } from '../resources/resources.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { AuthModule } from '../auth/auth.module.js';

import { AIGatewayService } from './ai-gateway.service.js';
import { AIContextService } from './ai-context.service.js';
import { WritingAssistService } from './services/writing-assist.service.js';
import { CaseSummarizationService } from './services/case-summarization.service.js';
import { CatchMeUpService } from './services/catch-me-up.service.js';
import { TimelineExplainService } from './services/timeline-explain.service.js';

import { AIAdminController } from './ai-admin.controller.js';
import { IntelligenceController } from './intelligence.controller.js';

@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
    AuditModule,
    IntegrationsModule,
    ResourcesModule,
    AuthorizationModule,
    AuthModule,
  ],
  providers: [
    AIGatewayService,
    AIContextService,
    WritingAssistService,
    CaseSummarizationService,
    CatchMeUpService,
    TimelineExplainService,
  ],
  controllers: [AIAdminController, IntelligenceController],
  exports: [
    AIGatewayService,
    AIContextService,
    WritingAssistService,
    CaseSummarizationService,
    CatchMeUpService,
    TimelineExplainService,
  ],
})
export class AIModule {}

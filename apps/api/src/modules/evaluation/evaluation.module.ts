import { Module } from '@nestjs/common';
import { EvaluationService } from './evaluation.service.js';
import { EvaluationController } from './evaluation.controller.js';
import { DatabaseModule } from '../database/database.module.js';
import { ResourcesModule } from '../resources/resources.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [
    DatabaseModule,
    ResourcesModule,
    AuditModule,
    AuthModule,
  ],
  controllers: [EvaluationController],
  providers: [EvaluationService],
  exports: [EvaluationService],
})
export class EvaluationModule {}

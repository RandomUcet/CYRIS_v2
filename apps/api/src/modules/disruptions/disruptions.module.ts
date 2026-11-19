import { Module } from '@nestjs/common';
import { DisruptionsController } from './disruptions.controller.js';
import { DisruptionsService } from './disruptions.service.js';
import { DatabaseModule } from '../database/database.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [DatabaseModule, AuthorizationModule, AuditModule, AuthModule],
  controllers: [DisruptionsController],
  providers: [DisruptionsService],
  exports: [DisruptionsService],
})
export class DisruptionsModule {}

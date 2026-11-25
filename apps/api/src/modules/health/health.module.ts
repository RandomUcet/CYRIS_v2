import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';
import { MaintenanceController } from './maintenance.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { AuditModule } from '../audit/audit.module.js';

@Module({
  imports:[AuthModule,AuthorizationModule,AuditModule],
  controllers: [HealthController,MaintenanceController],
  providers: [HealthService],
})
export class HealthModule {}

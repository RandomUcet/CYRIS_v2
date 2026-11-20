import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ServiceAvailabilityInterceptor } from './service-availability.interceptor.js';
import { DisruptionsController, ServiceStatusController } from './disruptions.controller.js';
import { DisruptionsService } from './disruptions.service.js';
import { DatabaseModule } from '../database/database.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [DatabaseModule, AuthorizationModule, AuditModule, AuthModule],
  controllers: [DisruptionsController, ServiceStatusController],
  providers: [DisruptionsService, { provide: APP_INTERCEPTOR, useClass: ServiceAvailabilityInterceptor }],
  exports: [DisruptionsService],
})
export class DisruptionsModule {}

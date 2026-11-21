import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { DatabaseModule } from '../database/database.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { OperationalHoldsController, OperationalHoldCurrentController } from './operational-holds.controller.js';
import { OperationalHoldsService } from './operational-holds.service.js';
import { OperationalHoldsInterceptor } from './operational-holds.interceptor.js';

@Module({
  imports: [DatabaseModule, AuthorizationModule, AuditModule, AuthModule],
  controllers: [OperationalHoldsController, OperationalHoldCurrentController],
  providers: [OperationalHoldsService, { provide: APP_INTERCEPTOR, useClass: OperationalHoldsInterceptor }],
  exports: [OperationalHoldsService],
})
export class OperationalHoldsModule {}

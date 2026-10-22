import { Module, Global } from '@nestjs/common';
import { IntegrationSecretService } from './integration-secret.service.js';
import { IdentityService } from './identity.service.js';
import { IdentityController } from './identity.controller.js';
import { DatabaseModule } from '../database/database.module.js';
import { ConfigModule } from '../config/config.module.js';
import { AuditModule } from '../audit/audit.module.js';

@Global()
@Module({
  imports: [DatabaseModule, ConfigModule, AuditModule],
  controllers: [IdentityController],
  providers: [IntegrationSecretService, IdentityService],
  exports: [IntegrationSecretService, IdentityService],
})
export class IntegrationsModule {}

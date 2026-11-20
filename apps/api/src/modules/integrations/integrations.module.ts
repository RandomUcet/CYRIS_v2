import { PlatformAdminsController } from './platform-admins.controller.js';
import { PlatformAdminsService } from './platform-admins.service.js';
import { Module, Global } from '@nestjs/common';
import { IntegrationSecretService } from './integration-secret.service.js';
import { IdentityService } from './identity.service.js';
import { IdentityController } from './identity.controller.js';
import { LdapTeamsController } from './ldap-teams.controller.js';
import { LdapTeamsService } from './ldap-teams.service.js';
import { DatabaseModule } from '../database/database.module.js';
import { ConfigModule } from '../config/config.module.js';
import { AuditModule } from '../audit/audit.module.js';

@Global()
@Module({
  imports: [DatabaseModule, ConfigModule, AuditModule],
  controllers: [IdentityController, LdapTeamsController, PlatformAdminsController],
  providers: [IntegrationSecretService, IdentityService, LdapTeamsService, PlatformAdminsService],
  exports: [IntegrationSecretService, IdentityService],
})
export class IntegrationsModule {}

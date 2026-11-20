import { Global, Module } from '@nestjs/common';
import { PreviewAccessController } from './preview-access.controller.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SessionService } from './session.service.js';
import { LocalIdentityProvider } from './providers/local-identity.provider.js';
import { LdapIdentityProvider } from './providers/ldap-identity.provider.js';
import { OidcIdentityProvider } from './providers/oidc-identity.provider.js';
import { AuthGuard } from './guards/auth.guard.js';
import { RateLimitService } from './rate-limit.service.js';
import { ViewAsService } from './view-as.service.js';
import { ViewAsController } from './view-as.controller.js';

@Global()
@Module({
  controllers: [AuthController, ViewAsController, PreviewAccessController],
  providers: [
    AuthService,
    SessionService,
    RateLimitService,
    LocalIdentityProvider,
    LdapIdentityProvider,
    OidcIdentityProvider,
    AuthGuard,
    ViewAsService,
  ],
  exports: [AuthService, SessionService, ViewAsService, RateLimitService, LocalIdentityProvider, LdapIdentityProvider, OidcIdentityProvider, AuthGuard],
})
export class AuthModule {}

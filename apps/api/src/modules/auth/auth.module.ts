import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SessionService } from './session.service.js';
import { LocalIdentityProvider } from './providers/local-identity.provider.js';
import { LdapIdentityProvider } from './providers/ldap-identity.provider.js';
import { OidcIdentityProvider } from './providers/oidc-identity.provider.js';
import { AuthGuard } from './guards/auth.guard.js';
import { RateLimitService } from './rate-limit.service.js';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    RateLimitService,
    LocalIdentityProvider,
    LdapIdentityProvider,
    OidcIdentityProvider,
    AuthGuard,
  ],
  exports: [AuthService, SessionService, RateLimitService, LocalIdentityProvider, LdapIdentityProvider, OidcIdentityProvider, AuthGuard],
})
export class AuthModule {}

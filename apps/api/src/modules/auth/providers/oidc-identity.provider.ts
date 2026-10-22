import { Injectable, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import * as jose from 'jose';
import { eq, and } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service.js';
import { IntegrationSecretService } from '../../integrations/integration-secret.service.js';
import { QueueService } from '../../queue/queue.service.js';
import { ConfigService } from '../../config/config.service.js';
import {
  users,
  userIdentities,
  integrations,
  IntegrationCategory,
  IdentityProviderType,
  UserStatus,
} from '@cyris/db';
import { generateId } from '@cyris/shared';
import type { IIdentityProvider, AuthenticatedIdentity } from './identity-provider.interface.js';
import type { OidcConfig } from '@cyris/contracts';

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface OidcAuthRequest {
  providerId: string;
  code: string;
  state: string;
}

@Injectable()
export class OidcIdentityProvider implements IIdentityProvider {
  readonly type = IdentityProviderType.OIDC;
  private readonly logger = new Logger(OidcIdentityProvider.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly secretService: IntegrationSecretService,
    private readonly queueService: QueueService,
    private readonly configService: ConfigService
  ) {}

  private get redis() {
    return this.queueService.client;
  }

  /**
   * Generates authorization URL, state, nonce, and PKCE challenge.
   */
  async generateAuthorizationUrl(providerId: string): Promise<{ authorizationUrl: string; state: string }> {
    const db = this.databaseService.client;
    const [providerRow] = await db
      .select()
      .from(integrations)
      .where(
        and(
          eq(integrations.id, providerId),
          eq(integrations.category, IntegrationCategory.OIDC),
          eq(integrations.enabled, true)
        )
      )
      .limit(1);

    if (!providerRow) {
      throw new BadRequestException(`OIDC provider '${providerId}' not found or disabled`);
    }

    const config = providerRow.config as OidcConfig;
    const state = randomBytes(24).toString('hex');
    const nonce = randomBytes(24).toString('hex');
    const codeVerifier = base64UrlEncode(randomBytes(32));
    const codeChallenge = base64UrlEncode(createHash('sha256').update(codeVerifier).digest());

    // Store state with 10m TTL in Redis
    const stateKey = `oidc:state:${state}`;
    await this.redis.set(
      stateKey,
      JSON.stringify({
        providerId,
        nonce,
        codeVerifier,
      }),
      'EX',
      600
    );

    // Discover or construct auth endpoint
    const issuer = config.issuerUrl.replace(/\/$/, '');
    let authorizationEndpoint = `${issuer}/protocol/openid-connect/auth`;
    try {
      const discoRes = await fetch(`${issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(3000) });
      if (discoRes.ok) {
        const disco = (await discoRes.json()) as any;
        if (disco.authorization_endpoint) {
          authorizationEndpoint = disco.authorization_endpoint;
        }
      }
    } catch {
      // Fallback to standard constructed endpoint
    }

    const publicBaseUrl = this.configService.values.PUBLIC_WEB_URL || 'http://localhost:3000';
    const redirectUri = `${publicBaseUrl}/api/auth/oidc/${providerId}/callback`;

    const scopes = (config.scopes || ['openid', 'profile', 'email']).join(' ');
    const params = new URLSearchParams({
      client_id: config.clientId,
      response_type: 'code',
      scope: scopes,
      redirect_uri: redirectUri,
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return {
      authorizationUrl: `${authorizationEndpoint}?${params.toString()}`,
      state,
    };
  }

  /**
   * Authenticates user via OIDC authorization code and state validation.
   */
  async authenticate(credentials: unknown): Promise<AuthenticatedIdentity | null> {
    const creds = credentials as OidcAuthRequest;
    if (!creds?.providerId || !creds?.code || !creds?.state) {
      return null;
    }

    // 1. Validate state from Redis (single-use)
    const stateKey = `oidc:state:${creds.state}`;
    const rawState = await this.redis.get(stateKey);
    if (!rawState) {
      this.logger.warn(`OIDC authentication rejected: invalid or expired state`);
      return null;
    }
    await this.redis.del(stateKey);

    const { providerId, nonce, codeVerifier } = JSON.parse(rawState);
    if (providerId !== creds.providerId) {
      this.logger.warn(`OIDC state providerId mismatch`);
      return null;
    }

    const db = this.databaseService.client;
    const [providerRow] = await db
      .select()
      .from(integrations)
      .where(
        and(
          eq(integrations.id, providerId),
          eq(integrations.category, IntegrationCategory.OIDC),
          eq(integrations.enabled, true)
        )
      )
      .limit(1);

    if (!providerRow) {
      this.logger.warn(`OIDC provider not found: ${providerId}`);
      return null;
    }

    const config = providerRow.config as OidcConfig;
    const clientSecret = await this.secretService.getSecret(providerId, 'CLIENT_SECRET');

    // 2. Discover token & userinfo endpoints
    const issuer = config.issuerUrl.replace(/\/$/, '');
    let tokenEndpoint = `${issuer}/protocol/openid-connect/token`;
    let userinfoEndpoint = `${issuer}/protocol/openid-connect/userinfo`;

    try {
      const discoRes = await fetch(`${issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(3000) });
      if (discoRes.ok) {
        const disco = (await discoRes.json()) as any;
        if (disco.token_endpoint) tokenEndpoint = disco.token_endpoint;
        if (disco.userinfo_endpoint) userinfoEndpoint = disco.userinfo_endpoint;
      }
    } catch {
      // Continue with default endpoints
    }

    const publicBaseUrl = this.configService.values.PUBLIC_WEB_URL || 'http://localhost:3000';
    const redirectUri = `${publicBaseUrl}/api/auth/oidc/${providerId}/callback`;

    // 3. Exchange code for tokens
    try {
      const tokenParams = new URLSearchParams({
        grant_type: 'authorization_code',
        code: creds.code,
        redirect_uri: redirectUri,
        client_id: config.clientId,
        code_verifier: codeVerifier,
      });

      if (clientSecret) {
        tokenParams.append('client_secret', clientSecret);
      }

      const tokenRes = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams.toString(),
        signal: AbortSignal.timeout(5000),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        this.logger.warn(`OIDC token exchange failed: ${tokenRes.status} ${errText}`);
        return null;
      }

      const tokenData = (await tokenRes.json()) as any;
      let subject: string | undefined;
      let email: string | undefined;
      let displayName: string | undefined;

      // 4. Verify ID Token claims if present
      if (tokenData.id_token) {
        const claims = jose.decodeJwt(tokenData.id_token);
        subject = String(claims.sub ?? '');
        email = (claims[config.claimMappings?.email ?? 'email'] as string) || undefined;
        displayName = (claims[config.claimMappings?.displayName ?? 'name'] as string) || undefined;
      }

      // 5. Query userinfo endpoint if email or subject missing
      if ((!email || !subject) && tokenData.access_token) {
        const userinfoRes = await fetch(userinfoEndpoint, {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
          signal: AbortSignal.timeout(5000),
        });
        if (userinfoRes.ok) {
          const userinfo = (await userinfoRes.json()) as any;
          if (!subject) subject = String(userinfo.sub ?? '');
          if (!email) email = userinfo[config.claimMappings?.email ?? 'email'];
          if (!displayName) displayName = userinfo[config.claimMappings?.displayName ?? 'name'];
        }
      }

      if (!subject) {
        this.logger.warn('OIDC authentication failed: missing subject identifier');
        return null;
      }

      const finalEmail = (email || `${subject}@oidc.local`).trim().toLowerCase();
      const finalDisplayName = (displayName || subject).trim();

      // Email domain filter check
      if (config.allowedEmailDomains && config.allowedEmailDomains.length > 0) {
        const domain = finalEmail.split('@')[1];
        if (!domain || !config.allowedEmailDomains.includes(domain)) {
          this.logger.warn(`OIDC login rejected: email domain '${domain}' not in allowed list`);
          return null;
        }
      }

      // 6. Identity Resolution & Controlled JIT Provisioning
      const normalizedSubject = subject.trim();
      const [existingIdentity] = await db
        .select({
          identity: userIdentities,
          user: users,
        })
        .from(userIdentities)
        .innerJoin(users, eq(userIdentities.userId, users.id))
        .where(
          and(
            eq(userIdentities.providerType, IdentityProviderType.OIDC),
            eq(userIdentities.providerSubject, normalizedSubject)
          )
        )
        .limit(1);

      if (existingIdentity) {
        if (existingIdentity.user.status !== UserStatus.ACTIVE) {
          this.logger.warn(`OIDC login denied: user account is disabled`);
          return null;
        }

        await db
          .update(users)
          .set({ lastLoginAt: new Date(), updatedAt: new Date() })
          .where(eq(users.id, existingIdentity.user.id));

        return {
          userId: existingIdentity.user.id,
          identityId: existingIdentity.identity.id,
          providerType: IdentityProviderType.OIDC,
          providerSubject: existingIdentity.identity.providerSubject,
        };
      }

      // Check JIT provisioning policy
      if (config.jitEnabled === false) {
        this.logger.warn(`OIDC user ${normalizedSubject} authenticated, but JIT provisioning is disabled`);
        return null;
      }

      // Conservative Identity Linking
      let targetUserId: string;
      const [existingUserByEmail] = await db
        .select()
        .from(users)
        .where(eq(users.email, finalEmail))
        .limit(1);

      if (existingUserByEmail) {
        targetUserId = existingUserByEmail.id;
      } else {
        const [newUser] = await db
          .insert(users)
          .values({
            id: generateId(),
            email: finalEmail,
            displayName: finalDisplayName,
            status: UserStatus.ACTIVE,
            lastLoginAt: new Date(),
          })
          .returning();
        targetUserId = newUser.id;
      }

      const identityId = generateId();
      await db.insert(userIdentities).values({
        id: identityId,
        userId: targetUserId,
        providerType: IdentityProviderType.OIDC,
        providerSubject: normalizedSubject,
        metadata: {
          providerId,
          issuer: config.issuerUrl,
        },
      });

      return {
        userId: targetUserId,
        identityId,
        providerType: IdentityProviderType.OIDC,
        providerSubject: normalizedSubject,
      };
    } catch (err) {
      // Safe error boundary: Unreachable / DNS failure never breaks local login
      this.logger.warn(`OIDC authentication failure: ${(err as Error).message}`);
      return null;
    }
  }
}

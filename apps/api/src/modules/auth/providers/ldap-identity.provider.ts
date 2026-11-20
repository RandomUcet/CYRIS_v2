import { Injectable, Logger } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import { eq, and, or, sql } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service.js';
import { IntegrationSecretService } from '../../integrations/integration-secret.service.js';
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
import { validateLdapConfig, type LdapConfig } from '@cyris/contracts';
import { authenticateDirectoryUser, ldapIdentitySubject } from './ldap-directory.js';
import { reconcileLdapMemberships } from './ldap-provisioning.js';

export interface LdapCredentials {
  providerId?: string;
  username: string;
  password: string;
}

@Injectable()
export class LdapIdentityProvider implements IIdentityProvider {
  readonly type = IdentityProviderType.LDAP;
  private readonly logger = new Logger(LdapIdentityProvider.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly secretService: IntegrationSecretService
  ) {}

  protected authenticateDirectory(config: LdapConfig, username: string, password: string, bindPassword: string) {
    return authenticateDirectoryUser(config, username, password, bindPassword);
  }

  /**
   * Authenticates user against configured LDAP / Active Directory directory.
   * If LDAP is down, timeout, or malformed, it fails safely without crashing API or impacting LOCAL login.
   */
  async authenticate(credentials: unknown): Promise<AuthenticatedIdentity | null> {
    const creds = credentials as LdapCredentials;
    if (!creds?.username || !creds?.password) {
      return null;
    }

    const db = this.databaseService.client;

    // 1. Locate enabled LDAP provider configuration
    let providerRow;
    if (creds.providerId) {
      [providerRow] = await db
        .select()
        .from(integrations)
        .where(
          and(
            eq(integrations.id, creds.providerId),
            eq(integrations.category, IntegrationCategory.LDAP),
            eq(integrations.enabled, true)
          )
        )
        .limit(1);
    } else {
      [providerRow] = await db
        .select()
        .from(integrations)
        .where(
          and(
            eq(integrations.category, IntegrationCategory.LDAP),
            eq(integrations.enabled, true)
          )
        )
        .limit(1);
    }

    if (!providerRow) {
      this.logger.debug('LDAP auth skipped: no enabled LDAP provider found');
      return null;
    }

    const config = providerRow.config as LdapConfig;
    if (validateLdapConfig(config).length > 0) {
      this.logger.warn(`LDAP auth denied: invalid provider configuration ${providerRow.id}`);
      return null;
    }
    let bindPassword = '';
    try {
      bindPassword = (await this.secretService.getSecret(providerRow.id, 'BIND_PASSWORD')) ?? '';
    } catch (err) {
      this.logger.warn(`LDAP login denied: bind secret unavailable for provider ${providerRow.id}`);
      return null;
    }

    if (!bindPassword) {
      this.logger.warn(`LDAP login denied: configure a bind secret for provider ${providerRow.id}`);
      return null;
    }
    try {
      const directoryUser = await this.authenticateDirectory(config, creds.username, creds.password, bindPassword);
      if (!directoryUser) return null;
      const { dn: userDn, email: userEmail, displayName: userDisplayName, groups: userGroups, groupDns = [] } = directoryUser;
      const normalizedSubject = userDn.toLowerCase();
      const scopedSubject = ldapIdentitySubject(providerRow.id, userDn);

      return await db.transaction(async (tx) => {
        // Two simultaneous first logins must resolve to the same identity.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${scopedSubject}, 0))`);
        const [provider] = await tx.select({ config: integrations.config }).from(integrations)
          .where(and(eq(integrations.id, providerRow.id), eq(integrations.category, 'LDAP'), eq(integrations.enabled, true)))
          .limit(1).for('share');
        if (!provider || !isDeepStrictEqual(provider.config, providerRow.config)) return null;

        const [existing] = await tx.select({ identityId: userIdentities.id, userId: userIdentities.userId })
          .from(userIdentities).where(and(eq(userIdentities.providerType, 'LDAP'), or(
            eq(userIdentities.providerSubject, scopedSubject),
            and(eq(userIdentities.providerSubject, normalizedSubject), sql`${userIdentities.metadata}->>'providerId' = ${providerRow.id}`),
          ))).limit(1);
        if (existing) {
          const [user] = await tx.select({ status: users.status }).from(users).where(eq(users.id, existing.userId)).for('update');
          if (user?.status !== UserStatus.ACTIVE) return null;
          const [identity] = await tx.select().from(userIdentities).where(eq(userIdentities.id, existing.identityId)).for('update');
          if (!identity) return null;
          await reconcileLdapMemberships(tx, identity.id, existing.userId, providerRow.id, config.groupMappings ?? [],
            userGroups, { ...(identity.metadata ?? {}), groupDns });
          await tx.update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, existing.userId));
          return { userId: existing.userId, identityId: identity.id, providerType: IdentityProviderType.LDAP,
            providerSubject: identity.providerSubject };
        }

        if (config.jitEnabled === false) return null;
        // Directory email alone cannot associate an existing account with this provider.
        const email = userEmail.trim().toLowerCase();
        const [userWithEmail] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
        if (userWithEmail) {
          this.logger.warn(`LDAP provisioning denied: email is already associated with an account (provider ${providerRow.id})`);
          return null;
        }
        const [user] = await tx.insert(users).values({
          id: generateId(), email, displayName: userDisplayName, status: UserStatus.ACTIVE, lastLoginAt: new Date(),
        }).returning({ id: users.id });
        const identityId = generateId();
        const metadata = { groups: userGroups, groupDns, providerId: providerRow.id };
        await tx.insert(userIdentities).values({
          id: identityId, userId: user.id, providerType: IdentityProviderType.LDAP, providerSubject: scopedSubject, metadata,
        });
        await reconcileLdapMemberships(tx, identityId, user.id, providerRow.id, config.groupMappings ?? [], userGroups, metadata);
        return { userId: user.id, identityId, providerType: IdentityProviderType.LDAP, providerSubject: scopedSubject };
      });
    } catch (ldapErr) {
      // Comprehensive error boundary: Unreachable / DNS failure / timeout never breaks local login
      // LDAP errors can contain directory filters or DNs; do not log raw server errors.
      this.logger.warn(`LDAP authentication failed for provider ${providerRow.id}`);
      return null;
    }
  }
}

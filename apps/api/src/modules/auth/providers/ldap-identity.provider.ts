import { Injectable, Logger } from '@nestjs/common';
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
      const { dn: userDn, email: userEmail, displayName: userDisplayName, groups: userGroups } = directoryUser;
      const normalizedSubject = userDn.toLowerCase();
      const scopedSubject = ldapIdentitySubject(providerRow.id, userDn);

      const [existingIdentity] = await db
        .select({
          identity: userIdentities,
          user: users,
        })
        .from(userIdentities)
        .innerJoin(users, eq(userIdentities.userId, users.id))
        .where(
          and(
            eq(userIdentities.providerType, IdentityProviderType.LDAP),
            or(
              eq(userIdentities.providerSubject, scopedSubject),
              and(
                eq(userIdentities.providerSubject, normalizedSubject),
                sql`${userIdentities.metadata}->>'providerId' = ${providerRow.id}`,
              ),
            )
          )
        )
        .limit(1);

      if (existingIdentity) {
        if (existingIdentity.user.status !== UserStatus.ACTIVE) {
          this.logger.warn(`LDAP login denied: user account is disabled`);
          return null;
        }

        await db.transaction(async (tx) => {
          await tx.select({ id: users.id }).from(users).where(eq(users.id, existingIdentity.user.id)).for('update');
          const [identity] = await tx.select().from(userIdentities).where(eq(userIdentities.id, existingIdentity.identity.id)).for('update');
          await reconcileLdapMemberships(tx, identity.id, existingIdentity.user.id, providerRow.id,
            config.groupMappings ?? [], userGroups, (identity.metadata ?? {}) as Record<string, unknown>);
          await tx.update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, existingIdentity.user.id));
        });

        return {
          userId: existingIdentity.user.id,
          identityId: existingIdentity.identity.id,
          providerType: IdentityProviderType.LDAP,
          providerSubject: existingIdentity.identity.providerSubject,
        };
      }

      // JIT Provisioning Policy Check
      if (config.jitEnabled === false) {
        this.logger.warn(`LDAP login denied: JIT provisioning is disabled for provider ${providerRow.id}`);
        return null;
      }

      return await db.transaction(async (tx) => {
        // Directory email is not proof of ownership of an existing local account.
        // Existing associations are resolved only through a provider-scoped identity above.
        let targetUserId: string;
        const [existingUserByEmail] = await tx
          .select()
          .from(users)
          .where(eq(users.email, userEmail.trim().toLowerCase()))
          .limit(1);

        if (existingUserByEmail) {
          this.logger.warn(`LDAP provisioning denied: existing account needs an administrator-managed identity association (provider ${providerRow.id})`);
          return null;
        } else {
          const [newUser] = await tx
            .insert(users)
            .values({
              id: generateId(),
              email: userEmail.trim().toLowerCase(),
              displayName: userDisplayName,
              status: UserStatus.ACTIVE,
              lastLoginAt: new Date(),
            })
            .returning();
          targetUserId = newUser.id;
        }

        const identityId = generateId();
        await tx.insert(userIdentities).values({
          id: identityId,
          userId: targetUserId,
          providerType: IdentityProviderType.LDAP,
          providerSubject: scopedSubject,
          metadata: {
            groups: userGroups,
            providerId: providerRow.id,
          },
        });

        await reconcileLdapMemberships(tx, identityId, targetUserId, providerRow.id,
          config.groupMappings ?? [], userGroups, { providerId: providerRow.id, groups: userGroups });

        return {
          userId: targetUserId,
          identityId,
          providerType: IdentityProviderType.LDAP,
          providerSubject: scopedSubject,
        };
      });
    } catch (ldapErr) {
      // Comprehensive error boundary: Unreachable / DNS failure / timeout never breaks local login
      // LDAP errors can contain directory filters or DNs; do not log raw server errors.
      this.logger.warn(`LDAP authentication failed for provider ${providerRow.id}`);
      return null;
    }
  }
}

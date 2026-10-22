import { Injectable, Logger } from '@nestjs/common';
import { Client } from 'ldapts';
import { eq, and } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service.js';
import { IntegrationSecretService } from '../../integrations/integration-secret.service.js';
import {
  users,
  userIdentities,
  integrations,
  IntegrationCategory,
  IdentityProviderType,
  UserStatus,
  roles,
  roleAssignments,
} from '@cyris/db';
import { generateId } from '@cyris/shared';
import type { IIdentityProvider, AuthenticatedIdentity } from './identity-provider.interface.js';
import type { LdapConfig } from '@cyris/contracts';

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
    let bindPassword = '';
    try {
      bindPassword = (await this.secretService.getSecret(providerRow.id, 'BIND_PASSWORD')) ?? '';
    } catch (err) {
      this.logger.warn(`Could not decrypt bind password for provider ${providerRow.id}: ${(err as Error).message}`);
    }

    // 2. Connect to LDAP directory with safe error boundary
    const client = new Client({
      url: config.url,
      timeout: 5000,
      connectTimeout: 5000,
      tlsOptions: config.tls ? { rejectUnauthorized: false } : undefined,
    });

    try {
      // 3. Service account bind
      if (config.bindDn && bindPassword) {
        await client.bind(config.bindDn, bindPassword);
      }

      // 4. Search for user entry
      const safeUsername = creds.username.replace(/[\\*()\0]/g, (c) => `\\${c.charCodeAt(0).toString(16)}`);
      const filter = (config.userFilter || '(uid={username})').replace('{username}', safeUsername);

      const usernameAttr = config.usernameAttr || 'uid';
      const emailAttr = config.emailAttr || 'mail';
      const displayNameAttr = config.displayNameAttr || 'cn';

      const searchResult = await client.search(config.baseDn, {
        scope: 'sub',
        filter,
        attributes: ['dn', usernameAttr, emailAttr, displayNameAttr],
        sizeLimit: 2,
      });

      if (!searchResult.searchEntries || searchResult.searchEntries.length === 0) {
        this.logger.debug(`LDAP user not found with filter: ${filter}`);
        await client.unbind().catch(() => {});
        return null;
      }

      const userEntry = searchResult.searchEntries[0];
      const userDn = userEntry.dn;
      const userEmail = (userEntry[emailAttr] as string) || `${creds.username}@ldap.local`;
      const userDisplayName = (userEntry[displayNameAttr] as string) || creds.username;

      // 5. Authenticate user credentials by binding user's DN
      const userClient = new Client({
        url: config.url,
        timeout: 5000,
        connectTimeout: 5000,
        tlsOptions: config.tls ? { rejectUnauthorized: false } : undefined,
      });

      try {
        await userClient.bind(userDn, creds.password);
        await userClient.unbind().catch(() => {});
      } catch (bindErr) {
        this.logger.debug(`LDAP user authentication failed for DN: ${userDn}`);
        await client.unbind().catch(() => {});
        return null;
      }

      // 6. Query user groups if groupBaseDn configured
      const userGroups: string[] = [];
      if (config.groupBaseDn) {
        try {
          const groupFilter = config.groupFilter
            ? config.groupFilter.replace('{dn}', userDn).replace('{username}', safeUsername)
            : `(|(member=${userDn})(memberUid=${safeUsername}))`;

          const groupSearch = await client.search(config.groupBaseDn, {
            scope: 'sub',
            filter: groupFilter,
            attributes: ['cn'],
          });

          for (const ge of groupSearch.searchEntries) {
            if (ge.cn) userGroups.push(String(ge.cn));
          }
        } catch (groupErr) {
          this.logger.warn(`Failed to resolve LDAP groups: ${(groupErr as Error).message}`);
        }
      }

      await client.unbind().catch(() => {});

      // 7. Resolve CYRIS User Identity or Perform Controlled JIT Provisioning
      const normalizedSubject = userDn.toLowerCase();

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
            eq(userIdentities.providerSubject, normalizedSubject)
          )
        )
        .limit(1);

      if (existingIdentity) {
        if (existingIdentity.user.status !== UserStatus.ACTIVE) {
          this.logger.warn(`LDAP login denied: user account is disabled`);
          return null;
        }

        await db
          .update(users)
          .set({ lastLoginAt: new Date(), updatedAt: new Date() })
          .where(eq(users.id, existingIdentity.user.id));

        return {
          userId: existingIdentity.user.id,
          identityId: existingIdentity.identity.id,
          providerType: IdentityProviderType.LDAP,
          providerSubject: existingIdentity.identity.providerSubject,
        };
      }

      // JIT Provisioning Policy Check
      if (config.jitEnabled === false) {
        this.logger.warn(`LDAP user ${normalizedSubject} authenticated, but JIT provisioning is disabled for provider`);
        return null;
      }

      // Conservative Identity Linking
      let targetUserId: string;
      const [existingUserByEmail] = await db
        .select()
        .from(users)
        .where(eq(users.email, userEmail.trim().toLowerCase()))
        .limit(1);

      if (existingUserByEmail) {
        targetUserId = existingUserByEmail.id;
      } else {
        const [newUser] = await db
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
      await db.insert(userIdentities).values({
        id: identityId,
        userId: targetUserId,
        providerType: IdentityProviderType.LDAP,
        providerSubject: normalizedSubject,
        metadata: {
          groups: userGroups,
          providerId: providerRow.id,
        },
      });

      // Apply LDAP group to role mappings if defined
      if (config.groupMappings && config.groupMappings.length > 0 && userGroups.length > 0) {
        for (const mapping of config.groupMappings) {
          if (userGroups.includes(mapping.ldapGroup)) {
            const [roleRow] = await db
              .select({ id: roles.id })
              .from(roles)
              .where(eq(roles.slug, mapping.roleSlug))
              .limit(1);

            if (roleRow) {
              await db
                .insert(roleAssignments)
                .values({
                  id: generateId(),
                  userId: targetUserId,
                  roleId: roleRow.id,
                })
                .onConflictDoNothing();
            }
          }
        }
      }

      return {
        userId: targetUserId,
        identityId,
        providerType: IdentityProviderType.LDAP,
        providerSubject: normalizedSubject,
      };
    } catch (ldapErr) {
      // Comprehensive error boundary: Unreachable / DNS failure / timeout never breaks local login
      this.logger.warn(`LDAP authentication error: ${(ldapErr as Error).message}`);
      await client.unbind().catch(() => {});
      return null;
    }
  }
}

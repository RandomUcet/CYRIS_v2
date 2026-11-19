import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { IntegrationSecretService } from './integration-secret.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  integrations,
  integrationSecrets,
  IntegrationCategory,
  IntegrationStatus,
} from '@cyris/db';
import { generateId } from '@cyris/shared';
import type {
  LdapConfig,
  OidcConfig,
  IdentityProviderSummary,
} from '@cyris/contracts';
import { validateLdapConfig } from '@cyris/contracts';

@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly secretService: IntegrationSecretService,
    private readonly auditService: AuditService
  ) {}

  /**
   * Lists all configured identity providers with secrets redacted.
   */
  async listProviders(): Promise<IdentityProviderSummary[]> {
    const db = this.databaseService.client;
    const rows = await db
      .select()
      .from(integrations)
      .where(
        eq(integrations.category, IntegrationCategory.LDAP)
      );

    const oidcRows = await db
      .select()
      .from(integrations)
      .where(
        eq(integrations.category, IntegrationCategory.OIDC)
      );

    const allRows = [...rows, ...oidcRows];

    const results: IdentityProviderSummary[] = [];
    for (const row of allRows) {
      const hasSecret = await this.secretService.hasSecret(
        row.id,
        row.category === IntegrationCategory.LDAP ? 'BIND_PASSWORD' : 'CLIENT_SECRET'
      );

      const safeConfig = { ...(row.config as Record<string, any>) };
      delete safeConfig.bindPassword;
      delete safeConfig.clientSecret;

      results.push({
        id: row.id,
        name: row.name,
        category: row.category as 'LDAP' | 'OIDC',
        enabled: row.enabled,
        status: row.status,
        config: safeConfig,
        hasSecretConfigured: hasSecret,
        lastCheckedAt: row.lastCheckedAt ? row.lastCheckedAt.toISOString() : null,
        lastError: row.lastError,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      });
    }

    return results;
  }

  /**
   * Lists active identity providers suitable for public login display.
   */
  async listPublicProviders(): Promise<Array<{ id: string; name: string; category: string; displayName: string }>> {
    const all = await this.listProviders();
    return all
      .filter((p) => p.enabled)
      .map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        displayName: (p.config.displayName as string) || p.name,
      }));
  }

  /**
   * Retrieves a single provider configuration with secrets redacted.
   */
  async getProvider(id: string): Promise<IdentityProviderSummary> {
    const db = this.databaseService.client;
    const [row] = await db
      .select()
      .from(integrations)
      .where(eq(integrations.id, id))
      .limit(1);

    if (!row) {
      throw new NotFoundException(`Identity provider '${id}' not found`);
    }

    const hasSecret = await this.secretService.hasSecret(
      row.id,
      row.category === IntegrationCategory.LDAP ? 'BIND_PASSWORD' : 'CLIENT_SECRET'
    );

    const safeConfig = { ...(row.config as Record<string, any>) };
    delete safeConfig.bindPassword;
    delete safeConfig.clientSecret;

    return {
      id: row.id,
      name: row.name,
      category: row.category as 'LDAP' | 'OIDC',
      enabled: row.enabled,
      status: row.status,
      config: safeConfig,
      hasSecretConfigured: hasSecret,
      lastCheckedAt: row.lastCheckedAt ? row.lastCheckedAt.toISOString() : null,
      lastError: row.lastError,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /**
   * Configures or updates an LDAP/Active Directory provider.
   * Bind password is encrypted via IntegrationSecretService and never logged/stored plaintext.
   */
  async saveLdapProvider(
    id?: string,
    name?: string,
    config?: LdapConfig,
    bindPassword?: string,
    actorUserId?: string
  ): Promise<IdentityProviderSummary> {
    if (!name || !config) {
      throw new BadRequestException('Provider name and configuration are required');
    }
    const configErrors = validateLdapConfig(config);
    if (configErrors.length > 0) throw new BadRequestException(configErrors.join('; '));

    const db = this.databaseService.client;
    const providerId = id ?? generateId();
    const safeConfig = { ...config };
    delete (safeConfig as any).bindPassword;

    const now = new Date();

    if (id) {
      const [existing] = await db.select().from(integrations).where(eq(integrations.id, id)).limit(1);
      if (!existing) {
        throw new NotFoundException(`Provider '${id}' not found`);
      }

      await db
        .update(integrations)
        .set({
          name,
          config: safeConfig,
          status: IntegrationStatus.OPERATIONAL,
          updatedAt: now,
        })
        .where(eq(integrations.id, id));
    } else {
      await db.insert(integrations).values({
        id: providerId,
        name,
        category: IntegrationCategory.LDAP,
        providerType: 'LDAP_ACTIVE_DIRECTORY',
        enabled: true,
        status: IntegrationStatus.OPERATIONAL,
        config: safeConfig,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (bindPassword && bindPassword.trim().length > 0) {
      await this.secretService.setSecret(providerId, 'BIND_PASSWORD', bindPassword.trim(), actorUserId);
    }

    await this.auditService.record({
      action: id ? 'identity.provider.updated' : 'identity.provider.created',
      category: 'integrations',
      actorUserId,
      metadata: { providerId, category: 'LDAP', name },
    });

    return this.getProvider(providerId);
  }

  async testLdapProvider(id: string, transport: 'MOCK' = 'MOCK'): Promise<{
    ok: boolean;
    transport: 'MOCK';
    providerId: string;
    certificateVerification: 'ENFORCED';
    message: string;
  }> {
    if (transport !== 'MOCK') throw new BadRequestException('Only the bounded MOCK transport is available in this environment');
    const provider = await this.getProvider(id);
    if (provider.category !== 'LDAP') throw new BadRequestException('Provider is not LDAP');
    const config = provider.config as unknown as LdapConfig;
    const configErrors = validateLdapConfig(config);
    if (configErrors.length > 0) throw new BadRequestException(configErrors.join('; '));
    return {
      ok: true,
      transport: 'MOCK',
      providerId: id,
      certificateVerification: 'ENFORCED',
      message: 'Configuration validated; no network connection was attempted.',
    };
  }

  /**
   * Configures or updates an OpenID Connect provider.
   * Client secret is encrypted via IntegrationSecretService.
   */
  async saveOidcProvider(
    id?: string,
    name?: string,
    config?: OidcConfig,
    clientSecret?: string,
    actorUserId?: string
  ): Promise<IdentityProviderSummary> {
    if (!name || !config) {
      throw new BadRequestException('Provider name and configuration are required');
    }

    const db = this.databaseService.client;
    const providerId = id ?? generateId();
    const safeConfig = { ...config };
    delete (safeConfig as any).clientSecret;

    const now = new Date();

    if (id) {
      const [existing] = await db.select().from(integrations).where(eq(integrations.id, id)).limit(1);
      if (!existing) {
        throw new NotFoundException(`Provider '${id}' not found`);
      }

      await db
        .update(integrations)
        .set({
          name,
          config: safeConfig,
          status: IntegrationStatus.OPERATIONAL,
          updatedAt: now,
        })
        .where(eq(integrations.id, id));
    } else {
      await db.insert(integrations).values({
        id: providerId,
        name,
        category: IntegrationCategory.OIDC,
        providerType: 'GENERIC_OIDC',
        enabled: true,
        status: IntegrationStatus.OPERATIONAL,
        config: safeConfig,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (clientSecret && clientSecret.trim().length > 0) {
      await this.secretService.setSecret(providerId, 'CLIENT_SECRET', clientSecret.trim(), actorUserId);
    }

    await this.auditService.record({
      action: id ? 'identity.provider.updated' : 'identity.provider.created',
      category: 'integrations',
      actorUserId,
      metadata: { providerId, category: 'OIDC', name },
    });

    return this.getProvider(providerId);
  }

  /**
   * Toggles enabled status of identity provider.
   */
  async toggleProvider(id: string, enabled: boolean, actorUserId?: string): Promise<IdentityProviderSummary> {
    const db = this.databaseService.client;
    const [row] = await db.select().from(integrations).where(eq(integrations.id, id)).limit(1);
    if (!row) {
      throw new NotFoundException(`Provider '${id}' not found`);
    }

    await db
      .update(integrations)
      .set({ enabled, updatedAt: new Date() })
      .where(eq(integrations.id, id));

    await this.auditService.record({
      action: 'identity.provider.toggled',
      category: 'integrations',
      actorUserId,
      metadata: { providerId: id, enabled },
    });

    return this.getProvider(id);
  }

  /**
   * Deletes an identity provider and its encrypted secrets.
   */
  async deleteProvider(id: string, actorUserId?: string): Promise<void> {
    const db = this.databaseService.client;
    await db.delete(integrations).where(eq(integrations.id, id));

    await this.auditService.record({
      action: 'identity.provider.deleted',
      category: 'integrations',
      actorUserId,
      metadata: { providerId: id },
    });
  }
}

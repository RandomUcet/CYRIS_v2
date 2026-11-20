import {
  Controller, Get, Post, Put, Delete, Param, Body, UseGuards,
  NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { IntegrationSecretService } from '../integrations/integration-secret.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { Permissions, PermissionScopes, generateId } from '@cyris/shared';
import { integrations, IntegrationCategory, IntegrationStatus, AuditOutcome } from '@cyris/db';
import {
  CreateAIProviderRequestSchema, UpdateAIProviderRequestSchema, TestConnectionRequestSchema,
  AICapability, type AIProviderResponse, type TestConnectionResponse,
} from '@cyris/contracts';
import { OpenAICompatibleProvider } from './providers/openai-compatible.provider.js';
import { AIAdmissionService } from './ai-admission.service.js';

type Transaction = Parameters<Parameters<DatabaseService['client']['transaction']>[0]>[0];
type ProviderRow = typeof integrations.$inferSelect;

@Controller('admin/integrations/ai')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermission(Permissions.PLATFORM_MANAGE, PermissionScopes.PLATFORM)
export class AIAdminController {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly integrationSecretService: IntegrationSecretService,
    private readonly auditService: AuditService,
    private readonly admission: AIAdmissionService
  ) {}

  private async loadProvider(id: string, tx?: Transaction): Promise<ProviderRow> {
    const db = tx ?? this.databaseService.client;
    const [row] = await db.select().from(integrations)
      .where(and(eq(integrations.id, id), eq(integrations.category, IntegrationCategory.AI_PROVIDER)))
      .limit(1);
    if (!row) throw new NotFoundException(`AI provider '${id}' not found`);
    return row;
  }

  private async present(row: ProviderRow, tx?: Transaction): Promise<AIProviderResponse> {
    const config = (row.config ?? {}) as Record<string, unknown>;
    const capabilities: string[] = [AICapability.CHAT, AICapability.STREAM];
    if (config.embeddingModel) capabilities.push(AICapability.EMBED);
    return {
      id: row.id,
      name: row.name,
      providerType: row.providerType,
      systemProfile: row.systemProfile,
      enabled: row.enabled,
      status: row.status,
      endpoint: String(config.endpoint || ''),
      chatModel: String(config.chatModel || ''),
      embeddingEndpoint: config.embeddingEndpoint ? String(config.embeddingEndpoint) : null,
      embeddingModel: config.embeddingModel ? String(config.embeddingModel) : null,
      timeoutSeconds: Number(config.timeoutSeconds || 60),
      tlsVerify: config.tlsVerify !== false,
      hasApiKey: await this.integrationSecretService.hasSecret(row.id, 'API_KEY', tx),
      capabilities,
      lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
      lastError: row.lastError,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // Serialize provider selection even when no provider is enabled yet.
  private write<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.databaseService.client.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('cyris.ai.provider-selection'))`);
      return fn(tx);
    });
  }

  private async disableOtherProviders(tx: Transaction, selectedId: string): Promise<void> {
    await tx.update(integrations).set({ enabled: false, updatedAt: new Date() }).where(and(
      eq(integrations.category, IntegrationCategory.AI_PROVIDER),
      eq(integrations.enabled, true),
      ne(integrations.id, selectedId),
    ));
  }

  private async rejectSparkDuplicate(tx: Transaction, name?: string, endpoint?: string, model?: string): Promise<void> {
    const [spark] = await tx.select({ name: integrations.name, config: integrations.config }).from(integrations)
      .where(eq(integrations.systemProfile, 'DGX_SPARK')).limit(1);
    if (!spark) return;
    const config = spark.config as Record<string, unknown>;
    if (name?.trim().toLowerCase() === spark.name.toLowerCase() ||
        (endpoint?.replace(/\/+$/, '') === config.endpoint && model === config.chatModel)) {
      throw new ConflictException('Use the built-in CYRIS DGX Spark profile for this provider.');
    }
  }

  @Get()
  async listProviders(): Promise<AIProviderResponse[]> {
    const rows = await this.databaseService.client.select().from(integrations)
      .where(eq(integrations.category, IntegrationCategory.AI_PROVIDER))
      .orderBy(desc(sql`${integrations.systemProfile} IS NOT NULL`), desc(integrations.createdAt));
    return Promise.all(rows.map(row => this.present(row)));
  }

  @Get(':id')
  async getProvider(@Param('id') id: string): Promise<AIProviderResponse> {
    return this.present(await this.loadProvider(id));
  }

  @Post()
  async createProvider(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser): Promise<AIProviderResponse> {
    const parsed = CreateAIProviderRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.format());
    const { name, providerType, enabled, apiKey, endpoint, chatModel, embeddingEndpoint, embeddingModel, timeoutSeconds, tlsVerify } = parsed.data;
    const id = generateId();
    const config = { endpoint, chatModel, embeddingEndpoint: embeddingEndpoint ?? null, embeddingModel: embeddingModel || null, timeoutSeconds, tlsVerify };
    return this.write(async tx => {
      await this.rejectSparkDuplicate(tx, name, endpoint, chatModel);
      if (enabled) await this.disableOtherProviders(tx, id);
      const [row] = await tx.insert(integrations).values({
        id, name, category: IntegrationCategory.AI_PROVIDER, providerType, enabled,
        status: IntegrationStatus.NOT_CONFIGURED, config,
      }).returning();
      if (apiKey?.trim()) await this.integrationSecretService.setSecret(id, 'API_KEY', apiKey, user.id, tx);
      await this.auditService.record({
        txClient: tx, action: 'integration.provider.created', category: 'ADMIN', actorUserId: user.id,
        resourceType: 'integration', resourceId: id, outcome: AuditOutcome.SUCCESS,
        metadata: { name, category: IntegrationCategory.AI_PROVIDER, providerType, enabled, endpoint, chatModel, embeddingEndpoint: config.embeddingEndpoint },
      });
      return this.present(row!, tx);
    });
  }

  @Put(':id')
  async updateProvider(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser): Promise<AIProviderResponse> {
    const parsed = UpdateAIProviderRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.format());
    const data = parsed.data;
    return this.write(async tx => {
      const existing = await this.loadProvider(id, tx);
      if (existing.systemProfile && (typeof data.enabled !== 'boolean' || Object.keys(body as object).length !== 1)) {
        throw new ConflictException('The built-in Spark profile only accepts an enabled switch.');
      }

      const current = (existing.config ?? {}) as Record<string, unknown>;
      const newName = data.name ?? existing.name;
      const newConfig = { ...current };
      for (const key of ['endpoint', 'chatModel', 'embeddingEndpoint', 'embeddingModel', 'timeoutSeconds', 'tlsVerify'] as const) {
        if (data[key] !== undefined) newConfig[key] = data[key];
      }
      const nameChanged = newName !== existing.name;
      const modelChanged = newConfig.endpoint !== current.endpoint || newConfig.chatModel !== current.chatModel;
      if (nameChanged || modelChanged) {
        await this.rejectSparkDuplicate(tx, nameChanged ? newName : undefined,
          modelChanged ? String(newConfig.endpoint) : undefined, modelChanged ? String(newConfig.chatModel) : undefined);
      }
      if (data.enabled === true) await this.disableOtherProviders(tx, id);
      const [row] = await tx.update(integrations).set({
        name: newName, config: newConfig, enabled: data.enabled ?? existing.enabled, updatedAt: new Date(),
      }).where(eq(integrations.id, id)).returning();

      if (data.clearApiKey) await this.integrationSecretService.deleteSecret(id, 'API_KEY', user.id, tx);
      else if (data.apiKey?.trim()) await this.integrationSecretService.setSecret(id, 'API_KEY', data.apiKey, user.id, tx);
      await this.auditService.record({
        txClient: tx, action: 'integration.provider.updated', category: 'ADMIN', actorUserId: user.id,
        resourceType: 'integration', resourceId: id, outcome: AuditOutcome.SUCCESS,
        metadata: { providerId: id, name: newName, enabled: row!.enabled, clearedSecret: Boolean(data.clearApiKey), updatedSecret: Boolean(data.apiKey?.trim()) },
      });
      return this.present(row!, tx);
    });
  }

  @Delete(':id')
  async deleteProvider(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<{ success: boolean }> {
    return this.write(async tx => {
      const row = await this.loadProvider(id, tx);
      if (row.systemProfile) throw new ConflictException('The built-in Spark profile can be disabled.');
      await tx.delete(integrations).where(eq(integrations.id, id));
      await this.auditService.record({
        txClient: tx, action: 'integration.provider.deleted', category: 'ADMIN', actorUserId: user.id,
        resourceType: 'integration', resourceId: id, outcome: AuditOutcome.SUCCESS,
        metadata: { providerId: id, name: row.name },
      });
      return { success: true };
    });
  }

  @Post('test-connection')
  async testConnection(@Body() body: unknown, @CurrentUser() user?: AuthenticatedUser): Promise<TestConnectionResponse> {
    const parsed = TestConnectionRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.format());

    const req = parsed.data;
    const saved = req.providerId ? await this.loadProvider(req.providerId) : null;
    const savedOnly = Boolean(saved) && Object.keys(body as object).length === 1;
    if (saved?.systemProfile && !savedOnly) {
      throw new BadRequestException('Test the built-in Spark profile using its providerId.');
    }
    const config = (saved?.config ?? {}) as Record<string, unknown>;
    const endpoint = req.endpoint ?? String(config.endpoint || '');
    const chatModel = req.chatModel ?? String(config.chatModel || '');
    if (!endpoint || !chatModel) throw new BadRequestException('Endpoint and chatModel are required for connection testing');

    const embeddingEndpoint = req.embeddingEndpoint ?? (config.embeddingEndpoint ? String(config.embeddingEndpoint) : undefined);
    const embeddingModel = req.embeddingModel ?? (config.embeddingModel ? String(config.embeddingModel) : undefined);
    const tlsVerify = req.tlsVerify ?? config.tlsVerify !== false;
    const sameDestination = endpoint === config.endpoint &&
      (embeddingEndpoint ?? endpoint) === (config.embeddingEndpoint ?? config.endpoint) &&
      (tlsVerify || config.tlsVerify === false);
    let apiKey = req.apiKey;
    if (!apiKey && saved && sameDestination) apiKey = (await this.integrationSecretService.getSecret(saved.id, 'API_KEY')) ?? undefined;

    const provider = new OpenAICompatibleProvider({
      id: saved?.id ?? 'test-probe', name: saved?.name ?? 'Test Probe',
      endpoint, chatModel, embeddingEndpoint, embeddingModel, apiKey,
      timeoutSeconds: req.timeoutSeconds ?? Number(config.timeoutSeconds || (saved ? 60 : 15)), tlsVerify,
    });
    const result = await this.admission.run('regular', user?.id, 30_000, () => provider.testConnection());

    // A draft probe must never mark the saved deployment healthy. A settings change during a probe
    // also invalidates its result. A test of a disabled provider leaves the switch untouched.
    if (saved && savedOnly) {
      await this.databaseService.client.update(integrations)
        .set({ status: result.status, lastCheckedAt: new Date(), lastError: result.error ?? null })
        .where(and(eq(integrations.id, saved.id), eq(integrations.config, saved.config),
          sql`date_trunc('milliseconds', ${integrations.updatedAt}) = ${saved.updatedAt.toISOString()}::timestamptz`));
    }
    return result;
  }
}

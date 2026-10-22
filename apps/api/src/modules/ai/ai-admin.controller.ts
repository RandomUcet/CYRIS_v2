import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { IntegrationSecretService } from '../integrations/integration-secret.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { Permissions, PermissionScopes, generateId } from '@cyris/shared';
import {
  integrations,
  IntegrationCategory,
  IntegrationStatus,
  AuditOutcome,
} from '@cyris/db';
import {
  CreateAIProviderRequestSchema,
  UpdateAIProviderRequestSchema,
  TestConnectionRequestSchema,
  AICapability,
  type AIProviderResponse,
  type TestConnectionResponse,
} from '@cyris/contracts';
import { OpenAICompatibleProvider } from './providers/openai-compatible.provider.js';

@Controller('admin/integrations/ai')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermission(Permissions.PLATFORM_MANAGE, PermissionScopes.PLATFORM)
export class AIAdminController {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly integrationSecretService: IntegrationSecretService,
    private readonly auditService: AuditService
  ) {}

  @Get()
  async listProviders(): Promise<AIProviderResponse[]> {
    const db = this.databaseService.client;
    const rows = await db
      .select()
      .from(integrations)
      .where(eq(integrations.category, IntegrationCategory.AI_PROVIDER))
      .orderBy(desc(integrations.createdAt));

    const results: AIProviderResponse[] = [];
    for (const row of rows) {
      const hasApiKey = await this.integrationSecretService.hasSecret(row.id, 'API_KEY');
      const config = (row.config as Record<string, unknown>) || {};
      const capabilities: string[] = [AICapability.CHAT, AICapability.STREAM];
      if (config.embeddingModel) capabilities.push(AICapability.EMBED);

      results.push({
        id: row.id,
        name: row.name,
        providerType: row.providerType,
        enabled: row.enabled,
        status: row.status,
        endpoint: String(config.endpoint || ''),
        chatModel: String(config.chatModel || ''),
        embeddingEndpoint: config.embeddingEndpoint ? String(config.embeddingEndpoint) : null,
        embeddingModel: config.embeddingModel ? String(config.embeddingModel) : null,
        timeoutSeconds: Number(config.timeoutSeconds || 60),
        tlsVerify: config.tlsVerify !== false,
        hasApiKey,
        capabilities,
        lastCheckedAt: row.lastCheckedAt ? row.lastCheckedAt.toISOString() : null,
        lastError: row.lastError,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      });
    }

    return results;
  }

  @Post()
  async createProvider(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<AIProviderResponse> {
    const parsed = CreateAIProviderRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }

    const {
      name,
      providerType,
      enabled,
      endpoint,
      chatModel,
      embeddingEndpoint,
      embeddingModel,
      apiKey,
      timeoutSeconds,
      tlsVerify,
    } = parsed.data;

    const id = generateId();
    const config = {
      endpoint,
      chatModel,
      embeddingEndpoint: embeddingEndpoint || null,
      embeddingModel: embeddingModel || null,
      timeoutSeconds,
      tlsVerify,
    };

    const db = this.databaseService.client;

    // If this provider is being created as enabled, optionally disable other AI providers to keep 1 active
    if (enabled) {
      await db
        .update(integrations)
        .set({ enabled: false, updatedAt: new Date() })
        .where(eq(integrations.category, IntegrationCategory.AI_PROVIDER));
    }

    await db.insert(integrations).values({
      id,
      name,
      category: IntegrationCategory.AI_PROVIDER,
      providerType,
      enabled,
      status: IntegrationStatus.NOT_CONFIGURED,
      config,
    });

    if (apiKey && apiKey.trim().length > 0) {
      await this.integrationSecretService.setSecret(id, 'API_KEY', apiKey, user.id);
    }

    await this.auditService.record({
      action: 'integration.provider.created',
      category: 'ADMIN',
      actorUserId: user.id,
      resourceType: 'integration',
      resourceId: id,
      outcome: AuditOutcome.SUCCESS,
      metadata: {
        name,
        category: IntegrationCategory.AI_PROVIDER,
        providerType,
        enabled,
        endpoint,
        chatModel,
        embeddingEndpoint: embeddingEndpoint || null,
      },
    });

    return {
      id,
      name,
      providerType,
      enabled,
      status: IntegrationStatus.NOT_CONFIGURED,
      endpoint,
      chatModel,
      embeddingEndpoint: embeddingEndpoint || null,
      embeddingModel: embeddingModel || null,
      timeoutSeconds,
      tlsVerify,
      hasApiKey: Boolean(apiKey && apiKey.trim().length > 0),
      capabilities: embeddingModel
        ? [AICapability.CHAT, AICapability.STREAM, AICapability.EMBED]
        : [AICapability.CHAT, AICapability.STREAM],
      lastCheckedAt: null,
      lastError: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  @Get(':id')
  async getProvider(@Param('id') id: string): Promise<AIProviderResponse> {
    const db = this.databaseService.client;
    const [row] = await db
      .select()
      .from(integrations)
      .where(
        and(
          eq(integrations.id, id),
          eq(integrations.category, IntegrationCategory.AI_PROVIDER)
        )
      )
      .limit(1);

    if (!row) {
      throw new NotFoundException(`AI Provider '${id}' not found`);
    }

    const hasApiKey = await this.integrationSecretService.hasSecret(row.id, 'API_KEY');
    const config = (row.config as Record<string, unknown>) || {};
    const capabilities: string[] = [AICapability.CHAT, AICapability.STREAM];
    if (config.embeddingModel) capabilities.push(AICapability.EMBED);

    return {
      id: row.id,
      name: row.name,
      providerType: row.providerType,
      enabled: row.enabled,
      status: row.status,
      endpoint: String(config.endpoint || ''),
      chatModel: String(config.chatModel || ''),
      embeddingEndpoint: config.embeddingEndpoint ? String(config.embeddingEndpoint) : null,
      embeddingModel: config.embeddingModel ? String(config.embeddingModel) : null,
      timeoutSeconds: Number(config.timeoutSeconds || 60),
      tlsVerify: config.tlsVerify !== false,
      hasApiKey,
      capabilities,
      lastCheckedAt: row.lastCheckedAt ? row.lastCheckedAt.toISOString() : null,
      lastError: row.lastError,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  @Put(':id')
  async updateProvider(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<AIProviderResponse> {
    const parsed = UpdateAIProviderRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }

    const db = this.databaseService.client;
    const [existing] = await db
      .select()
      .from(integrations)
      .where(
        and(
          eq(integrations.id, id),
          eq(integrations.category, IntegrationCategory.AI_PROVIDER)
        )
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`AI Provider '${id}' not found`);
    }

    const data = parsed.data;
    const currentConfig = (existing.config as Record<string, unknown>) || {};

    const updatedConfig = {
      endpoint: data.endpoint ?? currentConfig.endpoint,
      chatModel: data.chatModel ?? currentConfig.chatModel,
      embeddingEndpoint:
        data.embeddingEndpoint !== undefined
          ? data.embeddingEndpoint
          : currentConfig.embeddingEndpoint,
      embeddingModel:
        data.embeddingModel !== undefined ? data.embeddingModel : currentConfig.embeddingModel,
      timeoutSeconds: data.timeoutSeconds ?? currentConfig.timeoutSeconds ?? 60,
      tlsVerify: data.tlsVerify !== undefined ? data.tlsVerify : currentConfig.tlsVerify ?? true,
    };

    if (data.enabled === true) {
      await db
        .update(integrations)
        .set({ enabled: false, updatedAt: new Date() })
        .where(eq(integrations.category, IntegrationCategory.AI_PROVIDER));
    }

    await db
      .update(integrations)
      .set({
        name: data.name ?? existing.name,
        enabled: data.enabled !== undefined ? data.enabled : existing.enabled,
        config: updatedConfig,
        updatedAt: new Date(),
      })
      .where(eq(integrations.id, id));

    // Handle secret key updates
    if (data.clearApiKey) {
      await this.integrationSecretService.deleteSecret(id, 'API_KEY', user.id);
    } else if (data.apiKey && data.apiKey.trim().length > 0) {
      await this.integrationSecretService.setSecret(id, 'API_KEY', data.apiKey, user.id);
    }

    await this.auditService.record({
      action: 'integration.provider.updated',
      category: 'ADMIN',
      actorUserId: user.id,
      resourceType: 'integration',
      resourceId: id,
      outcome: AuditOutcome.SUCCESS,
      metadata: {
        providerId: id,
        name: data.name ?? existing.name,
        enabled: data.enabled !== undefined ? data.enabled : existing.enabled,
        clearedSecret: Boolean(data.clearApiKey),
        updatedSecret: Boolean(data.apiKey && data.apiKey.trim().length > 0),
      },
    });

    return this.getProvider(id);
  }

  @Delete(':id')
  async deleteProvider(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<{ success: boolean }> {
    const db = this.databaseService.client;
    const [existing] = await db
      .select({ id: integrations.id, name: integrations.name })
      .from(integrations)
      .where(
        and(
          eq(integrations.id, id),
          eq(integrations.category, IntegrationCategory.AI_PROVIDER)
        )
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`AI Provider '${id}' not found`);
    }

    await db.delete(integrations).where(eq(integrations.id, id));

    await this.auditService.record({
      action: 'integration.provider.deleted',
      category: 'ADMIN',
      actorUserId: user.id,
      resourceType: 'integration',
      resourceId: id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { providerId: id, name: existing.name },
    });

    return { success: true };
  }

  @Post('test-connection')
  async testConnection(
    @Body() body: unknown
  ): Promise<TestConnectionResponse> {
    const parsed = TestConnectionRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }

    const req = parsed.data;
    let endpoint = req.endpoint;
    let chatModel = req.chatModel;
    let embeddingEndpoint = req.embeddingEndpoint;
    let embeddingModel = req.embeddingModel;
    let apiKey = req.apiKey;
    let timeoutSeconds = req.timeoutSeconds;
    let tlsVerify = req.tlsVerify ?? true;
    let providerName = 'Test Probe';

    const db = this.databaseService.client;

    if (req.providerId) {
      const [existing] = await db
        .select()
        .from(integrations)
        .where(eq(integrations.id, req.providerId))
        .limit(1);

      if (existing) {
        providerName = existing.name;
        const config = (existing.config as Record<string, unknown>) || {};
        endpoint = endpoint ?? String(config.endpoint || '');
        chatModel = chatModel ?? String(config.chatModel || '');
        embeddingEndpoint =
          embeddingEndpoint ??
          (config.embeddingEndpoint ? String(config.embeddingEndpoint) : undefined);
        embeddingModel =
          embeddingModel ??
          (config.embeddingModel ? String(config.embeddingModel) : undefined);
        timeoutSeconds = timeoutSeconds ?? Number(config.timeoutSeconds || 60);
        tlsVerify = req.tlsVerify !== undefined ? req.tlsVerify : config.tlsVerify !== false;

        if (!apiKey) {
          apiKey = (await this.integrationSecretService.getSecret(existing.id, 'API_KEY')) ?? undefined;
        }
      }
    }

    if (!endpoint || !chatModel) {
      throw new BadRequestException('Endpoint and chatModel are required for connection testing');
    }

    const provider = new OpenAICompatibleProvider({
      id: req.providerId ?? 'test-probe',
      name: providerName,
      endpoint,
      chatModel,
      embeddingEndpoint,
      embeddingModel,
      apiKey,
      timeoutSeconds: timeoutSeconds ?? 15,
      tlsVerify,
    });

    const result = await provider.testConnection();

    // If testing an existing provider, update its health status in database
    if (req.providerId) {
      await db
        .update(integrations)
        .set({
          status: result.status,
          lastCheckedAt: new Date(),
          lastError: result.error ?? null,
          updatedAt: new Date(),
        })
        .where(eq(integrations.id, req.providerId));
    }

    return result;
  }
}

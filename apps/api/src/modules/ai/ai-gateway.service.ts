import { HttpException, Injectable, Logger } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { IntegrationSecretService } from '../integrations/integration-secret.service.js';
import {
  integrations,
  aiRuns,
  IntegrationCategory,
  AIRunStatus,
} from '@cyris/db';
import {
  AICapability,
  type AICapabilityValue,
  type IntelligenceStatusResponse,
} from '@cyris/contracts';
import { generateId } from '@cyris/shared';
import {
  type AIProvider,
  type AIMessage,
  type AIGenerateOptions,
  type AIGenerateResult,
  type AIEmbeddingOptions,
  type AIEmbeddingResult,
} from './providers/ai-provider.interface.js';
import { OpenAICompatibleProvider } from './providers/openai-compatible.provider.js';

import { AIAdmissionService, inferenceTimeoutMs } from './ai-admission.service.js';

export interface ExecuteAIOperationParams {
  userId?: string | null;
  eventId?: string | null;
  capability?: AICapabilityValue;
  operationType: 'WRITING_ASSIST' | 'CASE_SUMMARY' | 'CATCH_ME_UP' | 'TIMELINE_EXPLAIN' | 'SUPPORT_REPLY' | 'SUPPORT_HANDOVER' | 'SCENARIO_DATA' | 'EXERCISE_ARCHITECT' | 'EXERCISE_ADVISOR' | 'LEGAL_RESEARCH';
  promptTemplateVersion?: string;
  contextResourceIds?: string[];
  /** Internal server-derived scope; never supplied by the browser. */
  exclusiveScope?: string;
  messages: AIMessage[];
  options?: AIGenerateOptions;
}

export interface ExecuteAIOperationResult {
  text: string;
  model: string;
  durationMs: number;
  runId: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

@Injectable()
export class AIGatewayService {
  private readonly logger = new Logger(AIGatewayService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly integrationSecretService: IntegrationSecretService,
    private readonly admission: AIAdmissionService
  ) {}

  /**
   * Retrieves the currently active and enabled AI provider instance.
   * Returns null if no active provider is configured.
   */
  async getActiveProvider(systemProfile?: 'DGX_SPARK'): Promise<{
    provider: AIProvider;
    integrationId: string;
    timeoutMs: number;
    model: string;
  } | null> {
    const db = this.databaseService.client;
    const [activeRow] = await db
      .select()
      .from(integrations)
      .where(
        and(
          eq(integrations.category, IntegrationCategory.AI_PROVIDER),
          eq(integrations.enabled, true),
          systemProfile ? eq(integrations.systemProfile, systemProfile) : undefined
        )
      )
      .orderBy(desc(integrations.updatedAt))
      .limit(1);

    if (!activeRow) {
      return null;
    }

    const config = (activeRow.config as Record<string, unknown>) || {};
    const apiKey = await this.integrationSecretService.getSecret(activeRow.id, 'API_KEY');

    const provider = new OpenAICompatibleProvider({
      id: activeRow.id,
      name: activeRow.name,
      endpoint: String(config.endpoint || 'http://localhost:8000/v1'),
      chatModel: String(config.chatModel || 'default-chat-model'),
      embeddingEndpoint: config.embeddingEndpoint
        ? String(config.embeddingEndpoint)
        : undefined,
      embeddingModel: config.embeddingModel ? String(config.embeddingModel) : undefined,
      apiKey,
      timeoutSeconds: Number(config.timeoutSeconds || 60),
      tlsVerify: config.tlsVerify !== false,
    });

    return {
      provider,
      integrationId: activeRow.id,
      timeoutMs: inferenceTimeoutMs(Number(config.timeoutSeconds || 60) * 1000),
      model: String(config.chatModel || 'default-chat-model'),
    };
  }

  admissionSnapshot(){return this.admission.snapshot();}

  async embed(
    input: string | string[],
    options?: AIEmbeddingOptions
  ): Promise<AIEmbeddingResult> {
    const active = await this.getActiveProvider();
    if (!active) {
      throw new Error(
        'No Intelligence provider configured or enabled. CYRIS Intelligence actions are currently offline.'
      );
    }
    if (!active.provider.embed) {
      throw new Error('Configured AI Provider does not support embeddings.');
    }
    if (!active.provider.getCapabilities().includes(AICapability.EMBED)) {
      throw new Error('Configured AI Provider does not have embedding capability enabled.');
    }
    const timeoutMs = inferenceTimeoutMs(options?.timeoutMs ?? active.timeoutMs);
    const embed = active.provider.embed.bind(active.provider);
    return this.admission.run('regular', null, timeoutMs, () => embed(input, { ...options, timeoutMs }));
  }

  /**
   * Returns high-level Intelligence readiness and configuration status.
   */
  async getStatus(systemProfile?: 'DGX_SPARK'): Promise<IntelligenceStatusResponse> {
    const db = this.databaseService.client;
    const [activeRow] = await db
      .select()
      .from(integrations)
      .where(and(eq(integrations.category, IntegrationCategory.AI_PROVIDER),
        systemProfile ? eq(integrations.systemProfile, systemProfile) : undefined))
      .orderBy(desc(integrations.enabled), desc(integrations.updatedAt))
      .limit(1);

    if (!activeRow) {
      return {
        configured: false,
        enabled: false,
        status: 'NOT_CONFIGURED',
        capabilities: [],
      };
    }

    const config = (activeRow.config as Record<string, unknown>) || {};
    const chatModel = config.chatModel ? String(config.chatModel) : undefined;
    const capabilities: string[] = [AICapability.CHAT, AICapability.STREAM];
    if (config.embeddingModel) {
      capabilities.push(AICapability.EMBED);
    }

    return {
      configured: true,
      enabled: activeRow.enabled,
      status: activeRow.status,
      providerName: activeRow.name,
      chatModel,
      capabilities,
    };
  }

  /**
   * Executes an AI operation through the central gateway.
   * Handles provider resolution, execution, error containment, and auditable ai_runs recording.
   */
  async execute(params: ExecuteAIOperationParams): Promise<ExecuteAIOperationResult> {
    const startedAt = new Date();
    const runId = generateId();
    const active = await this.getActiveProvider(['SCENARIO_DATA','EXERCISE_ARCHITECT','EXERCISE_ADVISOR','LEGAL_RESEARCH'].includes(params.operationType) ? 'DGX_SPARK' : undefined);

    if (!active) {
      throw new Error(
        'No Intelligence provider configured or enabled. CYRIS Intelligence actions are currently offline.'
      );
    }

    const { provider, integrationId, model } = active;
    const requiredCap = params.capability || AICapability.CHAT;
    const caps = provider.getCapabilities();

    if (!caps.includes(requiredCap)) {
      throw new Error(
        `Configured AI Provider does not support required capability "${requiredCap}".`
      );
    }

    let status: (typeof AIRunStatus)[keyof typeof AIRunStatus] = AIRunStatus.SUCCESS;
    let errorCategory: string | null = null;
    let result: AIGenerateResult | null = null;

    try {
      const support = params.operationType === 'SUPPORT_REPLY' || params.operationType === 'SUPPORT_HANDOVER';
      const timeoutMs = inferenceTimeoutMs(params.options?.timeoutMs ?? active.timeoutMs);
      result = await this.admission.run(support ? 'support' : 'regular', params.userId, timeoutMs,
        () => provider.generate(params.messages, { ...params.options, timeoutMs }), params.exclusiveScope);
      return {
        text: result.text,
        model: result.model,
        durationMs: result.durationMs,
        runId,
        usage: result.usage,
      };
    } catch (err: unknown) {
      status = AIRunStatus.FAILED;
      if (err instanceof HttpException) {
        errorCategory = err.getStatus() === 429 ? 'CAPACITY' : 'ADMISSION_UNAVAILABLE';
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('timeout') || msg.includes('aborted')) {
        status = AIRunStatus.TIMED_OUT;
        errorCategory = 'TIMEOUT';
      } else if (msg.includes('401') || msg.includes('403') || msg.includes('Authentication')) {
        errorCategory = 'AUTH_FAILED';
      } else if (msg.includes('ECONNREFUSED') || msg.includes('Connection refused')) {
        errorCategory = 'UNREACHABLE';
      } else {
        errorCategory = 'PROVIDER_ERROR';
      }
      throw new Error(`AI generation failed (${errorCategory})`);
    } finally {
      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();

      // Persist provenance metadata into ai_runs
      // CRITICAL: NEVER persist secrets, raw unbounded prompts, or full completions
      try {
        const db = this.databaseService.client;
        await db.insert(aiRuns).values({
          id: runId,
          userId: params.userId ?? null,
          eventId: params.eventId ?? null,
          providerId: integrationId,
          capability: requiredCap,
          operationType: params.operationType,
          model,
          promptTemplateVersion: params.promptTemplateVersion ?? '1.0',
          contextResourceIds: params.contextResourceIds ?? [],
          startedAt,
          completedAt,
          durationMs,
          status,
          usageMetadata: result?.usage ?? null,
          errorCategory,
        });
      } catch (logErr) {
        this.logger.error(`Failed to record ai_runs provenance: ${logErr}`);
      }
    }
  }
}

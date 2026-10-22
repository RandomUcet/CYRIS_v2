import { Logger } from '@nestjs/common';
import { Agent } from 'undici';
import {
  type AIProvider,
  type AIMessage,
  type AIGenerateOptions,
  type AIGenerateResult,
  type AIEmbeddingOptions,
  type AIEmbeddingResult,
  type TestConnectionResult,
} from './ai-provider.interface.js';
import { AICapability, type AICapabilityValue } from '@cyris/contracts';

export interface OpenAICompatibleProviderConfig {
  id: string;
  name: string;
  endpoint: string;
  chatModel: string;
  embeddingEndpoint?: string | null;
  embeddingModel?: string | null;
  apiKey?: string | null;
  timeoutSeconds: number;
  tlsVerify: boolean;
}

export class OpenAICompatibleProvider implements AIProvider {
  private readonly logger = new Logger(OpenAICompatibleProvider.name);
  readonly id: string;
  readonly name: string;
  readonly providerType = 'OPENAI_COMPATIBLE';

  private readonly endpoint: string;
  private readonly chatModel: string;
  private readonly embeddingEndpoint: string;
  private readonly embeddingModel?: string | null;
  private readonly apiKey?: string | null;
  private readonly timeoutMs: number;
  private readonly tlsVerify: boolean;
  private readonly dispatcher?: Agent;

  constructor(config: OpenAICompatibleProviderConfig) {
    this.id = config.id;
    this.name = config.name;
    // Normalize endpoint (trim trailing slashes)
    this.endpoint = config.endpoint.replace(/\/+$/, '');
    this.chatModel = config.chatModel;
    this.embeddingEndpoint = (config.embeddingEndpoint || config.endpoint).replace(/\/+$/, '');
    this.embeddingModel = config.embeddingModel;
    this.apiKey = config.apiKey;
    this.timeoutMs = Math.max(5000, (config.timeoutSeconds || 60) * 1000);
    this.tlsVerify = config.tlsVerify ?? true;

    if (!this.tlsVerify) {
      this.logger.warn(
        `[SECURITY WARNING] Insecure TLS verification override enabled for AI Provider "${this.name}" (${this.endpoint}).`
      );
      this.dispatcher = new Agent({
        connect: {
          rejectUnauthorized: false,
        },
      });
    }
  }

  getCapabilities(): AICapabilityValue[] {
    const caps: AICapabilityValue[] = [AICapability.CHAT, AICapability.STREAM];
    if (this.embeddingModel && typeof this.embed === 'function') {
      caps.push(AICapability.EMBED);
    }
    return caps;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (this.apiKey && this.apiKey.trim().length > 0) {
      headers.Authorization = `Bearer ${this.apiKey.trim()}`;
    }
    return headers;
  }

  private resolveUrl(path: string): string {
    // If endpoint already contains /v1 and path starts with /v1, strip prefix
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    if (this.endpoint.endsWith('/v1') && cleanPath.startsWith('/v1/')) {
      return `${this.endpoint}${cleanPath.substring(3)}`;
    }
    return `${this.endpoint}${cleanPath}`;
  }

  private resolveEmbeddingUrl(path: string): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    if (this.embeddingEndpoint.endsWith('/v1') && cleanPath.startsWith('/v1/')) {
      return `${this.embeddingEndpoint}${cleanPath.substring(3)}`;
    }
    return `${this.embeddingEndpoint}${cleanPath}`;
  }

  async generate(messages: AIMessage[], options?: AIGenerateOptions): Promise<AIGenerateResult> {
    const startTime = Date.now();
    const timeout = options?.timeoutMs ?? this.timeoutMs;
    const url = this.resolveUrl('/chat/completions');

    const body = {
      model: this.chatModel,
      messages,
      temperature: options?.temperature ?? 0.2,
      max_tokens: options?.maxTokens ?? 2048,
      stop: options?.stop,
      ...(options?.reasoning && options.reasoning !== 'default'
        ? {
            chat_template_kwargs: {
              enable_thinking: options.reasoning === 'enabled',
            },
          }
        : {}),
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
        dispatcher: this.dispatcher,
      } as any);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(
          `AI Provider returned HTTP ${response.status}: ${errorText.substring(0, 200)}`
        );
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        };
      };

      const durationMs = Date.now() - startTime;
      const text = data.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || text.trim().length === 0) {
        throw new Error(
          'AI Provider returned no usable text content. Reasoning output is not accepted as a text response.'
        );
      }

      return {
        text,
        model: this.chatModel,
        durationMs,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
            }
          : undefined,
      };
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      this.logger.warn(`AI generation failed after ${durationMs}ms: ${this.sanitizeError(err)}`);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async embed(
    input: string | string[],
    options?: AIEmbeddingOptions
  ): Promise<AIEmbeddingResult> {
    if (!this.embeddingModel) {
      throw new Error('AI Provider embedding model is not configured');
    }

    const startTime = Date.now();
    const timeout = options?.timeoutMs ?? this.timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(this.resolveEmbeddingUrl('/embeddings'), {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({ model: this.embeddingModel, input }),
        signal: controller.signal,
        dispatcher: this.dispatcher,
      } as any);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(
          `AI embedding provider returned HTTP ${response.status}: ${errorText.substring(0, 200)}`
        );
      }

      const data = (await response.json()) as {
        data?: Array<{ embedding?: unknown }>;
        model?: string;
        usage?: { prompt_tokens?: number; total_tokens?: number };
      };
      if (!Array.isArray(data.data) || data.data.length === 0) {
        throw new Error('AI embedding provider returned no embeddings');
      }

      const embeddings = data.data.map((item, index) => {
        if (
          !Array.isArray(item.embedding) ||
          item.embedding.length === 0 ||
          item.embedding.some((value) => typeof value !== 'number' || !Number.isFinite(value))
        ) {
          throw new Error(`AI embedding provider returned malformed embedding at index ${index}`);
        }
        return item.embedding;
      }) as number[][];

      return {
        embeddings,
        model: data.model || this.embeddingModel,
        durationMs: Date.now() - startTime,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              totalTokens: data.usage.total_tokens,
            }
          : undefined,
      };
    } catch (err: unknown) {
      this.logger.warn(`AI embedding failed after ${Date.now() - startTime}ms: ${this.sanitizeError(err)}`);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async testConnection(): Promise<TestConnectionResult> {
    const startTime = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(this.timeoutMs, 15000));

    try {
      // 1. First attempt to probe /models endpoint
      const modelsUrl = this.resolveUrl('/models');
      const modelsRes = await fetch(modelsUrl, {
        method: 'GET',
        headers: this.buildHeaders(),
        signal: controller.signal,
        dispatcher: this.dispatcher,
      } as any);

      if (modelsRes.ok) {
        const latencyMs = Date.now() - startTime;
        const body = (await modelsRes.json().catch(() => ({}))) as {
          data?: Array<{ id?: string }>;
        };
        const modelsList = Array.isArray(body?.data)
          ? body.data.map((m) => m.id).filter(Boolean)
          : [];

        const chatModelAvailable = modelsList.length === 0 || modelsList.includes(this.chatModel);
        const chatResult: TestConnectionResult = {
          success: chatModelAvailable,
          status: chatModelAvailable ? 'OPERATIONAL' : 'ERROR',
          latencyMs,
          resolvedModel: chatModelAvailable ? this.chatModel : modelsList[0] || this.chatModel,
          capabilities: this.getCapabilities(),
        };
        if (!chatModelAvailable) {
          chatResult.error = `Chat model "${this.chatModel}" is not exposed by the runtime`;
        }
        if (this.embeddingModel) {
          chatResult.embedding = await this.testEmbeddingConnection();
          if (!chatResult.embedding.success) {
            chatResult.success = false;
            chatResult.status = chatModelAvailable ? 'DEGRADED' : 'ERROR';
            chatResult.error = chatModelAvailable
              ? `Chat runtime is operational, but embedding runtime failed: ${chatResult.embedding.error}`
              : `${chatResult.error}; embedding runtime failed: ${chatResult.embedding.error}`;
          }
        }
        return chatResult;
      }

      // 2. If /models is 404 or 405, fallback to a 1-token test completion
      if (modelsRes.status === 404 || modelsRes.status === 405) {
        const completionsUrl = this.resolveUrl('/chat/completions');
        const probeRes = await fetch(completionsUrl, {
          method: 'POST',
          headers: this.buildHeaders(),
          body: JSON.stringify({
            model: this.chatModel,
            messages: [{ role: 'user', content: 'probe' }],
            max_tokens: 1,
          }),
          signal: controller.signal,
          dispatcher: this.dispatcher,
        } as any);

        if (probeRes.ok) {
          const latencyMs = Date.now() - startTime;
          const chatResult: TestConnectionResult = {
            success: true,
            status: 'OPERATIONAL',
            latencyMs,
            resolvedModel: this.chatModel,
            capabilities: this.getCapabilities(),
          };
          if (this.embeddingModel) {
            chatResult.embedding = await this.testEmbeddingConnection();
            if (!chatResult.embedding.success) {
              chatResult.success = false;
              chatResult.status = 'DEGRADED';
              chatResult.error = `Chat runtime is operational, but embedding runtime failed: ${chatResult.embedding.error}`;
            }
          }
          return chatResult;
        }

        return {
          success: false,
          status: 'ERROR',
          error: this.categorizeHttpStatus(probeRes.status),
        };
      }

      return {
        success: false,
        status: 'ERROR',
        error: this.categorizeHttpStatus(modelsRes.status),
      };
    } catch (err: unknown) {
      return {
        success: false,
        status: 'ERROR',
        error: this.sanitizeError(err),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private async testEmbeddingConnection(): Promise<NonNullable<TestConnectionResult['embedding']>> {
    if (!this.embeddingModel) {
      return { success: false, status: 'NOT_CONFIGURED', error: 'Embedding model is not configured' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(this.timeoutMs, 15000));
    try {
      const response = await fetch(this.resolveEmbeddingUrl('/models'), {
        method: 'GET',
        headers: this.buildHeaders(),
        signal: controller.signal,
        dispatcher: this.dispatcher,
      } as any);
      if (!response.ok) {
        return {
          success: false,
          status: 'ERROR',
          error: this.categorizeEmbeddingHttpStatus(response.status),
        };
      }
      const body = (await response.json().catch(() => ({}))) as {
        data?: Array<{ id?: string }>;
      };
      const models = Array.isArray(body.data)
        ? body.data.map((model) => model.id).filter((id): id is string => Boolean(id))
        : [];
      if (models.length > 0 && !models.includes(this.embeddingModel)) {
        return {
          success: false,
          status: 'ERROR',
          error: `Embedding model "${this.embeddingModel}" is not exposed by the runtime`,
        };
      }
      return {
        success: true,
        status: 'OPERATIONAL',
        resolvedModel: this.embeddingModel,
      };
    } catch (err: unknown) {
      return {
        success: false,
        status: 'ERROR',
        error: this.sanitizeError(err),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private categorizeEmbeddingHttpStatus(status: number): string {
    if (status === 401 || status === 403) return 'Embedding runtime rejected authentication';
    if (status === 404) return `Embedding endpoint or model "${this.embeddingModel}" not found (HTTP 404)`;
    if (status >= 500) return `Embedding runtime server error (HTTP ${status})`;
    return `Embedding runtime returned unexpected HTTP ${status}`;
  }

  private categorizeHttpStatus(status: number): string {
    if (status === 401 || status === 403) {
      return 'Authentication rejected (invalid or missing API key)';
    }
    if (status === 404) {
      return `Endpoint or model "${this.chatModel}" not found (HTTP 404)`;
    }
    if (status === 429) {
      return 'Provider rate limit exceeded (HTTP 429)';
    }
    if (status >= 500) {
      return `Upstream provider server error (HTTP ${status})`;
    }
    return `Provider returned unexpected HTTP ${status}`;
  }

  private sanitizeError(err: unknown): string {
    if (!err) return 'Unknown connection error';
    const msg = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string })?.code;

    if (msg.includes('aborted') || code === 'ABORT_ERR' || msg.includes('timeout')) {
      return `Provider timeout (exceeded ${Math.round(this.timeoutMs / 1000)}s)`;
    }
    if (
      code === 'ECONNREFUSED' ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('fetch failed') ||
      code === 'ENOTFOUND'
    ) {
      return 'Connection refused or endpoint unreachable';
    }
    if (
      msg.includes('DEPTH_ZERO_SELF_SIGNED_CERT') ||
      msg.includes('CERT_') ||
      msg.includes('certificate')
    ) {
      return 'TLS verification failed (untrusted or invalid SSL/TLS certificate)';
    }
    return `Connection error: ${msg.replace(/https?:\/\/[^@\s]+@/g, '***@').substring(0, 120)}`;
  }
}

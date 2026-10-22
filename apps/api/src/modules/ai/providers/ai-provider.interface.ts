import type { AICapabilityValue } from '@cyris/contracts';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type AIReasoningMode = 'default' | 'enabled' | 'disabled';

export interface AIGenerateOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  stop?: string[];
  reasoning?: AIReasoningMode;
}

export interface AIGenerateResult {
  text: string;
  model: string;
  durationMs: number;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface AIEmbeddingOptions {
  timeoutMs?: number;
}

export interface AIEmbeddingResult {
  embeddings: number[][];
  model: string;
  durationMs: number;
  usage?: {
    promptTokens?: number;
    totalTokens?: number;
  };
}

export interface TestConnectionResult {
  success: boolean;
  status: string;
  latencyMs?: number;
  resolvedModel?: string;
  capabilities?: string[];
  embedding?: {
    success: boolean;
    status: string;
    resolvedModel?: string;
    error?: string;
  };
  error?: string;
}

export interface AIProvider {
  readonly id: string;
  readonly name: string;
  readonly providerType: string;

  getCapabilities(): AICapabilityValue[];

  generate(messages: AIMessage[], options?: AIGenerateOptions): Promise<AIGenerateResult>;

  stream?(messages: AIMessage[], options?: AIGenerateOptions): AsyncIterable<string>;

  embed?(
    input: string | string[],
    options?: AIEmbeddingOptions
  ): Promise<AIEmbeddingResult>;

  testConnection(): Promise<TestConnectionResult>;
}

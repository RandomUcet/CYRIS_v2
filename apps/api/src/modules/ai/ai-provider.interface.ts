/**
 * AI Provider Configuration Interface.
 * Future sensitive values (apiKey, clientCert) will be encrypted at rest using CYRIS_MASTER_KEY.
 */
export interface AiProviderConfig {
  id: string;
  name: string;
  providerType: 'dgx-spark' | 'local' | 'cloud';
  endpoint: string;
  model: string;
  embeddingModel?: string;
  timeoutMs: number;
  tlsSettings?: {
    caCertPath?: string;
    rejectUnauthorized?: boolean;
  };
  auth?: {
    type: 'bearer' | 'basic' | 'custom-header';
    encryptedSecret: string; // Decrypted at runtime using CYRIS_MASTER_KEY
  };
}

/**
 * Interface contract for downstream AI compute providers (such as DGX Spark).
 * Spark communicates strictly through this provider abstraction and never has direct DB access.
 */
export interface IAiProvider {
  readonly id: string;
  readonly name: string;

  checkHealth(): Promise<{ ok: boolean; latencyMs: number }>;

  generateEmbeddings?(texts: string[]): Promise<number[][]>;

  generateCompletion?(prompt: string, options?: Record<string, unknown>): Promise<string>;
}

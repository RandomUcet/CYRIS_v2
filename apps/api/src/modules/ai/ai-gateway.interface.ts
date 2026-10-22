import type { IAiProvider } from './ai-provider.interface.js';

/**
 * Top-level AI Gateway interface contract.
 * Coordinates multiple providers, handles fallbacks, auditing, and prompt templating.
 */
export interface IAiGateway {
  getProvider(providerId?: string): IAiProvider;
  listProviders(): string[];
}

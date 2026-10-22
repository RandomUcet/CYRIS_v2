import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { EnvSchema, type EnvConfig } from './schema.js';

export * from './schema.js';

import { fileURLToPath } from 'node:url';

const currentDir = typeof import.meta.dirname === 'string'
  ? import.meta.dirname
  : fileURLToPath(new URL('.', import.meta.url));

let cachedConfig: EnvConfig | null = null;

/**
 * Automatically locate and load .env file from common workspace locations.
 */
function locateAndLoadEnv(): void {
  const possiblePaths = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
    resolve(process.cwd(), '../.env'),
    resolve(currentDir, '../../../.env'),
  ];

  for (const envPath of possiblePaths) {
    if (existsSync(envPath)) {
      dotenvConfig({ path: envPath });
      break;
    }
  }
}

/**
 * Loads, validates, and freezes the application environment configuration.
 * Throws a detailed Zod validation error if any required variables are missing or invalid.
 */
export function loadConfig(override?: Record<string, unknown>): EnvConfig {
  if (cachedConfig && !override) {
    return cachedConfig;
  }

  locateAndLoadEnv();

  const raw = {
    ...process.env,
    ...override,
  };

  const parsed = EnvSchema.safeParse(raw);

  if (!parsed.success) {
    const errorDetails = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `CYRIS Config Validation Failure:\n${errorDetails}\n\nPlease check your .env file or environment variables.`
    );
  }

  cachedConfig = Object.freeze(parsed.data);
  return cachedConfig;
}

/**
 * Returns a sanitized copy of the configuration suitable for logging or diagnostics.
 * Critical secrets (passwords, secret keys, master key) are masked.
 */
export function getSanitizedConfig(config: EnvConfig): Record<string, unknown> {
  return {
    NODE_ENV: config.NODE_ENV,
    PORT: config.PORT,
    DATABASE_URL: config.DATABASE_URL.replace(/:([^:@]+)@/, ':***@'),
    POSTGRES_DB: config.POSTGRES_DB,
    POSTGRES_USER: config.POSTGRES_USER,
    POSTGRES_PASSWORD: '***REDACTED***',
    REDIS_URL: config.REDIS_URL,
    TYPESENSE_HOST: config.TYPESENSE_HOST,
    TYPESENSE_PORT: config.TYPESENSE_PORT,
    TYPESENSE_API_KEY: '***REDACTED***',
    S3_ENDPOINT: config.S3_ENDPOINT,
    S3_REGION: config.S3_REGION,
    S3_BUCKET: config.S3_BUCKET,
    S3_AUDIT_BUCKET: config.S3_AUDIT_BUCKET,
    S3_ACCESS_KEY: config.S3_ACCESS_KEY,
    S3_SECRET_KEY: '***REDACTED***',
    SMTP_HOST: config.SMTP_HOST,
    SMTP_PORT: config.SMTP_PORT,
    CYRIS_MASTER_KEY: '***REDACTED***',
  };
}

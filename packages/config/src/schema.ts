import { z } from 'zod';

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),

  // PostgreSQL
  DATABASE_URL: z.string().url().min(1, 'DATABASE_URL is required'),
  POSTGRES_DB: z.string().min(1, 'POSTGRES_DB is required').default('cyris'),
  POSTGRES_USER: z.string().min(1, 'POSTGRES_USER is required').default('cyris'),
  POSTGRES_PASSWORD: z.string().min(1, 'POSTGRES_PASSWORD is required'),

  // Redis
  REDIS_URL: z.string().url().min(1, 'REDIS_URL is required').default('redis://localhost:6379'),

  CYRIS_AI_MAX_CONCURRENT: z.coerce.number().int().min(1).max(16).default(2),

  // Typesense
  TYPESENSE_HOST: z.string().min(1, 'TYPESENSE_HOST is required').default('localhost'),
  TYPESENSE_PORT: z.coerce.number().default(8108),
  TYPESENSE_API_KEY: z.string().min(1, 'TYPESENSE_API_KEY is required'),

  // MinIO / S3 Object Storage
  S3_ENDPOINT: z.string().url().min(1, 'S3_ENDPOINT is required').default('http://localhost:9000'),
  S3_REGION: z.string().min(1, 'S3_REGION is required').default('us-east-1'),
  S3_BUCKET: z.string().min(1, 'S3_BUCKET is required').default('cyris-storage'),
  S3_AUDIT_BUCKET: z.string().min(1, 'S3_AUDIT_BUCKET is required').default('cyris-audit'),
  S3_ACCESS_KEY: z.string().min(1, 'S3_ACCESS_KEY is required'),
  S3_SECRET_KEY: z.string().min(1, 'S3_SECRET_KEY is required'),

  // Mailpit / SMTP
  SMTP_HOST: z.string().min(1, 'SMTP_HOST is required').default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),

  // CYRIS Security
  CYRIS_MASTER_KEY: z
    .string()
    .min(32, 'CYRIS_MASTER_KEY must be at least 32 characters long for cryptographic envelope encryption'),

  // Public Web App URL
  PUBLIC_WEB_URL: z.string().default('http://localhost:3000'),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

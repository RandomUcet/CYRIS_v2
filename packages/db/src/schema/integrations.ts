import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, text, timestamp, jsonb, boolean, integer, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { generateId } from '@cyris/shared';
import { users } from './users.js';
import { events } from './events.js';

export const IntegrationCategory = {
  AI_PROVIDER: 'AI_PROVIDER',
  LDAP: 'LDAP',
  OIDC: 'OIDC',
  WEBHOOK: 'WEBHOOK',
} as const;

export type IntegrationCategoryValue = (typeof IntegrationCategory)[keyof typeof IntegrationCategory];

export const IntegrationStatus = {
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  OPERATIONAL: 'OPERATIONAL',
  DEGRADED: 'DEGRADED',
  ERROR: 'ERROR',
} as const;

export type IntegrationStatusValue = (typeof IntegrationStatus)[keyof typeof IntegrationStatus];

export const AIRunStatus = {
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  TIMED_OUT: 'TIMED_OUT',
  ABORTED: 'ABORTED',
} as const;

export type AIRunStatusValue = (typeof AIRunStatus)[keyof typeof AIRunStatus];

/**
 * External integration configuration table.
 * Stores non-sensitive metadata for AI providers, identity providers, and webhooks.
 */
export const integrations = pgTable(
  'integrations',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateId()),
    name: varchar('name', { length: 128 }).notNull(),
    category: varchar('category', { length: 64 }).notNull().default(IntegrationCategory.AI_PROVIDER),
    providerType: varchar('provider_type', { length: 64 }).notNull(), // e.g. 'OPENAI_COMPATIBLE'
    systemProfile: varchar('system_profile', { length: 32 }).$type<'DGX_SPARK'>(),
    enabled: boolean('enabled').notNull().default(false),
    status: varchar('status', { length: 32 }).notNull().default(IntegrationStatus.NOT_CONFIGURED),
    config: jsonb('config').notNull().default('{}'), // Non-sensitive settings (endpoint, model, timeout, tls)
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    categoryIdx: index('integrations_category_idx').on(table.category),
    enabledIdx: index('integrations_enabled_idx').on(table.enabled),
    systemProfileIdx: uniqueIndex('integrations_system_profile_idx').on(table.systemProfile),
    activeAiIdx: uniqueIndex('integrations_active_ai_idx').on(table.category)
      .where(sql`${table.category} = 'AI_PROVIDER' AND ${table.enabled}`),
    systemProfileCheck: check('integrations_system_profile_check', sql`${table.systemProfile} IS NULL OR
      (${table.systemProfile} = 'DGX_SPARK' AND ${table.category} = 'AI_PROVIDER' AND ${table.providerType} = 'OPENAI_COMPATIBLE')`),
  })
);

/**
 * Encrypted integration secrets table.
 * Strictly stores AES-256-GCM ciphertexts with isolated IVs and authentication tags.
 * Secret plaintext is never written to PostgreSQL.
 */
export const integrationSecrets = pgTable(
  'integration_secrets',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateId()),
    integrationId: uuid('integration_id')
      .notNull()
      .references(() => integrations.id, { onDelete: 'cascade' }),
    secretKey: varchar('secret_key', { length: 64 }).notNull(), // e.g. 'API_KEY'
    encryptedValue: text('encrypted_value').notNull(),
    iv: varchar('iv', { length: 64 }).notNull(),
    authTag: varchar('auth_tag', { length: 64 }).notNull(),
    keyVersion: integer('key_version').notNull().default(1),
    algorithm: varchar('algorithm', { length: 32 }).notNull().default('aes-256-gcm'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    integrationSecretUniqueIdx: uniqueIndex('integration_secrets_integration_key_idx').on(
      table.integrationId,
      table.secretKey
    ),
  })
);

/**
 * AI Run Execution Provenance.
 * Auditable metadata tracking AI invocations, referenced resources, models, and execution duration.
 * Raw prompts, user secrets, and unbounded model output are NEVER persisted indefinitely.
 */
export const aiRuns = pgTable(
  'ai_runs',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateId()),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    eventId: uuid('event_id').references(() => events.id, { onDelete: 'set null' }),
    providerId: uuid('provider_id').references(() => integrations.id, { onDelete: 'set null' }),
    capability: varchar('capability', { length: 64 }).notNull(), // 'CHAT', 'STREAM', 'EMBED', 'TOOL_CALL'
    operationType: varchar('operation_type', { length: 64 }).notNull(), // 'WRITING_ASSIST', 'CASE_SUMMARY', 'CATCH_ME_UP', 'TIMELINE_EXPLAIN'
    model: varchar('model', { length: 128 }).notNull(),
    promptTemplateVersion: varchar('prompt_template_version', { length: 32 }),
    contextResourceIds: jsonb('context_resource_ids').notNull().default('[]'),
    requestId: varchar('request_id', { length: 128 }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),
    status: varchar('status', { length: 32 }).notNull().default(AIRunStatus.SUCCESS),
    usageMetadata: jsonb('usage_metadata'),
    errorCategory: varchar('error_category', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('ai_runs_user_id_idx').on(table.userId),
    eventIdIdx: index('ai_runs_event_id_idx').on(table.eventId),
    operationIdx: index('ai_runs_operation_idx').on(table.operationType, table.status),
    startedAtIdx: index('ai_runs_started_at_idx').on(table.startedAt),
  })
);

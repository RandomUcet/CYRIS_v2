import { pgTable, uuid, varchar, text, timestamp, jsonb, index, integer } from 'drizzle-orm/pg-core';
import { generateId } from '@cyris/shared';
import { users } from './users.js';
import { events } from './events.js';

export const AuditActorType = {
  USER: 'USER',
  SYSTEM: 'SYSTEM',
  SERVICE: 'SERVICE',
} as const;

export type AuditActorTypeValue = (typeof AuditActorType)[keyof typeof AuditActorType];

export const AuditOutcome = {
  SUCCESS: 'SUCCESS',
  DENIED: 'DENIED',
  FAILURE: 'FAILURE',
} as const;

export type AuditOutcomeValue = (typeof AuditOutcome)[keyof typeof AuditOutcome];

export const OutboxStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  PROCESSED: 'PROCESSED',
  FAILED: 'FAILED',
} as const;

export type OutboxStatusValue = (typeof OutboxStatus)[keyof typeof OutboxStatus];

/**
 * Append-only application audit log.
 * Immutable operational record of security and administrative events.
 */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateId()),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorType: varchar('actor_type', { length: 32 }).notNull().default(AuditActorType.USER),
    eventId: uuid('event_id').references(() => events.id, { onDelete: 'set null' }),
    action: varchar('action', { length: 128 }).notNull(),
    category: varchar('category', { length: 64 }).notNull(),
    resourceType: varchar('resource_type', { length: 64 }),
    resourceId: varchar('resource_id', { length: 128 }),
    outcome: varchar('outcome', { length: 32 }).notNull().default(AuditOutcome.SUCCESS),
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: text('user_agent'),
    requestId: varchar('request_id', { length: 128 }),
    metadata: jsonb('metadata').notNull().default('{}'),
    changes: jsonb('changes'),
  },
  (table) => ({
    occurredAtIdx: index('audit_events_occurred_at_idx').on(table.occurredAt),
    eventIdIdx: index('audit_events_event_id_idx').on(table.eventId),
    actorUserIdIdx: index('audit_events_actor_user_id_idx').on(table.actorUserId),
    actionCategoryIdx: index('audit_events_action_category_idx').on(table.action, table.category),
    resourceIdx: index('audit_events_resource_idx').on(table.resourceType, table.resourceId),
  })
);

/**
 * Transactional Outbox.
 * Supports reliable asynchronous event processing (audit archival, notifications, etc.).
 */
export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateId()),
    eventType: varchar('event_type', { length: 128 }).notNull(),
    payload: jsonb('payload').notNull(),
    status: varchar('status', { length: 32 }).notNull().default(OutboxStatus.PENDING),
    retryCount: integer('retry_count').notNull().default(0),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (table) => ({
    statusCreatedAtIdx: index('outbox_events_status_created_at_idx').on(table.status, table.createdAt),
  })
);

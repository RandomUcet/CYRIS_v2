import { pgTable, uuid, varchar, jsonb, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { generateId } from '@cyris/shared';
import { events } from './events.js';
import { users } from './users.js';

export const ScenarioDataBatchStatus = {
  DRAFT: 'DRAFT',
  GENERATING: 'GENERATING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CLEANED: 'CLEANED',
} as const;

export const scenarioDataBatches = pgTable(
  'scenario_data_batches',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateId()),
    eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    identifier: varchar('identifier', { length: 32 }).notNull(),
    generatorVersion: integer('generator_version').notNull(),
    seed: integer('seed').notNull(),
    preset: varchar('preset', { length: 32 }).notNull(),
    configuration: jsonb('configuration').notNull(),
    status: varchar('status', { length: 32 }).notNull().default(ScenarioDataBatchStatus.DRAFT),
    counts: jsonb('counts'),
    relationshipCount: integer('relationship_count').notNull().default(0),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    failureMessage: varchar('failure_message', { length: 1000 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cleanedAt: timestamp('cleaned_at', { withTimezone: true }),
    cleanedByUserId: uuid('cleaned_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => ({
    eventIdx: index('scenario_data_batches_event_idx').on(table.eventId),
    statusIdx: index('scenario_data_batches_status_idx').on(table.status),
  })
);

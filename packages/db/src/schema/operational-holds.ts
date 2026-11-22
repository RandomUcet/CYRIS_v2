import { pgTable, uuid, varchar, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { generateId } from '@cyris/shared';
import { events } from './events.js';
import { users } from './users.js';

export const operationalHolds = pgTable('exercise_operation_holds', {
  id: uuid('id').primaryKey().$defaultFn(() => generateId()),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  targetType: varchar('target_type', { length: 16 }).notNull(),
  targetId: uuid('target_id'),
  module: varchar('module', { length: 32 }).notNull().default('ALL'),
  reason: text('reason').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revision: integer('revision').notNull().default(1),
  restoredAt: timestamp('restored_at', { withTimezone: true }),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  restoredByUserId: uuid('restored_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  eventWindowIdx: index('exercise_operation_holds_event_window_idx').on(table.eventId, table.startsAt, table.expiresAt),
  scopeIdx: index('exercise_operation_holds_scope_idx').on(table.eventId, table.targetType, table.targetId),
}));

export type OperationalHoldRow = typeof operationalHolds.$inferSelect;

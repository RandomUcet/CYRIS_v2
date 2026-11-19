import { pgTable, uuid, varchar, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { generateId } from '@cyris/shared';
import { events } from './events.js';
import { users } from './users.js';

export const disruptionTargetTypes = ['EVENT', 'UNIT', 'USER'] as const;
export const disruptionModes = ['UNAVAILABLE', 'READ_ONLY', 'DEGRADED'] as const;

export const exerciseDisruptions = pgTable(
  'exercise_disruptions',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateId()),
    eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    targetType: varchar('target_type', { length: 16 }).notNull(),
    targetId: uuid('target_id'),
    module: varchar('module', { length: 64 }).notNull(),
    mode: varchar('mode', { length: 32 }).notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    reason: text('reason').notNull(),
    revision: integer('revision').notNull().default(1),
    restoredAt: timestamp('restored_at', { withTimezone: true }),
    restoredByUserId: uuid('restored_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    eventModuleIdx: index('exercise_disruptions_event_module_idx').on(table.eventId, table.module),
    activeWindowIdx: index('exercise_disruptions_active_window_idx').on(table.startsAt, table.expiresAt),
  })
);

export type ExerciseDisruption = typeof exerciseDisruptions.$inferSelect;

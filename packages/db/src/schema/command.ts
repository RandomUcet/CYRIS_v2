import { pgTable, uuid, integer, text, timestamp } from 'drizzle-orm/pg-core';
import { events } from './events.js';
import { users } from './users.js';

export const commandDefconStates = pgTable('command_defcon_states', {
  eventId: uuid('event_id').primaryKey().references(() => events.id, { onDelete: 'cascade' }),
  level: integer('level'),
  revision: integer('revision').notNull().default(0),
  reason: text('reason'),
  publicMessage: text('public_message'),
  publicRevision: integer('public_revision').notNull().default(0),
  publicUpdatedAt: timestamp('public_updated_at', { withTimezone: true }),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});

export type CommandDefconState = typeof commandDefconStates.$inferSelect;

import { pgTable, uuid, varchar, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { generateId } from '@cyris/shared';
import { events } from './events.js';
import { users } from './users.js';
import { exerciseDisruptions } from './disruptions.js';

export const recoveryObjectiveAudienceTypes = ['EVENT', 'UNIT', 'USER'] as const;
export const recoveryObjectiveStatuses = ['DRAFT', 'PUBLISHED', 'APPROVED', 'REJECTED', 'RESTORED'] as const;

export const recoveryObjectives = pgTable('recovery_objectives', {
  id: uuid('id').primaryKey().$defaultFn(() => generateId()),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  disruptionId: uuid('disruption_id').notNull().references(() => exerciseDisruptions.id, { onDelete: 'cascade' }),
  audienceType: varchar('audience_type', { length: 16 }).notNull(),
  audienceId: uuid('audience_id'),
  title: varchar('title', { length: 200 }).notNull(),
  instructions: text('instructions').notNull(),
  status: varchar('status', { length: 16 }).notNull().default('DRAFT'),
  revision: integer('revision').notNull().default(1),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
}, (table) => ({
  eventStatusIdx: index('recovery_objectives_event_status_idx').on(table.eventId, table.status),
  disruptionIdx: index('recovery_objectives_disruption_idx').on(table.disruptionId),
}));

export const recoveryReports = pgTable('recovery_reports', {
  id: uuid('id').primaryKey().$defaultFn(() => generateId()),
  objectiveId: uuid('objective_id').notNull().references(() => recoveryObjectives.id, { onDelete: 'cascade' }),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  authorUserId: uuid('author_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  revision: integer('revision').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  objectiveAuthorIdx: index('recovery_reports_objective_author_idx').on(table.objectiveId, table.authorUserId),
}));

export type RecoveryObjective = typeof recoveryObjectives.$inferSelect;
export type RecoveryReport = typeof recoveryReports.$inferSelect;

import { pgTable, uuid, varchar, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { events, organizationalUnits } from './events.js';
import { users } from './users.js';
import { generateId } from '@cyris/shared';

/** Durable EXCON messaging plans; delivery is performed by the worker only when due. */
export const exerciseBroadcastPlans = pgTable('exercise_broadcast_plans', {
  id: uuid('id').primaryKey().$defaultFn(() => generateId()),
  eventId: uuid('event_id').notNull().references(() => events.id, {onDelete:'cascade'}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {onDelete:'set null'}),
  kind: varchar('kind',{length:16}).notNull(),
  audience: varchar('audience',{length:8}).notNull(),
  unitId: uuid('unit_id').references(() => organizationalUnits.id, {onDelete:'set null'}),
  title: varchar('title',{length:120}).notNull(),
  message: text('message').notNull(),
  status: varchar('status',{length:16}).notNull().default('DRAFT'),
  scheduledAt: timestamp('scheduled_at',{withTimezone:true}),
  sentAt: timestamp('sent_at',{withTimezone:true}),
  deliveredCount: integer('delivered_count').notNull().default(0),
  revision: integer('revision').notNull().default(1),
  failureCode: varchar('failure_code',{length:40}),
  createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
  updatedAt: timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
}, t=>({
  dueIdx:index('excon_plan_due_idx').on(t.status,t.scheduledAt),
  eventCreatedIdx:index('excon_plan_event_created_idx').on(t.eventId,t.createdAt),
}));
export type ExerciseBroadcastPlanRow = typeof exerciseBroadcastPlans.$inferSelect;

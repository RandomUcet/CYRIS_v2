import { pgTable, uuid, varchar, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { events, organizationalUnits } from './events.js';
import { resources } from './resources.js';
import { users } from './users.js';

/**
 * Operational Tasks (Shared First-Class Resource across Units)
 * resources.id === operational_tasks.id
 */
export const operationalTasks = pgTable(
  'operational_tasks',
  {
    id: uuid('id')
      .primaryKey()
      .references(() => resources.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    taskNumber: varchar('task_number', { length: 64 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    status: varchar('status', { length: 32 }).notNull().default('OPEN'),
    priority: varchar('priority', { length: 32 }).notNull().default('NORMAL'),
    owningUnitId: uuid('owning_unit_id').references(() => organizationalUnits.id, {
      onDelete: 'set null',
    }),
    assignedUnitId: uuid('assigned_unit_id').references(() => organizationalUnits.id, {
      onDelete: 'set null',
    }),
    assignedUserId: uuid('assigned_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    sourceType: varchar('source_type', { length: 64 }).default('MANUAL'),
    sourceResourceId: uuid('source_resource_id'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    completionNote: text('completion_note'),
    blockedReason: text('blocked_reason'),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    taskNumberIdx: uniqueIndex('task_event_num_idx').on(table.eventId, table.taskNumber),
  })
);

export const operationalTasksRelations = relations(operationalTasks, ({ one }) => ({
  resource: one(resources, {
    fields: [operationalTasks.id],
    references: [resources.id],
  }),
  event: one(events, {
    fields: [operationalTasks.eventId],
    references: [events.id],
  }),
  owningUnit: one(organizationalUnits, {
    fields: [operationalTasks.owningUnitId],
    references: [organizationalUnits.id],
  }),
  assignedUnit: one(organizationalUnits, {
    fields: [operationalTasks.assignedUnitId],
    references: [organizationalUnits.id],
  }),
  assignedUser: one(users, {
    fields: [operationalTasks.assignedUserId],
    references: [users.id],
  }),
  createdByUser: one(users, {
    fields: [operationalTasks.createdByUserId],
    references: [users.id],
  }),
}));

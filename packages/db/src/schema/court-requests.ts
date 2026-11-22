import { pgTable, uuid, varchar, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { events, organizationalUnits } from './events.js';
import { users } from './users.js';
import { courtCases } from './court.js';
import { resources } from './resources.js';

export const courtRequests = pgTable('court_requests', {
  id: uuid('id').primaryKey(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  courtCaseId: uuid('court_case_id').notNull().references(() => courtCases.id, { onDelete: 'cascade' }),
  kind: varchar('kind', { length: 32 }).notNull(),
  subject: varchar('subject', { length: 255 }).notNull(),
  details: text('details').notNull(),
  requestedByUserId: uuid('requested_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  requestedFromUnitId: uuid('requested_from_unit_id').references(() => organizationalUnits.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 32 }).notNull().default('OPEN'),
  revision: integer('revision').notNull().default(1),
  dueAt: timestamp('due_at', { withTimezone: true }),
  response: text('response'),
  linkedResourceId: uuid('linked_resource_id').references(() => resources.id, { onDelete: 'set null' }),
  respondedByUserId: uuid('responded_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({
  event: index('court_requests_event_idx').on(t.eventId, t.status),
  matter: index('court_requests_case_idx').on(t.courtCaseId, t.createdAt),
  recipient: index('court_requests_recipient_idx').on(t.eventId, t.requestedFromUnitId, t.status),
}));

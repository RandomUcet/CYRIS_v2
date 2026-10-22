import { pgTable, uuid, varchar, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { generateId } from '@cyris/shared';
import { users } from './users.js';
import { events } from './events.js';
import { resources } from './resources.js';

export const NotificationSeverity = {
  INFO: 'INFO',
  ACTION: 'ACTION',
  URGENT: 'URGENT',
} as const;

export type NotificationSeverityType = (typeof NotificationSeverity)[keyof typeof NotificationSeverity];

/**
 * Notifications table
 * First-class operational attention records, separated from Timeline (Activity) and Audit.
 * Stores templateKey + parameters for dynamic client-side localization.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateId()),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 64 }).notNull(),
    severity: varchar('severity', { length: 32 }).notNull().default(NotificationSeverity.INFO),
    templateKey: varchar('template_key', { length: 128 }).notNull(),
    templateParams: jsonb('template_params').notNull().default('{}'),
    resourceId: uuid('resource_id').references(() => resources.id, { onDelete: 'set null' }),
    actionUrl: varchar('action_url', { length: 512 }),
    sourceEventId: varchar('source_event_id', { length: 128 }),
    readAt: timestamp('read_at', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userReadIdx: index('notifications_user_read_idx').on(table.userId, table.readAt),
    userCreatedIdx: index('notifications_user_created_idx').on(table.userId, table.createdAt),
    dedupIdx: uniqueIndex('notifications_dedup_idx').on(table.sourceEventId, table.userId, table.type),
  })
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
  event: one(events, {
    fields: [notifications.eventId],
    references: [events.id],
  }),
  resource: one(resources, {
    fields: [notifications.resourceId],
    references: [resources.id],
  }),
}));

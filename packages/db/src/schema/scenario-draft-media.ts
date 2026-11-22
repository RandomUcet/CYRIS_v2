import { pgTable, uuid, varchar, integer, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { scenarioDataBatches } from './scenario-data.js';
import { events } from './events.js';
import { users } from './users.js';

/** Private images selected for an unpublished Spark data batch. No public URLs. */
export const scenarioDraftMedia = pgTable('scenario_draft_media', {
  id: uuid('id').primaryKey(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  batchId: uuid('batch_id').notNull().references(() => scenarioDataBatches.id, { onDelete: 'cascade' }),
  kind: varchar('kind', { length: 32 }).notNull(),
  recordIndex: integer('record_index').notNull(),
  objectKey: varchar('object_key', { length: 512 }).notNull(),
  bucket: varchar('bucket', { length: 128 }).notNull(),
  filename: varchar('filename', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 128 }).notNull(),
  byteSize: integer('byte_size').notNull(),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({
  uniqueSlot: uniqueIndex('scenario_draft_media_slot_idx').on(t.batchId, t.kind, t.recordIndex),
  eventIdx: index('scenario_draft_media_event_idx').on(t.eventId, t.batchId),
}));

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  bigint,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { generateId } from '@cyris/shared';
import { events } from './events.js';
import { users } from './users.js';
import { resources } from './resources.js';

export const documents = pgTable(
  'documents',
  {
    id: uuid('id')
      .primaryKey()
      .references(() => resources.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    documentNumber: varchar('document_number', { length: 64 }),
    title: text('title').notNull(),
    description: text('description'),
    documentType: varchar('document_type', { length: 64 }).notNull().default('REPORT'),
    status: varchar('status', { length: 32 }).notNull().default('DRAFT'),
    originalFilename: text('original_filename').notNull(),
    mimeType: text('mime_type').notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    objectKey: text('object_key').notNull(),
    sha256: varchar('sha256', { length: 64 }).notNull(),
    uploadedByUserId: uuid('uploaded_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    textExtractionStatus: varchar('text_extraction_status', { length: 32 }).notNull().default('PENDING'),
    extractedText: text('extracted_text'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    eventDocIdx: index('documents_event_idx').on(table.eventId),
    docNumberIdx: index('documents_number_idx').on(table.eventId, table.documentNumber),
    docTypeIdx: index('documents_type_idx').on(table.eventId, table.documentType),
    extractionIdx: index('documents_extraction_idx').on(table.textExtractionStatus),
  })
);

export const documentVersions = pgTable(
  'document_versions',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    objectKey: text('object_key').notNull(),
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    sha256: varchar('sha256', { length: 64 }).notNull(),
    uploadedByUserId: uuid('uploaded_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    changeNote: text('change_note'),
  },
  (table) => ({
    docVersionUnique: uniqueIndex('document_versions_doc_ver_unique').on(
      table.documentId,
      table.versionNumber
    ),
    docIdx: index('document_versions_doc_idx').on(table.documentId),
  })
);

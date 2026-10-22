import { pgTable, uuid, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';
import { generateId } from '@cyris/shared';
import { resources } from './resources.js';
import { organizationalUnits } from './events.js';
import { users } from './users.js';

export const EvidenceStatus = {
  REGISTERED: 'REGISTERED',
  SECURED: 'SECURED',
  IN_TRANSIT: 'IN_TRANSIT',
  STORED: 'STORED',
  UNDER_ANALYSIS: 'UNDER_ANALYSIS',
  RELEASED: 'RELEASED',
  DISPOSED: 'DISPOSED',
} as const;

export type EvidenceStatusValue = (typeof EvidenceStatus)[keyof typeof EvidenceStatus];

export const CustodyHolderType = {
  USER: 'USER',
  UNIT: 'UNIT',
  STORAGE: 'STORAGE',
} as const;

export type CustodyHolderTypeValue = (typeof CustodyHolderType)[keyof typeof CustodyHolderType];

/**
 * Operational Evidence Entity.
 */
export const evidence = pgTable(
  'evidence',
  {
    id: uuid('id')
      .primaryKey()
      .references(() => resources.id, { onDelete: 'cascade' }),
    evidenceNumber: varchar('evidence_number', { length: 32 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    evidenceType: varchar('evidence_type', { length: 64 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default(EvidenceStatus.REGISTERED),
    condition: text('condition'),
    securedAt: timestamp('secured_at', { withTimezone: true }),
    securedByUserId: uuid('secured_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    owningUnitId: uuid('owning_unit_id').references(() => organizationalUnits.id, { onDelete: 'set null' }),
    currentHolderType: varchar('current_holder_type', { length: 32 }).notNull().default(CustodyHolderType.USER),
    currentHolderId: varchar('current_holder_id', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    evidenceNumberIdx: index('evidence_number_idx').on(table.evidenceNumber),
    statusIdx: index('evidence_status_idx').on(table.status),
    owningUnitIdx: index('evidence_owning_unit_idx').on(table.owningUnitId),
  })
);

/**
 * Immutable Chain of Custody History.
 * Transfers are append-only and never rewritten.
 */
export const evidenceCustodyTransfers = pgTable(
  'evidence_custody_transfers',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateId()),
    evidenceId: uuid('evidence_id')
      .notNull()
      .references(() => evidence.id, { onDelete: 'cascade' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    transferredByUserId: uuid('transferred_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    fromHolderType: varchar('from_holder_type', { length: 32 }).notNull(),
    fromHolderId: varchar('from_holder_id', { length: 64 }).notNull(),
    toHolderType: varchar('to_holder_type', { length: 32 }).notNull(),
    toHolderId: varchar('to_holder_id', { length: 64 }).notNull(),
    reason: text('reason'),
    notes: text('notes'),
  },
  (table) => ({
    evidenceOccurredIdx: index('custody_evidence_occurred_idx').on(table.evidenceId, table.occurredAt),
  })
);

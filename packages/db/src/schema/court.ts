import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { generateId } from '@cyris/shared';
import { events } from './events.js';
import { users } from './users.js';
import { resources } from './resources.js';
import { cases } from './investigation.js';
import { evidence } from './evidence.js';
import { documents } from './documents.js';

export const courtCases = pgTable(
  'court_cases',
  {
    id: uuid('id')
      .primaryKey()
      .references(() => resources.id, { onDelete: 'cascade' }),
    courtCaseNumber: varchar('court_case_number', { length: 32 }).notNull(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    summary: text('summary'),
    status: varchar('status', { length: 32 }).notNull().default('PREPARATION'),
    originatingCaseId: uuid('originating_case_id').references(() => cases.id, { onDelete: 'set null' }),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    eventNumberUnique: uniqueIndex('court_cases_event_num_unique').on(
      table.eventId,
      table.courtCaseNumber
    ),
    eventStatusIdx: index('court_cases_event_status_idx').on(table.eventId, table.status),
    originatingCaseIdx: index('court_cases_originating_case_idx').on(table.originatingCaseId),
  })
);

export const courtCaseParties = pgTable(
  'court_case_parties',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    courtCaseId: uuid('court_case_id')
      .notNull()
      .references(() => courtCases.id, { onDelete: 'cascade' }),
    partyResourceId: uuid('party_resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    partyRole: varchar('party_role', { length: 32 }).notNull().default('DEFENCE'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    courtCaseIdx: index('court_case_parties_case_idx').on(table.courtCaseId),
    partyResourceIdx: index('court_case_parties_party_idx').on(table.partyResourceId),
  })
);

export const charges = pgTable(
  'charges',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    courtCaseId: uuid('court_case_id')
      .notNull()
      .references(() => courtCases.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 64 }),
    title: text('title').notNull(),
    description: text('description').notNull(),
    status: varchar('status', { length: 32 }).notNull().default('FILED'),
    relatedCaseResourceId: uuid('related_case_resource_id').references(() => resources.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    courtCaseIdx: index('charges_case_idx').on(table.courtCaseId),
    statusIdx: index('charges_status_idx').on(table.status),
  })
);

export const courtExhibits = pgTable(
  'court_exhibits',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    courtCaseId: uuid('court_case_id')
      .notNull()
      .references(() => courtCases.id, { onDelete: 'cascade' }),
    evidenceId: uuid('evidence_id')
      .notNull()
      .references(() => evidence.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
    exhibitNumber: varchar('exhibit_number', { length: 32 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('SUBMITTED'),
    proposedByUserId: uuid('proposed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    proposedAt: timestamp('proposed_at', { withTimezone: true }).notNull().defaultNow(),
    decisionByUserId: uuid('decision_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionReason: text('decision_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    caseExhibitUnique: uniqueIndex('court_exhibits_case_num_unique').on(
      table.courtCaseId,
      table.exhibitNumber
    ),
    caseEvidenceUnique: uniqueIndex('court_exhibits_case_evidence_unique').on(
      table.courtCaseId,
      table.evidenceId
    ),
    courtCaseIdx: index('court_exhibits_case_idx').on(table.courtCaseId),
  })
);

export const courtHearings = pgTable(
  'court_hearings',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    courtCaseId: uuid('court_case_id')
      .notNull()
      .references(() => courtCases.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    status: varchar('status', { length: 32 }).notNull().default('SCHEDULED'),
    locationResourceId: uuid('location_resource_id').references(() => resources.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    courtCaseIdx: index('court_hearings_case_idx').on(table.courtCaseId),
    scheduledIdx: index('court_hearings_scheduled_idx').on(table.scheduledAt),
  })
);

export const courtFilings = pgTable(
  'court_filings',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    courtCaseId: uuid('court_case_id')
      .notNull()
      .references(() => courtCases.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    filingType: varchar('filing_type', { length: 64 }).notNull().default('MOTION'),
    filedByUserId: uuid('filed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    filedAt: timestamp('filed_at', { withTimezone: true }).notNull().defaultNow(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    courtCaseIdx: index('court_filings_case_idx').on(table.courtCaseId),
    docIdx: index('court_filings_doc_idx').on(table.documentId),
  })
);

export const courtDecisions = pgTable(
  'court_decisions',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    courtCaseId: uuid('court_case_id')
      .notNull()
      .references(() => courtCases.id, { onDelete: 'cascade' }),
    decisionType: varchar('decision_type', { length: 64 }).notNull().default('VERDICT_CONVICTION'),
    summary: text('summary').notNull(),
    reasoning: text('reasoning'),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().defaultNow(),
    decidedByUserId: uuid('decided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    courtCaseIdx: index('court_decisions_case_idx').on(table.courtCaseId),
  })
);

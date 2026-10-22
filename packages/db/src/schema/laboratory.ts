import { pgTable, uuid, varchar, text, timestamp, primaryKey, index } from 'drizzle-orm/pg-core';
import { resources } from './resources.js';
import { evidence } from './evidence.js';
import { organizationalUnits } from './events.js';
import { users } from './users.js';

export const LabAnalysisStatus = {
  REQUESTED: 'REQUESTED',
  ACCEPTED: 'ACCEPTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
} as const;

export type LabAnalysisStatusValue = (typeof LabAnalysisStatus)[keyof typeof LabAnalysisStatus];

/**
 * Operational Laboratory Analysis Entity.
 */
export const labAnalyses = pgTable(
  'lab_analyses',
  {
    id: uuid('id')
      .primaryKey()
      .references(() => resources.id, { onDelete: 'cascade' }),
    analysisNumber: varchar('analysis_number', { length: 32 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default(LabAnalysisStatus.REQUESTED),
    requestedByUserId: uuid('requested_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    requestedFromUnitId: uuid('requested_from_unit_id').references(() => organizationalUnits.id, { onDelete: 'set null' }),
    assignedToUserId: uuid('assigned_to_user_id').references(() => users.id, { onDelete: 'set null' }),
    assignedUnitId: uuid('assigned_unit_id').references(() => organizationalUnits.id, { onDelete: 'set null' }),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    analysisType: varchar('analysis_type', { length: 64 }).notNull(),
    purpose: text('purpose'),
    method: text('method'),
    findings: text('findings'),
    conclusion: text('conclusion'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    analysisNumberIdx: index('lab_analyses_number_idx').on(table.analysisNumber),
    statusIdx: index('lab_analyses_status_idx').on(table.status),
    requestedFromUnitIdx: index('lab_analyses_req_unit_idx').on(table.requestedFromUnitId),
    assignedUnitIdx: index('lab_analyses_assigned_unit_idx').on(table.assignedUnitId),
  })
);

/**
 * Join table linking Laboratory Analyses to Evidence resources.
 */
export const labAnalysisEvidence = pgTable(
  'lab_analysis_evidence',
  {
    analysisId: uuid('analysis_id')
      .notNull()
      .references(() => labAnalyses.id, { onDelete: 'cascade' }),
    evidenceId: uuid('evidence_id')
      .notNull()
      .references(() => evidence.id, { onDelete: 'cascade' }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.analysisId, table.evidenceId] }),
    evidenceIdx: index('lab_analysis_evidence_evidence_idx').on(table.evidenceId),
  })
);

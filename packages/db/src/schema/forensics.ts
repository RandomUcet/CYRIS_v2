import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  bigint,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { generateId } from '@cyris/shared';
import { events, organizationalUnits } from './events.js';
import { users } from './users.js';
import { resources } from './resources.js';
import { evidence } from './evidence.js';

export const forensicAnalyses = pgTable(
  'forensic_analyses',
  {
    id: uuid('id')
      .primaryKey()
      .references(() => resources.id, { onDelete: 'cascade' }),
    analysisNumber: varchar('analysis_number', { length: 32 }).notNull(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    analysisType: varchar('analysis_type', { length: 64 }).notNull().default('FILE_ANALYSIS'),
    status: varchar('status', { length: 32 }).notNull().default('REQUESTED'),
    priority: varchar('priority', { length: 32 }).notNull().default('MEDIUM'),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    requestedFromUnitId: uuid('requested_from_unit_id').references(() => organizationalUnits.id, { onDelete: 'set null' }),
    assignedToUserId: uuid('assigned_to_user_id').references(() => users.id, { onDelete: 'set null' }),
    assignedUnitId: uuid('assigned_unit_id').references(() => organizationalUnits.id, { onDelete: 'set null' }),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    purpose: text('purpose'),
    methodology: text('methodology'),
    findings: text('findings'),
    conclusion: text('conclusion'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    eventNumberUnique: uniqueIndex('forensic_analyses_event_num_unique').on(
      table.eventId,
      table.analysisNumber
    ),
    eventStatusIdx: index('forensic_analyses_event_status_idx').on(table.eventId, table.status),
    assignedUnitIdx: index('forensic_analyses_assigned_unit_idx').on(table.assignedUnitId),
  })
);

export const forensicAnalysisEvidence = pgTable(
  'forensic_analysis_evidence',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    analysisId: uuid('analysis_id')
      .notNull()
      .references(() => forensicAnalyses.id, { onDelete: 'cascade' }),
    evidenceId: uuid('evidence_id')
      .notNull()
      .references(() => evidence.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueLink: uniqueIndex('forensic_evidence_unique_link').on(table.analysisId, table.evidenceId),
  })
);

export const forensicAnalysisDevices = pgTable(
  'forensic_analysis_devices',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    analysisId: uuid('analysis_id')
      .notNull()
      .references(() => forensicAnalyses.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueLink: uniqueIndex('forensic_devices_unique_link').on(table.analysisId, table.deviceId),
  })
);

export const forensicFindings = pgTable(
  'forensic_findings',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    analysisId: uuid('analysis_id')
      .notNull()
      .references(() => forensicAnalyses.id, { onDelete: 'cascade' }),
    findingType: varchar('finding_type', { length: 64 }).notNull().default('ARTIFACT'),
    title: text('title').notNull(),
    description: text('description').notNull(),
    confidence: varchar('confidence', { length: 32 }).notNull().default('CONFIRMED'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    analysisIdx: index('forensic_findings_analysis_idx').on(table.analysisId),
  })
);

export const technicalIndicators = pgTable(
  'technical_indicators',
  {
    id: uuid('id')
      .primaryKey()
      .references(() => resources.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    indicatorType: varchar('indicator_type', { length: 32 }).notNull(),
    value: text('value').notNull(),
    normalizedValue: text('normalized_value').notNull(),
    description: text('description'),
    verificationState: varchar('verification_state', { length: 32 }).notNull().default('UNVERIFIED'),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    eventIndicatorIdx: index('technical_indicators_event_idx').on(table.eventId, table.indicatorType),
    normalizedValIdx: index('technical_indicators_norm_val_idx').on(table.eventId, table.normalizedValue),
  })
);

export const forensicAcquisitions = pgTable(
  'forensic_acquisitions',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    analysisId: uuid('analysis_id')
      .notNull()
      .references(() => forensicAnalyses.id, { onDelete: 'cascade' }),
    evidenceId: uuid('evidence_id').references(() => evidence.id, { onDelete: 'set null' }),
    deviceId: uuid('device_id').references(() => resources.id, { onDelete: 'set null' }),
    acquisitionType: varchar('acquisition_type', { length: 64 }).notNull().default('LOGICAL'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    toolName: text('tool_name'),
    toolVersion: text('tool_version'),
    sourceSize: bigint('source_size', { mode: 'number' }),
    hashAlgorithm: varchar('hash_algorithm', { length: 32 }).notNull().default('SHA-256'),
    sourceHash: varchar('source_hash', { length: 128 }),
    imageHash: varchar('image_hash', { length: 128 }),
    storageReference: text('storage_reference'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    analysisIdx: index('forensic_acquisitions_analysis_idx').on(table.analysisId),
  })
);

import { pgTable, uuid, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';
import { resources } from './resources.js';
import { organizationalUnits } from './events.js';
import { users } from './users.js';

export const IncidentStatus = {
  NEW: 'NEW',
  ACTIVE: 'ACTIVE',
  CONTAINED: 'CONTAINED',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
} as const;

export type IncidentStatusValue = (typeof IncidentStatus)[keyof typeof IncidentStatus];

export const IncidentPriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

export type IncidentPriorityValue = (typeof IncidentPriority)[keyof typeof IncidentPriority];

export const CaseStatus = {
  OPEN: 'OPEN',
  INVESTIGATING: 'INVESTIGATING',
  PENDING: 'PENDING',
  REFERRED: 'REFERRED',
  CLOSED: 'CLOSED',
  ARCHIVED: 'ARCHIVED',
} as const;

export type CaseStatusValue = (typeof CaseStatus)[keyof typeof CaseStatus];

export const CasePriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

export type CasePriorityValue = (typeof CasePriority)[keyof typeof CasePriority];

/**
 * Operational Incidents.
 */
export const incidents = pgTable(
  'incidents',
  {
    id: uuid('id')
      .primaryKey()
      .references(() => resources.id, { onDelete: 'cascade' }),
    incidentNumber: varchar('incident_number', { length: 32 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    status: varchar('status', { length: 32 }).notNull().default(IncidentStatus.NEW),
    priority: varchar('priority', { length: 32 }).notNull().default(IncidentPriority.MEDIUM),
    occurredAt: timestamp('occurred_at', { withTimezone: true }),
    detectedAt: timestamp('detected_at', { withTimezone: true }),
    owningUnitId: uuid('owning_unit_id').references(() => organizationalUnits.id, { onDelete: 'set null' }),
    leadUserId: uuid('lead_user_id').references(() => users.id, { onDelete: 'set null' }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    incidentNumberIdx: index('incidents_number_idx').on(table.incidentNumber),
    statusIdx: index('incidents_status_idx').on(table.status),
    owningUnitIdx: index('incidents_owning_unit_idx').on(table.owningUnitId),
    leadUserIdx: index('incidents_lead_user_idx').on(table.leadUserId),
  })
);

/**
 * Investigative Cases.
 */
export const cases = pgTable(
  'cases',
  {
    id: uuid('id')
      .primaryKey()
      .references(() => resources.id, { onDelete: 'cascade' }),
    caseNumber: varchar('case_number', { length: 32 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    summary: text('summary'),
    status: varchar('status', { length: 32 }).notNull().default(CaseStatus.OPEN),
    priority: varchar('priority', { length: 32 }).notNull().default(CasePriority.MEDIUM),
    owningUnitId: uuid('owning_unit_id').references(() => organizationalUnits.id, { onDelete: 'set null' }),
    leadUserId: uuid('lead_user_id').references(() => users.id, { onDelete: 'set null' }),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    caseNumberIdx: index('cases_number_idx').on(table.caseNumber),
    statusIdx: index('cases_status_idx').on(table.status),
    owningUnitIdx: index('cases_owning_unit_idx').on(table.owningUnitId),
    leadUserIdx: index('cases_lead_user_idx').on(table.leadUserId),
  })
);

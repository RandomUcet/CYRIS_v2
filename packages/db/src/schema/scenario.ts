import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { generateId } from '@cyris/shared';
import { events, organizationalUnits } from './events.js';
import { users } from './users.js';
import { resources } from './resources.js';

export const ScenarioClockModeValues = {
  REAL_TIME: 'REAL_TIME',
  SCENARIO_TIME: 'SCENARIO_TIME',
} as const;

export const scenarioClocks = pgTable(
  'scenario_clocks',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateId()),
    eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    mode: varchar('mode', { length: 32 }).notNull().default('REAL_TIME'),
    scenarioBaseTime: timestamp('scenario_base_time', { withTimezone: true }),
    realBaseTime: timestamp('real_base_time', { withTimezone: true }),
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    pausedScenarioTime: timestamp('paused_scenario_time', { withTimezone: true }),
    speedMultiplier: integer('speed_multiplier').notNull().default(1),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    eventIdx: uniqueIndex('scenario_clocks_event_idx').on(table.eventId),
  })
);

export const ScenarioPhaseStatusValues = {
  DRAFT: 'DRAFT',
  PLANNED: 'PLANNED',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export const ScenarioInjectStatusValues = {
  DRAFT: 'DRAFT',
  BLOCKED: 'BLOCKED',
  READY: 'READY',
  SCHEDULED: 'SCHEDULED',
  RELEASED: 'RELEASED',
  CANCELLED: 'CANCELLED',
} as const;

/**
 * Scenario Phases (Sequenced timeline phases of an exercise)
 */
export const scenarioPhases = pgTable(
  'scenario_phases',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateId()),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 64 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    sequence: integer('sequence').notNull().default(0),
    status: varchar('status', { length: 32 }).notNull().default('DRAFT'),
    plannedStartAt: timestamp('planned_start_at', { withTimezone: true }),
    plannedEndAt: timestamp('planned_end_at', { withTimezone: true }),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    controllerNotes: text('controller_notes'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    eventSeqIdx: index('scenario_phases_event_seq_idx').on(table.eventId, table.sequence),
    eventStatusIdx: index('scenario_phases_event_status_idx').on(table.eventId, table.status),
  })
);

/**
 * Scenario Injects (Planned scenario stimulus or controlled release)
 */
export const scenarioInjects = pgTable(
  'scenario_injects',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateId()),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    phaseId: uuid('phase_id').references(() => scenarioPhases.id, { onDelete: 'set null' }),
    injectNumber: varchar('inject_number', { length: 32 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    controllerSummary: text('controller_summary').notNull(),
    participantTitle: varchar('participant_title', { length: 255 }),
    participantContent: text('participant_content'),
    status: varchar('status', { length: 32 }).notNull().default('DRAFT'),
    priority: varchar('priority', { length: 32 }).notNull().default('NORMAL'),
    triggerType: varchar('trigger_type', { length: 32 }).notNull().default('MANUAL'),
    releasePolicy: varchar('release_policy', { length: 32 }).notNull().default('MANUAL_CONFIRMATION'),
    conditionLogic: varchar('condition_logic', { length: 8 }).notNull().default('ALL'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    requiresAcknowledgement: boolean('requires_acknowledgement').notNull().default(false),
    controllerNotes: text('controller_notes'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    releasedByUserId: uuid('released_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    eventInjectNumIdx: uniqueIndex('scenario_injects_num_idx').on(table.eventId, table.injectNumber),
    eventStatusIdx: index('scenario_injects_event_status_idx').on(table.eventId, table.status),
    eventPhaseIdx: index('scenario_injects_event_phase_idx').on(table.eventId, table.phaseId),
  })
);

/**
 * Scenario Inject Dependencies (Prerequisite injects)
 */
export const scenarioInjectDependencies = pgTable(
  'scenario_inject_dependencies',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateId()),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    injectId: uuid('inject_id')
      .notNull()
      .references(() => scenarioInjects.id, { onDelete: 'cascade' }),
    dependsOnInjectId: uuid('depends_on_inject_id')
      .notNull()
      .references(() => scenarioInjects.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueDepIdx: uniqueIndex('scenario_inject_dep_unique_idx').on(table.injectId, table.dependsOnInjectId),
    injectIdx: index('scenario_inject_dep_inject_idx').on(table.injectId),
  })
);

/**
 * Scenario Inject Conditions (Typed domain event or state conditions)
 */
export const scenarioInjectConditions = pgTable(
  'scenario_inject_conditions',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateId()),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    injectId: uuid('inject_id')
      .notNull()
      .references(() => scenarioInjects.id, { onDelete: 'cascade' }),
    conditionType: varchar('condition_type', { length: 64 }).notNull(),
    targetResourceId: uuid('target_resource_id').references(() => resources.id, { onDelete: 'set null' }),
    targetIdentifier: varchar('target_identifier', { length: 64 }),
    targetStatus: varchar('target_status', { length: 64 }),
    activityType: varchar('activity_type', { length: 64 }),
    expectedValue: jsonb('expected_value'),
    isSatisfied: boolean('is_satisfied').notNull().default(false),
    satisfiedAt: timestamp('satisfied_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    injectIdx: index('scenario_conditions_inject_idx').on(table.injectId),
    typeIdx: index('scenario_conditions_type_idx').on(table.eventId, table.conditionType),
  })
);

/**
 * Scenario Inject Targets (Target audience: Event, Unit, User)
 */
export const scenarioInjectTargets = pgTable(
  'scenario_inject_targets',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateId()),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    injectId: uuid('inject_id')
      .notNull()
      .references(() => scenarioInjects.id, { onDelete: 'cascade' }),
    targetType: varchar('target_type', { length: 32 }).notNull(),
    targetUnitId: uuid('target_unit_id').references(() => organizationalUnits.id, { onDelete: 'cascade' }),
    targetUserId: uuid('target_user_id').references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    injectIdx: index('scenario_targets_inject_idx').on(table.injectId),
  })
);

/**
 * Scenario Inject Actions (Controlled resource disclosure or briefings)
 */
export const scenarioInjectActions = pgTable(
  'scenario_inject_actions',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateId()),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    injectId: uuid('inject_id')
      .notNull()
      .references(() => scenarioInjects.id, { onDelete: 'cascade' }),
    actionType: varchar('action_type', { length: 64 }).notNull(),
    resourceId: uuid('resource_id').references(() => resources.id, { onDelete: 'cascade' }),
    targetType: varchar('target_type', { length: 32 }).notNull().default('UNIT'),
    targetUnitId: uuid('target_unit_id').references(() => organizationalUnits.id, { onDelete: 'cascade' }),
    targetUserId: uuid('target_user_id').references(() => users.id, { onDelete: 'cascade' }),
    newVisibility: varchar('new_visibility', { length: 32 }),
    parameters: jsonb('parameters'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    injectIdx: index('scenario_actions_inject_idx').on(table.injectId),
  })
);

/**
 * Scenario Inject Releases (Immutable historical release snapshot)
 */
export const scenarioInjectReleases = pgTable(
  'scenario_inject_releases',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateId()),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    injectId: uuid('inject_id')
      .notNull()
      .references(() => scenarioInjects.id, { onDelete: 'cascade' }),
    releaseType: varchar('release_type', { length: 32 }).notNull().default('MANUAL'),
    overrideReason: text('override_reason'),
    participantTitle: varchar('participant_title', { length: 255 }).notNull(),
    participantContent: text('participant_content'),
    audienceSnapshot: jsonb('audience_snapshot').notNull(),
    actionsSnapshot: jsonb('actions_snapshot').notNull(),
    releasedByUserId: uuid('released_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    releasedAt: timestamp('released_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    injectIdx: index('scenario_releases_inject_idx').on(table.injectId),
    eventReleasedIdx: index('scenario_releases_event_idx').on(table.eventId, table.releasedAt),
  })
);

/**
 * Scenario Inject Translations (Multilingual participant content)
 */
export const scenarioInjectTranslations = pgTable(
  'scenario_inject_translations',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateId()),
    injectId: uuid('inject_id')
      .notNull()
      .references(() => scenarioInjects.id, { onDelete: 'cascade' }),
    locale: varchar('locale', { length: 16 }).notNull(),
    participantTitle: varchar('participant_title', { length: 255 }).notNull(),
    participantContent: text('participant_content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueInjectLocaleIdx: uniqueIndex('scenario_inject_translations_inject_locale_idx').on(
      table.injectId,
      table.locale
    ),
  })
);

/**
 * Scenario Deliveries (Participant-facing briefing instances)
 */
export const scenarioDeliveries = pgTable(
  'scenario_deliveries',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateId()),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => scenarioInjectReleases.id, { onDelete: 'cascade' }),
    injectId: uuid('inject_id')
      .notNull()
      .references(() => scenarioInjects.id, { onDelete: 'cascade' }),
    recipientUserId: uuid('recipient_user_id').references(() => users.id, { onDelete: 'cascade' }),
    targetUnitId: uuid('target_unit_id').references(() => organizationalUnits.id, { onDelete: 'cascade' }),
    locale: varchar('locale', { length: 16 }).notNull().default('en'),
    participantTitle: varchar('participant_title', { length: 255 }),
    participantContent: text('participant_content'),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  },
  (table) => ({
    userDeliveryIdx: index('scenario_deliveries_user_idx').on(table.eventId, table.recipientUserId),
    unitDeliveryIdx: index('scenario_deliveries_unit_idx').on(table.eventId, table.targetUnitId),
    releaseDeliveryIdx: index('scenario_deliveries_release_idx').on(table.eventId, table.releaseId),
  })
);

// Relations
export const scenarioPhasesRelations = relations(scenarioPhases, ({ one, many }) => ({
  event: one(events, {
    fields: [scenarioPhases.eventId],
    references: [events.id],
  }),
  injects: many(scenarioInjects),
}));

export const scenarioInjectsRelations = relations(scenarioInjects, ({ one, many }) => ({
  event: one(events, {
    fields: [scenarioInjects.eventId],
    references: [events.id],
  }),
  phase: one(scenarioPhases, {
    fields: [scenarioInjects.phaseId],
    references: [scenarioPhases.id],
  }),
  dependencies: many(scenarioInjectDependencies, { relationName: 'injectPrerequisites' }),
  conditions: many(scenarioInjectConditions),
  targets: many(scenarioInjectTargets),
  actions: many(scenarioInjectActions),
  releases: many(scenarioInjectReleases),
  translations: many(scenarioInjectTranslations),
}));

export const scenarioInjectTranslationsRelations = relations(scenarioInjectTranslations, ({ one }) => ({
  inject: one(scenarioInjects, {
    fields: [scenarioInjectTranslations.injectId],
    references: [scenarioInjects.id],
  }),
}));

export const scenarioDeliveriesRelations = relations(scenarioDeliveries, ({ one }) => ({
  release: one(scenarioInjectReleases, {
    fields: [scenarioDeliveries.releaseId],
    references: [scenarioInjectReleases.id],
  }),
  inject: one(scenarioInjects, {
    fields: [scenarioDeliveries.injectId],
    references: [scenarioInjects.id],
  }),
  user: one(users, {
    fields: [scenarioDeliveries.recipientUserId],
    references: [users.id],
  }),
  unit: one(organizationalUnits, {
    fields: [scenarioDeliveries.targetUnitId],
    references: [organizationalUnits.id],
  }),
}));

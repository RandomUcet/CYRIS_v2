import { pgTable, uuid, varchar, text, timestamp, integer, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { generateId } from '@cyris/shared';
import { events, organizationalUnits } from './events.js';
import { users } from './users.js';
import { scenarioPhases, scenarioInjects } from './scenario.js';
import { activityEvents } from './resources.js';

/**
 * Evaluation Objectives (Benchmarks / Rubrics)
 */
export const evaluationObjectives = pgTable(
  'evaluation_objectives',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 64 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description').notNull(),
    category: varchar('category', { length: 128 }),
    scenarioPhaseId: uuid('scenario_phase_id').references(() => scenarioPhases.id, {
      onDelete: 'set null',
    }),
    scenarioInjectId: uuid('scenario_inject_id').references(() => scenarioInjects.id, {
      onDelete: 'set null',
    }),
    targetUnitId: uuid('target_unit_id').references(() => organizationalUnits.id, {
      onDelete: 'set null',
    }),
    weight: integer('weight').default(1),
    status: varchar('status', { length: 32 }).notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    objectiveCodeIdx: uniqueIndex('eval_obj_code_idx').on(table.eventId, table.code),
  })
);

/**
 * Evaluation Criteria (Granular grading/measurement items for an objective)
 */
export const evaluationCriteria = pgTable('evaluation_criteria', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
  objectiveId: uuid('objective_id')
    .notNull()
    .references(() => evaluationObjectives.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  measurementType: varchar('measurement_type', { length: 32 }).notNull().default('SCORE'),
  maximumScore: integer('maximum_score'),
  sequence: integer('sequence').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Observer Notes / Observations (Evaluator-only factual notes & scores)
 * STRICT: Quarantined from participant view, participant search, and general participant timeline.
 */
export const evaluationObservations = pgTable('evaluation_observations', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  observerUserId: uuid('observer_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
  objectiveId: uuid('objective_id').references(() => evaluationObjectives.id, {
    onDelete: 'set null',
  }),
  criterionId: uuid('criterion_id').references(() => evaluationCriteria.id, {
    onDelete: 'set null',
  }),
  targetUnitId: uuid('target_unit_id').references(() => organizationalUnits.id, {
    onDelete: 'set null',
  }),
  targetUserId: uuid('target_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  scenarioInjectId: uuid('scenario_inject_id').references(() => scenarioInjects.id, {
    onDelete: 'set null',
  }),
  relatedResourceId: uuid('related_resource_id'),
  relatedActivityEventId: uuid('related_activity_event_id').references(() => activityEvents.id, {
    onDelete: 'set null',
  }),
  observationType: varchar('observation_type', { length: 64 }).notNull().default('NOTE'),
  note: text('note').notNull(),
  score: integer('score'),
  result: varchar('result', { length: 64 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const evaluationObjectivesRelations = relations(evaluationObjectives, ({ one, many }) => ({
  event: one(events, {
    fields: [evaluationObjectives.eventId],
    references: [events.id],
  }),
  scenarioPhase: one(scenarioPhases, {
    fields: [evaluationObjectives.scenarioPhaseId],
    references: [scenarioPhases.id],
  }),
  scenarioInject: one(scenarioInjects, {
    fields: [evaluationObjectives.scenarioInjectId],
    references: [scenarioInjects.id],
  }),
  targetUnit: one(organizationalUnits, {
    fields: [evaluationObjectives.targetUnitId],
    references: [organizationalUnits.id],
  }),
  criteria: many(evaluationCriteria),
  observations: many(evaluationObservations),
}));

export const evaluationCriteriaRelations = relations(evaluationCriteria, ({ one, many }) => ({
  objective: one(evaluationObjectives, {
    fields: [evaluationCriteria.objectiveId],
    references: [evaluationObjectives.id],
  }),
  observations: many(evaluationObservations),
}));

export const evaluationObservationsRelations = relations(evaluationObservations, ({ one }) => ({
  event: one(events, {
    fields: [evaluationObservations.eventId],
    references: [events.id],
  }),
  observerUser: one(users, {
    fields: [evaluationObservations.observerUserId],
    references: [users.id],
  }),
  objective: one(evaluationObjectives, {
    fields: [evaluationObservations.objectiveId],
    references: [evaluationObjectives.id],
  }),
  criterion: one(evaluationCriteria, {
    fields: [evaluationObservations.criterionId],
    references: [evaluationCriteria.id],
  }),
  targetUnit: one(organizationalUnits, {
    fields: [evaluationObservations.targetUnitId],
    references: [organizationalUnits.id],
  }),
  targetUser: one(users, {
    fields: [evaluationObservations.targetUserId],
    references: [users.id],
  }),
  scenarioInject: one(scenarioInjects, {
    fields: [evaluationObservations.scenarioInjectId],
    references: [scenarioInjects.id],
  }),
  relatedActivityEvent: one(activityEvents, {
    fields: [evaluationObservations.relatedActivityEventId],
    references: [activityEvents.id],
  }),
}));

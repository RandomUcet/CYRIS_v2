import { pgTable, uuid, varchar, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { generateId } from '@cyris/shared';
import { events, organizationalUnits } from './events.js';
import { resources } from './resources.js';
import { users } from './users.js';
import { persons, locations } from './registry.js';
import { incidents } from './investigation.js';

/**
 * Medical Encounters (Casualty / Treatment tracking)
 * resources.id === medical_encounters.id
 */
export const medicalEncounters = pgTable(
  'medical_encounters',
  {
    id: uuid('id')
      .primaryKey()
      .references(() => resources.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    medicalNumber: varchar('medical_number', { length: 64 }).notNull(),
    personId: uuid('person_id').references(() => persons.id, { onDelete: 'set null' }),
    status: varchar('status', { length: 32 }).notNull().default('RECEIVED'),
    triageCategory: varchar('triage_category', { length: 32 }).notNull().default('UNKNOWN'),
    incidentId: uuid('incident_id').references(() => incidents.id, { onDelete: 'set null' }),
    locationId: uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),
    chiefComplaint: text('chief_complaint'),
    mechanismOfInjury: text('mechanism_of_injury'),
    assessmentSummary: text('assessment_summary'),
    disposition: text('disposition'),
    assignedUnitId: uuid('assigned_unit_id').references(() => organizationalUnits.id, {
      onDelete: 'set null',
    }),
    assignedUserId: uuid('assigned_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    stabilizedAt: timestamp('stabilized_at', { withTimezone: true }),
    transferredAt: timestamp('transferred_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    medicalNumberIdx: uniqueIndex('med_event_num_idx').on(table.eventId, table.medicalNumber),
  })
);

/**
 * Medical Structured Observations (Vitals / Measurements)
 */
export const medicalObservations = pgTable('medical_observations', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
  encounterId: uuid('encounter_id')
    .notNull()
    .references(() => medicalEncounters.id, { onDelete: 'cascade' }),
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
  observationType: varchar('observation_type', { length: 64 }).notNull(),
  value: varchar('value', { length: 255 }).notNull(),
  unit: varchar('unit', { length: 64 }),
  note: text('note'),
  recordedByUserId: uuid('recorded_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Medical Interventions (Field / Clinical actions taken)
 */
export const medicalInterventions = pgTable('medical_interventions', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
  encounterId: uuid('encounter_id')
    .notNull()
    .references(() => medicalEncounters.id, { onDelete: 'cascade' }),
  interventionType: varchar('intervention_type', { length: 128 }).notNull(),
  description: text('description').notNull(),
  performedAt: timestamp('performed_at', { withTimezone: true }).notNull().defaultNow(),
  performedByUserId: uuid('performed_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  outcome: text('outcome'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const medicalEncountersRelations = relations(medicalEncounters, ({ one, many }) => ({
  resource: one(resources, {
    fields: [medicalEncounters.id],
    references: [resources.id],
  }),
  event: one(events, {
    fields: [medicalEncounters.eventId],
    references: [events.id],
  }),
  person: one(persons, {
    fields: [medicalEncounters.personId],
    references: [persons.id],
  }),
  incident: one(incidents, {
    fields: [medicalEncounters.incidentId],
    references: [incidents.id],
  }),
  location: one(locations, {
    fields: [medicalEncounters.locationId],
    references: [locations.id],
  }),
  assignedUnit: one(organizationalUnits, {
    fields: [medicalEncounters.assignedUnitId],
    references: [organizationalUnits.id],
  }),
  assignedUser: one(users, {
    fields: [medicalEncounters.assignedUserId],
    references: [users.id],
  }),
  observations: many(medicalObservations),
  interventions: many(medicalInterventions),
}));

export const medicalObservationsRelations = relations(medicalObservations, ({ one }) => ({
  encounter: one(medicalEncounters, {
    fields: [medicalObservations.encounterId],
    references: [medicalEncounters.id],
  }),
  recordedByUser: one(users, {
    fields: [medicalObservations.recordedByUserId],
    references: [users.id],
  }),
}));

export const medicalInterventionsRelations = relations(medicalInterventions, ({ one }) => ({
  encounter: one(medicalEncounters, {
    fields: [medicalInterventions.encounterId],
    references: [medicalEncounters.id],
  }),
  performedByUser: one(users, {
    fields: [medicalInterventions.performedByUserId],
    references: [users.id],
  }),
}));

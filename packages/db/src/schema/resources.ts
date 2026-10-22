import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  integer,
  primaryKey,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { generateId } from '@cyris/shared';
import { events, organizationalUnits } from './events.js';
import { users } from './users.js';

export const ResourceVisibility = {
  EVENT: 'EVENT',
  UNIT: 'UNIT',
  RESTRICTED: 'RESTRICTED',
  SCENARIO: 'SCENARIO',
} as const;

export type ResourceVisibilityValue = (typeof ResourceVisibility)[keyof typeof ResourceVisibility];

export const ActivityVisibility = {
  EVENT: 'EVENT',
  UNIT: 'UNIT',
  RESTRICTED: 'RESTRICTED',
  SCENARIO: 'SCENARIO',
} as const;

export type ActivityVisibilityValue = (typeof ActivityVisibility)[keyof typeof ActivityVisibility];

export const PrincipalType = {
  USER: 'USER',
  UNIT: 'UNIT',
} as const;

export type PrincipalTypeValue = (typeof PrincipalType)[keyof typeof PrincipalType];

/**
 * Common Resource Registry.
 * A lightweight cross-domain reference table allowing relationships, search references,
 * links, and AI context across future domain entities without generic EAV records.
 * All domain objects share the SAME UUID as resources.id.
 */
export const resources = pgTable(
  'resources',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateId()),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    resourceType: varchar('resource_type', { length: 64 }).notNull(),
    visibility: varchar('visibility', { length: 32 }).notNull().default(ResourceVisibility.EVENT),
    owningUnitId: uuid('owning_unit_id').references(() => organizationalUnits.id, { onDelete: 'set null' }),
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    eventResourceIdx: index('resources_event_type_idx').on(table.eventId, table.resourceType),
    visibilityIdx: index('resources_visibility_idx').on(table.visibility),
    owningUnitIdx: index('resources_owning_unit_idx').on(table.owningUnitId),
  })
);

/**
 * Concurrency-Safe Identifier Allocator.
 * Powers short operational identifiers (e.g. INC-0001, CASE-0001, E-0001, LAB-0001) per event.
 */
export const identifierCounters = pgTable(
  'identifier_counters',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    entityType: varchar('entity_type', { length: 32 }).notNull(),
    lastValue: integer('last_value').notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.eventId, table.entityType] }),
  })
);

/**
 * Explicit Resource Access Control List.
 * Provides explicit allowed principal grants (Users or Units) for RESTRICTED resources.
 */
export const resourceAccessControl = pgTable(
  'resource_access_control',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateId()),
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    principalType: varchar('principal_type', { length: 32 }).notNull(),
    principalId: uuid('principal_id').notNull(),
    grantedByUserId: uuid('granted_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    resourcePrincipalIdx: uniqueIndex('resource_acl_unique_idx').on(
      table.resourceId,
      table.principalType,
      table.principalId
    ),
    resourceIdx: index('resource_acl_resource_idx').on(table.resourceId),
  })
);

/**
 * Reusable Resource Assignments.
 * Explicitly assigns operational resources to users (assignees) or units.
 */
export const resourceAssignments = pgTable(
  'resource_assignments',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateId()),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    unitId: uuid('unit_id').references(() => organizationalUnits.id, { onDelete: 'set null' }),
    assignedByUserId: uuid('assigned_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
    notes: text('notes'),
  },
  (table) => ({
    resourceIdx: index('resource_assignments_resource_idx').on(table.resourceId),
    userIdx: index('resource_assignments_user_idx').on(table.userId),
    unitIdx: index('resource_assignments_unit_idx').on(table.unitId),
  })
);

/**
 * Cross-Domain Directed Resource Relationships.
 */
export const resourceRelationships = pgTable(
  'resource_relationships',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateId()),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    sourceResourceId: uuid('source_resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    targetResourceId: uuid('target_resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    relationshipType: varchar('relationship_type', { length: 64 }).notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    metadata: jsonb('metadata'),
  },
  (table) => ({
    uniqueActiveRelIdx: uniqueIndex('resource_rel_unique_active_idx')
      .on(table.eventId, table.sourceResourceId, table.targetResourceId, table.relationshipType)
      .where(sql`removed_at IS NULL`),
    sourceIdx: index('resource_rel_source_idx').on(table.sourceResourceId),
    targetIdx: index('resource_rel_target_idx').on(table.targetResourceId),
  })
);

/**
 * Operational Activity Events (Explicitly recorded timeline events).
 */
export const activityEvents = pgTable(
  'activity_events',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateId()),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    resourceId: uuid('resource_id').references(() => resources.id, { onDelete: 'set null' }),
    activityType: varchar('activity_type', { length: 64 }).notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    title: varchar('title', { length: 255 }).notNull(),
    summary: text('summary'),
    reason: text('reason'),
    source: varchar('source', { length: 64 }),
    causationId: uuid('causation_id'),
    requestId: varchar('request_id', { length: 64 }),
    relatedResourceIds: jsonb('related_resource_ids').$type<string[]>(),
    metadata: jsonb('metadata'),
    visibility: varchar('visibility', { length: 32 }).notNull().default(ActivityVisibility.EVENT),
  },
  (table) => ({
    eventOccurredIdx: index('activity_events_event_occurred_idx').on(table.eventId, table.occurredAt),
    resourceIdx: index('activity_events_resource_idx').on(table.resourceId),
    causationIdx: index('activity_events_causation_idx').on(table.causationId),
  })
);

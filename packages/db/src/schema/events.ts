import { pgTable, uuid, varchar, text, timestamp, uniqueIndex, foreignKey, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { generateId } from '@cyris/shared';
import { users } from './users.js';

export const EventStatus = {
  DRAFT: 'DRAFT',
  PREPARATION: 'PREPARATION',
  ACTIVE: 'ACTIVE',
  CLOSED: 'CLOSED',
  ARCHIVED: 'ARCHIVED',
} as const;

export type EventStatusType = (typeof EventStatus)[keyof typeof EventStatus];

export const MembershipStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;

export type MembershipStatusType = (typeof MembershipStatus)[keyof typeof MembershipStatus];

/**
 * Events / Exercises (e.g., Czech Cybertron 2027)
 */
export const events = pgTable('events', {
  id: uuid('id').primaryKey().$defaultFn(() => generateId()),
  slug: varchar('slug', { length: 128 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 32 }).notNull().default(EventStatus.DRAFT),
  defaultLocale: varchar('default_locale', { length: 16 }).notNull().default('en'),
  defaultTimezone: varchar('default_timezone', { length: 64 }).notNull().default('UTC'),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Event Memberships (Connects User to Event)
 */
export const eventMemberships = pgTable(
  'event_memberships',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateId()),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 32 }).notNull().default(MembershipStatus.ACTIVE),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    eventUserIdx: uniqueIndex('event_memberships_event_user_idx').on(table.eventId, table.userId),
  })
);

/**
 * Generic Event-Scoped Organizational Units (e.g. Investigation, SOC, Team Alpha)
 */
export const organizationalUnits = pgTable(
  'organizational_units',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateId()),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    parentUnitId: uuid('parent_unit_id'),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 128 }).notNull(),
    kind: varchar('kind', { length: 64 }).notNull().default('department'),
    description: text('description'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    eventSlugIdx: uniqueIndex('org_units_event_slug_idx').on(table.eventId, table.slug),
    parentFk: foreignKey({
      columns: [table.parentUnitId],
      foreignColumns: [table.id],
      name: 'org_units_parent_fk',
    }).onDelete('set null'),
  })
);

/**
 * Membership-to-Unit Assignments (Operators belonging to teams/units)
 */
export const membershipUnitAssignments = pgTable(
  'membership_unit_assignments',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateId()),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => eventMemberships.id, { onDelete: 'cascade' }),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => organizationalUnits.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    memberUnitIdx: uniqueIndex('membership_unit_idx').on(table.membershipId, table.unitId),
  })
);

/**
 * Unit Capabilities (Operational functionality relevant to the unit)
 */
export const unitCapabilities = pgTable(
  'unit_capabilities',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateId()),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => organizationalUnits.id, { onDelete: 'cascade' }),
    capabilityKey: varchar('capability_key', { length: 64 }).notNull(),
    configuration: jsonb('configuration'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    unitKeyIdx: uniqueIndex('unit_capabilities_unit_key_idx').on(table.unitId, table.capabilityKey),
  })
);

// Relations
export const eventsRelations = relations(events, ({ many }) => ({
  memberships: many(eventMemberships),
  units: many(organizationalUnits),
}));

export const eventMembershipsRelations = relations(eventMemberships, ({ one, many }) => ({
  event: one(events, {
    fields: [eventMemberships.eventId],
    references: [events.id],
  }),
  user: one(users, {
    fields: [eventMemberships.userId],
    references: [users.id],
  }),
  unitAssignments: many(membershipUnitAssignments),
}));

export const organizationalUnitsRelations = relations(organizationalUnits, ({ one, many }) => ({
  event: one(events, {
    fields: [organizationalUnits.eventId],
    references: [events.id],
  }),
  parentUnit: one(organizationalUnits, {
    fields: [organizationalUnits.parentUnitId],
    references: [organizationalUnits.id],
    relationName: 'subUnits',
  }),
  subUnits: many(organizationalUnits, {
    relationName: 'subUnits',
  }),
  membershipAssignments: many(membershipUnitAssignments),
  capabilities: many(unitCapabilities),
}));

export const membershipUnitAssignmentsRelations = relations(membershipUnitAssignments, ({ one }) => ({
  membership: one(eventMemberships, {
    fields: [membershipUnitAssignments.membershipId],
    references: [eventMemberships.id],
  }),
  unit: one(organizationalUnits, {
    fields: [membershipUnitAssignments.unitId],
    references: [organizationalUnits.id],
  }),
}));

export const unitCapabilitiesRelations = relations(unitCapabilities, ({ one }) => ({
  unit: one(organizationalUnits, {
    fields: [unitCapabilities.unitId],
    references: [organizationalUnits.id],
  }),
}));

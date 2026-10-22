import { pgTable, uuid, varchar, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { generateId, PermissionScopes } from '@cyris/shared';
import { users } from './users.js';
import { events, eventMemberships, organizationalUnits } from './events.js';

/**
 * Roles (Named bundles of permissions, either Platform-level or Event-specific)
 */
export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().$defaultFn(() => generateId()),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 128 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Role Permissions (Atomic permission key + Operational Scope)
 */
export const rolePermissions = pgTable(
  'role_permissions',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateId()),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionKey: varchar('permission_key', { length: 128 }).notNull(),
    scope: varchar('scope', { length: 32 }).notNull().default(PermissionScopes.EVENT),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    rolePermScopeIdx: uniqueIndex('role_perm_scope_idx').on(
      table.roleId,
      table.permissionKey,
      table.scope
    ),
  })
);

/**
 * Role Assignments (Platform role -> User, OR Event role -> EventMembership)
 */
export const roleAssignments = pgTable('role_assignments', {
  id: uuid('id').primaryKey().$defaultFn(() => generateId()),
  roleId: uuid('role_id')
    .notNull()
    .references(() => roles.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  membershipId: uuid('membership_id').references(() => eventMemberships.id, { onDelete: 'cascade' }),
  unitId: uuid('unit_id').references(() => organizationalUnits.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Relations
export const rolesRelations = relations(roles, ({ one, many }) => ({
  event: one(events, {
    fields: [roles.eventId],
    references: [events.id],
  }),
  permissions: many(rolePermissions),
  assignments: many(roleAssignments),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, {
    fields: [rolePermissions.roleId],
    references: [roles.id],
  }),
}));

export const roleAssignmentsRelations = relations(roleAssignments, ({ one }) => ({
  role: one(roles, {
    fields: [roleAssignments.roleId],
    references: [roles.id],
  }),
  user: one(users, {
    fields: [roleAssignments.userId],
    references: [users.id],
  }),
  membership: one(eventMemberships, {
    fields: [roleAssignments.membershipId],
    references: [eventMemberships.id],
  }),
  unit: one(organizationalUnits, {
    fields: [roleAssignments.unitId],
    references: [organizationalUnits.id],
  }),
}));

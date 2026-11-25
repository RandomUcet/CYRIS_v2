import { pgTable, boolean, uuid, varchar, text, timestamp, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { generateId } from '@cyris/shared';

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
} as const;

export type UserStatusType = (typeof UserStatus)[keyof typeof UserStatus];

export const IdentityProviderType = {
  LOCAL: 'LOCAL',
  LDAP: 'LDAP',
  OIDC: 'OIDC',
} as const;

export type IdentityProviderType = (typeof IdentityProviderType)[keyof typeof IdentityProviderType];

/**
 * CYRIS User Profile (Real human operator, distinct from scenario Persons)
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().$defaultFn(() => generateId()),
  email: varchar('email', { length: 255 }).notNull().unique(),
  displayName: varchar('display_name', { length: 255 }).notNull(),
  status: varchar('status', { length: 32 }).notNull().default(UserStatus.ACTIVE),
  testExpiresAt: timestamp('test_expires_at', {withTimezone:true}),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Authentication Identities (1:N with users, allows Local, LDAP, OIDC)
 */
export const userIdentities = pgTable(
  'user_identities',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateId()),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    providerType: varchar('provider_type', { length: 32 }).notNull(),
    providerSubject: varchar('provider_subject', { length: 255 }).notNull(),
    passwordHash: text('password_hash'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    providerSubjectIdx: uniqueIndex('user_identities_provider_sub_idx').on(
      table.providerType,
      table.providerSubject
    ),
  })
);

export const userPreferences = pgTable('user_preferences', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  locale: varchar('locale', { length: 16 }).notNull().default('en'),
  timezone: varchar('timezone', { length: 64 }).notNull().default('UTC'),
  dateFormat: varchar('date_format', { length: 32 }),
  timeFormat: varchar('time_format', { length: 32 }),
  notificationChannels: jsonb('notification_channels').notNull().default('{"inApp": true, "email": true}'),
  notificationCategories: jsonb('notification_categories').notNull().default('{}'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ one, many }) => ({
  identities: many(userIdentities),
  preferences: one(userPreferences, {
    fields: [users.id],
    references: [userPreferences.userId],
  }),
}));

export const userIdentitiesRelations = relations(userIdentities, ({ one }) => ({
  user: one(users, {
    fields: [userIdentities.userId],
    references: [users.id],
  }),
}));

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(users, {
    fields: [userPreferences.userId],
    references: [users.id],
  }),
}));

/** Only generated local exercise accounts participate in the preview switch. */
export const previewTeamAccounts = pgTable('preview_team_accounts', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(false),
  generation: uuid('generation').notNull().defaultRandom(),
});

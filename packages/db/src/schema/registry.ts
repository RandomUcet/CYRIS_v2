import { pgTable, uuid, varchar, text, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { resources } from './resources.js';

/**
 * ==============================================================================
 * CYRIS v2 — Scenario Registry Domain Entities
 * ==============================================================================
 * Fictional scenario entities (NOT CYRIS operator user accounts).
 * All typed resource objects share primary key: domain_table.id = resources.id.
 */

export const RegistryStatus = {
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
  DECEASED: 'DECEASED',
  UNKNOWN: 'UNKNOWN',
} as const;

export type RegistryStatusValue = (typeof RegistryStatus)[keyof typeof RegistryStatus];

/**
 * Fictional Scenario Person.
 */
export const persons = pgTable(
  'persons',
  {
    id: uuid('id')
      .primaryKey()
      .references(() => resources.id, { onDelete: 'cascade' }),
    identifier: varchar('identifier', { length: 32 }),
    displayName: varchar('display_name', { length: 255 }).notNull(),
    givenName: varchar('given_name', { length: 128 }),
    middleName: varchar('middle_name', { length: 128 }),
    familyName: varchar('family_name', { length: 128 }),
    dateOfBirth: varchar('date_of_birth', { length: 32 }),
    nationality: varchar('nationality', { length: 64 }),
    emails: jsonb('emails').$type<Array<{ value: string; label?: string; primary?: boolean; note?: string }>>().default([]),
    phones: jsonb('phones').$type<Array<{ value: string; label?: string; primary?: boolean; note?: string }>>().default([]),
    provenance: varchar('provenance', { length: 32 }).notNull().default('MANUAL'),
    generationBatchId: varchar('generation_batch_id', { length: 128 }),
    generationSeed: varchar('generation_seed', { length: 255 }),
    description: text('description'),
    status: varchar('status', { length: 32 }).notNull().default(RegistryStatus.ACTIVE),
    aliases: jsonb('aliases').$type<string[]>().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    displayNameIdx: index('persons_display_name_idx').on(table.displayName),
    statusIdx: index('persons_status_idx').on(table.status),
    identifierIdx: uniqueIndex('persons_identifier_unique_idx').on(table.identifier),
  })
);

/**
 * Fictional Scenario Organisation.
 */
export const organisations = pgTable(
  'organisations',
  {
    id: uuid('id')
      .primaryKey()
      .references(() => resources.id, { onDelete: 'cascade' }),
    identifier: varchar('identifier', { length: 32 }),
    name: varchar('name', { length: 255 }).notNull(),
    shortName: varchar('short_name', { length: 128 }),
    aliases: jsonb('aliases').$type<string[]>().default([]),
    legalName: varchar('legal_name', { length: 255 }),
    registrationNumber: varchar('registration_number', { length: 64 }),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 64 }),
    website: varchar('website', { length: 255 }),
    provenance: varchar('provenance', { length: 32 }).notNull().default('MANUAL'),
    generationBatchId: varchar('generation_batch_id', { length: 128 }),
    generationSeed: varchar('generation_seed', { length: 255 }),
    description: text('description'),
    status: varchar('status', { length: 32 }).notNull().default(RegistryStatus.ACTIVE),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nameIdx: index('organisations_name_idx').on(table.name),
    regNumIdx: index('organisations_reg_num_idx').on(table.registrationNumber),
    identifierIdx: uniqueIndex('organisations_identifier_unique_idx').on(table.identifier),
  })
);

/**
 * Fictional Scenario Location.
 */
export const locations = pgTable(
  'locations',
  {
    id: uuid('id')
      .primaryKey()
      .references(() => resources.id, { onDelete: 'cascade' }),
    identifier: varchar('identifier', { length: 32 }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    addressText: text('address_text'),
    locationType: varchar('location_type', { length: 64 }),
    city: varchar('city', { length: 128 }),
    region: varchar('region', { length: 128 }),
    country: varchar('country', { length: 128 }),
    postalCode: varchar('postal_code', { length: 32 }),
    latitude: varchar('latitude', { length: 32 }),
    longitude: varchar('longitude', { length: 32 }),
    provenance: varchar('provenance', { length: 32 }).notNull().default('MANUAL'),
    generationBatchId: varchar('generation_batch_id', { length: 128 }),
    generationSeed: varchar('generation_seed', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nameIdx: index('locations_name_idx').on(table.name),
    identifierIdx: uniqueIndex('locations_identifier_unique_idx').on(table.identifier),
  })
);

/**
 * Fictional Scenario Vehicle.
 */
export const vehicles = pgTable(
  'vehicles',
  {
    id: uuid('id')
      .primaryKey()
      .references(() => resources.id, { onDelete: 'cascade' }),
    identifier: varchar('identifier', { length: 32 }),
    label: varchar('label', { length: 255 }).notNull(),
    registrationPlate: varchar('registration_plate', { length: 32 }),
    vin: varchar('vin', { length: 64 }),
    make: varchar('make', { length: 64 }),
    model: varchar('model', { length: 64 }),
    variant: varchar('variant', { length: 128 }),
    modelYear: varchar('model_year', { length: 4 }),
    colour: varchar('colour', { length: 32 }),
    description: text('description'),
    status: varchar('status', { length: 32 }).notNull().default(RegistryStatus.ACTIVE),
    provenance: varchar('provenance', { length: 32 }).notNull().default('MANUAL'),
    generationBatchId: varchar('generation_batch_id', { length: 128 }),
    generationSeed: varchar('generation_seed', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    labelIdx: index('vehicles_label_idx').on(table.label),
    plateIdx: index('vehicles_plate_idx').on(table.registrationPlate),
    identifierIdx: uniqueIndex('vehicles_identifier_unique_idx').on(table.identifier),
  })
);

/**
 * Fictional Scenario Device.
 */
export const devices = pgTable(
  'devices',
  {
    id: uuid('id')
      .primaryKey()
      .references(() => resources.id, { onDelete: 'cascade' }),
    identifier: varchar('identifier', { length: 32 }),
    label: varchar('label', { length: 255 }).notNull(),
    deviceType: varchar('device_type', { length: 64 }).notNull(), // 'PHONE', 'LAPTOP', 'SERVER', 'USB', 'ROUTER', etc.
    manufacturer: varchar('manufacturer', { length: 64 }),
    model: varchar('model', { length: 64 }),
    serialNumber: varchar('serial_number', { length: 64 }),
    assetTag: varchar('asset_tag', { length: 64 }),
    hostname: varchar('hostname', { length: 128 }),
    operatingSystem: varchar('operating_system', { length: 128 }),
    macAddress: varchar('mac_address', { length: 64 }),
    ipAddress: varchar('ip_address', { length: 64 }),
    description: text('description'),
    status: varchar('status', { length: 32 }).notNull().default(RegistryStatus.ACTIVE),
    provenance: varchar('provenance', { length: 32 }).notNull().default('MANUAL'),
    generationBatchId: varchar('generation_batch_id', { length: 128 }),
    generationSeed: varchar('generation_seed', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    labelIdx: index('devices_label_idx').on(table.label),
    hostnameIdx: index('devices_hostname_idx').on(table.hostname),
    serialIdx: index('devices_serial_idx').on(table.serialNumber),
    identifierIdx: uniqueIndex('devices_identifier_unique_idx').on(table.identifier),
  })
);

export const weapons = pgTable(
  'weapons',
  {
    id: uuid('id').primaryKey().references(() => resources.id, { onDelete: 'cascade' }),
    identifier: varchar('identifier', { length: 32 }),
    category: varchar('category', { length: 128 }).notNull(),
    manufacturer: varchar('manufacturer', { length: 128 }),
    model: varchar('model', { length: 128 }),
    serialNumber: varchar('serial_number', { length: 128 }),
    calibre: varchar('calibre', { length: 128 }),
    description: text('description'),
    status: varchar('status', { length: 32 }).notNull().default(RegistryStatus.ACTIVE),
    provenance: varchar('provenance', { length: 32 }).notNull().default('MANUAL'),
    generationBatchId: varchar('generation_batch_id', { length: 128 }),
    generationSeed: varchar('generation_seed', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    identifierIdx: uniqueIndex('weapons_identifier_unique_idx').on(table.identifier),
    serialIdx: index('weapons_serial_idx').on(table.serialNumber),
  })
);

export const registryMedia = pgTable(
  'registry_media',
  {
    id: uuid('id').primaryKey(),
    resourceId: uuid('resource_id').notNull().references(() => resources.id, { onDelete: 'cascade' }),
    objectKey: varchar('object_key', { length: 512 }).notNull(),
    bucket: varchar('bucket', { length: 128 }).notNull(),
    filename: varchar('filename', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 128 }).notNull(),
    byteSize: varchar('byte_size', { length: 32 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    resourceUniqueIdx: uniqueIndex('registry_media_resource_unique_idx').on(table.resourceId),
  })
);

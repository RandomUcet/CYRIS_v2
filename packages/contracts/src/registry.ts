import { z } from 'zod';
import { ResourceVisibilitySchema } from './resources.js';

export const RegistryStatusSchema = z.enum(['ACTIVE', 'ARCHIVED', 'DECEASED', 'UNKNOWN']);
export type RegistryStatus = z.infer<typeof RegistryStatusSchema>;
export const RegistryProvenanceSchema = z.enum(['MANUAL', 'SYNTHETIC', 'IMPORTED', 'SYSTEM']);
export type RegistryProvenance = z.infer<typeof RegistryProvenanceSchema>;
const ContactMethodSchema = z.object({
  value: z.string().min(1),
  label: z.string().optional(),
  primary: z.boolean().optional(),
  note: z.string().optional(),
});

// --- Person ---
export const CreatePersonRequestSchema = z.object({
  displayName: z.string().min(1),
  givenName: z.string().optional(),
  middleName: z.string().optional(),
  familyName: z.string().optional(),
  dateOfBirth: z.string().optional(),
  nationality: z.string().optional(),
  emails: z.array(ContactMethodSchema).nullable().optional(),
  phones: z.array(ContactMethodSchema).nullable().optional(),
  description: z.string().optional(),
  status: RegistryStatusSchema.default('ACTIVE'),
  aliases: z.array(z.string()).optional(),
  provenance: RegistryProvenanceSchema.optional(),
  generationBatchId: z.string().optional(),
  generationSeed: z.string().optional(),
  visibility: ResourceVisibilitySchema.default('EVENT'),
  owningUnitId: z.string().uuid().optional(),
});

export type CreatePersonRequest = z.infer<typeof CreatePersonRequestSchema>;

export const UpdatePersonRequestSchema = CreatePersonRequestSchema.partial();
export type UpdatePersonRequest = z.infer<typeof UpdatePersonRequestSchema>;

export const PersonResponseSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  displayName: z.string(),
  givenName: z.string().nullable().optional(),
  middleName: z.string().nullable().optional(),
  familyName: z.string().nullable().optional(),
  dateOfBirth: z.string().nullable().optional(),
  nationality: z.string().nullable().optional(),
  emails: z.array(ContactMethodSchema).nullable().optional(),
  phones: z.array(ContactMethodSchema).nullable().optional(),
  description: z.string().nullable().optional(),
  status: z.string(),
  aliases: z.array(z.string()).optional(),
  identifier: z.string().nullable().optional(),
  provenance: z.string().optional(),
  generationBatchId: z.string().nullable().optional(),
  generationSeed: z.string().nullable().optional(),
  visibility: z.string(),
  owningUnitId: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type PersonResponse = z.infer<typeof PersonResponseSchema>;

// --- Organisation ---
export const CreateOrganisationRequestSchema = z.object({
  name: z.string().min(1),
  shortName: z.string().optional(),
  aliases: z.array(z.string()).optional(),
  legalName: z.string().optional(),
  registrationNumber: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  website: z.string().url().optional(),
  description: z.string().optional(),
  status: RegistryStatusSchema.default('ACTIVE'),
  provenance: RegistryProvenanceSchema.optional(),
  generationBatchId: z.string().optional(),
  generationSeed: z.string().optional(),
  visibility: ResourceVisibilitySchema.default('EVENT'),
  owningUnitId: z.string().uuid().optional(),
});

export type CreateOrganisationRequest = z.infer<typeof CreateOrganisationRequestSchema>;

export const UpdateOrganisationRequestSchema = CreateOrganisationRequestSchema.partial();
export type UpdateOrganisationRequest = z.infer<typeof UpdateOrganisationRequestSchema>;

export const OrganisationResponseSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  name: z.string(),
  shortName: z.string().nullable().optional(),
  aliases: z.array(z.string()).nullable().optional(),
  legalName: z.string().nullable().optional(),
  registrationNumber: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  status: z.string(),
  identifier: z.string().nullable().optional(),
  provenance: z.string().optional(),
  generationBatchId: z.string().nullable().optional(),
  generationSeed: z.string().nullable().optional(),
  visibility: z.string(),
  owningUnitId: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type OrganisationResponse = z.infer<typeof OrganisationResponseSchema>;

// --- Location ---
export const CreateLocationRequestSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  addressText: z.string().optional(),
  locationType: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  country: z.string().optional(),
  postalCode: z.string().optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  provenance: RegistryProvenanceSchema.optional(),
  generationBatchId: z.string().optional(),
  generationSeed: z.string().optional(),
  visibility: ResourceVisibilitySchema.default('EVENT'),
  owningUnitId: z.string().uuid().optional(),
});

export type CreateLocationRequest = z.infer<typeof CreateLocationRequestSchema>;

export const UpdateLocationRequestSchema = CreateLocationRequestSchema.partial();
export type UpdateLocationRequest = z.infer<typeof UpdateLocationRequestSchema>;

export const LocationResponseSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable().optional(),
  addressText: z.string().nullable().optional(),
  locationType: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  latitude: z.string().nullable().optional(),
  longitude: z.string().nullable().optional(),
  identifier: z.string().nullable().optional(),
  provenance: z.string().optional(),
  generationBatchId: z.string().nullable().optional(),
  generationSeed: z.string().nullable().optional(),
  visibility: z.string(),
  owningUnitId: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type LocationResponse = z.infer<typeof LocationResponseSchema>;

// --- Vehicle ---
export const CreateVehicleRequestSchema = z.object({
  label: z.string().min(1),
  registrationPlate: z.string().optional(),
  vin: z.string().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  variant: z.string().optional(),
  modelYear: z.string().optional(),
  colour: z.string().optional(),
  description: z.string().optional(),
  status: RegistryStatusSchema.default('ACTIVE'),
  provenance: RegistryProvenanceSchema.optional(),
  generationBatchId: z.string().optional(),
  generationSeed: z.string().optional(),
  visibility: ResourceVisibilitySchema.default('EVENT'),
  owningUnitId: z.string().uuid().optional(),
});

export type CreateVehicleRequest = z.infer<typeof CreateVehicleRequestSchema>;

export const UpdateVehicleRequestSchema = CreateVehicleRequestSchema.partial();
export type UpdateVehicleRequest = z.infer<typeof UpdateVehicleRequestSchema>;

export const VehicleResponseSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  label: z.string(),
  registrationPlate: z.string().nullable().optional(),
  vin: z.string().nullable().optional(),
  make: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  variant: z.string().nullable().optional(),
  modelYear: z.string().nullable().optional(),
  colour: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  status: z.string(),
  identifier: z.string().nullable().optional(),
  provenance: z.string().optional(),
  generationBatchId: z.string().nullable().optional(),
  generationSeed: z.string().nullable().optional(),
  visibility: z.string(),
  owningUnitId: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type VehicleResponse = z.infer<typeof VehicleResponseSchema>;

// --- Device ---
export const CreateDeviceRequestSchema = z.object({
  label: z.string().min(1),
  deviceType: z.string().min(1),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  assetTag: z.string().optional(),
  hostname: z.string().optional(),
  operatingSystem: z.string().optional(),
  macAddress: z.string().optional(),
  ipAddress: z.string().optional(),
  description: z.string().optional(),
  status: RegistryStatusSchema.default('ACTIVE'),
  provenance: RegistryProvenanceSchema.optional(),
  generationBatchId: z.string().optional(),
  generationSeed: z.string().optional(),
  visibility: ResourceVisibilitySchema.default('EVENT'),
  owningUnitId: z.string().uuid().optional(),
});

export type CreateDeviceRequest = z.infer<typeof CreateDeviceRequestSchema>;

export const UpdateDeviceRequestSchema = CreateDeviceRequestSchema.partial();
export type UpdateDeviceRequest = z.infer<typeof UpdateDeviceRequestSchema>;

export const DeviceResponseSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  label: z.string(),
  deviceType: z.string(),
  manufacturer: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  serialNumber: z.string().nullable().optional(),
  assetTag: z.string().nullable().optional(),
  hostname: z.string().nullable().optional(),
  operatingSystem: z.string().nullable().optional(),
  macAddress: z.string().nullable().optional(),
  ipAddress: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  status: z.string(),
  identifier: z.string().nullable().optional(),
  provenance: z.string().optional(),
  generationBatchId: z.string().nullable().optional(),
  generationSeed: z.string().nullable().optional(),
  visibility: z.string(),
  owningUnitId: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type DeviceResponse = z.infer<typeof DeviceResponseSchema>;

// --- Weapon ---
export const CreateWeaponRequestSchema = z.object({
  category: z.string().min(1),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  calibre: z.string().optional(),
  description: z.string().optional(),
  status: RegistryStatusSchema.default('ACTIVE'),
  provenance: RegistryProvenanceSchema.default('MANUAL'),
  generationBatchId: z.string().optional(),
  generationSeed: z.string().optional(),
  visibility: ResourceVisibilitySchema.default('EVENT'),
  owningUnitId: z.string().uuid().optional(),
});
export type CreateWeaponRequest = z.infer<typeof CreateWeaponRequestSchema>;
export const UpdateWeaponRequestSchema = CreateWeaponRequestSchema.partial();
export type UpdateWeaponRequest = z.infer<typeof UpdateWeaponRequestSchema>;
export const WeaponResponseSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  category: z.string(),
  manufacturer: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  serialNumber: z.string().nullable().optional(),
  calibre: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  status: z.string(),
  identifier: z.string().nullable().optional(),
  provenance: z.string(),
  generationBatchId: z.string().nullable().optional(),
  generationSeed: z.string().nullable().optional(),
  visibility: z.string(),
  owningUnitId: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WeaponResponse = z.infer<typeof WeaponResponseSchema>;

/** Event-isolated selector for creating relationships without a search index. */
export const RegistryPickerQuerySchema = z.object({
  q: z.string().trim().min(2).max(80),
  limit: z.coerce.number().int().min(1).max(30).default(20),
  types:z.enum(['persons','organisations','persons,organisations','devices','locations','vehicles','weapons','licences']).optional(),
});
export type RegistryPickerQuery = z.infer<typeof RegistryPickerQuerySchema>;
export type RegistryPickerTypes=NonNullable<RegistryPickerQuery['types']>;
export const RegistryPickerResultSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  entityType: z.enum(['persons','organisations','locations','vehicles','devices','weapons','licences']),
  identifier: z.string().nullable(),
  label: z.string(),
});
export type RegistryPickerResult = z.infer<typeof RegistryPickerResultSchema>;

export const LicenceCategorySchema = z.enum(['DRIVING','FIREARMS','PROFESSIONAL','BUSINESS','SECURITY','OTHER']);
export const LicenceStatusSchema = z.enum(['ISSUED','SUSPENDED','REVOKED','ARCHIVED']);
const LicenceDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
}, 'Invalid calendar date');
const LicenceFieldsSchema = z.object({
  title: z.string().trim().min(1).max(200),
  category: LicenceCategorySchema,
  licenceNumber: z.string().trim().min(1).max(100).nullable().optional(),
  validFrom: LicenceDateSchema,
  validUntil: LicenceDateSchema.nullable().optional(),
  status: LicenceStatusSchema.default('ISSUED'),
  description: z.string().max(10000).nullable().optional(),
});
export function licenceDatesOrdered(from: string, until?: string | null): boolean {
  return !until || from <= until;
}
export const CreateLicenceRequestSchema = LicenceFieldsSchema.extend({
  holderId: z.string().uuid(),
  issuerId: z.string().uuid(),
  visibility: z.enum(['EVENT','RESTRICTED','SCENARIO']).default('EVENT'),
}).strict().refine(data => data.holderId !== data.issuerId, 'Holder and issuer must be different')
  .refine(data => licenceDatesOrdered(data.validFrom, data.validUntil), 'End date precedes start date');
export const UpdateLicenceRequestSchema = LicenceFieldsSchema.partial().strict();
export type CreateLicenceRequest = z.infer<typeof CreateLicenceRequestSchema>;
export type UpdateLicenceRequest = z.infer<typeof UpdateLicenceRequestSchema>;
/** Evaluate against the exercise date, never silently against the host clock. */
export function effectiveLicenceStatus(status: z.infer<typeof LicenceStatusSchema>, from: string, until: string | null, exerciseDate: string) {
  if (status !== 'ISSUED') return status;
  if (exerciseDate < from) return 'NOT_YET_VALID';
  if (until && exerciseDate > until) return 'EXPIRED';
  return 'VALID';
}

/** Date of the exercise instant in its configured time zone, not the viewer/host date. */
export function licenceExerciseDate(instant:Date,timeZone:string):string|null{
  if(!Number.isFinite(instant.getTime()))return null;
  try{
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',calendar:'gregory',numberingSystem:'latn'}).formatToParts(instant);
    const part=(name:string)=>parts.find(p=>p.type===name)?.value;
    const date=[part('year')?.padStart(4,'0'),part('month'),part('day')].join('-');
    return LicenceDateSchema.safeParse(date).success?date:null;
  }catch{return null;}
}
export const LicenceEffectiveStatusSchema=z.enum(['VALID','NOT_YET_VALID','EXPIRED','SUSPENDED','REVOKED','ARCHIVED']);
export type LicenceEffectiveStatus=z.infer<typeof LicenceEffectiveStatusSchema>;

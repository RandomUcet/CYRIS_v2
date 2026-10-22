import { z } from 'zod';

export const MedicalEncounterStatus = {
  RECEIVED: 'RECEIVED',
  TRIAGED: 'TRIAGED',
  UNDER_CARE: 'UNDER_CARE',
  STABILIZED: 'STABILIZED',
  TRANSFERRED: 'TRANSFERRED',
  CLOSED: 'CLOSED',
  DECEASED: 'DECEASED',
} as const;

export type MedicalEncounterStatusType = (typeof MedicalEncounterStatus)[keyof typeof MedicalEncounterStatus];

export const TriageCategory = {
  IMMEDIATE: 'IMMEDIATE', // Red
  DELAYED: 'DELAYED',     // Yellow
  MINOR: 'MINOR',         // Green
  EXPECTANT: 'EXPECTANT', // Black
  UNKNOWN: 'UNKNOWN',
} as const;

export type TriageCategoryType = (typeof TriageCategory)[keyof typeof TriageCategory];

export const MedicalObservationType = {
  HEART_RATE: 'HEART_RATE',
  BLOOD_PRESSURE: 'BLOOD_PRESSURE',
  SPO2: 'SPO2',
  TEMPERATURE: 'TEMPERATURE',
  RESPIRATORY_RATE: 'RESPIRATORY_RATE',
  GCS: 'GCS',
  OTHER: 'OTHER',
} as const;

export type MedicalObservationTypeValue = (typeof MedicalObservationType)[keyof typeof MedicalObservationType];

/* -------------------------------------------------------------------------- */
/* Models                                                                     */
/* -------------------------------------------------------------------------- */

export const MedicalObservationItemSchema = z.object({
  id: z.string().uuid(),
  encounterId: z.string().uuid(),
  observedAt: z.string(),
  observationType: z.string(),
  value: z.string(),
  unit: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  recordedByUserId: z.string().uuid(),
  recordedByUserDisplayName: z.string().optional(),
  createdAt: z.string(),
});

export type MedicalObservationItem = z.infer<typeof MedicalObservationItemSchema>;

export const MedicalInterventionItemSchema = z.object({
  id: z.string().uuid(),
  encounterId: z.string().uuid(),
  interventionType: z.string(),
  description: z.string(),
  performedAt: z.string(),
  performedByUserId: z.string().uuid(),
  performedByUserDisplayName: z.string().optional(),
  outcome: z.string().nullable().optional(),
  createdAt: z.string(),
});

export type MedicalInterventionItem = z.infer<typeof MedicalInterventionItemSchema>;

export const MedicalEncounterItemSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  medicalNumber: z.string(),
  personId: z.string().uuid().nullable().optional(),
  personDisplayName: z.string().optional(),
  status: z.enum(['RECEIVED', 'TRIAGED', 'UNDER_CARE', 'STABILIZED', 'TRANSFERRED', 'CLOSED', 'DECEASED']),
  triageCategory: z.enum(['IMMEDIATE', 'DELAYED', 'MINOR', 'EXPECTANT', 'UNKNOWN']),
  visibility: z.enum(['EVENT', 'UNIT', 'RESTRICTED', 'SCENARIO']).default('UNIT'),
  incidentId: z.string().uuid().nullable().optional(),
  incidentNumber: z.string().optional(),
  locationId: z.string().uuid().nullable().optional(),
  locationName: z.string().optional(),
  chiefComplaint: z.string().nullable().optional(),
  mechanismOfInjury: z.string().nullable().optional(),
  assessmentSummary: z.string().nullable().optional(),
  disposition: z.string().nullable().optional(),
  assignedUnitId: z.string().uuid().nullable().optional(),
  assignedUnitName: z.string().optional(),
  assignedUserId: z.string().uuid().nullable().optional(),
  assignedUserDisplayName: z.string().optional(),
  openedAt: z.string(),
  stabilizedAt: z.string().nullable().optional(),
  transferredAt: z.string().nullable().optional(),
  closedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type MedicalEncounterItem = z.infer<typeof MedicalEncounterItemSchema>;

export const MedicalEncounterDetailSchema = MedicalEncounterItemSchema.extend({
  observations: z.array(MedicalObservationItemSchema).default([]),
  interventions: z.array(MedicalInterventionItemSchema).default([]),
  documents: z
    .array(
      z.object({
        id: z.string().uuid(),
        title: z.string(),
        documentNumber: z.string().optional(),
        documentType: z.string(),
      })
    )
    .default([]),
  timeline: z
    .array(
      z.object({
        id: z.string().uuid(),
        activityType: z.string(),
        occurredAt: z.string(),
        title: z.string(),
        summary: z.string().optional(),
        actorUserId: z.string().nullable().optional(),
      })
    )
    .default([]),
});

export type MedicalEncounterDetail = z.infer<typeof MedicalEncounterDetailSchema>;

/**
 * Operational Medical Summary for Command & Crisis Management.
 * STRICT: Contains ONLY aggregate numbers, zero patient clinical notes or identities.
 */
export const MedicalOperationalSummaryResponseSchema = z.object({
  eventId: z.string().uuid(),
  totalEncounters: z.number().int().nonnegative(),
  activeCasualties: z.number().int().nonnegative(),
  stabilizedCasualties: z.number().int().nonnegative(),
  transferredCasualties: z.number().int().nonnegative(),
  closedCasualties: z.number().int().nonnegative(),
  deceasedCasualties: z.number().int().nonnegative(),
  triageCounts: z.object({
    IMMEDIATE: z.number().int().nonnegative(),
    DELAYED: z.number().int().nonnegative(),
    MINOR: z.number().int().nonnegative(),
    EXPECTANT: z.number().int().nonnegative(),
    UNKNOWN: z.number().int().nonnegative(),
  }),
  lastUpdated: z.string(),
});

export type MedicalOperationalSummaryResponse = z.infer<typeof MedicalOperationalSummaryResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Requests                                                                   */
/* -------------------------------------------------------------------------- */

export const CreateMedicalEncounterRequestSchema = z.object({
  personId: z.string().uuid().optional(),
  triageCategory: z.enum(['IMMEDIATE', 'DELAYED', 'MINOR', 'EXPECTANT', 'UNKNOWN']).default('UNKNOWN'),
  incidentId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  chiefComplaint: z.string().max(2000).optional(),
  mechanismOfInjury: z.string().max(2000).optional(),
  assessmentSummary: z.string().max(5000).optional(),
  assignedUnitId: z.string().uuid().optional(),
  assignedUserId: z.string().uuid().optional(),
  visibility: z.enum(['EVENT', 'UNIT', 'RESTRICTED', 'SCENARIO']).default('UNIT'),
});

export type CreateMedicalEncounterRequest = z.infer<typeof CreateMedicalEncounterRequestSchema>;

export const UpdateMedicalEncounterRequestSchema = z.object({
  personId: z.string().uuid().nullable().optional(),
  locationId: z.string().uuid().nullable().optional(),
  chiefComplaint: z.string().max(2000).optional(),
  mechanismOfInjury: z.string().max(2000).optional(),
  assessmentSummary: z.string().max(5000).optional(),
  disposition: z.string().max(2000).optional(),
  assignedUnitId: z.string().uuid().nullable().optional(),
  assignedUserId: z.string().uuid().nullable().optional(),
});

export type UpdateMedicalEncounterRequest = z.infer<typeof UpdateMedicalEncounterRequestSchema>;

export const TriageMedicalEncounterRequestSchema = z.object({
  triageCategory: z.enum(['IMMEDIATE', 'DELAYED', 'MINOR', 'EXPECTANT', 'UNKNOWN']),
  notes: z.string().max(2000).optional(),
});

export type TriageMedicalEncounterRequest = z.infer<typeof TriageMedicalEncounterRequestSchema>;

export const CreateMedicalObservationRequestSchema = z.object({
  observationType: z.enum([
    'HEART_RATE',
    'BLOOD_PRESSURE',
    'SPO2',
    'TEMPERATURE',
    'RESPIRATORY_RATE',
    'GCS',
    'OTHER',
  ]),
  value: z.string().min(1).max(255),
  unit: z.string().max(64).optional(),
  note: z.string().max(1000).optional(),
});

export type CreateMedicalObservationRequest = z.infer<typeof CreateMedicalObservationRequestSchema>;

export const CreateMedicalInterventionRequestSchema = z.object({
  interventionType: z.string().min(1).max(128),
  description: z.string().min(1).max(5000),
  outcome: z.string().max(1000).optional(),
});

export type CreateMedicalInterventionRequest = z.infer<typeof CreateMedicalInterventionRequestSchema>;

export const TransferMedicalEncounterRequestSchema = z.object({
  targetLocationId: z.string().uuid(),
  disposition: z.string().min(1).max(2000),
  receivingUnitId: z.string().uuid().optional(),
});

export type TransferMedicalEncounterRequest = z.infer<typeof TransferMedicalEncounterRequestSchema>;

export const CloseMedicalEncounterRequestSchema = z.object({
  status: z.enum(['CLOSED', 'DECEASED']).default('CLOSED'),
  disposition: z.string().min(1).max(2000),
});

export type CloseMedicalEncounterRequest = z.infer<typeof CloseMedicalEncounterRequestSchema>;

export const MedicalQueryFiltersSchema = z.object({
  eventId: z.string().uuid().optional(),
  status: z.string().optional(),
  triageCategory: z.string().optional(),
  locationId: z.string().uuid().optional(),
  incidentId: z.string().uuid().optional(),
  assignedUnitId: z.string().uuid().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export type MedicalQueryFilters = z.infer<typeof MedicalQueryFiltersSchema>;

export type MedicalTriageCategory = TriageCategoryType;
export type MedicalObservationType = MedicalObservationTypeValue;
export type MedicalEncounterStatus = MedicalEncounterStatusType;
export type MedicalObservation = MedicalObservationItem;
export type MedicalIntervention = MedicalInterventionItem;

export type TriageEncounterRequest = TriageMedicalEncounterRequest;
export type AddMedicalObservationRequest = CreateMedicalObservationRequest;
export type AddMedicalInterventionRequest = CreateMedicalInterventionRequest;
export type TransferEncounterRequest = TransferMedicalEncounterRequest;
export type CloseEncounterRequest = CloseMedicalEncounterRequest;


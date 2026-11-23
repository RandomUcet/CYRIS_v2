import { z } from 'zod';

export const ScenarioDataPresetSchema = z.enum(['SMALL', 'STANDARD', 'LARGE', 'CUSTOM']);
export const ScenarioDataCountsSchema = z.object({
  persons: z.number().int().min(0).max(5000),
  organisations: z.number().int().min(0).max(500),
  locations: z.number().int().min(0).max(1000),
  vehicles: z.number().int().min(0).max(2500),
  devices: z.number().int().min(0).max(5000),
  weapons: z.number().int().min(0).max(1000),
}).refine((counts) => Object.values(counts).reduce((sum, value) => sum + value, 0) <= 12000, {
  message: 'The total generated record limit is 12000',
});
export const ScenarioDataRequestSchema = z.object({
  seed: z.number().int().min(-2147483648).max(2147483647),
  preset: ScenarioDataPresetSchema,
  counts: ScenarioDataCountsSchema.optional(),
  previewToken: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});
export type ScenarioDataRequest = z.infer<typeof ScenarioDataRequestSchema>;
export type ScenarioDataCounts = z.infer<typeof ScenarioDataCountsSchema>;

export const ScenarioDataBatchResponseSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  identifier: z.string(),
  generatorVersion: z.number(),
  seed: z.number(),
  preset: ScenarioDataPresetSchema,
  configuration: ScenarioDataCountsSchema,
  status: z.string(),
  counts: ScenarioDataCountsSchema.nullable(),
  relationshipCount: z.number(),
  createdByUserId: z.string().uuid().nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  cleanedAt: z.string().nullable(),
  failureMessage: z.string().nullable(),
  source: z.enum(['LOCAL', 'SPARK']).optional(),
  prepared: z.number().int().optional(),
  brief: z.string().optional(),
  strategy: z.enum(['FAST', 'DETAILED']).optional(),
  samples: z.record(z.array(z.string())).optional(),
  personDetails: z.array(z.object({ name: z.string(), description: z.string(), dateOfBirth: z.string() })).optional(),
});
export type ScenarioDataBatchResponse = z.infer<typeof ScenarioDataBatchResponseSchema>;

export const ScenarioDataPreviewSchema = z.object({
  counts: ScenarioDataCountsSchema,
  estimatedRelationships: z.number(),
  previewToken: z.string().optional(),
  personDetails: z.array(z.object({ name: z.string(), description: z.string(), dateOfBirth: z.string() })).optional(),
  samples: z.object({
    persons: z.array(z.string()),
    organisations: z.array(z.string()),
    locations: z.array(z.string()),
    vehicles: z.array(z.string()),
    devices: z.array(z.string()),
    weapons: z.array(z.string()),
  }),
});
export type ScenarioDataPreview = z.infer<typeof ScenarioDataPreviewSchema>;

export const SparkDraftRequestSchema = ScenarioDataRequestSchema.extend({
  brief: z.string().trim().min(1).max(1200),
  // FAST: one short AI scene blueprint + local deterministic records.
  // DETAILED: AI writes every page. Missing preserves the old detailed API path.
  strategy: z.enum(['FAST', 'DETAILED']).optional(),
});
export type SparkDraftRequest = z.infer<typeof SparkDraftRequestSchema>;

const short = z.string().trim().min(1).max(64);
const name = z.string().trim().min(1).max(120);
const personalName = name.regex(/^[\p{L}\p{M}]+(?:[ '’‑-][\p{L}\p{M}]+)*$/u);
const description = z.string().trim().min(1).max(450);
export const ScenarioRowSchemas = {
  persons: z.object({
    givenName: personalName, familyName: personalName, nationality: short,
    dateOfBirth: z.string().date(), description,
  }),
  organisations: z.object({ name, description }),
  locations: z.object({ name, city: name, country: name, locationType: short, description }),
  vehicles: z.object({ make: short, model: short, modelYear: z.string().regex(/^\d{4}$/), colour: short, description }),
  devices: z.object({ deviceType: short, manufacturer: short, model: short, description }),
  weapons: z.object({ category: short, manufacturer: short, model: short, description }),
};
export type ScenarioWorld = { [K in keyof typeof ScenarioRowSchemas]: z.infer<(typeof ScenarioRowSchemas)[K]>[] };
export const ScenarioDraftPosition = z.object({ prepared: z.number().int().nonnegative() });

export const ScenarioLinkSlots = z.array(z.number().int().nonnegative()).max(4);

// Browse already-published synthetic registry records from a generation batch.
// Images are uploaded using the existing registry primary-media authorization.
export const ScenarioBatchMediaQuerySchema = z.object({
  kind: z.enum(['persons', 'organisations', 'locations', 'vehicles', 'devices', 'weapons']),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ScenarioBatchMediaQuery = z.infer<typeof ScenarioBatchMediaQuerySchema>;
export const ScenarioBatchMediaListSchema = z.object({
  kind: ScenarioBatchMediaQuerySchema.shape.kind,
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  hasMore: z.boolean(),
  records: z.array(z.object({
    id: z.string().uuid(), identifier: z.string().nullable(),
    label: z.string(), hasImage: z.boolean(),
  })),
});
export type ScenarioBatchMediaList = z.infer<typeof ScenarioBatchMediaListSchema>;


const BlueprintDetail = z.string().trim().min(2).max(120);
const BlueprintList = z.array(BlueprintDetail).min(2).max(5);
export const ScenarioBlueprintSchema = z.object({
  setting: BlueprintDetail,
  activities: BlueprintList,
  roles: BlueprintList,
  sites: BlueprintList,
  organisations: BlueprintList,
  equipment: BlueprintList,
});
export type ScenarioBlueprint = z.infer<typeof ScenarioBlueprintSchema>;

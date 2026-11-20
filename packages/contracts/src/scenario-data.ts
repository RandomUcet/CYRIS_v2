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

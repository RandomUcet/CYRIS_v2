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
});
export type ScenarioDataBatchResponse = z.infer<typeof ScenarioDataBatchResponseSchema>;

export const ScenarioDataPreviewSchema = z.object({
  counts: ScenarioDataCountsSchema,
  estimatedRelationships: z.number(),
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

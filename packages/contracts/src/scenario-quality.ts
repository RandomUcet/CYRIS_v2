import { z } from 'zod';
export const ScenarioQualityCheckSchema = z.object({
  code: z.enum(['COUNTS','DUPLICATE_PEOPLE','RELATIONSHIPS','DESCRIPTIONS','IMAGES']),
  status: z.enum(['PASS','WARN','FAIL','INFO']),
  message: z.string(),
});
export const ScenarioQualityReportSchema = z.object({
  batchId: z.string().uuid(), eventId: z.string().uuid(),
  ready: z.boolean(), score: z.number().int().min(0).max(100),
  generatedAt: z.string(), checks: z.array(ScenarioQualityCheckSchema),
  preparedRecords: z.number().int().nonnegative(),
  expectedRecords: z.number().int().nonnegative(),
  relationships: z.number().int().nonnegative(),
  images: z.number().int().nonnegative(),
});
export type ScenarioQualityReport = z.infer<typeof ScenarioQualityReportSchema>;

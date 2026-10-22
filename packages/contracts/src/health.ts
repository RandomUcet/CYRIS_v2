import { z } from 'zod';

export const HealthStatusSchema = z.enum(['ok', 'degraded', 'down']);
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export const HealthResponseSchema = z.object({
  status: HealthStatusSchema,
  service: z.string(),
  version: z.string(),
  timestamp: z.string(),
  uptime: z.number(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const DependencyHealthSchema = z.object({
  status: z.enum(['up', 'down']),
  latencyMs: z.number().optional(),
  error: z.string().optional(),
});
export type DependencyHealth = z.infer<typeof DependencyHealthSchema>;

export const ReadinessResponseSchema = z.object({
  status: z.enum(['ok', 'down']),
  timestamp: z.string(),
  dependencies: z.object({
    postgres: DependencyHealthSchema,
    redis: DependencyHealthSchema,
    typesense: DependencyHealthSchema,
    storage: DependencyHealthSchema,
    mail: DependencyHealthSchema.optional(),
  }),
  optionalIntegrations: z.record(DependencyHealthSchema).optional(),
});
export type ReadinessResponse = z.infer<typeof ReadinessResponseSchema>;

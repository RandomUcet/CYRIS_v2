import { z } from 'zod';

export const ServiceStatusStateSchema = z.enum(['OPERATIONAL', 'PLANNED', 'ACTIVE', 'EXPIRED', 'RESTORED']);
export const ServiceImpactSchema = z.enum(['NONE', 'READ_ONLY', 'DEGRADED', 'UNAVAILABLE']);

export const ServiceStatusItemSchema = z.object({
  service: z.string().min(1),
  state: ServiceStatusStateSchema,
  impact: ServiceImpactSchema,
  startsAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
  restoredAt: z.string().datetime().nullable(),
  revision: z.number().int().positive().nullable(),
  reason: z.string().nullable(),
});

export const ServiceStatusResponseSchema = z.object({
  eventId: z.string().uuid(),
  generatedAt: z.string().datetime(),
  scope: z.enum(['PERSONAL','EVENT']),
  current: z.object({service:z.string(),impact:ServiceImpactSchema,activeCount:z.number().int().nonnegative(),plannedCount:z.number().int().nonnegative()}),
  items: z.array(ServiceStatusItemSchema),
});

export type ServiceStatusState = z.infer<typeof ServiceStatusStateSchema>;
export type ServiceImpact = z.infer<typeof ServiceImpactSchema>;
export type ServiceStatusItem = z.infer<typeof ServiceStatusItemSchema>;
export type ServiceStatusResponse = z.infer<typeof ServiceStatusResponseSchema>;

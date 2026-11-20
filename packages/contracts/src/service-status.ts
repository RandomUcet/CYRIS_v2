import { z } from 'zod';
import { RestrictedServiceModeSchema, ServiceModuleSchema } from './disruptions.js';

export const ServiceImpactSchema = z.enum(['NONE', 'READ_ONLY', 'UNAVAILABLE']);
export const ServiceStatusItemSchema = z.object({
  service: ServiceModuleSchema,
  impact: RestrictedServiceModeSchema,
});

export const ServiceStatusResponseSchema = z.object({
  eventId: z.string().uuid(),
  generatedAt: z.string().datetime(),
  scope: z.literal('PERSONAL'),
  current: z.object({
    impact: ServiceImpactSchema,
    activeCount: z.number().int().nonnegative(),
  }),
  items: z.array(ServiceStatusItemSchema),
});

export type ServiceImpact = z.infer<typeof ServiceImpactSchema>;
export type ServiceStatusItem = z.infer<typeof ServiceStatusItemSchema>;
export type ServiceStatusResponse = z.infer<typeof ServiceStatusResponseSchema>;

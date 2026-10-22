import { z } from 'zod';
import { ActivityEventItemSchema } from './resources.js';

export const TimelineQueryFiltersSchema = z.object({
  type: z.string().optional(),
  unitId: z.string().uuid().optional(),
  resourceType: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50).optional(),
  cursor: z.string().optional(),
});

export type TimelineQueryFilters = z.infer<typeof TimelineQueryFiltersSchema>;

export const TimelineResponseSchema = z.object({
  items: z.array(ActivityEventItemSchema),
  total: z.number().optional(),
  nextCursor: z.string().nullable().optional(),
});

export type TimelineResponse = z.infer<typeof TimelineResponseSchema>;

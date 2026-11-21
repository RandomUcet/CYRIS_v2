import { z } from 'zod';
import { ServiceModuleSchema } from './disruptions.js';

/** Real administrative write locks. Not simulated exercise disruptions or DEFCON. */
export const HoldTargetSchema = z.enum(['EVENT', 'UNIT', 'USER']);
export const HoldModuleSchema = z.union([z.literal('ALL'), ServiceModuleSchema]);
export const CreateOperationalHoldSchema = z.object({
  targetType: HoldTargetSchema,
  targetId: z.string().uuid().nullable().optional(),
  module: HoldModuleSchema.default('ALL'),
  reason: z.string().trim().min(5).max(1000),
  startsAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.targetType === 'EVENT' && value.targetId)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['targetId'], message: 'Event lock must not specify a target ID.' });
  if (value.targetType !== 'EVENT' && !value.targetId)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['targetId'], message: 'A person or team target is required.' });
  if (value.startsAt && value.expiresAt && new Date(value.expiresAt) <= new Date(value.startsAt))
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expiresAt'], message: 'Expiry must follow start.' });
});
export const RestoreOperationalHoldSchema = z.object({
  expectedRevision: z.number().int().positive(),
  reason: z.string().trim().min(5).max(1000),
});
export const OperationalHoldSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  targetType: HoldTargetSchema,
  targetId: z.string().uuid().nullable(),
  module: HoldModuleSchema,
  reason: z.string(),
  startsAt: z.string(),
  expiresAt: z.string().nullable(),
  revision: z.number().int().positive(),
  restoredAt: z.string().nullable(),
  active: z.boolean(),
});
export const CurrentOperationalHoldsSchema = z.object({
  eventId: z.string().uuid(),
  generatedAt: z.string(),
  holds: z.array(OperationalHoldSchema.pick({ id: true, module: true, reason: true, expiresAt: true })),
});
export type CreateOperationalHold = z.infer<typeof CreateOperationalHoldSchema>;
export type RestoreOperationalHold = z.infer<typeof RestoreOperationalHoldSchema>;
export type OperationalHold = z.infer<typeof OperationalHoldSchema>;
export type CurrentOperationalHolds = z.infer<typeof CurrentOperationalHoldsSchema>;

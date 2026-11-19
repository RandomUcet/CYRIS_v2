import { z } from 'zod';

export const DisruptionTargetTypeSchema = z.enum(['EVENT', 'UNIT', 'USER']);
export const DisruptionModeSchema = z.enum(['UNAVAILABLE', 'READ_ONLY', 'DEGRADED']);

export const CreateDisruptionRequestSchema = z.object({
  targetType: DisruptionTargetTypeSchema,
  targetId: z.string().uuid().nullable().optional(),
  module: z.string().trim().min(1).max(64),
  mode: DisruptionModeSchema,
  startsAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  reason: z.string().trim().min(3).max(2000),
}).superRefine((value, context) => {
  if (value.targetType === 'EVENT' && value.targetId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['targetId'], message: 'EVENT target must not have targetId' });
  }
  if (value.targetType !== 'EVENT' && !value.targetId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['targetId'], message: 'UNIT and USER targets require targetId' });
  }
  if (value.startsAt && value.expiresAt && new Date(value.expiresAt) <= new Date(value.startsAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['expiresAt'], message: 'expiresAt must be after startsAt' });
  }
});

export const RestoreDisruptionRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  reason: z.string().trim().min(3).max(2000),
});

export const DisruptionSnapshotSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  targetType: DisruptionTargetTypeSchema,
  targetId: z.string().uuid().nullable(),
  module: z.string(),
  mode: DisruptionModeSchema,
  startsAt: z.string(),
  expiresAt: z.string().nullable(),
  reason: z.string(),
  revision: z.number().int().positive(),
  restoredAt: z.string().nullable(),
  active: z.boolean(),
});

export type CreateDisruptionRequest = z.infer<typeof CreateDisruptionRequestSchema>;
export type RestoreDisruptionRequest = z.infer<typeof RestoreDisruptionRequestSchema>;
export type DisruptionSnapshot = z.infer<typeof DisruptionSnapshotSchema>;

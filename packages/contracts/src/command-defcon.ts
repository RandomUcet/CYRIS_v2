import { z } from 'zod';

export const CommandDefconLevelSchema = z.union([
  z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5),
]);
export type CommandDefconLevel = z.infer<typeof CommandDefconLevelSchema>;

export const CommandDefconSnapshotSchema = z.object({
  eventId: z.string().uuid(),
  level: CommandDefconLevelSchema.nullable(),
  initialized: z.boolean(),
  revision: z.number().int().nonnegative(),
  reason: z.string().nullable(),
  updatedByUserId: z.string().uuid().nullable(),
  updatedAt: z.string().nullable(),
  history: z.array(z.object({
    id: z.string().uuid(),
    level: CommandDefconLevelSchema,
    reason: z.string(),
    occurredAt: z.string(),
    actorUserId: z.string().uuid().nullable(),
  })),
});
export type CommandDefconSnapshot = z.infer<typeof CommandDefconSnapshotSchema>;

export const CommandReadinessSnapshotSchema = z.object({
  eventId: z.string().uuid(),
  level: CommandDefconLevelSchema.nullable(),
  initialized: z.boolean(),
  revision: z.number().int().nonnegative(),
  updatedAt: z.string().nullable(),
});
export type CommandReadinessSnapshot = z.infer<typeof CommandReadinessSnapshotSchema>;

export const ChangeCommandDefconRequestSchema = z.object({
  level: CommandDefconLevelSchema,
  expectedRevision: z.number().int().nonnegative(),
  reason: z.string().trim().min(3).max(2000),
});
export type ChangeCommandDefconRequest = z.infer<typeof ChangeCommandDefconRequestSchema>;

import { z } from 'zod';

export const CreateUnitRequestSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(2).max(128).regex(/^[a-z0-9-]+$/, 'Slug must be alphanumeric lowercase with hyphens'),
  kind: z.string().min(1).max(64).optional().default('department'),
  description: z.string().optional(),
  parentUnitId: z.string().uuid().nullable().optional(),
});

export type CreateUnitRequest = z.infer<typeof CreateUnitRequestSchema>;

export const UpdateUnitRequestSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z.string().min(2).max(128).optional(),
  kind: z.string().min(1).max(64).optional(),
  description: z.string().nullable().optional(),
  parentUnitId: z.string().uuid().nullable().optional(),
  archivedAt: z.string().datetime().nullable().optional(),
});

export type UpdateUnitRequest = z.infer<typeof UpdateUnitRequestSchema>;

export const UnitResponseSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  parentUnitId: z.string().uuid().nullable().optional(),
  name: z.string(),
  slug: z.string(),
  kind: z.string(),
  description: z.string().nullable().optional(),
  archivedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type UnitResponse = z.infer<typeof UnitResponseSchema>;

export const AssignMembershipUnitRequestSchema = z.object({
  membershipId: z.string().uuid(),
});

export type AssignMembershipUnitRequest = z.infer<typeof AssignMembershipUnitRequestSchema>;

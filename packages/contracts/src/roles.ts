import { z } from 'zod';

export const RolePermissionEntrySchema = z.object({
  permissionKey: z.string().min(1),
  scope: z.enum(['PLATFORM', 'EVENT', 'UNIT', 'OWN', 'ASSIGNED']),
});

export type RolePermissionEntry = z.infer<typeof RolePermissionEntrySchema>;

export const CreateRoleRequestSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(2).max(128).regex(/^[a-z0-9-]+$/, 'Slug must be alphanumeric lowercase with hyphens'),
  description: z.string().optional(),
  permissions: z.array(RolePermissionEntrySchema).optional().default([]),
});

export type CreateRoleRequest = z.infer<typeof CreateRoleRequestSchema>;

export const UpdateRoleRequestSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  permissions: z.array(RolePermissionEntrySchema).optional(),
});

export type UpdateRoleRequest = z.infer<typeof UpdateRoleRequestSchema>;

export const RoleResponseSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid().nullable().optional(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable().optional(),
  permissions: z.array(RolePermissionEntrySchema),
  createdAt: z.string(),
});

export type RoleResponse = z.infer<typeof RoleResponseSchema>;

export const AssignRoleRequestSchema = z.object({
  roleId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  membershipId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
});

export type AssignRoleRequest = z.infer<typeof AssignRoleRequestSchema>;

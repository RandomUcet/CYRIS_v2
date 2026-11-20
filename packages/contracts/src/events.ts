import { z } from 'zod';

export const EventStatusSchema = z.enum(['DRAFT', 'PREPARATION', 'ACTIVE', 'CLOSED', 'ARCHIVED']);
export type EventStatus = z.infer<typeof EventStatusSchema>;

export const CreateEventRequestSchema = z.object({
  slug: z.string().min(2).max(128).regex(/^[a-z0-9-]+$/, 'Slug must be alphanumeric lowercase with hyphens'),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  status: EventStatusSchema.optional().default('DRAFT'),
  defaultLocale: z.string().min(2).max(16).optional().default('en'),
  defaultTimezone: z.string().min(1).max(64).optional().default('UTC'),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});

export type CreateEventRequest = z.infer<typeof CreateEventRequestSchema>;

export const UpdateEventRequestSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  status: EventStatusSchema.optional(),
  defaultLocale: z.string().min(2).max(16).optional(),
  defaultTimezone: z.string().min(1).max(64).optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  archivedAt: z.string().datetime().nullable().optional(),
});

export type UpdateEventRequest = z.infer<typeof UpdateEventRequestSchema>;

export const DuplicateEventRequestSchema = z.object({
  slug: z.string().min(2).max(128).regex(/^[a-z0-9-]+$/, 'Slug must be alphanumeric lowercase with hyphens'),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});

export type DuplicateEventRequest = z.infer<typeof DuplicateEventRequestSchema>;

export const EventResponseSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  status: z.string(),
  defaultLocale: z.string().default('en'),
  defaultTimezone: z.string().default('UTC'),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  archivedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type EventResponse = z.infer<typeof EventResponseSchema>;

// Membership DTOs
export const AddMembershipRequestSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional().default('ACTIVE'),
});

export type AddMembershipRequest = z.infer<typeof AddMembershipRequestSchema>;

export const UpdateMembershipRequestSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

export type UpdateMembershipRequest = z.infer<typeof UpdateMembershipRequestSchema>;

export const MembershipResponseSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  userId: z.string().uuid(),
  status: z.string(),
  joinedAt: z.string(),
  user: z
    .object({
      id: z.string().uuid(),
      email: z.string(),
      displayName: z.string(),
      status: z.string(),
    })
    .optional(),
  platformRoles: z.array(z.object({ id: z.string().uuid(), name: z.string() })).default([]),
  units: z.array(z.object({ id: z.string().uuid(), name: z.string(), slug: z.string().optional() })),
  roles: z.array(z.object({ id: z.string().uuid(), assignmentId: z.string().uuid().optional(), name: z.string(), unitId: z.string().uuid().nullable() })),
});

export type MembershipResponse = z.infer<typeof MembershipResponseSchema>;

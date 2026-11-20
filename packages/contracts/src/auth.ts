import { z } from 'zod';

export const LoginRequestSchema = z.object({
  identifier: z.string().min(1, 'Identifier (email or username) is required'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const UserProfileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
  status: z.enum(['ACTIVE', 'DISABLED']),
  lastLoginAt: z.string().nullable().optional(),
  createdAt: z.string(),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;

export const MembershipSummarySchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  eventSlug: z.string(),
  eventName: z.string(),
  status: z.string(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
  unitIds: z.array(z.string().uuid()),
});

export type MembershipSummary = z.infer<typeof MembershipSummarySchema>;

export const StartViewAsRequestSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  eventId: z.string().uuid(),
  targetUserId: z.string().uuid(),
});
export type StartViewAsRequest = z.infer<typeof StartViewAsRequestSchema>;

export const ViewAsContextSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  actorUserId: z.string().uuid(),
  targetUserId: z.string().uuid(),
  targetDisplayName: z.string(),
  startedAt: z.string(),
  expiresAt: z.string(),
  readOnly: z.literal(true),
});
export type ViewAsContext = z.infer<typeof ViewAsContextSchema>;

export const CurrentUserResponseSchema = z.object({
  user: UserProfileSchema,
  platformRoles: z.array(z.string()),
  platformPermissions: z.array(z.string()),
  memberships: z.array(MembershipSummarySchema),
  viewAs: ViewAsContextSchema.optional(),
});

export type CurrentUserResponse = z.infer<typeof CurrentUserResponseSchema>;

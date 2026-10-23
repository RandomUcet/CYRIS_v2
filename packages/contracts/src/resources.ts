import { z } from 'zod';

export const ResourceVisibilitySchema = z.enum(['EVENT', 'UNIT', 'RESTRICTED', 'SCENARIO']);
export type ResourceVisibility = z.infer<typeof ResourceVisibilitySchema>;

export const ResourceItemSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  resourceType: z.string().min(1),
  visibility: ResourceVisibilitySchema.default('EVENT'),
  owningUnitId: z.string().uuid().nullable().optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ResourceItem = z.infer<typeof ResourceItemSchema>;

export const CreateRelationshipRequestSchema = z.object({
  targetResourceId: z.string().uuid(),
  relationshipType: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateRelationshipRequest = z.infer<typeof CreateRelationshipRequestSchema>;

export const ResolvedEntityIdentitySchema = z.object({
  id: z.string().uuid(),
  identifier: z.string(),
  title: z.string(),
  type: z.string(),
});

export type ResolvedEntityIdentity = z.infer<typeof ResolvedEntityIdentitySchema>;

export const ResourceRelationshipItemSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  sourceResourceId: z.string().uuid(),
  targetResourceId: z.string().uuid(),
  relationshipType: z.string(),
  createdByUserId: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  removedAt: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
  source: ResolvedEntityIdentitySchema.nullable().optional(),
  target: ResolvedEntityIdentitySchema.nullable().optional(),
});

export type ResourceRelationshipItem = z.infer<typeof ResourceRelationshipItemSchema>;

export const ActivityVisibilitySchema = z.enum(['EVENT', 'UNIT', 'RESTRICTED', 'SCENARIO']);
export type ActivityVisibility = z.infer<typeof ActivityVisibilitySchema>;

export const ActivityEventItemSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  resourceId: z.string().uuid().nullable().optional(),
  activityType: z.string(),
  actorUserId: z.string().uuid().nullable().optional(),
  occurredAt: z.string(),
  title: z.string(),
  summary: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  causationId: z.string().uuid().nullable().optional(),
  requestId: z.string().nullable().optional(),
  relatedResourceIds: z.array(z.string().uuid()).nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
  visibility: ActivityVisibilitySchema.default('EVENT'),
});

export type ActivityEventItem = z.infer<typeof ActivityEventItemSchema>;

export const CreateActivityEventRequestSchema = z.object({
  resourceId: z.string().uuid().optional(),
  activityType: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().optional(),
  reason: z.string().optional(),
  source: z.string().optional(),
  causationId: z.string().uuid().optional(),
  requestId: z.string().optional(),
  relatedResourceIds: z.array(z.string().uuid()).optional(),
  metadata: z.record(z.unknown()).optional(),
  visibility: ActivityVisibilitySchema.default('EVENT'),
});

export type CreateActivityEventRequest = z.infer<typeof CreateActivityEventRequestSchema>;

export const PrincipalTypeSchema = z.enum(['USER', 'UNIT']);
export type PrincipalType = z.infer<typeof PrincipalTypeSchema>;

export const ResourceAccessGrantRequestSchema = z.object({
  principalType: PrincipalTypeSchema,
  principalId: z.string().uuid(),
});

export type ResourceAccessGrantRequest = z.infer<typeof ResourceAccessGrantRequestSchema>;

export const AssignResourceRequestSchema = z.object({
  userId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

export type AssignResourceRequest = z.infer<typeof AssignResourceRequestSchema>;

export const ResourceAssignmentItemSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  resourceId: z.string().uuid(),
  userId: z.string().uuid().nullable().optional(),
  unitId: z.string().uuid().nullable().optional(),
  assignedByUserId: z.string().uuid().nullable().optional(),
  assignedAt: z.string(),
  notes: z.string().nullable().optional(),
});

export type ResourceAssignmentItem = z.infer<typeof ResourceAssignmentItemSchema>;

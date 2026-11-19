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

export const ParticipantDisruptionStatusSchema = z.object({
  eventId: z.string().uuid(),
  module: z.literal('tasks'),
  mode: DisruptionModeSchema.nullable(),
  active: z.boolean(),
  revision: z.number().int().nonnegative().nullable(),
});

export type CreateDisruptionRequest = z.infer<typeof CreateDisruptionRequestSchema>;
export type RestoreDisruptionRequest = z.infer<typeof RestoreDisruptionRequestSchema>;
export type DisruptionSnapshot = z.infer<typeof DisruptionSnapshotSchema>;
export type ParticipantDisruptionStatus = z.infer<typeof ParticipantDisruptionStatusSchema>;
export type DisruptionMode = z.infer<typeof DisruptionModeSchema>;

export const RecoveryAudienceTypeSchema = z.enum(['EVENT', 'UNIT', 'USER']);
export const RecoveryObjectiveStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'APPROVED', 'REJECTED', 'RESTORED']);
export const CreateRecoveryObjectiveRequestSchema = z.object({
  disruptionId: z.string().uuid(),
  audienceType: RecoveryAudienceTypeSchema,
  audienceId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(3).max(200),
  instructions: z.string().trim().min(3).max(4000),
});
export const RecoveryObjectiveReviewRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  decision: z.enum(['APPROVE', 'REJECT']),
});
export const RecoveryObjectiveRestoreRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  reason: z.string().trim().min(3).max(1000),
});
export const RecoveryReportRequestSchema = z.object({
  body: z.string().trim().min(3).max(4000),
});
export const RecoveryObjectiveSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  disruptionId: z.string().uuid(),
  audienceType: RecoveryAudienceTypeSchema,
  audienceId: z.string().uuid().nullable(),
  title: z.string(),
  instructions: z.string(),
  status: RecoveryObjectiveStatusSchema,
  revision: z.number().int().positive(),
  createdAt: z.string(),
  publishedAt: z.string().nullable(),
});
export const RecoveryReportSchema = z.object({
  id: z.string().uuid(),
  objectiveId: z.string().uuid(),
  body: z.string(),
  authorUserId: z.string().uuid(),
  createdAt: z.string(),
});
export type CreateRecoveryObjectiveRequest = z.infer<typeof CreateRecoveryObjectiveRequestSchema>;
export type RecoveryObjectiveReviewRequest = z.infer<typeof RecoveryObjectiveReviewRequestSchema>;
export type RecoveryObjectiveRestoreRequest = z.infer<typeof RecoveryObjectiveRestoreRequestSchema>;
export type RecoveryReportRequest = z.infer<typeof RecoveryReportRequestSchema>;
export type RecoveryObjective = z.infer<typeof RecoveryObjectiveSchema>;
export type RecoveryReport = z.infer<typeof RecoveryReportSchema>;
export const CreateRecoveryArtifactRequestSchema = z.object({
  objectiveId: z.string().uuid(),
  title: z.string().trim().min(3).max(200),
  filename: z.string().regex(/^[A-Za-z0-9._-]{1,128}$/),
  body: z.string().min(1).max(20000),
});
export const RecoveryArtifactSchema = z.object({
  id: z.string().uuid(),
  objectiveId: z.string().uuid(),
  title: z.string(),
  filename: z.string(),
  mimeType: z.literal('text/plain'),
  status: z.enum(['DRAFT', 'PUBLISHED']),
  revision: z.number().int().positive(),
  createdAt: z.string(),
  publishedAt: z.string().nullable(),
});
export type CreateRecoveryArtifactRequest = z.infer<typeof CreateRecoveryArtifactRequestSchema>;
export type RecoveryArtifact = z.infer<typeof RecoveryArtifactSchema>;

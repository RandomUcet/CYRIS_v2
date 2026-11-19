import { z } from 'zod';
import { ResourceVisibilitySchema } from './resources.js';

export const LabAnalysisStatusSchema = z.enum([
  'REQUESTED',
  'ACCEPTED',
  'IN_PROGRESS',
  'COMPLETED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
]);
export type LabAnalysisStatus = z.infer<typeof LabAnalysisStatusSchema>;

export const CreateLabAnalysisRequestSchema = z.object({
  analysisType: z.string().min(1),
  evidenceIds: z.array(z.string().uuid()).min(1),
  requestedFromUnitId: z.string().uuid().optional(),
  purpose: z.string().optional(),
  method: z.string().optional(),
  visibility: ResourceVisibilitySchema.default('EVENT'),
  causationId: z.string().uuid().optional(),
});

export type CreateLabAnalysisRequest = z.infer<typeof CreateLabAnalysisRequestSchema>;

export const UpdateLabAnalysisRequestSchema = z.object({
  status: LabAnalysisStatusSchema.optional(),
  assignedToUserId: z.string().uuid().optional(),
  assignedUnitId: z.string().uuid().optional(),
  method: z.string().optional(),
  findings: z.string().optional(),
  conclusion: z.string().optional(),
  notes: z.string().optional(),
  causationId: z.string().uuid().optional(),
});

export type UpdateLabAnalysisRequest = z.infer<typeof UpdateLabAnalysisRequestSchema>;

export const LabAnalysisResponseSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  analysisNumber: z.string(),
  status: z.string(),
  requestedByUserId: z.string().uuid(),
  requestedFromUnitId: z.string().uuid().nullable().optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
  assignedUnitId: z.string().uuid().nullable().optional(),
  requestedAt: z.string(),
  acceptedAt: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  approvedAt: z.string().nullable().optional(),
  analysisType: z.string(),
  purpose: z.string().nullable().optional(),
  method: z.string().nullable().optional(),
  findings: z.string().nullable().optional(),
  conclusion: z.string().nullable().optional(),
  visibility: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  evidenceIds: z.array(z.string().uuid()).optional(),
});

export type LabAnalysisResponse = z.infer<typeof LabAnalysisResponseSchema>;

export const ReassignLabAnalysisRequestSchema = z.object({
  assignedToUserId: z.string().uuid().nullable().optional(),
  assignedUnitId: z.string().uuid().nullable().optional(),
  reason: z.string().trim().min(3, 'A reassignment reason is required'),
});
export type ReassignLabAnalysisRequest = z.infer<typeof ReassignLabAnalysisRequestSchema>;

export const CorrectLabAnalysisRequestSchema = z.object({
  status: LabAnalysisStatusSchema.optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
  assignedUnitId: z.string().uuid().nullable().optional(),
  reason: z.string().trim().min(3, 'A correction reason is required'),
});
export type CorrectLabAnalysisRequest = z.infer<typeof CorrectLabAnalysisRequestSchema>;

import { z } from 'zod';

/** Formal simulation-only legal disclosure and expert-report requests. */
export const CourtRequestKindSchema = z.enum([
  'EVIDENCE', 'DOCUMENT', 'FORENSIC_REPORT', 'LAB_REPORT',
  'MEDICAL_REPORT', 'EXPERT_OPINION', 'OTHER',
]);
export const CourtRequestStatusSchema = z.enum(['OPEN', 'IN_PROGRESS', 'FULFILLED', 'DECLINED', 'CANCELLED']);
export const CreateCourtRequestSchema = z.object({
  kind: CourtRequestKindSchema,
  subject: z.string().trim().min(4).max(255),
  details: z.string().trim().min(10).max(5000),
  requestedFromUnitId: z.string().uuid().optional(),
  dueAt: z.string().datetime().optional(),
});
export const ReplyCourtRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  status: z.enum(['IN_PROGRESS', 'FULFILLED', 'DECLINED']),
  response: z.string().trim().min(5).max(8000),
  linkedResourceId: z.string().uuid().optional(),
});
export const CourtRequestItemSchema = z.object({
  id: z.string().uuid(), eventId: z.string().uuid(), courtCaseId: z.string().uuid(),
  kind: CourtRequestKindSchema, subject: z.string(), details: z.string(),
  requestedFromUnitId: z.string().uuid().nullable(),
  requestedByUserId: z.string().uuid(), status: CourtRequestStatusSchema,
  revision: z.number().int().positive(), dueAt: z.string().nullable(),
  response: z.string().nullable(), linkedResourceId: z.string().uuid().nullable(),
  respondedByUserId: z.string().uuid().nullable(), respondedAt: z.string().nullable(),
  createdAt: z.string(), updatedAt: z.string(),
});
export type CreateCourtRequest = z.infer<typeof CreateCourtRequestSchema>;
export type ReplyCourtRequest = z.infer<typeof ReplyCourtRequestSchema>;
export type CourtRequestItem = z.infer<typeof CourtRequestItemSchema>;

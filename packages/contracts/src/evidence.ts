import { z } from 'zod';
import { ResourceVisibilitySchema } from './resources.js';

export const EvidenceStatusSchema = z.enum([
  'REGISTERED',
  'SECURED',
  'IN_TRANSIT',
  'STORED',
  'UNDER_ANALYSIS',
  'RELEASED',
  'DISPOSED',
]);
export type EvidenceStatus = z.infer<typeof EvidenceStatusSchema>;

export const CustodyHolderTypeSchema = z.enum(['USER', 'UNIT', 'STORAGE']);
export type CustodyHolderType = z.infer<typeof CustodyHolderTypeSchema>;

export const CreateEvidenceRequestSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  evidenceType: z.string().min(1),
  status: EvidenceStatusSchema.default('REGISTERED'),
  condition: z.string().optional(),
  securedAt: z.string().optional(),
  securedByUserId: z.string().uuid().optional(),
  owningUnitId: z.string().uuid().optional(),
  caseId: z.string().uuid().optional(),
  currentHolderType: CustodyHolderTypeSchema.default('USER'),
  currentHolderId: z.string().min(1),
  visibility: ResourceVisibilitySchema.default('EVENT'),
});

export type CreateEvidenceRequest = z.infer<typeof CreateEvidenceRequestSchema>;

export const UpdateEvidenceRequestSchema = CreateEvidenceRequestSchema.partial();
export type UpdateEvidenceRequest = z.infer<typeof UpdateEvidenceRequestSchema>;

export const TransferEvidenceRequestSchema = z.object({
  toHolderType: CustodyHolderTypeSchema,
  toHolderId: z.string().trim().min(1).max(255),
  reason: z.string().trim().min(1).max(2000),
  notes: z.string().optional(),
  newStatus: EvidenceStatusSchema.optional(),
  causationId: z.string().uuid().optional(),
}).strict().refine(v=>v.toHolderType==='STORAGE'||z.string().uuid().safeParse(v.toHolderId).success,'Select an existing user or unit');

export type TransferEvidenceRequest = z.infer<typeof TransferEvidenceRequestSchema>;

export const EvidenceCustodyTransferResponseSchema = z.object({
  id: z.string().uuid(),
  evidenceId: z.string().uuid(),
  occurredAt: z.string(),
  transferredByUserId: z.string().uuid(),
  fromHolderType: z.string(),
  fromHolderId: z.string(),
  fromHolderName:z.string().nullable().optional(),
  toHolderName:z.string().nullable().optional(),
  toHolderType: z.string(),
  toHolderId: z.string(),
  reason: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type EvidenceCustodyTransferResponse = z.infer<typeof EvidenceCustodyTransferResponseSchema>;

export const EvidenceResponseSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  evidenceNumber: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  evidenceType: z.string(),
  status: z.string(),
  condition: z.string().nullable().optional(),
  securedAt: z.string().nullable().optional(),
  securedByUserId: z.string().uuid().nullable().optional(),
  owningUnitId: z.string().uuid().nullable().optional(),
  currentHolderType: z.string(),
  currentHolderId: z.string(),
  currentHolderName:z.string().nullable().optional(),
  visibility: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  custodyHistory: z.array(EvidenceCustodyTransferResponseSchema).optional(),
});

export type EvidenceResponse = z.infer<typeof EvidenceResponseSchema>;

export const CustodyRecipientQuerySchema=z.object({q:z.string().trim().min(2).max(80),type:z.enum(['USER','UNIT'])}).strict();
export type CustodyRecipientQuery=z.infer<typeof CustodyRecipientQuerySchema>;
export type CustodyRecipient={id:string;name:string};

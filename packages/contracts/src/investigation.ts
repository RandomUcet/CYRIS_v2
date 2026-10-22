import { z } from 'zod';
import { ResourceVisibilitySchema } from './resources.js';

export const IncidentStatusSchema = z.enum(['NEW', 'ACTIVE', 'CONTAINED', 'RESOLVED', 'CLOSED']);
export type IncidentStatus = z.infer<typeof IncidentStatusSchema>;

export const IncidentPrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type IncidentPriority = z.infer<typeof IncidentPrioritySchema>;

export const CaseStatusSchema = z.enum([
  'OPEN',
  'INVESTIGATING',
  'PENDING',
  'REFERRED',
  'CLOSED',
  'ARCHIVED',
]);
export type CaseStatus = z.infer<typeof CaseStatusSchema>;

export const CASE_STATUS_TRANSITIONS: Record<CaseStatus, readonly CaseStatus[]> = {
  OPEN: ['OPEN', 'INVESTIGATING', 'ARCHIVED'],
  INVESTIGATING: ['INVESTIGATING', 'OPEN', 'PENDING', 'REFERRED', 'CLOSED'],
  PENDING: ['PENDING', 'INVESTIGATING', 'REFERRED', 'CLOSED'],
  REFERRED: ['REFERRED', 'INVESTIGATING', 'CLOSED'],
  CLOSED: ['CLOSED', 'ARCHIVED'],
  ARCHIVED: ['ARCHIVED'],
};

export const CasePrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type CasePriority = z.infer<typeof CasePrioritySchema>;

// --- Incident ---
export const CreateIncidentRequestSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: IncidentStatusSchema.default('NEW'),
  priority: IncidentPrioritySchema.default('MEDIUM'),
  occurredAt: z.string().optional(),
  detectedAt: z.string().optional(),
  owningUnitId: z.string().uuid().optional(),
  leadUserId: z.string().uuid().optional(),
  visibility: ResourceVisibilitySchema.default('EVENT'),
});

export type CreateIncidentRequest = z.infer<typeof CreateIncidentRequestSchema>;

export const UpdateIncidentRequestSchema = CreateIncidentRequestSchema.partial().extend({
  closedAt: z.string().optional(),
});
export type UpdateIncidentRequest = z.infer<typeof UpdateIncidentRequestSchema>;

export const IncidentResponseSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  incidentNumber: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  status: z.string(),
  priority: z.string(),
  occurredAt: z.string().nullable().optional(),
  detectedAt: z.string().nullable().optional(),
  owningUnitId: z.string().uuid().nullable().optional(),
  leadUserId: z.string().uuid().nullable().optional(),
  closedAt: z.string().nullable().optional(),
  visibility: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type IncidentResponse = z.infer<typeof IncidentResponseSchema>;

// --- Case ---
export const CreateCaseRequestSchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional(),
  status: CaseStatusSchema.default('OPEN'),
  priority: CasePrioritySchema.default('MEDIUM'),
  owningUnitId: z.string().uuid().optional(),
  leadUserId: z.string().uuid().optional(),
  openedAt: z.string().optional(),
  visibility: ResourceVisibilitySchema.default('EVENT'),
});

export type CreateCaseRequest = z.infer<typeof CreateCaseRequestSchema>;

export const UpdateCaseRequestSchema = CreateCaseRequestSchema.partial().extend({
  closedAt: z.string().optional(),
});
export type UpdateCaseRequest = z.infer<typeof UpdateCaseRequestSchema>;

export const CaseResponseSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  caseNumber: z.string(),
  title: z.string(),
  summary: z.string().nullable().optional(),
  status: z.string(),
  priority: z.string(),
  owningUnitId: z.string().uuid().nullable().optional(),
  leadUserId: z.string().uuid().nullable().optional(),
  openedAt: z.string(),
  closedAt: z.string().nullable().optional(),
  visibility: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CaseResponse = z.infer<typeof CaseResponseSchema>;

export const CaseWorkspaceResponseSchema = z.object({
  case: CaseResponseSchema,
  allowedActions: z.object({
    update: z.boolean(),
    assign: z.boolean(),
    close: z.boolean(),
    createEvidence: z.boolean(),
    createTask: z.boolean(),
  }),
  allowedTransitions: z.array(CaseStatusSchema),
  related: z.object({
    incidents: z.array(z.record(z.unknown())),
    evidence: z.array(z.record(z.unknown())),
    entities: z.array(z.record(z.unknown())),
    tasks: z.array(z.record(z.unknown())),
  }),
  counts: z.record(z.number()),
  recentActivity: z.array(z.record(z.unknown())),
});
export type CaseWorkspaceResponse = z.infer<typeof CaseWorkspaceResponseSchema>;

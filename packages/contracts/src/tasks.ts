import { z } from 'zod';

export const TaskStatus = {
  OPEN: 'OPEN',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  IN_PROGRESS: 'IN_PROGRESS',
  BLOCKED: 'BLOCKED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type TaskStatusType = (typeof TaskStatus)[keyof typeof TaskStatus];

export const TaskPriority = {
  LOW: 'LOW',
  NORMAL: 'NORMAL',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const;

export type TaskPriorityType = (typeof TaskPriority)[keyof typeof TaskPriority];

export const TaskSourceType = {
  INCIDENT: 'INCIDENT',
  CASE: 'CASE',
  INJECT: 'INJECT',
  COURT_CASE: 'COURT_CASE',
  MEDICAL: 'MEDICAL',
  MANUAL: 'MANUAL',
} as const;

export type TaskSourceTypeValue = (typeof TaskSourceType)[keyof typeof TaskSourceType];

/* -------------------------------------------------------------------------- */
/* Models                                                                     */
/* -------------------------------------------------------------------------- */

export const OperationalTaskItemSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  taskNumber: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  status: z.enum(['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED']),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
  visibility: z.enum(['EVENT', 'UNIT', 'RESTRICTED', 'SCENARIO']).default('EVENT'),
  owningUnitId: z.string().uuid().nullable().optional(),
  owningUnitName: z.string().optional(),
  assignedUnitId: z.string().uuid().nullable().optional(),
  assignedUnitName: z.string().optional(),
  assignedUserId: z.string().uuid().nullable().optional(),
  assignedUserDisplayName: z.string().optional(),
  sourceType: z.string().nullable().optional(),
  sourceResourceId: z.string().uuid().nullable().optional(),
  sourceIdentifier: z.string().optional(),
  sourceTitle: z.string().optional(),
  dueAt: z.string().nullable().optional(),
  acknowledgedAt: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  completionNote: z.string().nullable().optional(),
  blockedReason: z.string().nullable().optional(),
  createdByUserId: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type OperationalTaskItem = z.infer<typeof OperationalTaskItemSchema>;

export const TaskActionSchema = z.enum(['acknowledge', 'start', 'block', 'complete', 'cancel', 'reopen', 'assign']);
export type TaskAction = z.infer<typeof TaskActionSchema>;

export const OperationalTaskDetailSchema = OperationalTaskItemSchema.extend({
  availableActions: z.array(TaskActionSchema).default([]),
  sourceResource: z
    .object({
      id: z.string().uuid(),
      resourceType: z.string(),
      identifier: z.string().optional(),
      title: z.string().optional(),
    })
    .nullable()
    .optional(),
  relatedResources: z
    .array(
      z.object({
        id: z.string().uuid(),
        resourceType: z.string(),
        relationshipType: z.string(),
        title: z.string().optional(),
      })
    )
    .default([]),
});

export type OperationalTaskDetail = z.infer<typeof OperationalTaskDetailSchema>;

/* -------------------------------------------------------------------------- */
/* Requests                                                                   */
/* -------------------------------------------------------------------------- */

export const CreateOperationalTaskRequestSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(10000).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  visibility: z.enum(['EVENT', 'UNIT', 'RESTRICTED', 'SCENARIO']).default('EVENT'),
  owningUnitId: z.string().uuid().optional(),
  assignedUnitId: z.string().uuid().optional(),
  assignedUserId: z.string().uuid().optional(),
  sourceType: z.enum(['INCIDENT', 'CASE', 'INJECT', 'COURT_CASE', 'MEDICAL', 'MANUAL']).default('MANUAL'),
  sourceResourceId: z.string().uuid().optional(),
  dueAt: z.string().datetime().optional(),
});

export type CreateOperationalTaskRequest = z.infer<typeof CreateOperationalTaskRequestSchema>;

export const UpdateOperationalTaskRequestSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(10000).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  dueAt: z.string().datetime().nullable().optional(),
});

export type UpdateOperationalTaskRequest = z.infer<typeof UpdateOperationalTaskRequestSchema>;

export const AssignOperationalTaskRequestSchema = z.object({
  assignedUnitId: z.string().uuid().nullable().optional(),
  assignedUserId: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).optional(),
});

export type AssignOperationalTaskRequest = z.infer<typeof AssignOperationalTaskRequestSchema>;

export const AcknowledgeOperationalTaskRequestSchema = z.object({
  notes: z.string().max(2000).optional(),
});

export type AcknowledgeOperationalTaskRequest = z.infer<typeof AcknowledgeOperationalTaskRequestSchema>;

export const StartOperationalTaskRequestSchema = z.object({
  notes: z.string().max(2000).optional(),
});

export type StartOperationalTaskRequest = z.infer<typeof StartOperationalTaskRequestSchema>;

export const BlockOperationalTaskRequestSchema = z.object({
  reason: z.string().min(1).max(2000),
});

export type BlockOperationalTaskRequest = z.infer<typeof BlockOperationalTaskRequestSchema>;

export const CompleteOperationalTaskRequestSchema = z.object({
  completionNote: z.string().max(5000).optional(),
});

export type CompleteOperationalTaskRequest = z.infer<typeof CompleteOperationalTaskRequestSchema>;

export const CancelOperationalTaskRequestSchema = z.object({
  reason: z.string().min(1).max(2000),
});

export type CancelOperationalTaskRequest = z.infer<typeof CancelOperationalTaskRequestSchema>;

export const ReopenOperationalTaskRequestSchema = z.object({
  reason: z.string().min(1).max(2000),
  newStatus: z.enum(['OPEN', 'IN_PROGRESS']).default('OPEN'),
});

export type ReopenOperationalTaskRequest = z.infer<typeof ReopenOperationalTaskRequestSchema>;

export const TaskQueryFiltersSchema = z.object({
  eventId: z.string().uuid().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  assignedUnitId: z.string().uuid().optional(),
  assignedUserId: z.string().uuid().optional(),
  owningUnitId: z.string().uuid().optional(),
  sourceResourceId: z.string().uuid().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export type TaskQueryFilters = z.infer<typeof TaskQueryFiltersSchema>;

export type TaskPriority = TaskPriorityType;
export type TaskStatus = TaskStatusType;

export const MyWorkViewSchema = z.enum(['personal', 'unit', 'event','requested']);
export type MyWorkView = z.infer<typeof MyWorkViewSchema>;

export const MyWorkQuerySchema = z.object({
  view: MyWorkViewSchema.default('personal'),
  unitId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});
export type MyWorkQuery = z.infer<typeof MyWorkQuerySchema>;

export const MyWorkItemSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  kind: z.enum(['TASK', 'LAB_ANALYSIS','FORENSIC_ANALYSIS']),
  reportAvailable:z.boolean().optional(),
  identifier: z.string(),
  title: z.string(),
  status: z.string(),
  assignedToUserId: z.string().uuid().nullable(),
  assignedUnitId: z.string().uuid().nullable(),
  assignedUnitName: z.string().optional(),
  updatedAt: z.string(),
  href: z.string(),
});
export type MyWorkItem = z.infer<typeof MyWorkItemSchema>;

export const MyWorkResponseSchema = z.object({
  items: z.array(MyWorkItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  view: MyWorkViewSchema,
  availableViews: z.array(MyWorkViewSchema).default(['personal']),
  availableUnits: z.array(z.object({ id: z.string().uuid(), name: z.string() })).default([]),
});
export type MyWorkResponse = z.infer<typeof MyWorkResponseSchema>;

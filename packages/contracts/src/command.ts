import { z } from 'zod';
import { IncidentResponseSchema } from './investigation.js';
import { OperationalTaskItemSchema } from './tasks.js';
import { MedicalOperationalSummaryResponseSchema } from './medical.js';

export const OperationalPictureResponseSchema = z.object({
  eventId: z.string().uuid(),
  criticalIncidents: z.array(IncidentResponseSchema),
  priorityTasks: z.array(OperationalTaskItemSchema),
  recentActivities: z.array(
    z.object({
      id: z.string().uuid(),
      activityType: z.string(),
      occurredAt: z.string(),
      title: z.string(),
      summary: z.string().optional(),
      actorUserId: z.string().nullable().optional(),
    })
  ),
  medicalSummary: MedicalOperationalSummaryResponseSchema.nullable(),
  generatedAt: z.string(),
});

export type OperationalPictureResponse = z.infer<typeof OperationalPictureResponseSchema>;

export const CreateSitrepRequestSchema = z.object({
  title: z.string().min(1).max(255),
  summary: z.string().min(1).max(10000),
  incidentIds: z.array(z.string().uuid()).default([]),
  taskIds: z.array(z.string().uuid()).default([]),
  includeMedicalSummary: z.boolean().default(true),
  visibility: z.enum(['EVENT', 'UNIT', 'RESTRICTED', 'SCENARIO']).default('EVENT'),
});

export type CreateSitrepRequest = z.infer<typeof CreateSitrepRequestSchema>;

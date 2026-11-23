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

/** One organizer-only, read-only operational snapshot across EXCON modules. */
export const ExconDashboardResponseSchema = z.object({
  asOf: z.string(),
  event: z.object({id:z.string().uuid(),name:z.string(),status:z.string(),timezone:z.string()}),
  defcon: z.object({level:z.number().int().min(1).max(5).nullable(),updatedAt:z.string().nullable()}),
  activePhase: z.object({id:z.string().uuid(),code:z.string(),title:z.string()}).nullable(),
  phases: z.object({total:z.number().int(),completed:z.number().int()}),
  injects: z.object({total:z.number().int(),ready:z.number().int(),blocked:z.number().int(),scheduled:z.number().int(),released:z.number().int(),draft:z.number().int()}),
  upcomingInjects: z.array(z.object({
    id:z.string().uuid(),number:z.string(),title:z.string(),status:z.string(),priority:z.string(),
    scheduledAt:z.string().nullable(),
  })),
  broadcasts: z.object({draft:z.number().int(),scheduled:z.number().int(),failed:z.number().int(),sent:z.number().int()}),
  upcomingBroadcasts: z.array(z.object({
    id:z.string().uuid(),title:z.string(),kind:z.string(),scheduledAt:z.string(),audience:z.string(),unitName:z.string().nullable(),
  })),
  recentBroadcasts: z.array(z.object({
    id:z.string(),title:z.string(),kind:z.string(),delivered:z.number().int(),read:z.number().int(),sentAt:z.string(),
  })),
  participation:z.object({
    activeUsers:z.number().int(),activeTeams:z.number().int(),
    briefingReceipts:z.number().int(),briefingsRead:z.number().int(),briefingsAcknowledged:z.number().int(),
    broadcastReceipts:z.number().int(),broadcastsRead:z.number().int(),urgentUnread:z.number().int(),
  }),
  holds:z.object({active:z.number().int(),modules:z.array(z.string())}),
});
export type ExconDashboardResponse = z.infer<typeof ExconDashboardResponseSchema>;

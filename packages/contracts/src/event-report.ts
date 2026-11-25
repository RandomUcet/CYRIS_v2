import { z } from 'zod';

/** Aggregate-only snapshot: does not expose confidential patient or evidence contents. */
export const EventAfterActionReportSchema = z.object({
  eventId: z.string().uuid(), eventName: z.string(), status: z.string(),
  generatedAt: z.string(), startsAt: z.string().nullable(), endsAt: z.string().nullable(),
  membershipCount: z.number().int().nonnegative(),
  resources: z.record(z.number().int().nonnegative()),
  courtStatus: z.record(z.number().int().nonnegative()),
  medicalStatus: z.record(z.number().int().nonnegative()),
  taskStatus: z.record(z.number().int().nonnegative()),
  supportStatus: z.record(z.number().int().nonnegative()),
  legalRequests: z.record(z.number().int().nonnegative()),
  auditCategories: z.record(z.number().int().nonnegative()),
  auditEvents: z.number().int().nonnegative(),
  auditOutcomes: z.record(z.number().int().nonnegative()),
  activeAuditOperators: z.number().int().nonnegative(),
  operationalEvents: z.number().int().nonnegative(),
  dailyActivity: z.array(z.object({
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    auditEvents: z.number().int().nonnegative(),
    operationalEvents: z.number().int().nonnegative(),
    denied: z.number().int().nonnegative(),
    failures: z.number().int().nonnegative(),
  })),
});
export type EventAfterActionReport = z.infer<typeof EventAfterActionReportSchema>;

export const EventPurgePreviewSchema = z.object({
  eventId: z.string().uuid(), eventName: z.string(), status: z.string(),
  generatedAt: z.string(),
  profiles: z.object({
    exerciseDataOnly: z.object({ description: z.string(), counts: z.record(z.number().int().nonnegative()) }),
    wholeEvent: z.object({ description: z.string(), counts: z.record(z.number().int().nonnegative()) }),
  }),
  selection: z.object({
    resourceTypes: z.array(z.string()),
    matchingResources: z.number().int().nonnegative(),
    unselectedResources: z.number().int().nonnegative(),
    inventoryCoverage: z.literal('DATABASE_RESOURCES_ONLY'),
  }),
  retention: z.object({
    eventSlug:z.string(),
    notificationHistory:z.number().int().nonnegative(),
    terminalManualTasks:z.number().int().nonnegative(),
    inventory:z.record(z.number().int().nonnegative()),
    execution:z.literal('HOST_ONLY'),
  }),
  executable: z.literal(false),
  blockers: z.array(z.string()),
});
export type EventPurgePreview = z.infer<typeof EventPurgePreviewSchema>;

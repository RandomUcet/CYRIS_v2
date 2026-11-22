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
});
export type EventAfterActionReport = z.infer<typeof EventAfterActionReportSchema>;

export const EventPurgePreviewSchema = z.object({
  eventId: z.string().uuid(), eventName: z.string(), status: z.string(),
  generatedAt: z.string(),
  profiles: z.object({
    exerciseDataOnly: z.object({ description: z.string(), counts: z.record(z.number().int().nonnegative()) }),
    wholeEvent: z.object({ description: z.string(), counts: z.record(z.number().int().nonnegative()) }),
  }),
  executable: z.literal(false),
  blockers: z.array(z.string()),
});
export type EventPurgePreview = z.infer<typeof EventPurgePreviewSchema>;

import { z } from 'zod';

export const AuditEventItemSchema = z.object({
  id: z.string().uuid(),
  occurredAt: z.string(),
  actorUserId: z.string().uuid().nullable().optional(),
  actorType: z.string(),
  eventId: z.string().uuid().nullable().optional(),
  action: z.string(),
  category: z.string(),
  resourceType: z.string().nullable().optional(),
  resourceId: z.string().nullable().optional(),
  outcome: z.string(),
  ipAddress: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  requestId: z.string().nullable().optional(),
  metadata: z.record(z.unknown()),
  changes: z.record(z.unknown()).nullable().optional(),
});

export type AuditEventItem = z.infer<typeof AuditEventItemSchema>;

export const AuditQueryFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
  eventId: z.string().uuid().optional(),
  actorUserId: z.string().uuid().optional(),
  action: z.string().optional(),
  category: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  /** Case-insensitive literal substring search across audit identifiers and IP. */
  q: z.string().trim().max(160).optional(),
  outcome: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export type AuditQueryFilters = z.infer<typeof AuditQueryFiltersSchema>;

export const AuditListResponseSchema = z.object({
  items: z.array(AuditEventItemSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

export type AuditListResponse = z.infer<typeof AuditListResponseSchema>;

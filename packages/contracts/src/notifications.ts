import { z } from 'zod';

export const NotificationSeverityValues = ['INFO', 'ACTION', 'URGENT'] as const;
export type NotificationSeverityValue = (typeof NotificationSeverityValues)[number];
export const NotificationSeveritySchema = z.enum(NotificationSeverityValues);

export const NotificationCategoryValues = [
  'ASSIGNMENTS',
  'BRIEFINGS',
  'EVIDENCE',
  'ANALYSIS',
  'COURT',
  'MEDICAL',
  'SCENARIO',
  'EVALUATION',
] as const;
export type NotificationCategoryValue = (typeof NotificationCategoryValues)[number];
export const NotificationCategorySchema = z.enum(NotificationCategoryValues);

export const NotificationItemSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  eventId: z.string().uuid().nullable().optional(),
  type: z.string(),
  severity: NotificationSeveritySchema,
  templateKey: z.string(),
  templateParams: z.record(z.any()).default({}),
  resourceId: z.string().uuid().nullable().optional(),
  actionUrl: z.string().nullable().optional(),
  sourceEventId: z.string().nullable().optional(),
  readAt: z.string().nullable().optional(),
  dismissedAt: z.string().nullable().optional(),
  createdAt: z.string(),
});

export type NotificationItem = z.infer<typeof NotificationItemSchema>;

export const NotificationListResponseSchema = z.object({
  unreadCount: z.number().int().min(0),
  newItems: z.array(NotificationItemSchema),
  earlierItems: z.array(NotificationItemSchema),
});

export type NotificationListResponse = z.infer<typeof NotificationListResponseSchema>;

export const CreateNotificationInputSchema = z.object({
  userId: z.string().uuid(),
  eventId: z.string().uuid().optional(),
  type: z.string().min(1).max(64),
  severity: NotificationSeveritySchema.optional().default('INFO'),
  templateKey: z.string().min(1).max(128),
  templateParams: z.record(z.any()).optional().default({}),
  resourceId: z.string().uuid().optional(),
  actionUrl: z.string().max(512).optional(),
  sourceEventId: z.string().max(128).optional(),
  isMandatory: z.boolean().optional().default(false),
});

export type CreateNotificationInput = z.input<typeof CreateNotificationInputSchema>;

export const MarkNotificationReadSchema = z.object({
  read: z.boolean().default(true),
});

export type MarkNotificationRead = z.infer<typeof MarkNotificationReadSchema>;

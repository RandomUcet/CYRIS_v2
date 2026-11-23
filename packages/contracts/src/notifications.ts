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

// Organizer-owned in-app exercise broadcasts. Explicit scope, server-chosen
// action URL and a client idempotency key prevent accidental repeats.
export const ExerciseBroadcastKindSchema = z.enum(['INFO', 'UPDATE', 'INSTRUCTION', 'URGENT']);
export const ExerciseBroadcastAudienceSchema = z.discriminatedUnion('audience', [
  z.object({ audience: z.literal('ALL'), unitId: z.undefined().optional() }),
  z.object({ audience: z.literal('UNIT'), unitId: z.string().uuid() }),
]);
export const ExerciseBroadcastRequestSchema = ExerciseBroadcastAudienceSchema.and(z.object({
  nonce: z.string().uuid(),
  kind: ExerciseBroadcastKindSchema,
  title: z.string().trim().min(3).max(120),
  message: z.string().trim().min(3).max(900),
}));
export type ExerciseBroadcastRequest = z.infer<typeof ExerciseBroadcastRequestSchema>;

export const ExerciseBroadcastAudienceQuerySchema = z.object({
  kind: ExerciseBroadcastKindSchema.default('INFO'),
  audience: z.enum(['ALL', 'UNIT']).default('ALL'),
  unitId: z.string().uuid().optional(),
}).superRefine((x,ctx)=>{
  if(x.audience==='UNIT'&&!x.unitId) ctx.addIssue({code:'custom',message:'Team is required for unit audience'});
  if(x.audience==='ALL'&&x.unitId) ctx.addIssue({code:'custom',message:'Unit must be omitted for all participants'});
});
export type ExerciseBroadcastAudienceQuery = z.infer<typeof ExerciseBroadcastAudienceQuerySchema>;

export const ExerciseBroadcastReceiptSchema = z.object({
  nonce: z.string().uuid(),
  delivered: z.number().int().nonnegative(),
  repeated: z.boolean(),
});
export type ExerciseBroadcastReceipt = z.infer<typeof ExerciseBroadcastReceiptSchema>;

export const ExerciseBroadcastHistorySchema = z.array(z.object({
  nonce: z.string().uuid(),
  kind: ExerciseBroadcastKindSchema,
  title: z.string(),
  audience: z.enum(['ALL','UNIT']),
  unitId: z.string().uuid().nullable(),
  delivered: z.number().int(),
  read: z.number().int(),
  sentAt: z.string(),
}));
export type ExerciseBroadcastHistory = z.infer<typeof ExerciseBroadcastHistorySchema>;

/** Persisted organizer-only plans (draft, scheduled, delivered or cancelled). */
export const ExerciseBroadcastPlanStatusSchema = z.enum(['DRAFT','SCHEDULED','SENT','CANCELLED','FAILED']);
export const ExerciseBroadcastPlanInputSchema = ExerciseBroadcastRequestSchema.and(z.object({
  scheduledAt: z.string().datetime({offset:true}).optional(),
}));
export type ExerciseBroadcastPlanInput = z.infer<typeof ExerciseBroadcastPlanInputSchema>;
export const ExerciseBroadcastPlanRevisionSchema = ExerciseBroadcastRequestSchema.and(z.object({
  revision: z.number().int().positive(),
}));
export type ExerciseBroadcastPlanRevision = z.infer<typeof ExerciseBroadcastPlanRevisionSchema>;
export const ExerciseBroadcastPlanTransitionSchema = z.object({
  revision: z.number().int().positive(),
  scheduledAt: z.string().datetime({offset:true}).optional(),
});
export type ExerciseBroadcastPlanTransition = z.infer<typeof ExerciseBroadcastPlanTransitionSchema>;
export const ExerciseBroadcastPlanResponseSchema = z.object({
  id:z.string().uuid(), eventId:z.string().uuid(),
  kind:ExerciseBroadcastKindSchema,
  audience:z.enum(['ALL','UNIT']),
  unitId:z.string().uuid().nullable(),
  title:z.string(),message:z.string(),
  status:ExerciseBroadcastPlanStatusSchema,
  scheduledAt:z.string().nullable(),
  sentAt:z.string().nullable(),
  deliveredCount:z.number().int().nonnegative(),
  revision:z.number().int().positive(),
  failureCode:z.string().nullable(),
  createdAt:z.string(),updatedAt:z.string(),
});
export type ExerciseBroadcastPlanResponse = z.infer<typeof ExerciseBroadcastPlanResponseSchema>;

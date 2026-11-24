import {z} from 'zod';

// Never confuse an EXERCISE event stream with real operational telemetry.
export const JsocCategorySchema=z.enum(['AUTH','NETWORK','DNS','ENDPOINT','APPLICATION']);
export const JsocSeveritySchema=z.enum(['INFO','LOW','MEDIUM','HIGH','CRITICAL']);
export const JsocLogQuerySchema=z.object({
  category:JsocCategorySchema.optional(),
  severity:JsocSeveritySchema.optional(),
  search:z.string().trim().max(100).optional(),
  page:z.coerce.number().int().min(1).max(10000).default(1),
  limit:z.coerce.number().int().min(1).max(100).default(25),
});
export const GenerateJsocLogsSchema=z.object({
  seed:z.number().int().min(-2147483648).max(2147483647),
  count:z.number().int().min(10).max(100),
  scenario:z.string().trim().min(3).max(160),
  category:JsocCategorySchema.optional(),
});
export type JsocCategory=z.infer<typeof JsocCategorySchema>;
export type JsocSeverity=z.infer<typeof JsocSeveritySchema>;
export type JsocLogQuery=z.infer<typeof JsocLogQuerySchema>;
export type GenerateJsocLogs=z.infer<typeof GenerateJsocLogsSchema>;
export const JsocLogSchema=z.object({
  id:z.string().uuid(),
  eventId:z.string().uuid(),
  observedAt:z.string().datetime(),
  category:JsocCategorySchema,
  severity:JsocSeveritySchema,
  source:z.string(),
  message:z.string(),
  sourceAddress:z.string().nullable(),
  destinationAddress:z.string().nullable(),
  scenario:z.string(),
  createdAt:z.string().datetime(),
});
export type JsocLog=z.infer<typeof JsocLogSchema>;
export const JsocLogPageSchema=z.object({
  eventId:z.string().uuid(),
  simulation:z.literal(true),
  canGenerate:z.boolean(),
  page:z.number().int(),
  limit:z.number().int(),
  total:z.number().int().nonnegative(),
  items:z.array(JsocLogSchema),
});
export type JsocLogPage=z.infer<typeof JsocLogPageSchema>;

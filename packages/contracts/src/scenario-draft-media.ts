import { z } from 'zod';
import { ScenarioBatchMediaQuerySchema } from './scenario-data.js';

export const ScenarioDraftKindSchema = ScenarioBatchMediaQuerySchema.shape.kind;
export const ScenarioDraftMediaSlotSchema = z.object({
  kind: ScenarioDraftKindSchema,
  index: z.number().int().nonnegative().max(12000),
});
export const ScenarioDraftMediaUploadSchema = ScenarioDraftMediaSlotSchema.extend({
  filename: z.string().trim().min(1).max(200),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  data: z.string().min(4).max(Math.ceil(5 * 1024 * 1024 * 4 / 3) + 8),
});
export const ScenarioDraftMediaRemoveSchema = ScenarioDraftMediaSlotSchema;
export const ScenarioDraftMediaImageQuerySchema = z.object({ kind: ScenarioDraftKindSchema, index: z.coerce.number().int().nonnegative().max(12000) });
export const ScenarioDraftRecordListQuerySchema = z.object({
  kind: ScenarioDraftKindSchema,
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const ScenarioDraftRecordListSchema = z.object({
  kind: ScenarioDraftKindSchema, page: z.number().int().positive(),
  limit: z.number().int().positive(), hasMore: z.boolean(),
  records: z.array(z.object({ index: z.number().int().nonnegative(), label: z.string(), hasImage: z.boolean() })),
});
export const ScenarioDraftMediaItemSchema = z.object({
  kind: ScenarioDraftKindSchema, index: z.number().int().nonnegative(),
  filename: z.string(), mimeType: z.string(), byteSize: z.number().int().nonnegative(),
});
export type ScenarioDraftMediaUpload = z.infer<typeof ScenarioDraftMediaUploadSchema>;
export type ScenarioDraftMediaRemove = z.infer<typeof ScenarioDraftMediaRemoveSchema>;
export type ScenarioDraftRecordListQuery = z.infer<typeof ScenarioDraftRecordListQuerySchema>;
export type ScenarioDraftRecordList = z.infer<typeof ScenarioDraftRecordListSchema>;
export type ScenarioDraftMediaItem = z.infer<typeof ScenarioDraftMediaItemSchema>;

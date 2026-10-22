import { z } from 'zod';

export const DocumentType = {
  REPORT: 'REPORT',
  PHOTO: 'PHOTO',
  FORENSIC_REPORT: 'FORENSIC_REPORT',
  LAB_REPORT: 'LAB_REPORT',
  INTERVIEW: 'INTERVIEW',
  COURT_FILING: 'COURT_FILING',
  EXHIBIT: 'EXHIBIT',
  BRIEFING_ATTACHMENT: 'BRIEFING_ATTACHMENT',
  OTHER: 'OTHER',
} as const;

export type DocumentTypeValue = (typeof DocumentType)[keyof typeof DocumentType];

export const DocumentStatus = {
  DRAFT: 'DRAFT',
  FINAL: 'FINAL',
  ARCHIVED: 'ARCHIVED',
} as const;

export type DocumentStatusValue = (typeof DocumentStatus)[keyof typeof DocumentStatus];

export const TextExtractionStatus = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  NO_TEXT: 'NO_TEXT',
} as const;

export type TextExtractionStatusValue = (typeof TextExtractionStatus)[keyof typeof TextExtractionStatus];

export const DocumentVersionItemSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  objectKey: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  byteSize: z.number().int().nonnegative(),
  sha256: z.string().length(64),
  uploadedByUserId: z.string().uuid().nullable().optional(),
  uploadedAt: z.string(),
  changeNote: z.string().nullable().optional(),
});
export type DocumentVersionItem = z.infer<typeof DocumentVersionItemSchema>;

export const DocumentItemSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  documentNumber: z.string().nullable().optional(),
  title: z.string(),
  description: z.string().nullable().optional(),
  documentType: z.string(),
  status: z.string(),
  originalFilename: z.string(),
  mimeType: z.string(),
  byteSize: z.number().int().nonnegative(),
  sha256: z.string().length(64),
  uploadedByUserId: z.string().uuid().nullable().optional(),
  uploadedAt: z.string(),
  textExtractionStatus: z.string(),
  extractedText: z.string().nullable().optional(),
  currentVersionNumber: z.number().int().positive().default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DocumentItem = z.infer<typeof DocumentItemSchema>;

export const DocumentDetailSchema = DocumentItemSchema.extend({
  versions: z.array(DocumentVersionItemSchema).default([]),
});
export type DocumentDetail = z.infer<typeof DocumentDetailSchema>;

export const CreateDocumentMetadataSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  documentType: z.string().default('REPORT'),
  visibility: z.enum(['EVENT', 'UNIT', 'RESTRICTED', 'SCENARIO']).default('EVENT'),
  owningUnitId: z.string().uuid().optional(),
  documentNumber: z.string().optional(),
});
export type CreateDocumentMetadata = z.infer<typeof CreateDocumentMetadataSchema>;

export const UpdateDocumentMetadataSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  documentType: z.string().optional(),
  status: z.enum(['DRAFT', 'FINAL', 'ARCHIVED']).optional(),
  visibility: z.enum(['EVENT', 'UNIT', 'RESTRICTED', 'SCENARIO']).optional(),
  owningUnitId: z.string().uuid().nullable().optional(),
});
export type UpdateDocumentMetadata = z.infer<typeof UpdateDocumentMetadataSchema>;

export const CreateDocumentVersionMetadataSchema = z.object({
  changeNote: z.string().max(1000).optional(),
});
export type CreateDocumentVersionMetadata = z.infer<typeof CreateDocumentVersionMetadataSchema>;

export const DocumentQueryFiltersSchema = z.object({
  eventId: z.string().uuid().optional(),
  documentType: z.string().optional(),
  status: z.string().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
export type DocumentQueryFilters = z.infer<typeof DocumentQueryFiltersSchema>;

// Convenience Type Aliases
export type DocumentListItemDto = DocumentItem;
export type DocumentDetailDto = DocumentItem;
export type DocumentVersionDto = DocumentVersionItem;
export type DocumentType = DocumentTypeValue;
export type DocumentStatus = DocumentStatusValue;

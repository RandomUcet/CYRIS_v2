import { z } from 'zod';

export const ForensicAnalysisType = {
  DISK_IMAGE: 'DISK_IMAGE',
  FILE_ANALYSIS: 'FILE_ANALYSIS',
  MEMORY_ANALYSIS: 'MEMORY_ANALYSIS',
  NETWORK_ANALYSIS: 'NETWORK_ANALYSIS',
  MOBILE_DEVICE: 'MOBILE_DEVICE',
  MALWARE_ANALYSIS: 'MALWARE_ANALYSIS',
  LOG_ANALYSIS: 'LOG_ANALYSIS',
  ACCOUNT_ANALYSIS: 'ACCOUNT_ANALYSIS',
  OTHER: 'OTHER',
} as const;

export type ForensicAnalysisTypeValue = (typeof ForensicAnalysisType)[keyof typeof ForensicAnalysisType];

export const ForensicStatus = {
  REQUESTED: 'REQUESTED',
  ACCEPTED: 'ACCEPTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
} as const;

export type ForensicStatusValue = (typeof ForensicStatus)[keyof typeof ForensicStatus];

export const ForensicPriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const;

export type ForensicPriorityValue = (typeof ForensicPriority)[keyof typeof ForensicPriority];

export const FindingType = {
  ARTIFACT: 'ARTIFACT',
  COMMUNICATION: 'COMMUNICATION',
  MALWARE: 'MALWARE',
  EXFILTRATION: 'EXFILTRATION',
  SYSTEM_LOG: 'SYSTEM_LOG',
  DELETED_FILE: 'DELETED_FILE',
  TIMELINE_EVENT: 'TIMELINE_EVENT',
  OTHER: 'OTHER',
} as const;

export type FindingTypeValue = (typeof FindingType)[keyof typeof FindingType];

export const FindingConfidence = {
  CONFIRMED: 'CONFIRMED',
  PROBABLE: 'PROBABLE',
  SUSPECTED: 'SUSPECTED',
  UNVERIFIED: 'UNVERIFIED',
} as const;

export type FindingConfidenceValue = (typeof FindingConfidence)[keyof typeof FindingConfidence];

export const IndicatorType = {
  IP: 'IP',
  DOMAIN: 'DOMAIN',
  HOSTNAME: 'HOSTNAME',
  EMAIL: 'EMAIL',
  USERNAME: 'USERNAME',
  FILE_HASH: 'FILE_HASH',
  URL: 'URL',
  OTHER: 'OTHER',
} as const;

export type IndicatorTypeValue = (typeof IndicatorType)[keyof typeof IndicatorType];

export const IndicatorVerificationState = {
  UNVERIFIED: 'UNVERIFIED',
  SUSPICIOUS: 'SUSPICIOUS',
  CONFIRMED_MALICIOUS: 'CONFIRMED_MALICIOUS',
  BENIGN: 'BENIGN',
} as const;

export type IndicatorVerificationStateValue = (typeof IndicatorVerificationState)[keyof typeof IndicatorVerificationState];

export const AcquisitionType = {
  PHYSICAL: 'PHYSICAL',
  LOGICAL: 'LOGICAL',
  TARGETED: 'TARGETED',
  MEMORY_DUMP: 'MEMORY_DUMP',
  TRIAGE: 'TRIAGE',
} as const;

export type AcquisitionTypeValue = (typeof AcquisitionType)[keyof typeof AcquisitionType];

/* -------------------------------------------------------------------------- */
/* DTO & Response Schemas                                                     */
/* -------------------------------------------------------------------------- */

export const ForensicFindingSchema = z.object({
  id: z.string().uuid(),
  analysisId: z.string().uuid(),
  findingType: z.string(),
  title: z.string(),
  description: z.string(),
  confidence: z.string().default('CONFIRMED'),
  createdByUserId: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
});
export type ForensicFinding = z.infer<typeof ForensicFindingSchema>;

export const TechnicalIndicatorSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  indicatorType: z.string(),
  value: z.string(),
  normalizedValue: z.string(),
  description: z.string().nullable().optional(),
  verificationState: z.string().default('UNVERIFIED'),
  firstSeenAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TechnicalIndicator = z.infer<typeof TechnicalIndicatorSchema>;

export const ForensicAcquisitionSchema = z.object({
  id: z.string().uuid(),
  analysisId: z.string().uuid(),
  evidenceId: z.string().uuid().nullable().optional(),
  deviceId: z.string().uuid().nullable().optional(),
  acquisitionType: z.string(),
  startedAt: z.string(),
  completedAt: z.string().nullable().optional(),
  toolName: z.string().nullable().optional(),
  toolVersion: z.string().nullable().optional(),
  sourceSize: z.number().int().nonnegative().nullable().optional(),
  hashAlgorithm: z.string().default('SHA-256'),
  sourceHash: z.string().nullable().optional(),
  imageHash: z.string().nullable().optional(),
  storageReference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type ForensicAcquisition = z.infer<typeof ForensicAcquisitionSchema>;

export const ForensicAnalysisItemSchema = z.object({
  id: z.string().uuid(),
  analysisNumber: z.string(),
  eventId: z.string().uuid(),
  analysisType: z.string(),
  status: z.string(),
  priority: z.string(),
  requestedByUserId: z.string().uuid().nullable().optional(),
  requestedFromUnitId: z.string().uuid().nullable().optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
  assignedUnitId: z.string().uuid().nullable().optional(),
  requestedAt: z.string(),
  acceptedAt: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  approvedAt: z.string().nullable().optional(),
  reportAvailable:z.boolean().optional(),
  requesterName:z.string().nullable().optional(),
  unitName:z.string().nullable().optional(),
  analystName:z.string().nullable().optional(),
  purpose: z.string().nullable().optional(),
  methodology: z.string().nullable().optional(),
  findings: z.string().nullable().optional(),
  conclusion: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ForensicAnalysisItem = z.infer<typeof ForensicAnalysisItemSchema>;

export const ForensicAnalysisDetailSchema = ForensicAnalysisItemSchema.extend({
  reportAvailable:z.boolean().optional(),
  actions:z.object({accept:z.boolean(),work:z.boolean(),complete:z.boolean(),approve:z.boolean(),reassign:z.boolean().optional()}).optional(),
  findingsList: z.array(ForensicFindingSchema).default([]),
  acquisitions: z.array(ForensicAcquisitionSchema).default([]),
  evidenceLinks: z.array(z.object({
    id: z.string().uuid(),
    evidenceNumber: z.string(),
    description: z.string(),
    status: z.string(),
  })).default([]),
  deviceLinks: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    deviceType: z.string(),
  })).default([]),
});
export type ForensicAnalysisDetail = z.infer<typeof ForensicAnalysisDetailSchema>;

/* -------------------------------------------------------------------------- */
/* Requests                                                                   */
/* -------------------------------------------------------------------------- */

export const CreateForensicAnalysisRequestSchema = z.object({
  analysisType: z.string().default('FILE_ANALYSIS'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  purpose: z.string().min(1).max(2000),
  methodology: z.string().max(2000).optional(),
  requestedFromUnitId: z.string().uuid().optional(),
  assignedUnitId: z.string().uuid().optional(),
  assignedToUserId: z.string().uuid().optional(),
  evidenceIds: z.array(z.string().uuid()).optional(),
  deviceIds: z.array(z.string().uuid()).optional(),
  visibility: z.enum(['EVENT', 'UNIT', 'RESTRICTED', 'SCENARIO']).default('EVENT'),
  owningUnitId: z.string().uuid().optional(),
});
export type CreateForensicAnalysisRequest = z.infer<typeof CreateForensicAnalysisRequestSchema>;

export const UpdateForensicStatusRequestSchema = z.object({
  status: z.enum([
    'REQUESTED',
    'ACCEPTED',
    'IN_PROGRESS',
    'COMPLETED',
    'APPROVED',
    'REJECTED',
    'CANCELLED',
  ]),
  notes: z.string().optional(),
  findings: z.string().optional(),
  conclusion: z.string().optional(),
  methodology: z.string().optional(),
});
export type UpdateForensicStatusRequest = z.infer<typeof UpdateForensicStatusRequestSchema>;
export const SaveForensicReportSchema=z.object({methodology:z.string().max(20000).optional(),findings:z.string().max(20000).optional(),conclusion:z.string().max(20000).optional()}).strict().refine(v=>Object.keys(v).length>0,'Provide report content');
export type SaveForensicReport=z.infer<typeof SaveForensicReportSchema>;

export const ReassignForensicAnalysisSchema=z.object({
  assignedToUserId:z.string().uuid(),
  expectedUpdatedAt:z.string().datetime(),
  reason:z.string().trim().min(1).max(1000),
}).strict();
export type ReassignForensicAnalysis=z.infer<typeof ReassignForensicAnalysisSchema>;

export const CreateForensicFindingRequestSchema = z.object({
  findingType: z.string().default('ARTIFACT'),
  title: z.string().min(1).max(255),
  description: z.string().min(1).max(5000),
  confidence: z.enum(['CONFIRMED', 'PROBABLE', 'SUSPECTED', 'UNVERIFIED']).default('CONFIRMED'),
});
export type CreateForensicFindingRequest = z.infer<typeof CreateForensicFindingRequestSchema>;

export const CreateTechnicalIndicatorRequestSchema = z.object({
  indicatorType: z.enum(['IP', 'DOMAIN', 'HOSTNAME', 'EMAIL', 'USERNAME', 'FILE_HASH', 'URL', 'OTHER']),
  value: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  verificationState: z.enum(['UNVERIFIED', 'SUSPICIOUS', 'CONFIRMED_MALICIOUS', 'BENIGN']).default('UNVERIFIED'),
  firstSeenAt: z.string().datetime().optional(),
});
export type CreateTechnicalIndicatorRequest = z.infer<typeof CreateTechnicalIndicatorRequestSchema>;

export const CreateForensicAcquisitionRequestSchema = z.object({
  evidenceId: z.string().uuid().optional(),
  deviceId: z.string().uuid().optional(),
  acquisitionType: z.enum(['PHYSICAL', 'LOGICAL', 'TARGETED', 'MEMORY_DUMP', 'TRIAGE']).default('LOGICAL'),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  toolName: z.string().max(100).optional(),
  toolVersion: z.string().max(50).optional(),
  sourceSize: z.number().int().nonnegative().optional(),
  hashAlgorithm: z.string().default('SHA-256'),
  sourceHash: z.string().optional(),
  imageHash: z.string().optional(),
  storageReference: z.string().optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateForensicAcquisitionRequest = z.infer<typeof CreateForensicAcquisitionRequestSchema>;

export const ForensicQueryFiltersSchema = z.object({
  eventId: z.string().uuid().optional(),
  status: z.string().optional(),
  analysisType: z.string().optional(),
  priority: z.string().optional(),
  assignedUnitId: z.string().uuid().optional(),
  assignedToUserId: z.string().uuid().optional(),
  evidenceId:z.string().uuid().optional(),
  mine:z.enum(['requested','assigned']).optional(),
  search:z.string().trim().max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
export type ForensicQueryFilters = z.infer<typeof ForensicQueryFiltersSchema>;

// Convenience Type Aliases
export type ForensicAnalysisListItemDto = ForensicAnalysisItem;
export type ForensicAnalysisDetailDto = ForensicAnalysisDetail;
export type ForensicFindingDto = ForensicFinding;
export type ForensicAcquisitionDto = ForensicAcquisition;
export type TechnicalIndicatorDto = TechnicalIndicator;
export type ForensicAnalysisType = ForensicAnalysisTypeValue;
export type ForensicPriority = ForensicPriorityValue;
export type ForensicFindingType = FindingTypeValue;
export type VerificationState = string;
export type IndicatorType = IndicatorTypeValue;

import { z } from 'zod';

export const CourtCaseStatus = {
  PREPARATION: 'PREPARATION',
  FILED: 'FILED',
  ACTIVE: 'ACTIVE',
  DELIBERATION: 'DELIBERATION',
  DECIDED: 'DECIDED',
  CLOSED: 'CLOSED',
} as const;

export type CourtCaseStatusValue = (typeof CourtCaseStatus)[keyof typeof CourtCaseStatus];

export const CourtPartyRole = {
  ACCUSED: 'ACCUSED',
  PROSECUTION: 'PROSECUTION',
  DEFENCE: 'DEFENCE',
  WITNESS: 'WITNESS',
  EXPERT: 'EXPERT',
  OTHER: 'OTHER',
} as const;

export type CourtPartyRoleValue = (typeof CourtPartyRole)[keyof typeof CourtPartyRole];

export const ChargeStatus = {
  FILED: 'FILED',
  ADMITTED: 'ADMITTED',
  DISMISSED: 'DISMISSED',
  CONVICTED: 'CONVICTED',
  ACQUITTED: 'ACQUITTED',
} as const;

export type ChargeStatusValue = (typeof ChargeStatus)[keyof typeof ChargeStatus];

export const ExhibitStatus = {
  PROPOSED: 'PROPOSED',
  SUBMITTED: 'SUBMITTED',
  ADMITTED: 'ADMITTED',
  EXCLUDED: 'EXCLUDED',
  WITHDRAWN: 'WITHDRAWN',
} as const;

export type ExhibitStatusValue = (typeof ExhibitStatus)[keyof typeof ExhibitStatus];

export const HearingStatus = {
  SCHEDULED: 'SCHEDULED',
  IN_SESSION: 'IN_SESSION',
  ADJOURNED: 'ADJOURNED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type HearingStatusValue = (typeof HearingStatus)[keyof typeof HearingStatus];

export const DecisionType = {
  VERDICT_CONVICTION: 'VERDICT_CONVICTION',
  VERDICT_ACQUITTAL: 'VERDICT_ACQUITTAL',
  DISMISSAL: 'DISMISSAL',
  INTERLOCUTORY_ORDER: 'INTERLOCUTORY_ORDER',
  SENTENCE: 'SENTENCE',
} as const;

export type DecisionTypeValue = (typeof DecisionType)[keyof typeof DecisionType];

export const CourtFilingType = {
  INDICTMENT: 'INDICTMENT',
  MOTION: 'MOTION',
  EVIDENCE_SUBMISSION: 'EVIDENCE_SUBMISSION',
  DEFENCE_BRIEF: 'DEFENCE_BRIEF',
  EXPERT_OPINION: 'EXPERT_OPINION',
  ORDER: 'ORDER',
  JUDGMENT: 'JUDGMENT',
} as const;

export type CourtFilingTypeValue = (typeof CourtFilingType)[keyof typeof CourtFilingType];

/* -------------------------------------------------------------------------- */
/* DTO & Response Schemas                                                     */
/* -------------------------------------------------------------------------- */

export const CourtCasePartySchema = z.object({
  id: z.string().uuid(),
  courtCaseId: z.string().uuid(),
  partyResourceId: z.string().uuid(),
  partyRole: z.string(),
  partyName: z.string().optional(),
  partyType: z.string().optional(), // 'person' | 'organisation'
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type CourtCaseParty = z.infer<typeof CourtCasePartySchema>;

export const ChargeSchema = z.object({
  id: z.string().uuid(),
  courtCaseId: z.string().uuid(),
  code: z.string().nullable().optional(),
  title: z.string(),
  description: z.string(),
  status: z.string().default('FILED'),
  relatedCaseResourceId: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Charge = z.infer<typeof ChargeSchema>;

export const CourtExhibitSchema = z.object({
  id: z.string().uuid(),
  courtCaseId: z.string().uuid(),
  evidenceId: z.string().uuid(),
  evidenceNumber: z.string().optional(),
  evidenceDescription: z.string().optional(),
  documentId: z.string().uuid().nullable().optional(),
  documentTitle: z.string().optional(),
  exhibitNumber: z.string(),
  status: z.string().default('SUBMITTED'),
  proposedByUserId: z.string().uuid().nullable().optional(),
  proposedAt: z.string(),
  decisionByUserId: z.string().uuid().nullable().optional(),
  decidedAt: z.string().nullable().optional(),
  decisionReason: z.string().nullable().optional(),
  chainOfCustodyCount: z.number().int().nonnegative().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CourtExhibit = z.infer<typeof CourtExhibitSchema>;

export const CourtHearingSchema = z.object({
  id: z.string().uuid(),
  courtCaseId: z.string().uuid(),
  title: z.string(),
  scheduledAt: z.string(),
  startedAt: z.string().nullable().optional(),
  endedAt: z.string().nullable().optional(),
  status: z.string().default('SCHEDULED'),
  locationResourceId: z.string().uuid().nullable().optional(),
  locationName: z.string().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CourtHearing = z.infer<typeof CourtHearingSchema>;

export const CourtFilingSchema = z.object({
  id: z.string().uuid(),
  courtCaseId: z.string().uuid(),
  documentId: z.string().uuid(),
  documentTitle: z.string().optional(),
  documentNumber: z.string().optional(),
  filingType: z.string(),
  filedByUserId: z.string().uuid().nullable().optional(),
  filedAt: z.string(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type CourtFiling = z.infer<typeof CourtFilingSchema>;

export const CourtDecisionSchema = z.object({
  id: z.string().uuid(),
  courtCaseId: z.string().uuid(),
  decisionType: z.string(),
  summary: z.string(),
  reasoning: z.string().nullable().optional(),
  decidedAt: z.string(),
  decidedByUserId: z.string().uuid().nullable().optional(),
  documentId: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
});
export type CourtDecision = z.infer<typeof CourtDecisionSchema>;

export const CourtCaseItemSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  courtCaseNumber: z.string(),
  title: z.string(),
  summary: z.string().nullable().optional(),
  status: z.string(),
  originatingCaseId: z.string().uuid().nullable().optional(),
  originatingCaseNumber: z.string().optional(),
  openedAt: z.string(),
  closedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CourtCaseItem = z.infer<typeof CourtCaseItemSchema>;

export const CourtCaseDetailSchema = CourtCaseItemSchema.extend({
  parties: z.array(CourtCasePartySchema).default([]),
  charges: z.array(ChargeSchema).default([]),
  exhibits: z.array(CourtExhibitSchema).default([]),
  hearings: z.array(CourtHearingSchema).default([]),
  filings: z.array(CourtFilingSchema).default([]),
  decisions: z.array(CourtDecisionSchema).default([]),
});
export type CourtCaseDetail = z.infer<typeof CourtCaseDetailSchema>;

export const CourtTimelineEventSchema = z.object({
  id: z.string(),
  occurredAt: z.string(),
  eventType: z.string(),
  title: z.string(),
  summary: z.string().optional(),
  actorUserId: z.string().nullable().optional(),
  metadata: z.record(z.any()).optional(),
});
export type CourtTimelineEvent = z.infer<typeof CourtTimelineEventSchema>;

/* -------------------------------------------------------------------------- */
/* Requests                                                                   */
/* -------------------------------------------------------------------------- */

export const CreateCourtCaseRequestSchema = z.object({
  title: z.string().min(1).max(255),
  summary: z.string().max(3000).optional(),
  originatingCaseId: z.string().uuid().optional(),
  visibility: z.enum(['EVENT', 'UNIT', 'RESTRICTED', 'SCENARIO']).default('EVENT'),
  owningUnitId: z.string().uuid().optional(),
});
export type CreateCourtCaseRequest = z.infer<typeof CreateCourtCaseRequestSchema>;

export const UpdateCourtCaseStatusRequestSchema = z.object({
  status: z.enum(['PREPARATION', 'FILED', 'ACTIVE', 'DELIBERATION', 'DECIDED', 'CLOSED']),
  summary: z.string().optional(),
});
export type UpdateCourtCaseStatusRequest = z.infer<typeof UpdateCourtCaseStatusRequestSchema>;

export const AddCourtCasePartyRequestSchema = z.object({
  partyResourceId: z.string().uuid(),
  partyRole: z.enum(['ACCUSED', 'PROSECUTION', 'DEFENCE', 'WITNESS', 'EXPERT', 'OTHER']),
  notes: z.string().max(1000).optional(),
});
export type AddCourtCasePartyRequest = z.infer<typeof AddCourtCasePartyRequestSchema>;

export const CreateChargeRequestSchema = z.object({
  code: z.string().max(64).optional(),
  title: z.string().min(1).max(255),
  description: z.string().min(1).max(3000),
  relatedCaseResourceId: z.string().uuid().optional(),
});
export type CreateChargeRequest = z.infer<typeof CreateChargeRequestSchema>;

export const UpdateChargeStatusRequestSchema = z.object({
  status: z.enum(['FILED', 'ADMITTED', 'DISMISSED', 'CONVICTED', 'ACQUITTED']),
});
export type UpdateChargeStatusRequest = z.infer<typeof UpdateChargeStatusRequestSchema>;

export const SubmitCourtExhibitRequestSchema = z.object({
  evidenceId: z.string().uuid(),
  documentId: z.string().uuid().optional(),
  exhibitNumber: z.string().max(32).optional(),
});
export type SubmitCourtExhibitRequest = z.infer<typeof SubmitCourtExhibitRequestSchema>;

export const DecideCourtExhibitRequestSchema = z.object({
  status: z.enum(['ADMITTED', 'EXCLUDED', 'WITHDRAWN']),
  decisionReason: z.string().min(1).max(2000),
});
export type DecideCourtExhibitRequest = z.infer<typeof DecideCourtExhibitRequestSchema>;

export const CreateCourtHearingRequestSchema = z.object({
  title: z.string().min(1).max(255),
  scheduledAt: z.string().datetime(),
  locationResourceId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateCourtHearingRequest = z.infer<typeof CreateCourtHearingRequestSchema>;

export const UpdateCourtHearingStatusRequestSchema = z.object({
  status: z.enum(['SCHEDULED', 'IN_SESSION', 'ADJOURNED', 'COMPLETED', 'CANCELLED']),
  notes: z.string().optional(),
});
export type UpdateCourtHearingStatusRequest = z.infer<typeof UpdateCourtHearingStatusRequestSchema>;

export const CreateCourtFilingRequestSchema = z.object({
  documentId: z.string().uuid(),
  filingType: z.string().default('MOTION'),
  notes: z.string().max(1000).optional(),
});
export type CreateCourtFilingRequest = z.infer<typeof CreateCourtFilingRequestSchema>;

export const CreateCourtDecisionRequestSchema = z.object({
  decisionType: z.enum(['VERDICT_CONVICTION', 'VERDICT_ACQUITTAL', 'DISMISSAL', 'INTERLOCUTORY_ORDER', 'SENTENCE']),
  summary: z.string().min(1).max(3000),
  reasoning: z.string().max(10000).optional(),
  documentId: z.string().uuid().optional(),
});
export type CreateCourtDecisionRequest = z.infer<typeof CreateCourtDecisionRequestSchema>;

export const CourtQueryFiltersSchema = z.object({
  eventId: z.string().uuid().optional(),
  status: z.string().optional(),
  originatingCaseId: z.string().uuid().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
export type CourtQueryFilters = z.infer<typeof CourtQueryFiltersSchema>;

// Convenience Type Aliases
export type CourtCaseListItemDto = CourtCaseItem;
export type CourtCaseDetailDto = CourtCaseDetail;
export type CourtCasePartyDto = CourtCaseParty;
export type ChargeDto = Charge;
export type CourtExhibitDto = CourtExhibit;
export type CourtHearingDto = CourtHearing;
export type CourtFilingDto = CourtFiling;
export type CourtDecisionDto = CourtDecision;
export type CourtCaseStatus = CourtCaseStatusValue;
export type CourtPartyRole = CourtPartyRoleValue;
export type ExhibitStatus = ExhibitStatusValue;
export type HearingStatus = HearingStatusValue;
export type CourtDecisionType = DecisionTypeValue | string;

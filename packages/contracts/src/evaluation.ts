import { z } from 'zod';

export const EvaluationStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  LOCKED: 'LOCKED',
  PUBLISHED: 'PUBLISHED',
} as const;

export type EvaluationStatusType = (typeof EvaluationStatus)[keyof typeof EvaluationStatus];

export const MeasurementType = {
  OBSERVATION: 'OBSERVATION',
  BOOLEAN: 'BOOLEAN',
  SCALE: 'SCALE',
  SCORE: 'SCORE',
} as const;

export type MeasurementTypeValue = (typeof MeasurementType)[keyof typeof MeasurementType];

export const EvaluationObservationType = {
  NOTE: 'NOTE',
  CRITERION_EVALUATION: 'CRITERION_EVALUATION',
  SIGNIFICANT_MOMENT: 'SIGNIFICANT_MOMENT',
  DEFICIENCY: 'DEFICIENCY',
  COMMENDATION: 'COMMENDATION',
} as const;

export type EvaluationObservationTypeValue = (typeof EvaluationObservationType)[keyof typeof EvaluationObservationType];

/* -------------------------------------------------------------------------- */
/* Models                                                                     */
/* -------------------------------------------------------------------------- */

export const EvaluationCriterionItemSchema = z.object({
  id: z.string().uuid(),
  objectiveId: z.string().uuid(),
  description: z.string(),
  measurementType: z.enum(['OBSERVATION', 'BOOLEAN', 'SCALE', 'SCORE']),
  maximumScore: z.number().int().positive().nullable().optional(),
  sequence: z.number().int().nonnegative().default(0),
  createdAt: z.string(),
});

export type EvaluationCriterionItem = z.infer<typeof EvaluationCriterionItemSchema>;

export const EvaluationObjectiveItemSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  code: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.string().nullable().optional(),
  scenarioPhaseId: z.string().uuid().nullable().optional(),
  scenarioPhaseTitle: z.string().optional(),
  scenarioInjectId: z.string().uuid().nullable().optional(),
  scenarioInjectNumber: z.string().optional(),
  targetUnitId: z.string().uuid().nullable().optional(),
  targetUnitName: z.string().optional(),
  weight: z.number().int().positive().default(1),
  status: z.enum(['DRAFT', 'ACTIVE', 'LOCKED', 'PUBLISHED']),
  criteria: z.array(EvaluationCriterionItemSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type EvaluationObjectiveItem = z.infer<typeof EvaluationObjectiveItemSchema>;

export const EvaluationObservationItemSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  observerUserId: z.string().uuid(),
  observerUserDisplayName: z.string().optional(),
  observedAt: z.string(),
  objectiveId: z.string().uuid().nullable().optional(),
  objectiveCode: z.string().optional(),
  objectiveTitle: z.string().optional(),
  criterionId: z.string().uuid().nullable().optional(),
  criterionDescription: z.string().optional(),
  targetUnitId: z.string().uuid().nullable().optional(),
  targetUnitName: z.string().optional(),
  targetUserId: z.string().uuid().nullable().optional(),
  targetUserDisplayName: z.string().optional(),
  scenarioInjectId: z.string().uuid().nullable().optional(),
  scenarioInjectNumber: z.string().optional(),
  relatedResourceId: z.string().uuid().nullable().optional(),
  relatedResourceType: z.string().optional(),
  relatedActivityEventId: z.string().uuid().nullable().optional(),
  observationType: z.enum(['NOTE', 'CRITERION_EVALUATION', 'SIGNIFICANT_MOMENT', 'DEFICIENCY', 'COMMENDATION']),
  note: z.string(),
  score: z.number().int().nullable().optional(),
  result: z.enum(['MET', 'PARTIALLY_MET', 'NOT_MET', 'EXCEEDED', 'UNOBSERVED']).nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type EvaluationObservationItem = z.infer<typeof EvaluationObservationItemSchema>;

export const AfterActionReviewResponseSchema = z.object({
  eventId: z.string().uuid(),
  status: z.enum(['DRAFT', 'ACTIVE', 'LOCKED', 'PUBLISHED']),
  objectivesCount: z.number().int().nonnegative(),
  observationsCount: z.number().int().nonnegative(),
  unitSummaries: z.array(
    z.object({
      unitId: z.string().uuid(),
      unitName: z.string(),
      observationsCount: z.number().int().nonnegative(),
      scoresRecorded: z.number().int().nonnegative(),
      averageScore: z.number().nullable(),
    })
  ),
  objectives: z.array(EvaluationObjectiveItemSchema),
  recentObservations: z.array(EvaluationObservationItemSchema),
  generatedAt: z.string(),
});

export type AfterActionReviewResponse = z.infer<typeof AfterActionReviewResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Requests                                                                   */
/* -------------------------------------------------------------------------- */

export const CreateEvaluationObjectiveRequestSchema = z.object({
  code: z.string().min(1).max(64),
  title: z.string().min(1).max(255),
  description: z.string().min(1).max(5000),
  category: z.string().max(128).optional(),
  scenarioPhaseId: z.string().uuid().optional(),
  scenarioInjectId: z.string().uuid().optional(),
  targetUnitId: z.string().uuid().optional(),
  weight: z.number().int().positive().default(1),
  status: z.enum(['DRAFT', 'ACTIVE', 'LOCKED', 'PUBLISHED']).default('ACTIVE'),
});

export type CreateEvaluationObjectiveRequest = z.infer<typeof CreateEvaluationObjectiveRequestSchema>;

export const UpdateEvaluationObjectiveRequestSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().min(1).max(5000).optional(),
  category: z.string().max(128).optional(),
  weight: z.number().int().positive().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'LOCKED', 'PUBLISHED']).optional(),
});

export type UpdateEvaluationObjectiveRequest = z.infer<typeof UpdateEvaluationObjectiveRequestSchema>;

export const CreateEvaluationCriterionRequestSchema = z.object({
  description: z.string().min(1).max(2000),
  measurementType: z.enum(['OBSERVATION', 'BOOLEAN', 'SCALE', 'SCORE']).default('SCORE'),
  maximumScore: z.number().int().positive().optional(),
  sequence: z.number().int().nonnegative().default(0),
});

export type CreateEvaluationCriterionRequest = z.infer<typeof CreateEvaluationCriterionRequestSchema>;

export const CreateEvaluationObservationRequestSchema = z.object({
  observedAt: z.string().datetime().optional(),
  objectiveId: z.string().uuid().optional(),
  criterionId: z.string().uuid().optional(),
  targetUnitId: z.string().uuid().optional(),
  targetUserId: z.string().uuid().optional(),
  scenarioInjectId: z.string().uuid().optional(),
  relatedResourceId: z.string().uuid().optional(),
  relatedActivityEventId: z.string().uuid().optional(),
  observationType: z
    .enum(['NOTE', 'CRITERION_EVALUATION', 'SIGNIFICANT_MOMENT', 'DEFICIENCY', 'COMMENDATION'])
    .default('NOTE'),
  note: z.string().min(1).max(10000),
  score: z.number().int().optional(),
  result: z.enum(['MET', 'PARTIALLY_MET', 'NOT_MET', 'EXCEEDED', 'UNOBSERVED']).optional(),
});

export type CreateEvaluationObservationRequest = z.infer<typeof CreateEvaluationObservationRequestSchema>;

export const UpdateEvaluationObservationRequestSchema = z.object({
  note: z.string().min(1).max(10000).optional(),
  score: z.number().int().nullable().optional(),
  result: z.enum(['MET', 'PARTIALLY_MET', 'NOT_MET', 'EXCEEDED', 'UNOBSERVED']).nullable().optional(),
});

export type UpdateEvaluationObservationRequest = z.infer<typeof UpdateEvaluationObservationRequestSchema>;

export const LockEvaluationRequestSchema = z.object({
  reason: z.string().min(1).max(1000),
});

export type LockEvaluationRequest = z.infer<typeof LockEvaluationRequestSchema>;

export const PublishEvaluationRequestSchema = z.object({
  notes: z.string().max(2000).optional(),
});

export type PublishEvaluationRequest = z.infer<typeof PublishEvaluationRequestSchema>;

export const EvaluationQueryFiltersSchema = z.object({
  eventId: z.string().uuid().optional(),
  objectiveId: z.string().uuid().optional(),
  targetUnitId: z.string().uuid().optional(),
  scenarioInjectId: z.string().uuid().optional(),
  observerUserId: z.string().uuid().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export type EvaluationQueryFilters = z.infer<typeof EvaluationQueryFiltersSchema>;

export type EvaluationObjective = EvaluationObjectiveItem;
export type EvaluationCriterion = EvaluationCriterionItem;
export type EvaluationObservationDetail = EvaluationObservationItem;

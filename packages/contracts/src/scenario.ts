import { z } from 'zod';

export const ScenarioPhaseStatus = {
  DRAFT: 'DRAFT',
  PLANNED: 'PLANNED',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type ScenarioPhaseStatusType = (typeof ScenarioPhaseStatus)[keyof typeof ScenarioPhaseStatus];

export const ScenarioInjectStatus = {
  DRAFT: 'DRAFT',
  BLOCKED: 'BLOCKED',
  READY: 'READY',
  SCHEDULED: 'SCHEDULED',
  RELEASED: 'RELEASED',
  CANCELLED: 'CANCELLED',
} as const;

export type ScenarioInjectStatusType = (typeof ScenarioInjectStatus)[keyof typeof ScenarioInjectStatus];

export const ScenarioInjectPriority = {
  LOW: 'LOW',
  NORMAL: 'NORMAL',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

export type ScenarioInjectPriorityType = (typeof ScenarioInjectPriority)[keyof typeof ScenarioInjectPriority];

export const ScenarioTriggerType = {
  MANUAL: 'MANUAL',
  SCHEDULED_TIME: 'SCHEDULED_TIME',
  CONDITION: 'CONDITION',
  EXTERNAL: 'EXTERNAL',
} as const;

export type ScenarioTriggerTypeValue = (typeof ScenarioTriggerType)[keyof typeof ScenarioTriggerType];

export const ScenarioReleasePolicy = {
  MANUAL_CONFIRMATION: 'MANUAL_CONFIRMATION',
  AUTO_RELEASE: 'AUTO_RELEASE',
} as const;

export type ScenarioReleasePolicyValue = (typeof ScenarioReleasePolicy)[keyof typeof ScenarioReleasePolicy];

export const ScenarioConditionType = {
  INJECT_RELEASED: 'INJECT_RELEASED',
  ACTIVITY_OCCURRED: 'ACTIVITY_OCCURRED',
  CASE_STATUS: 'CASE_STATUS',
  INCIDENT_STATUS: 'INCIDENT_STATUS',
  EVIDENCE_STATUS: 'EVIDENCE_STATUS',
  LAB_STATUS: 'LAB_STATUS',
  TASK_STATUS: 'TASK_STATUS',
  RECOVERY_OBJECTIVE_STATUS: 'RECOVERY_OBJECTIVE_STATUS',
} as const;

export type ScenarioConditionTypeValue = (typeof ScenarioConditionType)[keyof typeof ScenarioConditionType];

export const ScenarioConditionLogic = {
  ALL: 'ALL',
  ANY: 'ANY',
} as const;

export type ScenarioConditionLogicValue = (typeof ScenarioConditionLogic)[keyof typeof ScenarioConditionLogic];

export type ScenarioConditionResult = {
  met: boolean;
  reason: string;
};

export function scenarioStatusMatches(actual: string | null | undefined, expected: string | null | undefined): ScenarioConditionResult {
  if (!actual || !expected) return { met: false, reason: 'Target status is missing or unavailable' };
  return actual === expected
    ? { met: true, reason: '' }
    : { met: false, reason: `Expected status ${expected}, current status is ${actual}` };
}

export function validateScenarioDependencyGraph(
  currentInjectId: string,
  candidateDependencyIds: readonly string[],
  existingEdges: readonly { injectId: string; dependsOnInjectId: string }[],
): string | null {
  if (candidateDependencyIds.includes(currentInjectId)) return 'Inject cannot depend on itself.';
  const graph = new Map<string, string[]>();
  for (const edge of existingEdges) {
    const list = graph.get(edge.injectId) ?? [];
    list.push(edge.dependsOnInjectId);
    graph.set(edge.injectId, list);
  }
  graph.set(currentInjectId, [...candidateDependencyIds]);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const dependency of graph.get(node) ?? []) if (visit(dependency)) return true;
    visiting.delete(node);
    visited.add(node);
    return false;
  };
  return visit(currentInjectId) ? 'Circular dependency detected between scenario injects.' : null;
}

export function canScenarioAutoRelease(
  status: string,
  releasePolicy: string,
  isActiveScenario: boolean,
): boolean {
  return isActiveScenario && releasePolicy === 'AUTO_RELEASE' && status !== 'DRAFT' && status !== 'CANCELLED';
}

export function combineScenarioConditions(
  results: readonly ScenarioConditionResult[],
  logic: ScenarioConditionLogicValue,
): ScenarioConditionResult {
  const met = results.length === 0 || (logic === 'ANY'
    ? results.some((result) => result.met)
    : results.every((result) => result.met));
  return {
    met,
    reason: met ? '' : results.filter((result) => !result.met).map((result) => result.reason).join('; '),
  };
}

export const ScenarioTargetType = {
  EVENT: 'EVENT',
  UNIT: 'UNIT',
  USER: 'USER',
} as const;

export type ScenarioTargetTypeValue = (typeof ScenarioTargetType)[keyof typeof ScenarioTargetType];

export const ScenarioActionType = {
  DELIVER_BRIEFING: 'DELIVER_BRIEFING',
  GRANT_RESOURCE_ACCESS: 'GRANT_RESOURCE_ACCESS',
  CHANGE_RESOURCE_VISIBILITY: 'CHANGE_RESOURCE_VISIBILITY',
  CREATE_INCIDENT: 'CREATE_INCIDENT',
} as const;

export type ScenarioActionTypeValue = (typeof ScenarioActionType)[keyof typeof ScenarioActionType];

export const ScenarioReleaseType = {
  MANUAL: 'MANUAL',
  AUTO: 'AUTO',
  OVERRIDE: 'OVERRIDE',
} as const;

export type ScenarioReleaseTypeValue = (typeof ScenarioReleaseType)[keyof typeof ScenarioReleaseType];

// ==============================================================================
// Schemas: Scenario Phases
// ==============================================================================

export const CreateScenarioPhaseSchema = z.object({
  code: z.string().min(1).max(64),
  title: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  sequence: z.number().int().min(0).default(0),
  status: z.enum(['DRAFT', 'PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED']).default('DRAFT'),
  plannedStartAt: z.string().datetime().optional().nullable(),
  plannedEndAt: z.string().datetime().optional().nullable(),
  controllerNotes: z.string().optional().nullable(),
});

export type CreateScenarioPhaseInput = z.input<typeof CreateScenarioPhaseSchema>;

export const UpdateScenarioPhaseSchema = CreateScenarioPhaseSchema.partial().extend({
  forceActive: z.boolean().optional(),
});

export type UpdateScenarioPhaseInput = z.input<typeof UpdateScenarioPhaseSchema>;

export const ScenarioPhaseResponseSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  code: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  sequence: z.number().int(),
  status: z.string(),
  plannedStartAt: z.string().nullable(),
  plannedEndAt: z.string().nullable(),
  activatedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  controllerNotes: z.string().nullable(),
  createdByUserId: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ScenarioPhaseResponse = z.infer<typeof ScenarioPhaseResponseSchema>;

// ==============================================================================
// Schemas: Targets, Dependencies, Conditions, Actions
// ==============================================================================

export const ScenarioInjectTargetInputSchema = z.object({
  targetType: z.enum(['EVENT', 'UNIT', 'USER']),
  targetUnitId: z.string().uuid().optional().nullable(),
  targetUserId: z.string().uuid().optional().nullable(),
});

export type ScenarioInjectTargetInput = z.infer<typeof ScenarioInjectTargetInputSchema>;

export const ScenarioInjectTargetResponseSchema = ScenarioInjectTargetInputSchema.extend({
  id: z.string().uuid(),
  injectId: z.string().uuid(),
  unitName: z.string().optional().nullable(),
  userFullName: z.string().optional().nullable(),
});

export type ScenarioInjectTargetResponse = z.infer<typeof ScenarioInjectTargetResponseSchema>;

export const ScenarioInjectConditionInputSchema = z.object({
  conditionType: z.enum([
    'INJECT_RELEASED',
    'ACTIVITY_OCCURRED',
    'CASE_STATUS',
    'INCIDENT_STATUS',
    'EVIDENCE_STATUS',
    'LAB_STATUS',
    'TASK_STATUS',
    'RECOVERY_OBJECTIVE_STATUS',
  ]),
  targetResourceId: z.string().uuid().optional().nullable(),
  targetIdentifier: z.string().optional().nullable(),
  targetStatus: z.string().optional().nullable(),
  activityType: z.string().optional().nullable(),
  expectedValue: z.record(z.any()).optional().nullable(),
});

export type ScenarioInjectConditionInput = z.infer<typeof ScenarioInjectConditionInputSchema>;

export const ScenarioInjectConditionResponseSchema = ScenarioInjectConditionInputSchema.extend({
  id: z.string().uuid(),
  injectId: z.string().uuid(),
  isSatisfied: z.boolean(),
  satisfiedAt: z.string().nullable(),
  label: z.string().optional(),
});

export type ScenarioInjectConditionResponse = z.infer<typeof ScenarioInjectConditionResponseSchema>;

export const ScenarioInjectActionInputSchema = z.object({
  actionType: z.enum(['DELIVER_BRIEFING', 'GRANT_RESOURCE_ACCESS', 'CHANGE_RESOURCE_VISIBILITY', 'CREATE_INCIDENT']),
  resourceId: z.string().uuid().optional().nullable(),
  targetType: z.enum(['EVENT', 'UNIT', 'USER']).default('UNIT'),
  targetUnitId: z.string().uuid().optional().nullable(),
  targetUserId: z.string().uuid().optional().nullable(),
  newVisibility: z.string().optional().nullable(),
  parameters: z.record(z.any()).optional().nullable(),
});

export type ScenarioInjectActionInput = z.infer<typeof ScenarioInjectActionInputSchema>;

export const ScenarioInjectActionResponseSchema = ScenarioInjectActionInputSchema.extend({
  id: z.string().uuid(),
  injectId: z.string().uuid(),
  resourceIdentifier: z.string().optional().nullable(),
  resourceTitle: z.string().optional().nullable(),
  unitName: z.string().optional().nullable(),
  userName: z.string().optional().nullable(),
});

export type ScenarioInjectActionResponse = z.infer<typeof ScenarioInjectActionResponseSchema>;

// ==============================================================================
// Schemas: Scenario Injects
// ==============================================================================

export const CreateScenarioInjectSchema = z.object({
  phaseId: z.string().uuid().optional().nullable(),
  title: z.string().min(1).max(255),
  controllerSummary: z.string().min(1),
  participantTitle: z.string().max(255).optional().nullable(),
  participantContent: z.string().optional().nullable(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']).default('NORMAL'),
  triggerType: z.enum(['MANUAL', 'SCHEDULED_TIME', 'CONDITION', 'EXTERNAL']).default('MANUAL'),
  releasePolicy: z.enum(['MANUAL_CONFIRMATION', 'AUTO_RELEASE']).default('MANUAL_CONFIRMATION'),
  conditionLogic: z.enum(['ALL', 'ANY']).default('ALL'),
  scheduledAt: z.string().datetime().optional().nullable(),
  requiresAcknowledgement: z.boolean().default(false),
  controllerNotes: z.string().optional().nullable(),
  dependencies: z.array(z.string().uuid()).optional().default([]),
  conditions: z.array(ScenarioInjectConditionInputSchema).optional().default([]),
  targets: z.array(ScenarioInjectTargetInputSchema).optional().default([]),
  actions: z.array(ScenarioInjectActionInputSchema).optional().default([]),
});

export type CreateScenarioInjectInput = z.input<typeof CreateScenarioInjectSchema>;

export const UpdateScenarioInjectSchema = CreateScenarioInjectSchema.partial();
export type UpdateScenarioInjectInput = z.input<typeof UpdateScenarioInjectSchema>;

export const ScenarioInjectTranslationInputSchema = z.object({
  locale: z.string().min(2).max(16),
  participantTitle: z.string().min(1).max(255),
  participantContent: z.string().min(1),
});

export type ScenarioInjectTranslationInput = z.infer<typeof ScenarioInjectTranslationInputSchema>;

export const ScenarioInjectTranslationResponseSchema = ScenarioInjectTranslationInputSchema.extend({
  id: z.string().uuid(),
  injectId: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ScenarioInjectTranslationResponse = z.infer<typeof ScenarioInjectTranslationResponseSchema>;

export const ScenarioInjectResponseSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  phaseId: z.string().uuid().nullable(),
  phaseName: z.string().optional().nullable(),
  injectNumber: z.string(),
  title: z.string(),
  controllerSummary: z.string(),
  participantTitle: z.string().nullable(),
  participantContent: z.string().nullable(),
  status: z.string(),
  priority: z.string(),
  triggerType: z.string(),
  releasePolicy: z.string(),
  conditionLogic: z.string(),
  scheduledAt: z.string().nullable(),
  requiresAcknowledgement: z.boolean(),
  controllerNotes: z.string().nullable(),
  createdByUserId: z.string().uuid().nullable(),
  releasedAt: z.string().nullable(),
  releasedByUserId: z.string().uuid().nullable(),
  cancelledAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  isDue: z.boolean().optional(),
  designReadOnly: z.boolean().optional(),
  translations: z.array(ScenarioInjectTranslationResponseSchema).optional().default([]),
  dependencies: z.array(z.object({
    id: z.string().uuid(),
    dependsOnInjectId: z.string().uuid(),
    injectNumber: z.string(),
    title: z.string(),
    status: z.string(),
  })).default([]),
  conditions: z.array(ScenarioInjectConditionResponseSchema).default([]),
  targets: z.array(ScenarioInjectTargetResponseSchema).default([]),
  actions: z.array(ScenarioInjectActionResponseSchema).default([]),
  blockedReasons: z.array(z.string()).default([]),
});

export type ScenarioInjectResponse = z.infer<typeof ScenarioInjectResponseSchema>;

// Release & Override Schemas
export const ReleaseScenarioInjectSchema = z.object({
  notes: z.string().optional(),
});

export const OverrideReleaseScenarioInjectSchema = z.object({
  overrideReason: z.string().min(5, 'Mandatory override reason required (min 5 characters)'),
});

// Run sheet summary for Scenario Control
export const ScenarioControlRunSheetSchema = z.object({
  clock: z.object({
    mode: z.enum(['REAL_TIME', 'SCENARIO_TIME']),
    operationalNow: z.string(),
    scenarioTime: z.string(),
    paused: z.boolean(),
  }),
  activePhase: ScenarioPhaseResponseSchema.nullable(),
  phases: z.array(ScenarioPhaseResponseSchema),
  summary: z.object({
    total: z.number(),
    draft: z.number(),
    blocked: z.number(),
    ready: z.number(),
    scheduled: z.number(),
    released: z.number(),
    cancelled: z.number(),
  }),
  injects: z.array(ScenarioInjectResponseSchema),
});

export type ScenarioControlRunSheet = z.infer<typeof ScenarioControlRunSheetSchema>;

// Audience Preview
export const AudiencePreviewResponseSchema = z.object({
  injectNumber: z.string(),
  targetAudienceDescription: z.string(),
  participantTitle: z.string().nullable(),
  participantContent: z.string().nullable(),
  requiresAcknowledgement: z.boolean(),
  disclosedResources: z.array(z.object({
    resourceId: z.string().uuid(),
    resourceType: z.string(),
    identifier: z.string().optional(),
    title: z.string().optional(),
    visibilityAction: z.string(),
  })),
  hiddenControllerMetadata: z.array(z.string()),
});

export type AudiencePreviewResponse = z.infer<typeof AudiencePreviewResponseSchema>;

// ==============================================================================
// Schemas: Participant Briefings (Physically omits all controller fields)
// ==============================================================================

export const ParticipantBriefingSchema = z.object({
  deliveryId: z.string().uuid(),
  eventId: z.string().uuid(),
  injectNumber: z.string(),
  title: z.string(),
  content: z.string().nullable(),
  locale: z.string().optional().default('en'),
  deliveredAt: z.string(),
  readAt: z.string().nullable(),
  acknowledgedAt: z.string().nullable(),
  requiresAcknowledgement: z.boolean(),
  disclosedResources: z.array(z.object({
    resourceId: z.string().uuid(),
    resourceType: z.string(),
    identifier: z.string().optional(),
    title: z.string().optional(),
  })).default([]),
});

export type ParticipantBriefing = z.infer<typeof ParticipantBriefingSchema>;

export const ParticipantBriefingsListResponseSchema = z.object({
  unreadCount: z.number(),
  pendingAcknowledgementCount: z.number(),
  newBriefings: z.array(ParticipantBriefingSchema),
  earlierBriefings: z.array(ParticipantBriefingSchema),
});

export type ParticipantBriefingsListResponse = z.infer<typeof ParticipantBriefingsListResponseSchema>;

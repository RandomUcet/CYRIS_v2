import { z } from 'zod';

/**
 * ==============================================================================
 * CYRIS v2 — Intelligence & AI Contracts
 * ==============================================================================
 */

export const AIProviderType = {
  OPENAI_COMPATIBLE: 'OPENAI_COMPATIBLE',
} as const;

export type AIProviderTypeValue = (typeof AIProviderType)[keyof typeof AIProviderType];

export const AICapability = {
  CHAT: 'CHAT',
  STREAM: 'STREAM',
  EMBED: 'EMBED',
  TOOL_CALL: 'TOOL_CALL',
} as const;

export type AICapabilityValue = (typeof AICapability)[keyof typeof AICapability];

export const AIProviderStatus = {
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  OPERATIONAL: 'OPERATIONAL',
  DEGRADED: 'DEGRADED',
  ERROR: 'ERROR',
} as const;

export type AIProviderStatusValue = (typeof AIProviderStatus)[keyof typeof AIProviderStatus];

// ==========================================
// Admin AI Provider Configuration
// ==========================================

export const CreateAIProviderRequestSchema = z.object({
  name: z.string().min(1).max(128),
  providerType: z.literal(AIProviderType.OPENAI_COMPATIBLE).default(AIProviderType.OPENAI_COMPATIBLE),
  enabled: z.boolean().default(false),
  endpoint: z.string().url('Endpoint must be a valid URL'),
  chatModel: z.string().min(1, 'Chat model identifier is required'),
  embeddingEndpoint: z.string().url('Embedding endpoint must be a valid URL').nullable().optional(),
  embeddingModel: z.string().optional(),
  apiKey: z.string().optional(),
  timeoutSeconds: z.number().int().min(5).max(300).default(60),
  tlsVerify: z.boolean().default(true),
});

export type CreateAIProviderRequest = z.infer<typeof CreateAIProviderRequestSchema>;

export const UpdateAIProviderRequestSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  enabled: z.boolean().optional(),
  endpoint: z.string().url('Endpoint must be a valid URL').optional(),
  chatModel: z.string().min(1).optional(),
  embeddingEndpoint: z.string().url('Embedding endpoint must be a valid URL').nullable().optional(),
  embeddingModel: z.string().nullable().optional(),
  apiKey: z.string().optional(),
  clearApiKey: z.boolean().optional(),
  timeoutSeconds: z.number().int().min(5).max(300).optional(),
  tlsVerify: z.boolean().optional(),
});

export type UpdateAIProviderRequest = z.infer<typeof UpdateAIProviderRequestSchema>;

export const AIProviderResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  providerType: z.string(),
  enabled: z.boolean(),
  status: z.string(),
  endpoint: z.string(),
  chatModel: z.string(),
  embeddingEndpoint: z.string().nullable().optional(),
  embeddingModel: z.string().nullable().optional(),
  timeoutSeconds: z.number(),
  tlsVerify: z.boolean(),
  hasApiKey: z.boolean(), // Strictly boolean — secrets are NEVER echoed
  capabilities: z.array(z.string()),
  lastCheckedAt: z.string().nullable().optional(),
  lastError: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AIProviderResponse = z.infer<typeof AIProviderResponseSchema>;

export const TestConnectionRequestSchema = z.object({
  providerId: z.string().uuid().optional(),
  endpoint: z.string().url().optional(),
  chatModel: z.string().optional(),
  embeddingEndpoint: z.string().url().nullable().optional(),
  embeddingModel: z.string().nullable().optional(),
  apiKey: z.string().optional(),
  timeoutSeconds: z.number().int().min(5).max(300).optional(),
  tlsVerify: z.boolean().optional(),
});

export type TestConnectionRequest = z.infer<typeof TestConnectionRequestSchema>;

export const TestConnectionResponseSchema = z.object({
  success: z.boolean(),
  status: z.string(),
  latencyMs: z.number().optional(),
  resolvedModel: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
  embedding: z.object({
    success: z.boolean(),
    status: z.string(),
    resolvedModel: z.string().optional(),
    error: z.string().optional(),
  }).optional(),
  error: z.string().optional(),
});

export type TestConnectionResponse = z.infer<typeof TestConnectionResponseSchema>;

export const IntelligenceStatusResponseSchema = z.object({
  configured: z.boolean(),
  enabled: z.boolean(),
  status: z.string(),
  providerName: z.string().optional(),
  chatModel: z.string().optional(),
  capabilities: z.array(z.string()),
});

export type IntelligenceStatusResponse = z.infer<typeof IntelligenceStatusResponseSchema>;

// ==========================================
// 1. Writing Assist
// ==========================================

export const WritingAssistAction = {
  IMPROVE: 'IMPROVE',
  CONCISE: 'CONCISE',
  FORMAL: 'FORMAL',
  CORRECT_LANGUAGE: 'CORRECT_LANGUAGE',
  TRANSLATE_CS_EN: 'TRANSLATE_CS_EN',
} as const;

export type WritingAssistActionValue = (typeof WritingAssistAction)[keyof typeof WritingAssistAction];

export const WritingAssistRequestSchema = z.object({
  text: z.string().min(1, 'Text to assist is required').max(10000),
  action: z.enum([
    WritingAssistAction.IMPROVE,
    WritingAssistAction.CONCISE,
    WritingAssistAction.FORMAL,
    WritingAssistAction.CORRECT_LANGUAGE,
    WritingAssistAction.TRANSLATE_CS_EN,
  ]),
  context: z.string().optional().default('general'),
  targetLanguage: z.enum(['cs', 'en']).optional(),
});

export type WritingAssistRequest = z.infer<typeof WritingAssistRequestSchema>;

export const WritingAssistResponseSchema = z.object({
  draft: z.string(),
  status: z.literal('DRAFT'),
  action: z.string(),
  preservedUncertainty: z.boolean(),
  model: z.string(),
  durationMs: z.number(),
});

export type WritingAssistResponse = z.infer<typeof WritingAssistResponseSchema>;

// ==========================================
// 2. Case Summarization
// ==========================================

export const SummarizeCaseRequestSchema = z.object({
  caseId: z.string().uuid(),
});

export type SummarizeCaseRequest = z.infer<typeof SummarizeCaseRequestSchema>;

export const SummarizeCaseResponseSchema = z.object({
  caseId: z.string().uuid(),
  caseCode: z.string(),
  status: z.literal('DRAFT'),
  summary: z.string(),
  referencedResourceIds: z.array(z.string().uuid()),
  referencedCodes: z.array(z.string()),
  sections: z.object({
    confirmedFacts: z.array(z.string()),
    correlations: z.array(z.string()),
    unverified: z.array(z.string()),
  }),
  model: z.string(),
  durationMs: z.number(),
  generatedAt: z.string(),
});

export type SummarizeCaseResponse = z.infer<typeof SummarizeCaseResponseSchema>;

// ==========================================
// 3. Catch Me Up Operational Briefing
// ==========================================

export const CatchMeUpPeriod = {
  LAST_LOGIN: 'LAST_LOGIN',
  LAST_2_HOURS: 'LAST_2_HOURS',
  TODAY: 'TODAY',
} as const;

export type CatchMeUpPeriodValue = (typeof CatchMeUpPeriod)[keyof typeof CatchMeUpPeriod];

export const CatchMeUpRequestSchema = z.object({
  period: z
    .enum([CatchMeUpPeriod.LAST_LOGIN, CatchMeUpPeriod.LAST_2_HOURS, CatchMeUpPeriod.TODAY])
    .default(CatchMeUpPeriod.LAST_2_HOURS),
});

export type CatchMeUpRequest = z.infer<typeof CatchMeUpRequestSchema>;

export const CatchMeUpItemSchema = z.object({
  category: z.enum(['INCIDENT', 'CASE', 'EVIDENCE', 'LAB', 'TIMELINE', 'TASK', 'MEDICAL', 'EVALUATION']),
  title: z.string(),
  description: z.string(),
  code: z.string().optional(),
  resourceId: z.string().uuid().optional(),
  timestamp: z.string(),
});

export type CatchMeUpItem = z.infer<typeof CatchMeUpItemSchema>;

export const CatchMeUpResponseSchema = z.object({
  period: z.string(),
  status: z.literal('DRAFT'),
  briefing: z.string(),
  itemCount: z.number(),
  items: z.array(CatchMeUpItemSchema),
  model: z.string(),
  durationMs: z.number(),
  generatedAt: z.string(),
});

export type CatchMeUpResponse = z.infer<typeof CatchMeUpResponseSchema>;

// ==========================================
// 4. Explain / Why (Timeline & Causation)
// ==========================================

export const ExplainTimelineRequestSchema = z.object({
  activityId: z.string().uuid().optional(),
  resourceId: z.string().uuid().optional(),
  question: z.string().max(500).optional(),
});

export type ExplainTimelineRequest = z.infer<typeof ExplainTimelineRequestSchema>;

export const ExplainCausalStepSchema = z.object({
  step: z.number(),
  title: z.string(),
  type: z.string(),
  resourceId: z.string().uuid().optional(),
  timestamp: z.string().optional(),
});

export type ExplainCausalStep = z.infer<typeof ExplainCausalStepSchema>;

export const ExplainTimelineResponseSchema = z.object({
  explanation: z.string(),
  hasSufficientContext: z.boolean(),
  causalChain: z.array(ExplainCausalStepSchema),
  referencedResourceIds: z.array(z.string().uuid()),
  status: z.literal('DRAFT'),
  model: z.string(),
  durationMs: z.number(),
  generatedAt: z.string(),
});

export type ExplainTimelineResponse = z.infer<typeof ExplainTimelineResponseSchema>;

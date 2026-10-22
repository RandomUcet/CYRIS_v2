import { Injectable, Logger } from '@nestjs/common';
import { AIGatewayService } from '../ai-gateway.service.js';
import { AIContextService } from '../ai-context.service.js';
import type { AuthenticatedUser } from '../../auth/session.service.js';
import type { ExplainTimelineRequest, ExplainTimelineResponse } from '@cyris/contracts';

@Injectable()
export class TimelineExplainService {
  private readonly logger = new Logger(TimelineExplainService.name);

  constructor(
    private readonly aiGateway: AIGatewayService,
    private readonly aiContext: AIContextService
  ) {}

  async explain(
    user: AuthenticatedUser,
    eventId: string,
    params: ExplainTimelineRequest
  ): Promise<ExplainTimelineResponse> {
    const context = await this.aiContext.buildTimelineExplainContext(user, eventId, {
      activityId: params.activityId,
      resourceId: params.resourceId,
    });

    const hasSufficientContext =
      context.causalChain.length > 0 || context.relatedActivities.length > 0;

    const systemPrompt = `You are the CYRIS Timeline Causation Analyst for Czech Cybertron.
Your role is to explain WHY an operational event occurred based SOLELY on explicit recorded timeline causation, parent activities, and related operational context.

CRITICAL RULES:
1. STRICT CAUSALITY: You may explain known causal chains recorded in CYRIS (e.g. parent activities, custody transfers, lab requests).
2. NEVER INVENT CAUSALITY: If CYRIS records do not explain what caused an event, you MUST explicitly state that the system does not have sufficient recorded information to establish causality.
3. OBJECTIVITY: Factual and neutral. Clearly distinguish explicit causally-linked triggers from circumstantial correlation.
4. DRAFT STATUS: Output is an advisory DRAFT explanation.`;

    const userPrompt = `Target Event:
Type: ${context.targetActivity?.activityType || 'UNKNOWN'}
Title: "${context.targetActivity?.title || 'Unknown'}"
Summary: "${context.targetActivity?.summary || 'None'}"
Occurred At: ${context.targetActivity?.occurredAt}

[RECORDED CAUSAL CHAIN (${context.causalChain.length} parent steps)]:
${
  context.causalChain.length > 0
    ? JSON.stringify(context.causalChain, null, 2)
    : 'No upstream causal activity recorded (event was logged directly without a parent link)'
}

[RELATED ACTIVITIES IN SAME CORRELATION BATCH (${context.relatedActivities.length} items)]:
${
  context.relatedActivities.length > 0
    ? JSON.stringify(context.relatedActivities, null, 2)
    : 'No correlated activities'
}

${params.question ? `Operator Question: "${params.question}"` : 'Explain the causal chain and triggers for this event.'}`;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];

    const result = await this.aiGateway.execute({
      userId: user.id,
      eventId,
      operationType: 'TIMELINE_EXPLAIN',
      promptTemplateVersion: '1.0',
      contextResourceIds: context.accessibleResourceIds,
      messages,
      options: {
        temperature: 0.1,
        maxTokens: 1200,
        reasoning: 'enabled',
      },
    });

    return {
      explanation: result.text.trim(),
      hasSufficientContext,
      causalChain: context.causalChain.map((c) => ({
        step: c.step,
        title: c.title,
        type: c.type,
        resourceId: c.resourceId,
        timestamp: c.occurredAt,
      })),
      referencedResourceIds: context.accessibleResourceIds,
      status: 'DRAFT',
      model: result.model,
      durationMs: result.durationMs,
      generatedAt: new Date().toISOString(),
    };
  }
}

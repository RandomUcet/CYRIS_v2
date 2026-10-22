import { Injectable, Logger } from '@nestjs/common';
import { AIGatewayService } from '../ai-gateway.service.js';
import { AIContextService } from '../ai-context.service.js';
import type { AuthenticatedUser } from '../../auth/session.service.js';
import type { CatchMeUpResponse } from '@cyris/contracts';
import { CatchMeUpPeriod } from '@cyris/contracts';

@Injectable()
export class CatchMeUpService {
  private readonly logger = new Logger(CatchMeUpService.name);

  constructor(
    private readonly aiGateway: AIGatewayService,
    private readonly aiContext: AIContextService
  ) {}

  async catchMeUp(
    user: AuthenticatedUser,
    eventId: string,
    period: 'LAST_LOGIN' | 'LAST_2_HOURS' | 'TODAY' = CatchMeUpPeriod.LAST_2_HOURS
  ): Promise<CatchMeUpResponse> {
    const { items, accessibleResourceIds } = await this.aiContext.buildCatchMeUpContext(
      user,
      eventId,
      period
    );

    if (items.length === 0) {
      return {
        period,
        status: 'DRAFT',
        briefing: `No new operational events or updates recorded during the selected period (${period.replace('_', ' ').toLowerCase()}) within your accessible units and permissions.`,
        itemCount: 0,
        items: [],
        model: 'system-static',
        durationMs: 1,
        generatedAt: new Date().toISOString(),
      };
    }

    const systemPrompt = `You are the CYRIS Operational Watch Officer for Czech Cybertron.
Your role is to produce a concise, professional operational briefing ("Catch Me Up") for an investigator or commander returning to active duty.

RULES:
1. FOCUS ON IMPACT: Do NOT dump activity rows verbatim. Summarize major operational movements: new cases, critical incidents, evidence custody shifts, or completed lab analyses.
2. CITATIONS: Mention specific codes and identifiers when available.
3. CONCISENESS: Keep the briefing to 2-3 focused paragraphs or bulleted operational highlights.
4. DRAFT STATUS: The briefing is an advisory DRAFT summary of accessible system events.`;

    const userPrompt = `Operational Period: ${period}
Total accessible events in window: ${items.length}

[ACCESSIBLE EVENTS]:
${JSON.stringify(items.slice(0, 20), null, 2)}

Provide a concise, high-priority operational briefing summarizing what happened while the operator was away.`;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];

    const result = await this.aiGateway.execute({
      userId: user.id,
      eventId,
      operationType: 'CATCH_ME_UP',
      promptTemplateVersion: '1.0',
      contextResourceIds: accessibleResourceIds,
      messages,
      options: {
        temperature: 0.2,
        maxTokens: 1000,
        reasoning: 'enabled',
      },
    });

    return {
      period,
      status: 'DRAFT',
      briefing: result.text.trim(),
      itemCount: items.length,
      items: items.slice(0, 10).map((it) => ({
        category: it.category,
        title: it.title,
        description: it.description,
        code: it.code,
        resourceId: it.resourceId,
        timestamp: it.occurredAt,
      })),
      model: result.model,
      durationMs: result.durationMs,
      generatedAt: new Date().toISOString(),
    };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { AIGatewayService } from '../ai-gateway.service.js';
import { AIContextService } from '../ai-context.service.js';
import type { AuthenticatedUser } from '../../auth/session.service.js';
import type { SummarizeCaseResponse } from '@cyris/contracts';

@Injectable()
export class CaseSummarizationService {
  private readonly logger = new Logger(CaseSummarizationService.name);

  constructor(
    private readonly aiGateway: AIGatewayService,
    private readonly aiContext: AIContextService
  ) {}

  async summarizeCase(
    user: AuthenticatedUser,
    caseId: string,
    eventId: string
  ): Promise<SummarizeCaseResponse> {
    // 1. Retrieve authorized context only
    const context = await this.aiContext.buildCaseContext(user, caseId);

    const referencedCodes: string[] = [context.caseNumber];
    for (const item of context.evidenceItems) {
      if (item.evidenceNumber) referencedCodes.push(item.evidenceNumber);
    }
    for (const item of context.labAnalyses) {
      if (item.analysisNumber) referencedCodes.push(item.analysisNumber);
    }
    for (const rel of context.relationships) {
      if (rel.targetCode) referencedCodes.push(rel.targetCode);
    }

    const systemPrompt = `You are the CYRIS Case Intelligence Analyst for Czech Cybertron.
Your role is to produce structured, objective case intelligence briefings based STRICTLY on permitted records.

CRITICAL RULES:
1. CITATIONS: Always reference concrete CYRIS identifiers when mentioning items (e.g. ${context.caseNumber}, E-0001, LAB-0001).
2. FACTUAL CLASSIFICATION: You must cleanly separate:
   - CONFIRMED FACTS: Formally secured evidence, chain of custody logs, approved lab findings, verified identities.
   - CORRELATIONS: Linked entities, relationships, network or organizational associations.
   - UNVERIFIED INFORMATION: Preliminary investigator notes, suspicions, open leads.
3. DRAFT STATUS: Output is an advisory DRAFT for human investigators and court review.
4. JSON OUTPUT: Respond ONLY with a valid JSON object matching this schema:
{
  "summary": "Concise 2-4 sentence executive overview of the case status and scope",
  "confirmedFacts": ["Fact 1 referencing codes", "Fact 2 referencing codes"],
  "correlations": ["Correlation 1 between entities", "Correlation 2"],
  "unverified": ["Unverified lead or hypothesis 1", "Unverified 2"]
}`;

    const userPrompt = `Summarize Case ${context.caseNumber}: "${context.title}"
Status: ${context.status} | Priority: ${context.priority}
Summary notes: ${context.summary || 'None'}

[PERMITTED ASSOCIATED EVIDENCE (${context.evidenceItems.length} items)]:
${context.evidenceItems.length > 0 ? JSON.stringify(context.evidenceItems, null, 2) : 'No evidence associated or accessible'}

[PERMITTED LAB ANALYSES (${context.labAnalyses.length} items)]:
${context.labAnalyses.length > 0 ? JSON.stringify(context.labAnalyses, null, 2) : 'No lab analyses associated or accessible'}

[PERMITTED RELATIONSHIPS (${context.relationships.length} links)]:
${context.relationships.length > 0 ? JSON.stringify(context.relationships, null, 2) : 'No relationships linked'}

[PERMITTED RECENT TIMELINE HIGHLIGHTS (${context.timelineHighlights.length} events)]:
${context.timelineHighlights.length > 0 ? JSON.stringify(context.timelineHighlights, null, 2) : 'No recent timeline events'}

Return only the JSON object as requested.`;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];

    const result = await this.aiGateway.execute({
      userId: user.id,
      eventId,
      operationType: 'CASE_SUMMARY',
      promptTemplateVersion: '1.0',
      contextResourceIds: context.accessibleResourceIds,
      messages,
      options: {
        temperature: 0.1,
        maxTokens: 1800,
        reasoning: 'disabled',
      },
    });

    let parsed = {
      summary: '',
      confirmedFacts: [] as string[],
      correlations: [] as string[],
      unverified: [] as string[],
    };

    try {
      // Find JSON block in response
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const rawJson = JSON.parse(jsonMatch[0]);
        parsed = {
          summary: typeof rawJson.summary === 'string' ? rawJson.summary : result.text,
          confirmedFacts: Array.isArray(rawJson.confirmedFacts) ? rawJson.confirmedFacts : [],
          correlations: Array.isArray(rawJson.correlations) ? rawJson.correlations : [],
          unverified: Array.isArray(rawJson.unverified) ? rawJson.unverified : [],
        };
      } else {
        parsed.summary = result.text;
      }
    } catch {
      parsed.summary = result.text;
    }

    return {
      caseId: context.caseId,
      caseCode: context.caseNumber,
      status: 'DRAFT',
      summary: parsed.summary,
      referencedResourceIds: context.accessibleResourceIds,
      referencedCodes,
      sections: {
        confirmedFacts: parsed.confirmedFacts,
        correlations: parsed.correlations,
        unverified: parsed.unverified,
      },
      model: result.model,
      durationMs: result.durationMs,
      generatedAt: new Date().toISOString(),
    };
  }
}

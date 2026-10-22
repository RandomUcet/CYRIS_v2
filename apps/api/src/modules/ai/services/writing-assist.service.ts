import { Injectable, Logger } from '@nestjs/common';
import { AIGatewayService } from '../ai-gateway.service.js';
import type { WritingAssistRequest, WritingAssistResponse } from '@cyris/contracts';
import { WritingAssistAction } from '@cyris/contracts';

@Injectable()
export class WritingAssistService {
  private readonly logger = new Logger(WritingAssistService.name);

  constructor(private readonly aiGateway: AIGatewayService) {}

  async assist(
    params: WritingAssistRequest,
    userId?: string,
    eventId?: string
  ): Promise<WritingAssistResponse> {
    const systemPrompt = `You are the CYRIS Operational Intelligence Writing Assistant for Czech Cybertron.
You assist emergency responders, cyber investigators, forensics analysts, and court officers with writing and reviewing operational texts.

CRITICAL FACTUAL INTEGRITY RULES:
1. PRESERVE FACTUAL UNCERTAINTY: You MUST strictly preserve all degrees of uncertainty, speculation, and qualification.
   - If the input contains phrases like "asi", "možná", "pravděpodobně", "maybe", "alleged", "suspected", or "unconfirmed", you must NEVER convert them into confirmed facts.
   - Example: "asi to usb patri novakovi" must be rewritten as "The USB flash drive allegedly/potentially belongs to Novák" (or Czech: "USB disk zřejmě patří panu Novákovi"), NEVER "The USB belongs to Novák".
2. NO HALLUCINATION: Do not invent names, dates, IPs, evidence codes, or laboratory findings that do not appear in the input.
3. CONTEXT INTEGRITY: Keep technical indicators (hashes, IPs, codes, file names) exactly as provided.
4. TONE: Professional, objective, institutional European operational tone.
5. DRAFT STATUS: The output is an uncommitted DRAFT suggestion for human review.`;

    let instruction = '';
    switch (params.action) {
      case WritingAssistAction.IMPROVE:
        instruction =
          'Improve the following text for clarity, professional structure, and flow while retaining all facts and uncertainty:';
        break;
      case WritingAssistAction.CONCISE:
        instruction =
          'Make the following operational text concise, structured, and rapid to read without omitting critical details or changing certainty:';
        break;
      case WritingAssistAction.FORMAL:
        instruction =
          'Rewrite the following text into formal institutional language suitable for an official cyber investigation record or court report:';
        break;
      case WritingAssistAction.CORRECT_LANGUAGE:
        instruction =
          'Correct typos, punctuation, and grammatical mistakes in the text while keeping original terminology and structure intact:';
        break;
      case WritingAssistAction.TRANSLATE_CS_EN:
        instruction =
          params.targetLanguage === 'en'
            ? 'Translate the following text from Czech to professional English, preserving all technical terminology and uncertainty:'
            : 'Translate the following text into professional Czech, preserving all technical terminology and uncertainty:';
        break;
      default:
        instruction = 'Review and polish the following operational text:';
    }

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      {
        role: 'user' as const,
        content: `${instruction}\n\n[CONTEXT: ${params.context || 'operational text'}]\n\n"""\n${params.text}\n"""\n\nProvide only the drafted replacement text without conversational prefixes or commentary.`,
      },
    ];

    const result = await this.aiGateway.execute({
      userId,
      eventId,
      operationType: 'WRITING_ASSIST',
      promptTemplateVersion: '1.0',
      messages,
      options: {
        temperature: 0.2,
        maxTokens: 768,
        reasoning: 'disabled',
      },
    });

    return {
      draft: result.text.trim(),
      status: 'DRAFT',
      action: params.action,
      preservedUncertainty: true,
      model: result.model,
      durationMs: result.durationMs,
    };
  }
}

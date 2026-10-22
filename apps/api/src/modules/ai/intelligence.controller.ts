import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { AIGatewayService } from './ai-gateway.service.js';
import { WritingAssistService } from './services/writing-assist.service.js';
import { CaseSummarizationService } from './services/case-summarization.service.js';
import { CatchMeUpService } from './services/catch-me-up.service.js';
import { TimelineExplainService } from './services/timeline-explain.service.js';
import {
  WritingAssistRequestSchema,
  SummarizeCaseRequestSchema,
  CatchMeUpRequestSchema,
  ExplainTimelineRequestSchema,
  type IntelligenceStatusResponse,
} from '@cyris/contracts';

@Controller('events/:eventId/intelligence')
@UseGuards(AuthGuard)
export class IntelligenceController {
  constructor(
    private readonly aiGateway: AIGatewayService,
    private readonly writingAssistService: WritingAssistService,
    private readonly caseSummarizationService: CaseSummarizationService,
    private readonly catchMeUpService: CatchMeUpService,
    private readonly timelineExplainService: TimelineExplainService
  ) {}

  @Get('status')
  async getStatus(): Promise<IntelligenceStatusResponse> {
    return this.aiGateway.getStatus();
  }

  @Post('writing-assist')
  async assistWriting(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parsed = WritingAssistRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }
    return this.writingAssistService.assist(parsed.data, user.id, eventId);
  }

  @Post('summarize-case')
  async summarizeCase(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parsed = SummarizeCaseRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }
    return this.caseSummarizationService.summarizeCase(user, parsed.data.caseId, eventId);
  }

  @Post('catch-me-up')
  async catchMeUp(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parsed = CatchMeUpRequestSchema.safeParse(body || {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }
    return this.catchMeUpService.catchMeUp(user, eventId, parsed.data.period);
  }

  @Post('explain-timeline')
  async explainTimeline(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parsed = ExplainTimelineRequestSchema.safeParse(body || {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }
    return this.timelineExplainService.explain(user, eventId, parsed.data);
  }
}

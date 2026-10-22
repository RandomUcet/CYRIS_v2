import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { LaboratoryService } from './laboratory.service.js';
import {
  CreateLabAnalysisRequestSchema,
  UpdateLabAnalysisRequestSchema,
} from '@cyris/contracts';

@Controller('events/:eventId/lab')
@UseGuards(AuthGuard)
export class LaboratoryController {
  constructor(private readonly laboratoryService: LaboratoryService) {}

  @Get()
  async listAnalyses(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.laboratoryService.listAnalyses(eventId, user);
  }

  @Post()
  async createAnalysis(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parsed = CreateLabAnalysisRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid lab analysis payload');
    }
    return this.laboratoryService.createAnalysis(eventId, parsed.data, user);
  }

  @Get(':analysisId')
  async getAnalysis(
    @Param('eventId') eventId: string,
    @Param('analysisId') analysisId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.laboratoryService.getAnalysis(eventId, analysisId, user);
  }

  @Patch(':analysisId')
  async updateAnalysis(
    @Param('eventId') eventId: string,
    @Param('analysisId') analysisId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parsed = UpdateLabAnalysisRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid lab analysis update');
    }
    return this.laboratoryService.updateAnalysis(eventId, analysisId, parsed.data, user);
  }
}

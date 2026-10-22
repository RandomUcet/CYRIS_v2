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
import { EvidenceService } from './evidence.service.js';
import {
  CreateEvidenceRequestSchema,
  UpdateEvidenceRequestSchema,
  TransferEvidenceRequestSchema,
} from '@cyris/contracts';

@Controller('events/:eventId/evidence')
@UseGuards(AuthGuard)
export class EvidenceController {
  constructor(private readonly evidenceService: EvidenceService) {}

  @Get()
  async listEvidence(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.evidenceService.listEvidence(eventId, user);
  }

  @Post()
  async createEvidence(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parsed = CreateEvidenceRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid evidence payload');
    }
    return this.evidenceService.createEvidence(eventId, parsed.data, user);
  }

  @Get(':evidenceId')
  async getEvidence(
    @Param('eventId') eventId: string,
    @Param('evidenceId') evidenceId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.evidenceService.getEvidence(eventId, evidenceId, user);
  }

  @Patch(':evidenceId')
  async updateEvidence(
    @Param('eventId') eventId: string,
    @Param('evidenceId') evidenceId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parsed = UpdateEvidenceRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid evidence update');
    }
    return this.evidenceService.updateEvidence(eventId, evidenceId, parsed.data, user);
  }

  @Post(':evidenceId/transfers')
  async transferCustody(
    @Param('eventId') eventId: string,
    @Param('evidenceId') evidenceId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parsed = TransferEvidenceRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid transfer payload');
    }
    return this.evidenceService.transferCustody(eventId, evidenceId, parsed.data, user);
  }

  @Get(':evidenceId/transfers')
  async getCustodyHistory(
    @Param('eventId') eventId: string,
    @Param('evidenceId') evidenceId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.evidenceService.getCustodyHistory(eventId, evidenceId, user);
  }
}

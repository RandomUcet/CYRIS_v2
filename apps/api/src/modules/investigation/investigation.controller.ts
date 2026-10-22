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
import { InvestigationService } from './investigation.service.js';
import {
  CreateIncidentRequestSchema,
  UpdateIncidentRequestSchema,
  CreateCaseRequestSchema,
  UpdateCaseRequestSchema,
  AssignResourceRequestSchema,
} from '@cyris/contracts';

@Controller('events/:eventId')
@UseGuards(AuthGuard)
export class InvestigationController {
  constructor(private readonly investigationService: InvestigationService) {}

  // ============================================================================
  // Incidents
  // ============================================================================

  @Get('incidents')
  async listIncidents(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.investigationService.listIncidents(eventId, user);
  }

  @Post('incidents')
  async createIncident(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parsed = CreateIncidentRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid incident payload');
    }
    return this.investigationService.createIncident(eventId, parsed.data, user);
  }

  @Get('incidents/:incidentId')
  async getIncident(
    @Param('eventId') eventId: string,
    @Param('incidentId') incidentId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.investigationService.getIncident(eventId, incidentId, user);
  }

  @Patch('incidents/:incidentId')
  async updateIncident(
    @Param('eventId') eventId: string,
    @Param('incidentId') incidentId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parsed = UpdateIncidentRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid incident update');
    }
    return this.investigationService.updateIncident(eventId, incidentId, parsed.data, user);
  }

  @Post('incidents/:incidentId/assign')
  async assignIncident(
    @Param('eventId') eventId: string,
    @Param('incidentId') incidentId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parsed = AssignResourceRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid assignment payload');
    }
    return this.investigationService.assignIncident(eventId, incidentId, parsed.data, user);
  }

  // ============================================================================
  // Cases
  // ============================================================================

  @Get('cases')
  async listCases(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.investigationService.listCases(eventId, user);
  }

  @Post('cases')
  async createCase(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parsed = CreateCaseRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid case payload');
    }
    return this.investigationService.createCase(eventId, parsed.data, user);
  }

  @Get('cases/:caseId')
  async getCase(
    @Param('eventId') eventId: string,
    @Param('caseId') caseId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.investigationService.getCase(eventId, caseId, user);
  }

  @Get('cases/:caseId/workspace')
  async getCaseWorkspace(
    @Param('eventId') eventId: string,
    @Param('caseId') caseId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.investigationService.getCaseWorkspace(eventId, caseId, user);
  }

  @Patch('cases/:caseId')
  async updateCase(
    @Param('eventId') eventId: string,
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parsed = UpdateCaseRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid case update');
    }
    return this.investigationService.updateCase(eventId, caseId, parsed.data, user);
  }

  @Post('cases/:caseId/assign')
  async assignCase(
    @Param('eventId') eventId: string,
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const parsed = AssignResourceRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid assignment payload');
    }
    return this.investigationService.assignCase(eventId, caseId, parsed.data, user);
  }

  @Post('cases/:caseId/close')
  async closeCase(
    @Param('eventId') eventId: string,
    @Param('caseId') caseId: string,
    @Body() body: { reason?: string },
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.investigationService.closeCase(eventId, caseId, body?.reason, user);
  }
}

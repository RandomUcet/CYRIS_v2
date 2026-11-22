import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator.js';
import { Permissions, PermissionScopes } from '@cyris/shared';
import { CourtService } from './court.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import {
  CreateCourtCaseRequestSchema,
  UpdateCourtCaseStatusRequestSchema,
  AddCourtCasePartyRequestSchema,
  CreateChargeRequestSchema,
  SubmitCourtExhibitRequestSchema,
  DecideCourtExhibitRequestSchema,
  CreateCourtHearingRequestSchema,
  UpdateCourtHearingStatusRequestSchema,
  CreateCourtFilingRequestSchema,
  CreateCourtDecisionRequestSchema,
  CourtQueryFiltersSchema,
  type CourtCaseDetail,
  type CourtCaseParty,
  type Charge,
  type CourtExhibit,
  type CourtHearing,
  type CourtFiling,
  type CourtDecision,
  type CourtTimelineEvent,
} from '@cyris/contracts';

@Controller('events/:eventId/court')
@UseGuards(AuthGuard)
export class CourtController {
  constructor(private readonly courtService: CourtService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermission(Permissions.COURT_CREATE, PermissionScopes.EVENT)
  async createCase(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<CourtCaseDetail> {
    const dto = CreateCourtCaseRequestSchema.parse(body);
    return this.courtService.createCourtCase(eventId, dto, user);
  }

  @Get()
  async listCases(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query() query: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const filters = CourtQueryFiltersSchema.parse(query);
    return this.courtService.listCourtCases(eventId, filters, user);
  }

  @Get(':courtCaseId')
  async getDetail(
    @Param('eventId', ParseUUIDPipe) _eventId: string,
    @Param('courtCaseId', ParseUUIDPipe) courtCaseId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<CourtCaseDetail> {
    return this.courtService.getCourtCaseDetail(courtCaseId, user);
  }

  @Patch(':courtCaseId/status')
  async updateStatus(
    @Param('eventId', ParseUUIDPipe) _eventId: string,
    @Param('courtCaseId', ParseUUIDPipe) courtCaseId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<CourtCaseDetail> {
    const dto = UpdateCourtCaseStatusRequestSchema.parse(body);
    return this.courtService.updateStatus(courtCaseId, dto, user);
  }

  @Post(':courtCaseId/parties')
  async addParty(
    @Param('eventId', ParseUUIDPipe) _eventId: string,
    @Param('courtCaseId', ParseUUIDPipe) courtCaseId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<CourtCaseParty> {
    const dto = AddCourtCasePartyRequestSchema.parse(body);
    return this.courtService.addParty(courtCaseId, dto, user);
  }

  @Post(':courtCaseId/charges')
  async createCharge(
    @Param('eventId', ParseUUIDPipe) _eventId: string,
    @Param('courtCaseId', ParseUUIDPipe) courtCaseId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<Charge> {
    const dto = CreateChargeRequestSchema.parse(body);
    return this.courtService.createCharge(courtCaseId, dto, user);
  }

  @Post(':courtCaseId/exhibits')
  async submitExhibit(
    @Param('eventId', ParseUUIDPipe) _eventId: string,
    @Param('courtCaseId', ParseUUIDPipe) courtCaseId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<CourtExhibit> {
    const dto = SubmitCourtExhibitRequestSchema.parse(body);
    return this.courtService.submitExhibit(courtCaseId, dto, user);
  }

  @Patch(':courtCaseId/exhibits/:exhibitId/decide')
  async decideExhibit(
    @Param('eventId', ParseUUIDPipe) _eventId: string,
    @Param('courtCaseId', ParseUUIDPipe) courtCaseId: string,
    @Param('exhibitId', ParseUUIDPipe) exhibitId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<CourtExhibit> {
    const dto = DecideCourtExhibitRequestSchema.parse(body);
    return this.courtService.decideExhibit(courtCaseId, exhibitId, dto, user);
  }

  @Post(':courtCaseId/hearings')
  async createHearing(
    @Param('eventId', ParseUUIDPipe) _eventId: string,
    @Param('courtCaseId', ParseUUIDPipe) courtCaseId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<CourtHearing> {
    const dto = CreateCourtHearingRequestSchema.parse(body);
    return this.courtService.createHearing(courtCaseId, dto, user);
  }

  @Patch(':courtCaseId/hearings/:hearingId/status')
  async updateHearingStatus(
    @Param('eventId', ParseUUIDPipe) _eventId: string,
    @Param('courtCaseId', ParseUUIDPipe) courtCaseId: string,
    @Param('hearingId', ParseUUIDPipe) hearingId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<CourtHearing> {
    const dto = UpdateCourtHearingStatusRequestSchema.parse(body);
    return this.courtService.updateHearingStatus(courtCaseId, hearingId, dto, user);
  }

  @Post(':courtCaseId/filings')
  async createFiling(
    @Param('eventId', ParseUUIDPipe) _eventId: string,
    @Param('courtCaseId', ParseUUIDPipe) courtCaseId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<CourtFiling> {
    const dto = CreateCourtFilingRequestSchema.parse(body);
    return this.courtService.createFiling(courtCaseId, dto, user);
  }

  @Post(':courtCaseId/decisions')
  async createDecision(
    @Param('eventId', ParseUUIDPipe) _eventId: string,
    @Param('courtCaseId', ParseUUIDPipe) courtCaseId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<CourtDecision> {
    const dto = CreateCourtDecisionRequestSchema.parse(body);
    return this.courtService.createDecision(courtCaseId, dto, user);
  }

  @Get(':courtCaseId/timeline')
  async getTimeline(
    @Param('eventId', ParseUUIDPipe) _eventId: string,
    @Param('courtCaseId', ParseUUIDPipe) courtCaseId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<CourtTimelineEvent[]> {
    return this.courtService.getCourtTimeline(courtCaseId, user);
  }
}

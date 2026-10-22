import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { MedicalService } from './medical.service.js';
import {
  CreateMedicalEncounterRequestSchema,
  UpdateMedicalEncounterRequestSchema,
  TriageMedicalEncounterRequestSchema,
  CreateMedicalObservationRequestSchema,
  CreateMedicalInterventionRequestSchema,
  TransferMedicalEncounterRequestSchema,
  CloseMedicalEncounterRequestSchema,
  MedicalQueryFiltersSchema,
  type MedicalEncounterItem,
  type MedicalEncounterDetail,
  type MedicalObservationItem,
  type MedicalInterventionItem,
  type MedicalOperationalSummaryResponse,
} from '@cyris/contracts';

@Controller('events/:eventId/medical')
@UseGuards(AuthGuard)
export class MedicalController {
  constructor(private readonly medicalService: MedicalService) {}

  @Get('operational-summary')
  async getOperationalSummary(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<MedicalOperationalSummaryResponse> {
    return this.medicalService.getOperationalSummary(eventId, user);
  }

  @Get()
  async listEncounters(
    @Param('eventId') eventId: string,
    @Query() query: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<MedicalEncounterItem[]> {
    const filters = MedicalQueryFiltersSchema.parse(query || {});
    return this.medicalService.listEncounters(eventId, filters, user);
  }

  @Post()
  async createEncounter(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<MedicalEncounterItem> {
    const dto = CreateMedicalEncounterRequestSchema.parse(body);
    return this.medicalService.createEncounter(eventId, dto, user);
  }

  @Get(':encounterId')
  async getEncounter(
    @Param('eventId') _eventId: string,
    @Param('encounterId') encounterId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<MedicalEncounterDetail> {
    return this.medicalService.getEncounterDetail(encounterId, user);
  }

  @Patch(':encounterId')
  async updateEncounter(
    @Param('eventId') _eventId: string,
    @Param('encounterId') encounterId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<MedicalEncounterDetail> {
    const dto = UpdateMedicalEncounterRequestSchema.parse(body);
    return this.medicalService.updateEncounter(encounterId, dto, user);
  }

  @Post(':encounterId/triage')
  async triageEncounter(
    @Param('eventId') _eventId: string,
    @Param('encounterId') encounterId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<MedicalEncounterDetail> {
    const dto = TriageMedicalEncounterRequestSchema.parse(body);
    return this.medicalService.triageEncounter(encounterId, dto, user);
  }

  @Post(':encounterId/observations')
  async addObservation(
    @Param('eventId') _eventId: string,
    @Param('encounterId') encounterId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<MedicalObservationItem> {
    const dto = CreateMedicalObservationRequestSchema.parse(body);
    return this.medicalService.addObservation(encounterId, dto, user);
  }

  @Post(':encounterId/interventions')
  async addIntervention(
    @Param('eventId') _eventId: string,
    @Param('encounterId') encounterId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<MedicalInterventionItem> {
    const dto = CreateMedicalInterventionRequestSchema.parse(body);
    return this.medicalService.addIntervention(encounterId, dto, user);
  }

  @Post(':encounterId/stabilize')
  async stabilizeEncounter(
    @Param('eventId') _eventId: string,
    @Param('encounterId') encounterId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<MedicalEncounterDetail> {
    return this.medicalService.stabilizeEncounter(encounterId, user);
  }

  @Post(':encounterId/transfer')
  async transferEncounter(
    @Param('eventId') _eventId: string,
    @Param('encounterId') encounterId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<MedicalEncounterDetail> {
    const dto = TransferMedicalEncounterRequestSchema.parse(body);
    return this.medicalService.transferEncounter(encounterId, dto, user);
  }

  @Post(':encounterId/close')
  async closeEncounter(
    @Param('eventId') _eventId: string,
    @Param('encounterId') encounterId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<MedicalEncounterDetail> {
    const dto = CloseMedicalEncounterRequestSchema.parse(body);
    return this.medicalService.closeEncounter(encounterId, dto, user);
  }
}

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
import { ForensicsService } from './forensics.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import {
  SaveForensicReportSchema,
  CreateForensicAnalysisRequestSchema,
  UpdateForensicStatusRequestSchema,
  CreateForensicFindingRequestSchema,
  CreateTechnicalIndicatorRequestSchema,
  CreateForensicAcquisitionRequestSchema,
  ForensicQueryFiltersSchema,
  type CreateForensicAnalysisRequest,
  type UpdateForensicStatusRequest,
  type CreateForensicFindingRequest,
  type CreateTechnicalIndicatorRequest,
  type CreateForensicAcquisitionRequest,
  type ForensicAnalysisDetail,
  type ForensicFinding,
  type TechnicalIndicator,
  type ForensicAcquisition,
} from '@cyris/contracts';

@Controller('events/:eventId')
@UseGuards(AuthGuard)
export class ForensicsController {
  constructor(private readonly forensicsService: ForensicsService) {}

  @Post('forensics')
  async createAnalysis(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ForensicAnalysisDetail> {
    const dto = CreateForensicAnalysisRequestSchema.parse(body);
    return this.forensicsService.createAnalysis(eventId, dto, user);
  }

  @Get('forensics')
  async listAnalyses(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query() query: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const filters = ForensicQueryFiltersSchema.parse(query);
    return this.forensicsService.listAnalyses(eventId, filters, user);
  }

  @Get('forensics/units')
  async listUnits(@Param('eventId',ParseUUIDPipe) eventId:string,@CurrentUser() user:AuthenticatedUser){return this.forensicsService.listDestinationUnits(eventId,user);}

  @Get('forensics/:analysisId')
  async getAnalysisDetail(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('analysisId', ParseUUIDPipe) analysisId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ForensicAnalysisDetail> {
    await this.forensicsService.assertAnalysisEvent(eventId,analysisId);
    return this.forensicsService.getAnalysisDetail(analysisId, user);
  }

  @Patch('forensics/:analysisId')
  async saveReport(@Param('eventId',ParseUUIDPipe) eventId:string,@Param('analysisId',ParseUUIDPipe) analysisId:string,@Body() body:unknown,@CurrentUser() user:AuthenticatedUser){
    await this.forensicsService.assertAnalysisEvent(eventId,analysisId);
    return this.forensicsService.saveReport(analysisId,SaveForensicReportSchema.parse(body),user);
  }

  @Patch('forensics/:analysisId/status')
  async updateStatus(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('analysisId', ParseUUIDPipe) analysisId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ForensicAnalysisDetail> {
    const dto = UpdateForensicStatusRequestSchema.parse(body);
    await this.forensicsService.assertAnalysisEvent(eventId,analysisId);
    return this.forensicsService.updateStatus(analysisId, dto, user);
  }

  @Post('forensics/:analysisId/findings')
  async createFinding(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('analysisId', ParseUUIDPipe) analysisId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ForensicFinding> {
    const dto = CreateForensicFindingRequestSchema.parse(body);
    await this.forensicsService.assertAnalysisEvent(eventId,analysisId);
    await this.forensicsService.assertAnalysisEvent(eventId,analysisId);
    return this.forensicsService.createFinding(analysisId, dto, user);
  }

  @Post('forensics/:analysisId/acquisitions')
  async createAcquisition(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('analysisId', ParseUUIDPipe) analysisId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ForensicAcquisition> {
    const dto = CreateForensicAcquisitionRequestSchema.parse(body);
    await this.forensicsService.assertAnalysisEvent(eventId,analysisId);
    return this.forensicsService.createAcquisition(analysisId, dto, user);
  }

  @Post('indicators')
  async createIndicator(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<TechnicalIndicator> {
    const dto = CreateTechnicalIndicatorRequestSchema.parse(body);
    return this.forensicsService.createIndicator(eventId, dto, user);
  }

  @Get('indicators')
  async listIndicators(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<TechnicalIndicator[]> {
    return this.forensicsService.listIndicators(eventId, user);
  }
}

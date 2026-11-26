import type {DiagnosticAnalysisInput,DiagnosticAnalysisResult} from '@cyris/contracts';
import type {CreateLocalTestAccount,LocalTestAccount,LocalTestAccountCreated} from '@cyris/contracts';
import type {ExerciseTeamSetupInput,ExerciseInjectSetupInput} from '@cyris/contracts';
import type {ExercisePhaseSetupInput} from '@cyris/contracts';
import type {ExerciseObserverHistory} from '@cyris/contracts';
import type {ExerciseJob,ExerciseJobSubmit} from '@cyris/contracts';
import type {LegalSourceInput,LegalSource,LegalSearchResult,LegalResearchInput,LegalResearchResult} from '@cyris/contracts';
import type {StoredExerciseAdvice,ExerciseAdviceDecision,ExerciseAdviceHandoffInput} from '@cyris/contracts';
import type {ExerciseBlueprintInput,ExerciseBlueprint,ExerciseBlueprintOverview} from '@cyris/contracts';
import type { ExerciseAdviceInput, ExerciseAdviceResult, ExerciseIntelligenceOverview } from '@cyris/contracts';
import type {
  HealthResponse,
  PlatformAdminAccount,
  LabAnalysisDetail,
  ReadinessResponse,
  CurrentUserResponse,
  CreateSupportRequest, SupportInbox, SupportInboxQuery, SupportMessageInput, SupportAssistInput, SupportAssistResult, SupportAssignee, AssignSupportRequest,
  EventResponse,
  EventAfterActionReport,
  EventPurgePreview,
  EventRetentionPlan,
  LoginRequest,
  SearchResponse,
  AIProviderResponse,
  CreateAIProviderRequest,
  UpdateAIProviderRequest,
  TestConnectionRequest,
  TestConnectionResponse,
  IntelligenceStatusResponse,
  WritingAssistRequest,
  WritingAssistResponse,
  SummarizeCaseResponse,
  CatchMeUpResponse,
  ExplainTimelineRequest,
  ExplainTimelineResponse,
  WorkspaceResolutionResponse,
  UnitCapabilityResponse,
  ScenarioControlRunSheet,
  ScenarioPhaseResponse,
  CreateScenarioPhaseInput,
  UpdateScenarioPhaseInput,
  ScenarioInjectResponse,
  CreateScenarioInjectInput,
  UpdateScenarioInjectInput,
  AudiencePreviewResponse,
  ParticipantBriefingsListResponse,
  DocumentItem,
  DocumentDetail,
  ForensicAnalysisItem,
  ForensicAnalysisDetail,
  ForensicFinding,
  TechnicalIndicator,
  ForensicAcquisition,
  CreateForensicAnalysisRequest,
  UpdateForensicStatusRequest,
  CreateForensicFindingRequest,
  CreateTechnicalIndicatorRequest,
  CreateForensicAcquisitionRequest,
  CourtCaseItem,
  CourtCaseDetail,
  CourtCaseParty,
  Charge,
  CourtExhibit,
  CourtHearing,
  CourtFiling,
  CourtDecision,
  CourtTimelineEvent,
  CourtRequestItem,
  CreateCourtRequest,
  ReplyCourtRequest,
  CreateCourtCaseRequest,
  UpdateCourtCaseStatusRequest,
  AddCourtCasePartyRequest,
  CreateChargeRequest,
  SubmitCourtExhibitRequest,
  DecideCourtExhibitRequest,
  CreateCourtHearingRequest,
  UpdateCourtHearingStatusRequest,
  CreateCourtFilingRequest,
  CreateCourtDecisionRequest,
  OperationalTaskItem,
  OperationalTaskDetail,
  MyWorkResponse, MyWorkKind,
  CreateOperationalTaskRequest,
  UpdateOperationalTaskRequest,
  AssignOperationalTaskRequest,
  BlockOperationalTaskRequest,
  ReopenOperationalTaskRequest,
  MedicalEncounterItem,
  MedicalEncounterDetail,
  MedicalObservation,
  MedicalIntervention,
  MedicalOperationalSummaryResponse,
  CreateMedicalEncounterRequest,
  UpdateMedicalEncounterRequest,
  TriageEncounterRequest,
  AddMedicalObservationRequest,
  AddMedicalInterventionRequest,
  TransferEncounterRequest,
  CloseEncounterRequest,
  EvaluationObjective,
  EvaluationCriterion,
  EvaluationObservationItem,
  EvaluationObservationDetail,
  AfterActionReviewResponse,
  CreateEvaluationObjectiveRequest,
  CreateEvaluationCriterionRequest,
  CreateEvaluationObservationRequest,
  UpdateEvaluationObservationRequest,
  LockEvaluationRequest,
  PublishEvaluationRequest,
  OperationalPictureResponse,
  ExconDashboardResponse,
  CreateSitrepRequest,
  UserPreferences,
  UpdateUserPreferences,
  NotificationItem,
  NotificationListResponse,
  ExerciseBroadcastRequest, ExerciseBroadcastReceipt, ExerciseBroadcastHistory,
  ExerciseBroadcastAudienceQuery,
  ExerciseBroadcastPlanResponse, ExerciseBroadcastPlanInput, ExerciseBroadcastPlanRevision,
  IdentityProviderSummary,
  LdapConfig,
  LdapAuthRequest,
  LdapTeamAssignment,
  LdapTeamAccount,
  OidcConfig,
  ScenarioDataRequest,
  ScenarioDataPreview,
  SparkDraftRequest,
  ScenarioDataBatchResponse,
  ScenarioBatchMediaList,
  ScenarioQualityReport,
  ScenarioDraftRecordList,
  ScenarioDraftMediaUpload,
  ScenarioDraftMediaItem,
  RegistryPickerResult,
  JsocLogQuery,
  JsocLogPage,
  GenerateJsocLogs,
  CommandDefconSnapshot,
  CommandReadinessSnapshot,
  ChangeCommandDefconRequest,
  DisruptionSnapshot,
  OperationalHold,
  CreateOperationalHold,
  RestoreOperationalHold,
  CurrentOperationalHolds,
  CreateDisruptionRequest,
  RestoreDisruptionRequest,
  ParticipantDisruptionStatus,
  RecoveryObjective,
  RecoveryReport,
  CreateRecoveryObjectiveRequest,
  RecoveryObjectiveReviewRequest,
  RecoveryObjectiveRestoreRequest,
  RecoveryReportRequest,
  RecoveryArtifact,
  CreateRecoveryArtifactRequest,
  ServiceStatusResponse,
  StartViewAsRequest,
  ViewAsContext,
  MembershipResponse,
} from '@cyris/contracts';
import { readViewAs, VIEW_AS_INVALID_EVENT } from './view-as';

export class CyrisApiClient {
  private readonly baseUrl: string;

  private async request(input: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    let preview: ViewAsContext | null;
    try { preview = readViewAs(); } catch {
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(VIEW_AS_INVALID_EVENT));
      throw new Error('Invalid preview. Return to administration.');
    }
    if (preview) {
      headers.set('X-Cyris-View-As', preview.id);
      const url = new URL(input, window.location.origin);
      if (['/api/search', '/api/notifications', '/search', '/notifications'].includes(url.pathname) && !url.searchParams.has('eventId')) {
        url.searchParams.set('eventId', preview.eventId);
        input = url.toString();
      }
    }
    const response = await fetch(input, { ...init, headers, cache: 'no-store' });
    if (preview && response.status === 403 && !input.split('?')[0]!.endsWith('/auth/view-as')) {
      const body = await response.clone().json().catch(() => null);
      if (body?.code === 'VIEW_AS_INVALID') window.dispatchEvent(new Event(VIEW_AS_INVALID_EVENT));
    }
    return response;
  }

  async startViewAs(input: StartViewAsRequest) {
    return this.postJson<ViewAsContext>('/auth/view-as', input);
  }

  async stopViewAs() {
    const response = await this.request(`${this.baseUrl}/auth/view-as`, { method: 'DELETE', credentials: 'include' });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, code: body.code as string | undefined, error: body.message as string | undefined };
  }

  listLocalTestAccounts(eventId:string,signal?:AbortSignal){return this.fetchJson<LocalTestAccount[]>('/events/'+encodeURIComponent(eventId)+'/local-test-accounts',signal);}
  createLocalTestAccount(eventId:string,input:CreateLocalTestAccount){return this.postJson<LocalTestAccountCreated>('/events/'+encodeURIComponent(eventId)+'/local-test-accounts',input);}
  disableLocalTestAccount(eventId:string,userId:string){return this.postJson<LocalTestAccount>('/events/'+encodeURIComponent(eventId)+'/local-test-accounts/'+encodeURIComponent(userId)+'/disable',{});}
  getPreviewAccess() { return this.fetchJson<{ enabled: boolean }>('/auth/team-preview'); }
  setPreviewAccess(enabled: boolean) { return this.patchJson<{ enabled: boolean }>('/auth/team-preview', { enabled }); }
  getTeamDisplays(eventId: string) { return this.fetchJson<Array<{ id: string; name: string; slug: string }>>(
    `/events/${eventId}/command/team-displays`); }

  listSupport(eventId: string, query: SupportInboxQuery = {}) {
    const params = new URLSearchParams();
    if (query.page) params.set('page', String(query.page));
    if (query.status) params.set('status', query.status);
    if (query.category) params.set('category', query.category);
    if (query.q) params.set('q', query.q);
    if (query.threadId) params.set('threadId', query.threadId);
    return this.fetchJson<SupportInbox>(`/events/${eventId}/support${params.size ? '?' + params : ''}`);
  }
  listSupportAssignees(eventId: string) {
    return this.fetchJson<SupportAssignee[]>(`/events/${encodeURIComponent(eventId)}/support/assignees`);
  }
  assignSupport(eventId: string, id: string, input: AssignSupportRequest) {
    return this.postJson<{id:string}>(`/events/${encodeURIComponent(eventId)}/support/${encodeURIComponent(id)}/assign`,input);
  }
  createSupport(eventId:string,input:CreateSupportRequest){return this.postJson<{id:string}>(`/events/${eventId}/support`,input);}
  assistSupport(eventId: string, input: SupportAssistInput) {
    return this.postJson<SupportAssistResult>(`/events/${eventId}/support/assist`, input);
  }
  replySupport(eventId:string,id:string,input:SupportMessageInput){return this.postJson<{id:string}>(`/events/${eventId}/support/${id}/reply`,input);}
  resolveSupport(eventId:string,id:string,expectedRevision:number){return this.postJson<{id:string}>(`/events/${eventId}/support/${id}/resolve`,{expectedRevision});}

  constructor(baseUrl?: string) {
    if (baseUrl) {
      this.baseUrl = baseUrl.replace(/\/+$/, '');
    } else if (typeof window !== 'undefined') {
      this.baseUrl = '/api';
    } else {
      this.baseUrl = (process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/+$/, '');
    }
  }

  async getHealth(): Promise<{ ok: boolean; data?: HealthResponse; error?: string }> {
    try {
      const res = await this.request(`${this.baseUrl}/health`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` };
      }
      const data = (await res.json()) as HealthResponse;
      return { ok: true, data };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to connect to CYRIS API';
      return { ok: false, error: message };
    }
  }

  analyzeOperationalDiagnostics(input:DiagnosticAnalysisInput){return this.postJson<DiagnosticAnalysisResult>('/admin/diagnostics/analyze',input);}
  runMaintenanceCheck(action:'API_STATUS'|'DEPENDENCY_CHECK'){return this.postJson<Record<string,unknown>>('/admin/maintenance/check',{action});}
  async getReadiness(): Promise<{ ok: boolean; data?: ReadinessResponse; error?: string }> {
    try {
      const res = await this.request(`${this.baseUrl}/health/ready`, {
        cache: 'no-store',
      });
      const data = (await res.json()) as ReadinessResponse;
      return { ok: res.ok, data };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to connect to CYRIS API';
      return { ok: false, error: message };
    }
  }

  async login(payload: LoginRequest): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await this.request(`${this.baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = (await res.json().catch(() => ({}))) as { message?: string };
        return { ok: false, error: errJson.message || 'Login failed' };
      }

      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async logout(): Promise<void> {
    const response = await this.request(`${this.baseUrl}/auth/logout`, { method: 'POST', credentials: 'include' });
    if (!response.ok) throw new Error('Unable to end the session. Please try again.');
  }

  async getMe(cookieHeader?: string): Promise<{ ok: boolean; data?: CurrentUserResponse; status?:number }> {
    try {
      const headers: Record<string, string> = {};
      if (cookieHeader) {
        headers['cookie'] = cookieHeader;
      }

      const res = await this.request(`${this.baseUrl}/auth/me`, {
        cache: 'no-store',
        credentials: 'include',
        headers,
      });

      if (!res.ok) {
        return { ok: false,status:res.status };
      }

      const data = (await res.json()) as CurrentUserResponse;
      return { ok: true, data };
    } catch {
      return { ok: false };
    }
  }

  async getEvents(cookieHeader?: string): Promise<{ ok: boolean; data?: EventResponse[] }> {
    try {
      const headers: Record<string, string> = {};
      if (cookieHeader) {
        headers['cookie'] = cookieHeader;
      }

      const res = await this.request(`${this.baseUrl}/events`, {
        cache: 'no-store',
        credentials: 'include',
        headers,
      });

      if (!res.ok) {
        return { ok: false, data: [] };
      }

      const data = (await res.json()) as EventResponse[];
      return { ok: true, data };
    } catch {
      return { ok: false, data: [] };
    }
  }

  async search(
    query: string,
    options?: { eventId?: string; types?: string; page?: number; limit?: number; signal?: AbortSignal }
  ): Promise<{ ok: boolean; data?: SearchResponse; error?: string }> {
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (options?.eventId) params.set('eventId', options.eventId);
      if (options?.types) params.set('types', options.types);
      if (options?.page) params.set('page', String(options.page));
      if (options?.limit) params.set('limit', String(options.limit));

      const res = await this.request(`${this.baseUrl}/search?${params.toString()}`, {
        cache: 'no-store',
        credentials: 'include',
        signal: options?.signal,
      });

      if (!res.ok) {
        const errJson = (await res.json().catch(() => ({}))) as { message?: string };
        return { ok: false, error: errJson.message || 'Search failed' };
      }

      const data = (await res.json()) as SearchResponse;
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  // Registry
  async previewScenarioData(eventId: string, payload: ScenarioDataRequest) {
    return this.postJson<ScenarioDataPreview>(`/events/${eventId}/scenario-data/preview`, payload);
  }
  listJsocLogs(eventId:string,query:JsocLogQuery,signal?:AbortSignal){
    const params=new URLSearchParams({page:String(query.page),limit:String(query.limit)});
    if(query.category)params.set('category',query.category);
    if(query.severity)params.set('severity',query.severity);
    if(query.search)params.set('search',query.search);
    return this.fetchJson<JsocLogPage>(`/events/${eventId}/jsoc/logs?${params}`,signal);
  }
  generateJsocLogs(eventId:string,input:GenerateJsocLogs){
    return this.postJson<{created:number;simulation:true}>(`/events/${eventId}/jsoc/generate`,input);
  }

  async getScenarioDataBatches(eventId: string) {
    return this.fetchJson<ScenarioDataBatchResponse[]>(`/events/${eventId}/scenario-data/batches`);
  }
  async getScenarioDataBatch(eventId: string, batchId: string) {
    return this.fetchJson<ScenarioDataBatchResponse>(`/events/${eventId}/scenario-data/batches/${batchId}`);
  }
  async generateScenarioData(eventId: string, payload: ScenarioDataRequest) {
    return this.postJson<ScenarioDataBatchResponse>(`/events/${eventId}/scenario-data/generate`, payload);
  }
  async startScenarioDraft(eventId:string, payload:SparkDraftRequest) {
    return this.postJson<ScenarioDataBatchResponse>(`/events/${eventId}/scenario-data/spark-drafts`,payload);
  }
  queueScenarioDraft(eventId:string,id:string){return this.postJson<ScenarioDataBatchResponse>(`/events/${eventId}/scenario-data/batches/${id}/queue`,{});}
  pauseScenarioDraft(eventId:string,id:string){return this.postJson<ScenarioDataBatchResponse>(`/events/${eventId}/scenario-data/batches/${id}/pause`,{});}
  async advanceScenarioDraft(eventId:string,id:string,prepared:number) {
    return this.postJson<ScenarioDataBatchResponse>(`/events/${eventId}/scenario-data/batches/${id}/advance`,{prepared});
  }
  async publishScenarioDraft(eventId:string,id:string) {
    return this.postJson<ScenarioDataBatchResponse>(`/events/${eventId}/scenario-data/batches/${id}/publish`,{});
  }
  async cleanupScenarioData(eventId: string, batchId: string) {
    return this.postJson<ScenarioDataBatchResponse>(`/events/${eventId}/scenario-data/batches/${batchId}/cleanup`, {});
  }

  /** Canonical, event-scoped relationship picker. No Typesense dependency. */
  async searchRegistryRecords(eventId:string,query:string,signal?:AbortSignal,types?:import('@cyris/contracts').RegistryPickerTypes){
    return this.fetchJson<RegistryPickerResult[]>(
      `/events/${eventId}/registry/search?q=${encodeURIComponent(query)}&limit=20${types?'&types='+encodeURIComponent(types):''}`,signal);
  }

  resolveRegistryPicker(eventId:string,id:string,signal?:AbortSignal){return this.fetchJson<RegistryPickerResult>(`/events/${eventId}/registry/picker/${id}`,signal);}
  async getPersons(eventId: string) {
    return this.fetchJson<any[]>(`/events/${eventId}/registry/persons`);
  }
  async getPerson(eventId: string, personId: string,signal?:AbortSignal) {
    return this.fetchJson<any>(`/events/${eventId}/registry/persons/${personId}`,signal);
  }
  async createPerson(eventId: string, data: any) {
    return this.postJson<any>(`/events/${eventId}/registry/persons`, data);
  }
  async updatePerson(eventId: string, personId: string, data: any) {
    return this.patchJson<any>(`/events/${eventId}/registry/persons/${personId}`, data);
  }
  async getOrganisations(eventId: string) {
    return this.fetchJson<any[]>(`/events/${eventId}/registry/organisations`);
  }
  async getOrganisation(eventId: string, orgId: string) {
    return this.fetchJson<any>(`/events/${eventId}/registry/organisations/${orgId}`);
  }
  async createOrganisation(eventId: string, data: any) {
    return this.postJson<any>(`/events/${eventId}/registry/organisations`, data);
  }
  async updateOrganisation(eventId: string, orgId: string, data: any) {
    return this.patchJson<any>(`/events/${eventId}/registry/organisations/${orgId}`, data);
  }
  async getVehicles(eventId: string) {
    return this.fetchJson<any[]>(`/events/${eventId}/registry/vehicles`);
  }
  async getVehicle(eventId: string, vehicleId: string) {
    return this.fetchJson<any>(`/events/${eventId}/registry/vehicles/${vehicleId}`);
  }
  async createVehicle(eventId: string, data: any) {
    return this.postJson<any>(`/events/${eventId}/registry/vehicles`, data);
  }
  async updateVehicle(eventId: string, vehicleId: string, data: any) {
    return this.patchJson<any>(`/events/${eventId}/registry/vehicles/${vehicleId}`, data);
  }

  // Relationships
  async createRelationship(sourceId: string, data: { targetResourceId: string; relationshipType: string }) {
    return this.postJson<any>(`/resources/${sourceId}/relationships`, data);
  }
  async getRelationships(resourceId: string) {
    return this.fetchJson<any[]>(`/resources/${resourceId}/relationships`);
  }
  async removeRelationship(eventId: string, relationshipId: string) {
    return this.deleteJson<any>(`/events/${eventId}/resources/relationships/${relationshipId}`);
  }

  // Incidents & Cases
  async getIncidents(eventId: string) {
    return this.fetchJson<any[]>(`/events/${eventId}/incidents`);
  }
  async createIncident(eventId: string, data: any) {
    return this.postJson<any>(`/events/${eventId}/incidents`, data);
  }
  async getCases(eventId: string) {
    return this.fetchJson<any[]>(`/events/${eventId}/cases`);
  }
  async getCase(eventId: string, caseId: string) {
    return this.fetchJson<any>(`/events/${eventId}/cases/${caseId}`);
  }
  async getCaseWorkspace(eventId: string, caseId: string) {
    return this.fetchJson<any>(`/events/${eventId}/cases/${caseId}/workspace`);
  }
  async createCase(eventId: string, data: any) {
    return this.postJson<any>(`/events/${eventId}/cases`, data);
  }

  // Evidence
  async getEvidence(eventId: string) {
    return this.fetchJson<any[]>(`/events/${eventId}/evidence`);
  }
  async getEvidenceItem(eventId: string, evidenceId: string) {
    return this.fetchJson<any>(`/events/${eventId}/evidence/${evidenceId}`);
  }
  async createEvidence(eventId: string, data: any) {
    return this.postJson<any>(`/events/${eventId}/evidence`, data);
  }
  searchCustodyRecipients(eventId:string,evidenceId:string,type:'USER'|'UNIT',q:string,signal?:AbortSignal){return this.fetchJson<import('@cyris/contracts').CustodyRecipient[]>(`/events/${eventId}/evidence/${evidenceId}/recipients?type=${type}&q=${encodeURIComponent(q)}`,signal);}
  async transferEvidence(eventId: string, evidenceId: string, data: import('@cyris/contracts').TransferEvidenceRequest) {
    return this.postJson<any>(`/events/${eventId}/evidence/${evidenceId}/transfers`, data);
  }

  // Laboratory
  async getLabAnalyses(eventId: string,evidenceId?:string,signal?:AbortSignal) {
    return this.fetchJson<import('@cyris/contracts').LabAnalysisResponse[]>(`/events/${eventId}/lab${evidenceId?'?evidenceId='+encodeURIComponent(evidenceId):''}`,signal);
  }
  async getLabUnits(eventId: string) {
    return this.fetchJson<Array<{ id: string; name: string }>>(`/events/${eventId}/lab/units`);
  }
  async getLabWorkers(eventId: string, unitId: string) {
    return this.fetchJson<Array<{ id: string; displayName: string }>>(
      `/events/${eventId}/lab/units/${unitId}/workers`
    );
  }
  async getLabAnalysis(eventId: string, analysisId: string) {
    return this.fetchJson<LabAnalysisDetail>(`/events/${eventId}/lab/${analysisId}`);
  }
  async createLabAnalysis(eventId: string, data: any) {
    return this.postJson<any>(`/events/${eventId}/lab`, data);
  }
  async updateLabAnalysis(eventId: string, analysisId: string, data: any) {
    return this.patchJson<any>(`/events/${eventId}/lab/${analysisId}`, data);
  }
  async reassignLabAnalysis(eventId: string, analysisId: string, data: any) {
    return this.postJson<any>(`/events/${eventId}/lab/${analysisId}/reassign`, data);
  }
  async correctLabAnalysis(eventId: string, analysisId: string, data: any) {
    return this.postJson<any>(`/events/${eventId}/lab/${analysisId}/correct`, data);
  }

  // Timeline
  async getEventTimeline(eventId: string, type?: string) {
    const q = type ? `?type=${encodeURIComponent(type)}` : '';
    return this.fetchJson<any>(`/events/${eventId}/timeline${q}`);
  }
  async getResourceTimeline(resourceId: string) {
    return this.fetchJson<any>(`/resources/${resourceId}/timeline`);
  }
  async getCaseTimeline(caseId: string) {
    return this.fetchJson<any>(`/cases/${caseId}/timeline`);
  }

  // Registry Devices & Locations
  async getDevices(eventId: string) {
    return this.fetchJson<any[]>(`/events/${eventId}/registry/devices`);
  }
  async getDevice(eventId: string, deviceId: string) {
    return this.fetchJson<any>(`/events/${eventId}/registry/devices/${deviceId}`);
  }
  async createDevice(eventId: string, data: any) {
    return this.postJson<any>(`/events/${eventId}/registry/devices`, data);
  }
  async updateDevice(eventId: string, deviceId: string, data: any) {
    return this.patchJson<any>(`/events/${eventId}/registry/devices/${deviceId}`, data);
  }
  async getRegistryRecordActions(eventId:string,id:string) {
    return this.fetchJson<{edit:boolean;link:boolean;timeline:boolean}>(`/events/${eventId}/registry/records/${id}/actions`);
  }
  async getLicences(eventId: string) {
    return this.fetchJson<any[]>(`/events/${eventId}/registry/licences`);
  }
  async getLicence(eventId: string,id:string) {
    return this.fetchJson<any>(`/events/${eventId}/registry/licences/${id}`);
  }
  async createLicence(eventId:string,data:any) {
    return this.postJson<any>(`/events/${eventId}/registry/licences`,data);
  }
  async updateLicence(eventId:string,id:string,data:any) {
    return this.patchJson<any>(`/events/${eventId}/registry/licences/${id}`,data);
  }
  async getWeapons(eventId: string) {
    return this.fetchJson<any[]>(`/events/${eventId}/registry/weapons`);
  }
  async getWeapon(eventId: string, weaponId: string) {
    return this.fetchJson<any>(`/events/${eventId}/registry/weapons/${weaponId}`);
  }
  async createWeapon(eventId: string, data: any) {
    return this.postJson<any>(`/events/${eventId}/registry/weapons`, data);
  }
  async updateWeapon(eventId: string, weaponId: string, data: any) {
    return this.patchJson<any>(`/events/${eventId}/registry/weapons/${weaponId}`, data);
  }

  async getScenarioBatchRecords(eventId:string,batchId:string,kind:ScenarioBatchMediaList['kind'],page=1) {
    return this.fetchJson<ScenarioBatchMediaList>(
      `/events/${eventId}/scenario-data/batches/${batchId}/records?kind=${encodeURIComponent(kind)}&page=${page}&limit=20`
    );
  }
  async getScenarioDraftRecords(eventId: string, batchId: string,
    kind: ScenarioDraftRecordList['kind'], page = 1) {
    return this.fetchJson<ScenarioDraftRecordList>(
      '/events/' + encodeURIComponent(eventId) + '/scenario-data/batches/' + encodeURIComponent(batchId) +
      '/draft-records?kind=' + encodeURIComponent(kind) + '&page=' + page + '&limit=20',
    );
  }
  async getScenarioDraftMedia(eventId: string, batchId: string) {
    return this.fetchJson<ScenarioDraftMediaItem[]>(
      '/events/' + encodeURIComponent(eventId) + '/scenario-data/batches/' + encodeURIComponent(batchId) + '/draft-media',
    );
  }
  async uploadScenarioDraftMedia(eventId: string, batchId: string, payload: ScenarioDraftMediaUpload) {
    return this.postJson<ScenarioDraftMediaItem>(
      '/events/' + encodeURIComponent(eventId) + '/scenario-data/batches/' + encodeURIComponent(batchId) + '/draft-media',
      payload,
    );
  }
  async removeScenarioDraftMedia(eventId: string, batchId: string,
    kind: ScenarioDraftRecordList['kind'], index: number) {
    return this.deleteJson<{ success: boolean }>(
      '/events/' + encodeURIComponent(eventId) + '/scenario-data/batches/' + encodeURIComponent(batchId) +
      '/draft-media?kind=' + encodeURIComponent(kind) + '&index=' + index,
    );
  }
  getScenarioDraftImageUrl(eventId: string, batchId: string, kind: ScenarioDraftRecordList['kind'], index: number) {
    return this.baseUrl + '/events/' + encodeURIComponent(eventId) + '/scenario-data/batches/' +
      encodeURIComponent(batchId) + '/draft-image?kind=' + encodeURIComponent(kind) + '&index=' + index;
  }

  async getScenarioDraftQuality(eventId: string, batchId: string) {
    return this.fetchJson<ScenarioQualityReport>(
      '/events/' + encodeURIComponent(eventId) + '/scenario-data/batches/' +
      encodeURIComponent(batchId) + '/quality',
    );
  }

  async uploadRegistryPrimaryMedia(eventId: string, resourceId: string, payload: { filename: string; mimeType: string; data: string }) {
    return this.postJson<any>(`/events/${eventId}/registry/${resourceId}/primary-media`, payload);
  }
  async removeRegistryPrimaryMedia(eventId: string, resourceId: string) {
    return this.deleteJson<any>(`/events/${eventId}/registry/${resourceId}/primary-media`);
  }
  getRegistryPrimaryMediaUrl(eventId: string, resourceId: string) {
    return `${this.baseUrl}/events/${eventId}/registry/${resourceId}/primary-media`;
  }
  async getLocations(eventId: string) {
    return this.fetchJson<any[]>(`/events/${eventId}/registry/locations`);
  }
  async getLocation(eventId: string, locId: string) {
    return this.fetchJson<any>(`/events/${eventId}/registry/locations/${locId}`);
  }
  async createLocation(eventId: string, data: any) {
    return this.postJson<any>(`/events/${eventId}/registry/locations`, data);
  }
  async updateLocation(eventId: string, locId: string, data: any) {
    return this.patchJson<any>(`/events/${eventId}/registry/locations/${locId}`, data);
  }

  // Event Relationships (for global graph)
  async getEventRelationships(eventId: string,signal?:AbortSignal) {
    return this.fetchJson<any[]>(`/events/${eventId}/relationships`,signal);
  }

  // Incident & Case Details & Updates
  async getIncident(eventId: string, incidentId: string) {
    return this.fetchJson<any>(`/events/${eventId}/incidents/${incidentId}`);
  }
  async updateIncident(eventId: string, incidentId: string, data: any) {
    return this.patchJson<any>(`/events/${eventId}/incidents/${incidentId}`, data);
  }
  async updateCase(eventId: string, caseId: string, data: any) {
    return this.patchJson<any>(`/events/${eventId}/cases/${caseId}`, data);
  }

  // Administration
  async getAudit(filters?: { limit?: number; page?: number; offset?: number; eventId?: string; action?: string; category?: string; resourceId?: string; q?: string; outcome?:string }) {
    const params = new URLSearchParams();
    if (filters?.limit) params.set('limit', String(filters.limit));
    // API paging is 1-based; keep legacy offset callers mapped to a page.
    if (filters?.page) params.set('page', String(filters.page));
    else if (filters?.offset) params.set('page', String(Math.floor(filters.offset / (filters.limit ?? 20)) + 1));
    if (filters?.resourceId) params.set('resourceId', filters.resourceId);
    if (filters?.q?.trim()) params.set('q', filters.q.trim());
    if (filters?.eventId) params.set('eventId', filters.eventId);
    if (filters?.action) params.set('action', filters.action);
    if (filters?.category) params.set('category', filters.category);
    if (filters?.outcome) params.set('outcome',filters.outcome);
    const q = params.toString() ? `?${params.toString()}` : '';
    return this.fetchJson<{ items: any[]; total: number }>(`/audit${q}`);
  }
  async getUnits(eventId: string) {
    return this.fetchJson<any[]>(`/events/${eventId}/units`);
  }
  async createUnit(eventId: string, data: any) {
    return this.postJson<any>(`/events/${eventId}/units`, data);
  }
  async getUnitCapabilities(eventId: string, unitId: string) {
    return this.fetchJson<UnitCapabilityResponse[]>(`/events/${eventId}/units/${unitId}/capabilities`);
  }
  async setUnitCapabilities(eventId: string, unitId: string, capabilityKeys: string[]) {
    return this.putJson<UnitCapabilityResponse[]>(`/events/${eventId}/units/${unitId}/capabilities`, { capabilityKeys });
  }
  async getWorkspace(eventId: string) {
    return this.fetchJson<WorkspaceResolutionResponse>(`/events/${eventId}/workspace`);
  }
  async getMemberships(eventId: string,signal?:AbortSignal) {
    return this.fetchJson<MembershipResponse[]>(`/events/${eventId}/memberships`,signal);
  }
  async activateMembership(eventId: string, membershipId: string) {
    return this.patchJson<unknown>(`/events/${eventId}/memberships/${membershipId}`, { status: 'ACTIVE' });
  }
  async deactivateMembership(eventId: string, membershipId: string) {
    return this.patchJson<unknown>(`/events/${encodeURIComponent(eventId)}/memberships/${encodeURIComponent(membershipId)}`,
      { status: 'INACTIVE' });
  }
  async getRoles(eventId: string,signal?:AbortSignal) {
    return this.fetchJson<any[]>(`/events/${eventId}/roles`,signal);
  }
  getEventAfterActionReport(eventId: string) {
    return this.fetchJson<EventAfterActionReport>(
      '/events/' + encodeURIComponent(eventId) + '/after-action-report');
  }
  getEventRetentionPlan(eventId:string,signal?:AbortSignal){
    return this.fetchJson<EventRetentionPlan>('/events/'+encodeURIComponent(eventId)+'/retention-plan',signal);
  }
  getEventPurgePreview(eventId: string, resourceTypes?: string[]) {
    const suffix = resourceTypes && resourceTypes.length
      ? '?resourceTypes=' + encodeURIComponent(resourceTypes.join(','))
      : '';
    return this.fetchJson<EventPurgePreview>(
      '/events/' + encodeURIComponent(eventId) + '/purge-preview' + suffix);
  }
  async getEvent(eventId: string) {
    return this.fetchJson<EventResponse>(`/events/${eventId}`);
  }
  async createEvent(data: any) {
    return this.postJson<EventResponse>('/events', data);
  }
  getTeamRoleReview(eventId:string){
    return this.fetchJson<import('@cyris/contracts').TeamRoleReviewItem[]>(`/events/${encodeURIComponent(eventId)}/team-templates/review`);
  }
  assignTeamOperatorProfile(eventId:string,payload:import('@cyris/contracts').AssignTeamOperatorProfile){
    return this.postJson<{created:number;alreadyAssigned:number}>(`/events/${encodeURIComponent(eventId)}/team-templates/assign-operators`,payload);
  }
  initializeTeamTemplates(eventId: string) {
    return this.postJson<{ eventId: string; unitsCreated: number; rolesCreated: number }>(
      `/events/${encodeURIComponent(eventId)}/team-templates`, {},
    );
  }
  async updateEvent(eventId: string, data: any) {
    return this.patchJson<EventResponse>(`/events/${eventId}`, data);
  }
  async duplicateEvent(eventId: string, data: any) {
    return this.postJson<EventResponse>(`/events/${eventId}/duplicate`, data);
  }
  async archiveEvent(eventId: string) {
    return this.postJson<EventResponse>(`/events/${eventId}/archive`, {});
  }
  async getEventUnits(eventId: string) {
    return this.getUnits(eventId);
  }
  async createEventUnit(eventId: string, data: any) {
    return this.createUnit(eventId, data);
  }
  async updateEventUnit(eventId: string, unitId: string, data: any) {
    return this.patchJson<any>(`/events/${eventId}/units/${unitId}`, data);
  }
  async getEventRoles(eventId: string) {
    return this.fetchJson<any[]>(`/events/${eventId}/roles`);
  }
  async createEventRole(eventId: string, data: any) {
    return this.postJson<any>(`/events/${eventId}/roles`, data);
  }
  async updateEventRole(eventId: string, roleId: string, data: any) {
    return this.patchJson<any>(`/events/${eventId}/roles/${roleId}`, data);
  }
  revokeRole(eventId: string, assignmentId: string) {
    return this.deleteJson<{ success: boolean }>(`/events/${eventId}/roles/assignments/${assignmentId}`);
  }
  async assignRole(eventId: string, data: any) {
    return this.postJson<any>(`/events/${eventId}/roles/assign`, data);
  }

  private async fetchJson<T>(path: string,signal?:AbortSignal): Promise<{ ok: boolean; data?: T; error?: string; status?: number }> {
    for (let attempt = 0; attempt < 2; attempt++) {
      if(signal?.aborted)return {ok:false,error:'Request cancelled'};
      try {
        const res = await this.request(`${this.baseUrl}${path}`, {
          cache: 'no-store',
          credentials: 'include',signal,
        });
        if (!res.ok) {
          const errJson = (await res.json().catch(() => ({}))) as { message?: string };
          return { ok: false, status: res.status, error: errJson.message || `HTTP ${res.status}` };
        }
        const data = (await res.json()) as T;
        return { ok: true, data };
      } catch (err) {
        if(signal?.aborted)return {ok:false,error:'Request cancelled'};
        if (attempt === 0 && (err instanceof TypeError || (err as Error).message?.includes('fetch'))) {
          // Transient socket reset during route transitions - retry once immediately
          await new Promise((r) => setTimeout(r, 80));
          continue;
        }
        return { ok: false, error: (err as Error).message };
      }
    }
    return { ok: false, error: 'Failed to fetch' };
  }

  private async postJson<T>(path: string, payload: unknown): Promise<{ ok: boolean; data?: T; error?: string; status?: number }> {
    try {
      const res = await this.request(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errJson = (await res.json().catch(() => ({}))) as { message?: string };
        return { ok: false, status: res.status, error: errJson.message || `HTTP ${res.status}` };
      }
      const data = (await res.json()) as T;
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  private async patchJson<T>(path: string, payload: unknown): Promise<{ ok: boolean; data?: T; error?: string }> {
    try {
      const res = await this.request(`${this.baseUrl}${path}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errJson = (await res.json().catch(() => ({}))) as { message?: string };
        return { ok: false, error: errJson.message || `HTTP ${res.status}` };
      }
      const data = (await res.json()) as T;
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  // ============================================================================
  // AI & Integrations Management (Admin)
  // ============================================================================

  async listAIProviders(): Promise<{ ok: boolean; data?: AIProviderResponse[]; error?: string }> {
    return this.fetchJson<AIProviderResponse[]>('/admin/integrations/ai');
  }

  async getAIProvider(id: string): Promise<{ ok: boolean; data?: AIProviderResponse; error?: string }> {
    return this.fetchJson<AIProviderResponse>(`/admin/integrations/ai/${id}`);
  }

  async createAIProvider(payload: CreateAIProviderRequest): Promise<{ ok: boolean; data?: AIProviderResponse; error?: string }> {
    return this.postJson<AIProviderResponse>('/admin/integrations/ai', payload);
  }

  async updateAIProvider(id: string, payload: UpdateAIProviderRequest): Promise<{ ok: boolean; data?: AIProviderResponse; error?: string }> {
    return this.putJson<AIProviderResponse>(`/admin/integrations/ai/${id}`, payload);
  }

  async deleteAIProvider(id: string): Promise<{ ok: boolean; error?: string }> {
    return this.deleteJson<{ success: boolean }>(`/admin/integrations/ai/${id}`);
  }

  testSparkInference(){return this.postJson<{success:boolean;category:string;durationMs:number;model:string}>('/admin/integrations/ai/test-spark-inference',{});}

  async testAIConnection(payload: TestConnectionRequest): Promise<{ ok: boolean; data?: TestConnectionResponse; error?: string }> {
    return this.postJson<TestConnectionResponse>('/admin/integrations/ai/test-connection', payload);
  }

  // ============================================================================
  // CYRIS Intelligence Operations
  // ============================================================================

  async getIntelligenceStatus(eventId: string): Promise<{ ok: boolean; data?: IntelligenceStatusResponse; error?: string }> {
    return this.fetchJson<IntelligenceStatusResponse>(`/events/${eventId}/intelligence/status`);
  }

  async writingAssist(eventId: string, payload: WritingAssistRequest): Promise<{ ok: boolean; data?: WritingAssistResponse; error?: string }> {
    return this.postJson<WritingAssistResponse>(`/events/${eventId}/intelligence/writing-assist`, payload);
  }

  async summarizeCase(eventId: string, caseId: string): Promise<{ ok: boolean; data?: SummarizeCaseResponse; error?: string }> {
    return this.postJson<SummarizeCaseResponse>(`/events/${eventId}/intelligence/summarize-case`, { caseId });
  }

  async catchMeUp(eventId: string, period?: string): Promise<{ ok: boolean; data?: CatchMeUpResponse; error?: string }> {
    return this.postJson<CatchMeUpResponse>(`/events/${eventId}/intelligence/catch-me-up`, { period });
  }

  async explainTimeline(eventId: string, payload: ExplainTimelineRequest): Promise<{ ok: boolean; data?: ExplainTimelineResponse; error?: string }> {
    return this.postJson<ExplainTimelineResponse>(`/events/${eventId}/intelligence/explain-timeline`, payload);
  }

  // ============================================================================
  // Scenario Control & Exercise Orchestration
  // ============================================================================

  async getScenarioControlRunSheet(eventId: string): Promise<{ ok: boolean; data?: ScenarioControlRunSheet; error?: string }> {
    return this.fetchJson<ScenarioControlRunSheet>(`/events/${eventId}/scenario/control`);
  }

  async updateScenarioClock(eventId: string, payload: {
    action: 'SET_TIME' | 'PAUSE' | 'RESUME' | 'ADVANCE';
    scenarioTime?: string;
    minutes?: number;
  }): Promise<{ ok: boolean; data?: ScenarioControlRunSheet['clock']; error?: string }> {
    return this.patchJson<ScenarioControlRunSheet['clock']>(`/events/${eventId}/scenario/clock`, payload);
  }

  async listScenarioPhases(eventId: string): Promise<{ ok: boolean; data?: ScenarioPhaseResponse[]; error?: string }> {
    return this.fetchJson<ScenarioPhaseResponse[]>(`/events/${eventId}/scenario/phases`);
  }

  async createScenarioPhase(eventId: string, payload: CreateScenarioPhaseInput): Promise<{ ok: boolean; data?: ScenarioPhaseResponse; error?: string }> {
    return this.postJson<ScenarioPhaseResponse>(`/events/${eventId}/scenario/phases`, payload);
  }

  async updateScenarioPhase(eventId: string, phaseId: string, payload: UpdateScenarioPhaseInput): Promise<{ ok: boolean; data?: ScenarioPhaseResponse; error?: string }> {
    return this.patchJson<ScenarioPhaseResponse>(`/events/${eventId}/scenario/phases/${phaseId}`, payload);
  }

  async reorderScenarioPhases(eventId: string, phaseIds: string[]): Promise<{ ok: boolean; data?: ScenarioPhaseResponse[]; error?: string }> {
    return this.postJson<ScenarioPhaseResponse[]>(`/events/${eventId}/scenario/phases/reorder`, { phaseIds });
  }

  async listScenarioInjects(eventId: string, phaseId?: string): Promise<{ ok: boolean; data?: ScenarioInjectResponse[]; error?: string }> {
    const q = phaseId ? `?phaseId=${encodeURIComponent(phaseId)}` : '';
    return this.fetchJson<ScenarioInjectResponse[]>(`/events/${eventId}/scenario/injects${q}`);
  }

  async getScenarioInject(eventId: string, injectId: string): Promise<{ ok: boolean; data?: ScenarioInjectResponse; error?: string }> {
    return this.fetchJson<ScenarioInjectResponse>(`/events/${eventId}/scenario/injects/${injectId}`);
  }

  async createScenarioInject(eventId: string, payload: CreateScenarioInjectInput): Promise<{ ok: boolean; data?: ScenarioInjectResponse; error?: string }> {
    return this.postJson<ScenarioInjectResponse>(`/events/${eventId}/scenario/injects`, payload);
  }

  async updateScenarioInject(eventId: string, injectId: string, payload: UpdateScenarioInjectInput): Promise<{ ok: boolean; data?: ScenarioInjectResponse; error?: string }> {
    return this.patchJson<ScenarioInjectResponse>(`/events/${eventId}/scenario/injects/${injectId}`, payload);
  }

  prepareScenarioInject(eventId:string,injectId:string){return this.postJson<ScenarioInjectResponse>(`/events/${eventId}/scenario/injects/${injectId}/prepare`,{});}
  async releaseScenarioInject(eventId: string, injectId: string): Promise<{ ok: boolean; data?: unknown; error?: string }> {
    return this.postJson(`/events/${eventId}/scenario/injects/${injectId}/release`, {});
  }

  async overrideReleaseScenarioInject(eventId: string, injectId: string, overrideReason: string): Promise<{ ok: boolean; data?: unknown; error?: string }> {
    return this.postJson(`/events/${eventId}/scenario/injects/${injectId}/override-release`, { overrideReason });
  }

  async cancelScenarioInject(eventId: string, injectId: string): Promise<{ ok: boolean; data?: ScenarioInjectResponse; error?: string }> {
    return this.postJson<ScenarioInjectResponse>(`/events/${eventId}/scenario/injects/${injectId}/cancel`, {});
  }

  async previewScenarioAudience(eventId: string, injectId: string, params?: { unitId?: string; userId?: string }): Promise<{ ok: boolean; data?: AudiencePreviewResponse; error?: string }> {
    const query = new URLSearchParams();
    if (params?.unitId) query.set('unitId', params.unitId);
    if (params?.userId) query.set('userId', params.userId);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.fetchJson<AudiencePreviewResponse>(`/events/${eventId}/scenario/injects/${injectId}/audience-preview${qs}`);
  }

  // ============================================================================
  // Participant Briefings
  // ============================================================================

  async getParticipantBriefings(eventId: string): Promise<{ ok: boolean; data?: ParticipantBriefingsListResponse; error?: string }> {
    return this.fetchJson<ParticipantBriefingsListResponse>(`/events/${eventId}/briefings`);
  }

  async markBriefingRead(eventId: string, deliveryId: string): Promise<{ ok: boolean; error?: string }> {
    return this.postJson<{ success: boolean }>(`/events/${eventId}/briefings/${deliveryId}/read`, {});
  }

  async acknowledgeBriefing(eventId: string, deliveryId: string): Promise<{ ok: boolean; error?: string }> {
    return this.postJson<{ success: boolean }>(`/events/${eventId}/briefings/${deliveryId}/acknowledge`, {});
  }

  // ============================================================================
  // Documents / Object Storage
  // ============================================================================

  async listDocuments(
    eventId: string,
    query?: { documentType?: string; status?: string; page?: number; limit?: number }
  ): Promise<{ ok: boolean; data?: { items: DocumentItem[]; total: number; page: number; limit: number }; error?: string }> {
    const params = new URLSearchParams();
    if (query?.documentType) params.set('documentType', query.documentType);
    if (query?.status) params.set('status', query.status);
    if (query?.page) params.set('page', String(query.page));
    if (query?.limit) params.set('limit', String(query.limit));
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.fetchJson<{ items: DocumentItem[]; total: number; page: number; limit: number }>(`/events/${eventId}/documents${qs}`);
  }

  async getDocument(eventId: string, documentId: string): Promise<{ ok: boolean; data?: DocumentDetail; error?: string }> {
    return this.fetchJson<DocumentDetail>(`/events/${eventId}/documents/${documentId}`);
  }

  async uploadDocument(
    eventId: string,
    payload: { filename: string; mimeType?: string; data: string; title: string; description?: string; documentType?: string; visibility?: string }
  ): Promise<{ ok: boolean; data?: DocumentItem; error?: string }> {
    return this.postJson<DocumentItem>(`/events/${eventId}/documents/upload`, payload);
  }

  async uploadDocumentVersion(
    eventId: string,
    documentId: string,
    payload: { filename: string; mimeType?: string; data: string; changeNote?: string }
  ): Promise<{ ok: boolean; data?: DocumentDetail; error?: string }> {
    return this.postJson<DocumentDetail>(`/events/${eventId}/documents/${documentId}/versions`, payload);
  }

  getDocumentDownloadUrl(eventId: string, documentId: string, version?: number): string {
    return `${this.baseUrl}/events/${eventId}/documents/${documentId}/download${version ? `?version=${version}` : ''}`;
  }

  // ============================================================================
  // Digital Forensics & Technical Indicators
  // ============================================================================

  async listForensicAnalyses(
    eventId: string,
    query?: { status?: string; analysisType?: string; priority?: string; page?: number; limit?: number;evidenceId?:string;mine?:'requested'|'assigned';search?:string }
  ): Promise<{ ok: boolean; data?: { items: ForensicAnalysisItem[]; total: number; page: number; limit: number }; error?: string }> {
    const params = new URLSearchParams();
    if (query?.status) params.set('status', query.status);
    if (query?.analysisType) params.set('analysisType', query.analysisType);
    if(query?.evidenceId)params.set('evidenceId',query.evidenceId);
    if(query?.mine)params.set('mine',query.mine);
    if(query?.search)params.set('search',query.search);
    if (query?.priority) params.set('priority', query.priority);
    if (query?.page) params.set('page', String(query.page));
    if (query?.limit) params.set('limit', String(query.limit));
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.fetchJson<{ items: ForensicAnalysisItem[]; total: number; page: number; limit: number }>(`/events/${eventId}/forensics${qs}`);
  }

  getForensicUnits(eventId:string){return this.fetchJson<Array<{id:string;name:string}>>(`/events/${eventId}/forensics/units`);}
  listForensicReassignmentCandidates(eventId:string,analysisId:string){return this.fetchJson<Array<{id:string;displayName:string}>>(`/events/${eventId}/forensics/${analysisId}/reassignment-candidates`);}
  reassignForensicAnalysis(eventId:string,analysisId:string,payload:{assignedToUserId:string;expectedUpdatedAt:string;reason:string}){return this.patchJson<ForensicAnalysisDetail>(`/events/${eventId}/forensics/${analysisId}/assignment`,payload);}
  async getForensicAnalysis(eventId: string, analysisId: string): Promise<{ ok: boolean; data?: ForensicAnalysisDetail; error?: string }> {
    return this.fetchJson<ForensicAnalysisDetail>(`/events/${eventId}/forensics/${analysisId}`);
  }

  async createForensicAnalysis(
    eventId: string,
    payload: CreateForensicAnalysisRequest
  ): Promise<{ ok: boolean; data?: ForensicAnalysisDetail; error?: string }> {
    return this.postJson<ForensicAnalysisDetail>(`/events/${eventId}/forensics`, payload);
  }

  async updateForensicStatus(
    eventId: string,
    analysisId: string,
    payload: UpdateForensicStatusRequest
  ): Promise<{ ok: boolean; data?: ForensicAnalysisDetail; error?: string }> {
    return this.patchJson<ForensicAnalysisDetail>(`/events/${eventId}/forensics/${analysisId}/status`, payload);
  }

  async createForensicFinding(
    eventId: string,
    analysisId: string,
    payload: CreateForensicFindingRequest
  ): Promise<{ ok: boolean; data?: ForensicFinding; error?: string }> {
    return this.postJson<ForensicFinding>(`/events/${eventId}/forensics/${analysisId}/findings`, payload);
  }

  async createForensicAcquisition(
    eventId: string,
    analysisId: string,
    payload: CreateForensicAcquisitionRequest
  ): Promise<{ ok: boolean; data?: ForensicAcquisition; error?: string }> {
    return this.postJson<ForensicAcquisition>(`/events/${eventId}/forensics/${analysisId}/acquisitions`, payload);
  }

  async listTechnicalIndicators(eventId: string): Promise<{ ok: boolean; data?: TechnicalIndicator[]; error?: string }> {
    return this.fetchJson<TechnicalIndicator[]>(`/events/${eventId}/indicators`);
  }

  async createTechnicalIndicator(
    eventId: string,
    payload: CreateTechnicalIndicatorRequest
  ): Promise<{ ok: boolean; data?: TechnicalIndicator; error?: string }> {
    return this.postJson<TechnicalIndicator>(`/events/${eventId}/indicators`, payload);
  }

  // ============================================================================
  // Prosecution, Defence & Court Proceedings
  // ============================================================================

  async listCourtCases(
    eventId: string,
    query?: { status?: string; originatingCaseId?: string; page?: number; limit?: number }
  ): Promise<{ ok: boolean; data?: { items: CourtCaseItem[]; total: number; page: number; limit: number }; error?: string }> {
    const params = new URLSearchParams();
    if (query?.status) params.set('status', query.status);
    if (query?.originatingCaseId) params.set('originatingCaseId', query.originatingCaseId);
    if (query?.page) params.set('page', String(query.page));
    if (query?.limit) params.set('limit', String(query.limit));
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.fetchJson<{ items: CourtCaseItem[]; total: number; page: number; limit: number }>(`/events/${eventId}/court${qs}`);
  }

  async getCourtCase(eventId: string, courtCaseId: string): Promise<{ ok: boolean; data?: CourtCaseDetail; error?: string }> {
    return this.fetchJson<CourtCaseDetail>(`/events/${eventId}/court/${courtCaseId}`);
  }

  async createCourtCase(
    eventId: string,
    payload: CreateCourtCaseRequest
  ): Promise<{ ok: boolean; data?: CourtCaseDetail; error?: string }> {
    return this.postJson<CourtCaseDetail>(`/events/${eventId}/court`, payload);
  }

  async updateCourtCaseStatus(
    eventId: string,
    courtCaseId: string,
    payload: UpdateCourtCaseStatusRequest
  ): Promise<{ ok: boolean; data?: CourtCaseDetail; error?: string }> {
    return this.patchJson<CourtCaseDetail>(`/events/${eventId}/court/${courtCaseId}/status`, payload);
  }

  async addCourtCaseParty(
    eventId: string,
    courtCaseId: string,
    payload: AddCourtCasePartyRequest
  ): Promise<{ ok: boolean; data?: CourtCaseParty; error?: string }> {
    return this.postJson<CourtCaseParty>(`/events/${eventId}/court/${courtCaseId}/parties`, payload);
  }

  async createCourtCharge(
    eventId: string,
    courtCaseId: string,
    payload: CreateChargeRequest
  ): Promise<{ ok: boolean; data?: Charge; error?: string }> {
    return this.postJson<Charge>(`/events/${eventId}/court/${courtCaseId}/charges`, payload);
  }

  async submitCourtExhibit(
    eventId: string,
    courtCaseId: string,
    payload: SubmitCourtExhibitRequest
  ): Promise<{ ok: boolean; data?: CourtExhibit; error?: string }> {
    return this.postJson<CourtExhibit>(`/events/${eventId}/court/${courtCaseId}/exhibits`, payload);
  }

  async decideCourtExhibit(
    eventId: string,
    courtCaseId: string,
    exhibitId: string,
    payload: DecideCourtExhibitRequest
  ): Promise<{ ok: boolean; data?: CourtExhibit; error?: string }> {
    return this.patchJson<CourtExhibit>(`/events/${eventId}/court/${courtCaseId}/exhibits/${exhibitId}/decide`, payload);
  }

  async createCourtHearing(
    eventId: string,
    courtCaseId: string,
    payload: CreateCourtHearingRequest
  ): Promise<{ ok: boolean; data?: CourtHearing; error?: string }> {
    return this.postJson<CourtHearing>(`/events/${eventId}/court/${courtCaseId}/hearings`, payload);
  }

  async updateCourtHearingStatus(
    eventId: string,
    courtCaseId: string,
    hearingId: string,
    payload: UpdateCourtHearingStatusRequest
  ): Promise<{ ok: boolean; data?: CourtHearing; error?: string }> {
    return this.patchJson<CourtHearing>(`/events/${eventId}/court/${courtCaseId}/hearings/${hearingId}/status`, payload);
  }

  async createCourtFiling(
    eventId: string,
    courtCaseId: string,
    payload: CreateCourtFilingRequest
  ): Promise<{ ok: boolean; data?: CourtFiling; error?: string }> {
    return this.postJson<CourtFiling>(`/events/${eventId}/court/${courtCaseId}/filings`, payload);
  }

  async createCourtDecision(
    eventId: string,
    courtCaseId: string,
    payload: CreateCourtDecisionRequest
  ): Promise<{ ok: boolean; data?: CourtDecision; error?: string }> {
    return this.postJson<CourtDecision>(`/events/${eventId}/court/${courtCaseId}/decisions`, payload);
  }

  listLegalRequests(eventId: string,signal?:AbortSignal) {
    return this.fetchJson<CourtRequestItem[]>('/events/' + encodeURIComponent(eventId) + '/legal-requests',signal);
  }
  listCourtRequests(eventId: string, courtCaseId: string) {
    return this.fetchJson<CourtRequestItem[]>(
      '/events/' + encodeURIComponent(eventId) + '/court/' + encodeURIComponent(courtCaseId) + '/requests',
    );
  }
  createCourtRequest(eventId: string, courtCaseId: string, input: CreateCourtRequest) {
    return this.postJson<CourtRequestItem>(
      '/events/' + encodeURIComponent(eventId) + '/court/' + encodeURIComponent(courtCaseId) + '/requests', input,
    );
  }
  replyCourtRequest(eventId: string, courtCaseId: string, requestId: string, input: ReplyCourtRequest) {
    return this.postJson<CourtRequestItem>(
      '/events/' + encodeURIComponent(eventId) + '/court/' + encodeURIComponent(courtCaseId) +
      '/requests/' + encodeURIComponent(requestId) + '/reply', input,
    );
  }

  async getCourtTimeline(
    eventId: string,
    courtCaseId: string
  ): Promise<{ ok: boolean; data?: CourtTimelineEvent[]; error?: string }> {
    return this.fetchJson<CourtTimelineEvent[]>(`/events/${eventId}/court/${courtCaseId}/timeline`);
  }

  private async putJson<T>(path: string, payload: unknown): Promise<{ ok: boolean; data?: T; error?: string }> {
    try {
      const res = await this.request(`${this.baseUrl}${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errJson = (await res.json().catch(() => ({}))) as { message?: string };
        return { ok: false, error: errJson.message || `HTTP ${res.status}` };
      }
      const data = (await res.json()) as T;
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async getForensicAnalyses(eventId: string) {
    const res = await this.listForensicAnalyses(eventId);
    return { ok: res.ok, data: res.data?.items, error: res.error };
  }

  async updateForensicAnalysis(
    eventId: string,
    analysisId: string,
    payload: { methodology?: string; findings?: string; conclusion?: string }
  ) {
    return this.patchJson<ForensicAnalysisDetail>(`/events/${eventId}/forensics/${analysisId}`, payload);
  }

  async getTechnicalIndicators(eventId: string) {
    return this.listTechnicalIndicators(eventId);
  }

  searchLegalLibrary(eventId:string,q:string,asOf:string,signal?:AbortSignal){return this.fetchJson<LegalSearchResult>('/events/'+encodeURIComponent(eventId)+'/legal-library?'+new URLSearchParams({q,asOf}),signal);}
  addLegalSource(eventId:string,input:LegalSourceInput){return this.postJson<LegalSource>('/events/'+encodeURIComponent(eventId)+'/legal-library',input);}
  researchLegalLibrary(eventId:string,input:LegalResearchInput){return this.postJson<LegalResearchResult>('/events/'+encodeURIComponent(eventId)+'/legal-library/research',input);}
  async getCourtCases(eventId: string) {
    const res = await this.listCourtCases(eventId);
    return { ok: res.ok, data: res.data?.items, error: res.error };
  }

  async updateCourtCase(
    eventId: string,
    courtCaseId: string,
    payload: UpdateCourtCaseStatusRequest
  ) {
    return this.updateCourtCaseStatus(eventId, courtCaseId, payload);
  }

  async addCourtParty(
    eventId: string,
    courtCaseId: string,
    payload: AddCourtCasePartyRequest
  ) {
    return this.addCourtCaseParty(eventId, courtCaseId, payload);
  }

  async addCourtCharge(
    eventId: string,
    courtCaseId: string,
    payload: CreateChargeRequest
  ) {
    return this.createCourtCharge(eventId, courtCaseId, payload);
  }

  // ============================================================================
  // Operational Tasking
  // ============================================================================

  async listTasks(
    eventId: string,
    query?: Record<string, any>
  ): Promise<{ ok: boolean; data?: OperationalTaskItem[]; error?: string }> {
    const qs = query ? `?${new URLSearchParams(query as any).toString()}` : '';
    return this.fetchJson<OperationalTaskItem[]>(`/events/${eventId}/tasks${qs}`);
  }

  async listMyWork(
    eventId: string,
    query?: { view?: 'personal' | 'unit' | 'event' | 'requested' | 'approval'; unitId?: string; kind?:MyWorkKind; page?: number; limit?: number }
  ): Promise<{ ok: boolean; data?: MyWorkResponse; error?: string }> {
    const params = new URLSearchParams();
    if (query?.view) params.set('view', query.view);
    if (query?.kind) params.set('kind',query.kind);
    if (query?.unitId) params.set('unitId', query.unitId);
    if (query?.page) params.set('page', String(query.page));
    if (query?.limit) params.set('limit', String(query.limit));
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.fetchJson<MyWorkResponse>(`/events/${eventId}/tasks/my-work${qs}`);
  }

  async getTask(
    eventId: string,
    taskId: string
  ): Promise<{ ok: boolean; data?: OperationalTaskDetail; error?: string }> {
    return this.fetchJson<OperationalTaskDetail>(`/events/${eventId}/tasks/${taskId}`);
  }

  async createTask(
    eventId: string,
    payload: CreateOperationalTaskRequest
  ): Promise<{ ok: boolean; data?: OperationalTaskDetail; error?: string }> {
    return this.postJson<OperationalTaskDetail>(`/events/${eventId}/tasks`, payload);
  }

  async updateTask(
    eventId: string,
    taskId: string,
    payload: UpdateOperationalTaskRequest
  ): Promise<{ ok: boolean; data?: OperationalTaskDetail; error?: string }> {
    return this.patchJson<OperationalTaskDetail>(`/events/${eventId}/tasks/${taskId}`, payload);
  }

  async assignTask(
    eventId: string,
    taskId: string,
    payload: AssignOperationalTaskRequest
  ): Promise<{ ok: boolean; data?: OperationalTaskDetail; error?: string }> {
    return this.postJson<OperationalTaskDetail>(`/events/${eventId}/tasks/${taskId}/assign`, payload);
  }

  async acknowledgeTask(
    eventId: string,
    taskId: string
  ): Promise<{ ok: boolean; data?: OperationalTaskDetail; error?: string }> {
    return this.postJson<OperationalTaskDetail>(`/events/${eventId}/tasks/${taskId}/acknowledge`, {});
  }

  async startTask(
    eventId: string,
    taskId: string
  ): Promise<{ ok: boolean; data?: OperationalTaskDetail; error?: string }> {
    return this.postJson<OperationalTaskDetail>(`/events/${eventId}/tasks/${taskId}/start`, {});
  }

  async blockTask(
    eventId: string,
    taskId: string,
    payload: BlockOperationalTaskRequest
  ): Promise<{ ok: boolean; data?: OperationalTaskDetail; error?: string }> {
    return this.postJson<OperationalTaskDetail>(`/events/${eventId}/tasks/${taskId}/block`, payload);
  }

  async completeTask(
    eventId: string,
    taskId: string,
    payload?: { completionNote?: string }
  ): Promise<{ ok: boolean; data?: OperationalTaskDetail; error?: string }> {
    return this.postJson<OperationalTaskDetail>(`/events/${eventId}/tasks/${taskId}/complete`, payload ?? {});
  }

  async cancelTask(
    eventId: string,
    taskId: string,
    payload?: { reason?: string }
  ): Promise<{ ok: boolean; data?: OperationalTaskDetail; error?: string }> {
    return this.postJson<OperationalTaskDetail>(`/events/${eventId}/tasks/${taskId}/cancel`, payload ?? {});
  }

  async reopenTask(
    eventId: string,
    taskId: string,
    payload: ReopenOperationalTaskRequest
  ): Promise<{ ok: boolean; data?: OperationalTaskDetail; error?: string }> {
    return this.postJson<OperationalTaskDetail>(`/events/${eventId}/tasks/${taskId}/reopen`, payload);
  }

  // ============================================================================
  // Medical Response Operations
  // ============================================================================

  async listMedicalEncounters(
    eventId: string,
    query?: Record<string, any>
  ): Promise<{ ok: boolean; data?: MedicalEncounterItem[]; error?: string }> {
    const qs = query ? `?${new URLSearchParams(query as any).toString()}` : '';
    return this.fetchJson<MedicalEncounterItem[]>(`/events/${eventId}/medical${qs}`);
  }

  async getMedicalEncounter(
    eventId: string,
    encounterId: string
  ): Promise<{ ok: boolean; data?: MedicalEncounterDetail; error?: string }> {
    return this.fetchJson<MedicalEncounterDetail>(`/events/${eventId}/medical/${encounterId}`);
  }

  async getMedicalSummary(
    eventId: string
  ): Promise<{ ok: boolean; data?: MedicalOperationalSummaryResponse; error?: string }> {
    return this.fetchJson<MedicalOperationalSummaryResponse>(`/events/${eventId}/medical/operational-summary`);
  }

  async createMedicalEncounter(
    eventId: string,
    payload: CreateMedicalEncounterRequest
  ): Promise<{ ok: boolean; data?: MedicalEncounterDetail; error?: string }> {
    return this.postJson<MedicalEncounterDetail>(`/events/${eventId}/medical`, payload);
  }

  async updateMedicalEncounter(
    eventId: string,
    encounterId: string,
    payload: UpdateMedicalEncounterRequest
  ): Promise<{ ok: boolean; data?: MedicalEncounterDetail; error?: string }> {
    return this.patchJson<MedicalEncounterDetail>(`/events/${eventId}/medical/${encounterId}`, payload);
  }

  async triageMedicalEncounter(
    eventId: string,
    encounterId: string,
    payload: TriageEncounterRequest
  ): Promise<{ ok: boolean; data?: MedicalEncounterDetail; error?: string }> {
    return this.postJson<MedicalEncounterDetail>(`/events/${eventId}/medical/${encounterId}/triage`, payload);
  }

  async addMedicalObservation(
    eventId: string,
    encounterId: string,
    payload: AddMedicalObservationRequest
  ): Promise<{ ok: boolean; data?: MedicalObservation; error?: string }> {
    return this.postJson<MedicalObservation>(`/events/${eventId}/medical/${encounterId}/observations`, payload);
  }

  async addMedicalIntervention(
    eventId: string,
    encounterId: string,
    payload: AddMedicalInterventionRequest
  ): Promise<{ ok: boolean; data?: MedicalIntervention; error?: string }> {
    return this.postJson<MedicalIntervention>(`/events/${eventId}/medical/${encounterId}/interventions`, payload);
  }

  async stabilizeMedicalEncounter(
    eventId: string,
    encounterId: string
  ): Promise<{ ok: boolean; data?: MedicalEncounterDetail; error?: string }> {
    return this.postJson<MedicalEncounterDetail>(`/events/${eventId}/medical/${encounterId}/stabilize`, {});
  }

  async receiveMedicalEncounter(
    eventId: string,
    encounterId: string
  ): Promise<{ ok: boolean; data?: MedicalEncounterDetail; error?: string }> {
    return this.postJson<MedicalEncounterDetail>(`/events/${eventId}/medical/${encounterId}/receive`, {});
  }

  async transferMedicalEncounter(
    eventId: string,
    encounterId: string,
    payload: TransferEncounterRequest
  ): Promise<{ ok: boolean; data?: MedicalEncounterDetail; error?: string }> {
    return this.postJson<MedicalEncounterDetail>(`/events/${eventId}/medical/${encounterId}/transfer`, payload);
  }

  async closeMedicalEncounter(
    eventId: string,
    encounterId: string,
    payload?: CloseEncounterRequest
  ): Promise<{ ok: boolean; data?: MedicalEncounterDetail; error?: string }> {
    return this.postJson<MedicalEncounterDetail>(`/events/${eventId}/medical/${encounterId}/close`, payload ?? {});
  }

  // ============================================================================
  // Observer & Evaluation Operations
  // ============================================================================

  async listEvaluationObjectives(
    eventId: string,
    query?: Record<string, any>
  ): Promise<{ ok: boolean; data?: EvaluationObjective[]; error?: string }> {
    const qs = query ? `?${new URLSearchParams(query as any).toString()}` : '';
    return this.fetchJson<EvaluationObjective[]>(`/events/${eventId}/evaluation/objectives${qs}`);
  }

  async createEvaluationObjective(
    eventId: string,
    payload: CreateEvaluationObjectiveRequest
  ): Promise<{ ok: boolean; data?: EvaluationObjective; error?: string }> {
    return this.postJson<EvaluationObjective>(`/events/${eventId}/evaluation/objectives`, payload);
  }

  async createEvaluationCriterion(
    eventId: string,
    objectiveId: string,
    payload: CreateEvaluationCriterionRequest
  ): Promise<{ ok: boolean; data?: EvaluationCriterion; error?: string }> {
    return this.postJson<EvaluationCriterion>(`/events/${eventId}/evaluation/objectives/${objectiveId}/criteria`, payload);
  }

  async listEvaluationObservations(
    eventId: string,
    query?: Record<string, any>
  ): Promise<{ ok: boolean; data?: EvaluationObservationItem[]; error?: string }> {
    const qs = query ? `?${new URLSearchParams(query as any).toString()}` : '';
    return this.fetchJson<EvaluationObservationItem[]>(`/events/${eventId}/evaluation/observations${qs}`);
  }

  async createEvaluationObservation(
    eventId: string,
    payload: CreateEvaluationObservationRequest
  ): Promise<{ ok: boolean; data?: EvaluationObservationDetail; error?: string }> {
    return this.postJson<EvaluationObservationDetail>(`/events/${eventId}/evaluation/observations`, payload);
  }

  async updateEvaluationObservation(
    eventId: string,
    observationId: string,
    payload: UpdateEvaluationObservationRequest
  ): Promise<{ ok: boolean; data?: EvaluationObservationDetail; error?: string }> {
    return this.patchJson<EvaluationObservationDetail>(`/events/${eventId}/evaluation/observations/${observationId}`, payload);
  }

  async getAfterActionReview(
    eventId: string
  ): Promise<{ ok: boolean; data?: AfterActionReviewResponse; error?: string }> {
    return this.fetchJson<AfterActionReviewResponse>(`/events/${eventId}/evaluation/after-action`);
  }

  async lockEvaluation(
    eventId: string,
    payload?: LockEvaluationRequest
  ): Promise<{ ok: boolean; data?: { locked: boolean; lockedAt: string }; error?: string }> {
    return this.postJson<{ locked: boolean; lockedAt: string }>(`/events/${eventId}/evaluation/lock`, payload ?? {});
  }

  async publishEvaluation(
    eventId: string,
    payload?: PublishEvaluationRequest
  ): Promise<{ ok: boolean; data?: { published: boolean; publishedAt: string }; error?: string }> {
    return this.postJson<{ published: boolean; publishedAt: string }>(`/events/${eventId}/evaluation/publish`, payload ?? {});
  }

  // ============================================================================
  // Command & Crisis Management Operations
  // ============================================================================

  async getOperationalPicture(
    eventId: string
  ): Promise<{ ok: boolean; data?: OperationalPictureResponse; error?: string }> {
    return this.fetchJson<OperationalPictureResponse>(`/events/${eventId}/command/operational-picture`);
  }

  async createSitrep(
    eventId: string,
    payload: CreateSitrepRequest
  ): Promise<{ ok: boolean; data?: DocumentItem; error?: string }> {
    return this.postJson<DocumentItem>(`/events/${eventId}/command/sitrep`, payload);
  }

  async getDefcon(eventId: string): Promise<{ ok: boolean; data?: CommandDefconSnapshot; error?: string }> {
    return this.fetchJson<CommandDefconSnapshot>(`/events/${eventId}/command/defcon`);
  }
  async getCommandReadiness(eventId: string): Promise<{ ok: boolean; data?: CommandReadinessSnapshot; error?: string; status?: number }> {
    return this.fetchJson<CommandReadinessSnapshot>(`/events/${eventId}/command/readiness`);
  }

  async changeDefcon(
    eventId: string,
    payload: ChangeCommandDefconRequest
  ): Promise<{ ok: boolean; data?: CommandDefconSnapshot; error?: string }> {
    return this.postJson<CommandDefconSnapshot>(`/events/${eventId}/command/defcon`, payload);
  }

  async listOperationalHolds(eventId: string): Promise<{ok:boolean; data?:OperationalHold[]; error?:string}> {
    return this.fetchJson<OperationalHold[]>('/events/' + encodeURIComponent(eventId) + '/operational-holds');
  }
  async getOperationalHoldsCurrent(eventId: string): Promise<{ok:boolean; data?:CurrentOperationalHolds; error?:string}> {
    return this.fetchJson<CurrentOperationalHolds>('/events/' + encodeURIComponent(eventId) + '/operational-holds/current');
  }
  async createOperationalHold(eventId: string, payload: CreateOperationalHold): Promise<{ok:boolean; data?:OperationalHold; error?:string}> {
    return this.postJson<OperationalHold>('/events/' + encodeURIComponent(eventId) + '/operational-holds', payload);
  }
  async restoreOperationalHold(eventId: string, holdId: string, payload: RestoreOperationalHold): Promise<{ok:boolean; data?:OperationalHold; error?:string}> {
    return this.postJson<OperationalHold>('/events/' + encodeURIComponent(eventId) + '/operational-holds/' + encodeURIComponent(holdId) + '/restore', payload);
  }

  async listDisruptions(eventId: string): Promise<{ ok: boolean; data?: DisruptionSnapshot[]; error?: string }> {
    return this.fetchJson<DisruptionSnapshot[]>(`/events/${eventId}/disruptions`);
  }

  async getDisruptionStatus(eventId: string): Promise<{ ok: boolean; data?: ParticipantDisruptionStatus; error?: string }> {
    return this.fetchJson<ParticipantDisruptionStatus>(`/events/${eventId}/disruptions/status`);
  }

  async getServiceStatus(eventId: string): Promise<{ ok: boolean; data?: ServiceStatusResponse; error?: string }> {
    return this.fetchJson<ServiceStatusResponse>(`/events/${eventId}/service-status`);
  }

  async startDisruption(
    eventId: string,
    payload: CreateDisruptionRequest
  ): Promise<{ ok: boolean; data?: DisruptionSnapshot; error?: string }> {
    return this.postJson<DisruptionSnapshot>(`/events/${eventId}/disruptions`, payload);
  }

  async restoreDisruption(
    eventId: string,
    disruptionId: string,
    payload: RestoreDisruptionRequest
  ): Promise<{ ok: boolean; data?: DisruptionSnapshot; error?: string }> {
    return this.postJson<DisruptionSnapshot>(`/events/${eventId}/disruptions/${disruptionId}/restore`, payload);
  }

  async listRecoveryObjectives(eventId: string): Promise<{ ok: boolean; data?: RecoveryObjective[]; error?: string }> {
    return this.fetchJson<RecoveryObjective[]>(`/events/${eventId}/disruptions/recovery-objectives`);
  }
  async createRecoveryObjective(eventId: string, payload: CreateRecoveryObjectiveRequest): Promise<{ ok: boolean; data?: RecoveryObjective; error?: string }> {
    return this.postJson<RecoveryObjective>(`/events/${eventId}/disruptions/recovery-objectives`, payload);
  }
  async publishRecoveryObjective(eventId: string, objectiveId: string, expectedRevision: number): Promise<{ ok: boolean; data?: RecoveryObjective; error?: string }> {
    return this.postJson<RecoveryObjective>(`/events/${eventId}/disruptions/recovery-objectives/${objectiveId}/publish`, { expectedRevision });
  }
  async reviewRecoveryObjective(eventId: string, objectiveId: string, payload: RecoveryObjectiveReviewRequest): Promise<{ ok: boolean; data?: RecoveryObjective; error?: string }> {
    return this.postJson<RecoveryObjective>(`/events/${eventId}/disruptions/recovery-objectives/${objectiveId}/review`, payload);
  }
  async restoreRecoveryObjective(eventId: string, objectiveId: string, payload: RecoveryObjectiveRestoreRequest): Promise<{ ok: boolean; data?: RecoveryObjective; error?: string }> {
    return this.postJson<RecoveryObjective>(`/events/${eventId}/disruptions/recovery-objectives/${objectiveId}/restore`, payload);
  }
  async submitRecoveryReport(eventId: string, objectiveId: string, payload: RecoveryReportRequest): Promise<{ ok: boolean; data?: RecoveryReport; error?: string }> {
    return this.postJson<RecoveryReport>(`/events/${eventId}/disruptions/recovery-objectives/${objectiveId}/reports`, payload);
  }
  async listRecoveryReports(eventId: string, objectiveId: string): Promise<{ ok: boolean; data?: RecoveryReport[]; error?: string }> {
    return this.fetchJson<RecoveryReport[]>(`/events/${eventId}/disruptions/recovery-objectives/${objectiveId}/reports`);
  }
  async listRecoveryArtifacts(eventId: string, objectiveId: string): Promise<{ ok: boolean; data?: RecoveryArtifact[]; error?: string }> {
    return this.fetchJson<RecoveryArtifact[]>(`/events/${eventId}/disruptions/recovery-objectives/${objectiveId}/artifacts`);
  }
  async createRecoveryArtifact(eventId: string, objectiveId: string, payload: Omit<CreateRecoveryArtifactRequest, 'objectiveId'>): Promise<{ ok: boolean; data?: RecoveryArtifact; error?: string }> {
    return this.postJson<RecoveryArtifact>(`/events/${eventId}/disruptions/recovery-objectives/${objectiveId}/artifacts`, payload);
  }
  async publishRecoveryArtifact(eventId: string, objectiveId: string, artifactId: string, expectedRevision: number): Promise<{ ok: boolean; data?: RecoveryArtifact; error?: string }> {
    return this.postJson<RecoveryArtifact>(`/events/${eventId}/disruptions/recovery-objectives/${objectiveId}/artifacts/${artifactId}/publish`, { expectedRevision });
  }

  // ============================================================================
  // User Preferences
  // ============================================================================

  async getUserPreferences(): Promise<{ ok: boolean; data?: UserPreferences; error?: string }> {
    return this.fetchJson<UserPreferences>('/preferences/me');
  }

  async updateUserPreferences(payload: UpdateUserPreferences): Promise<{ ok: boolean; data?: UserPreferences; error?: string }> {
    return this.patchJson<UserPreferences>('/preferences/me', payload);
  }

  // ============================================================================
  // Notifications
  // ============================================================================

  handoffExerciseAdvice(eventId:string,runId:string,input:ExerciseAdviceHandoffInput){return this.postJson<StoredExerciseAdvice>('/events/'+encodeURIComponent(eventId)+'/command/excon/intelligence/history/'+encodeURIComponent(runId)+'/handoff',input);}
  getExerciseObserverHistory(eventId:string,signal?:AbortSignal){return this.fetchJson<ExerciseObserverHistory>('/events/'+encodeURIComponent(eventId)+'/command/excon/intelligence/observer-history',signal);}
  listExerciseJobs(eventId:string,signal?:AbortSignal){return this.fetchJson<ExerciseJob[]>('/events/'+encodeURIComponent(eventId)+'/command/excon/intelligence/jobs',signal);}
  submitExerciseJob(eventId:string,input:ExerciseJobSubmit){return this.postJson<ExerciseJob>('/events/'+encodeURIComponent(eventId)+'/command/excon/intelligence/jobs',input);}
  cancelExerciseJob(eventId:string,jobId:string){return this.postJson<ExerciseJob>('/events/'+encodeURIComponent(eventId)+'/command/excon/intelligence/jobs/'+encodeURIComponent(jobId)+'/cancel',{});}
  setupExerciseInjects(eventId:string,runId:string,input:ExerciseInjectSetupInput){return this.postJson<StoredExerciseAdvice>('/events/'+encodeURIComponent(eventId)+'/command/excon/intelligence/history/'+encodeURIComponent(runId)+'/setup-injects',input);}
  setupExerciseTeams(eventId:string,runId:string,input:ExerciseTeamSetupInput){return this.postJson<StoredExerciseAdvice>('/events/'+encodeURIComponent(eventId)+'/command/excon/intelligence/history/'+encodeURIComponent(runId)+'/setup-teams',input);}
  setupExercisePhases(eventId:string,runId:string,input:ExercisePhaseSetupInput){return this.postJson<StoredExerciseAdvice>('/events/'+encodeURIComponent(eventId)+'/command/excon/intelligence/history/'+encodeURIComponent(runId)+'/setup-phases',input);}
  getExerciseAdviceHistory(eventId:string,signal?:AbortSignal){return this.fetchJson<StoredExerciseAdvice[]>('/events/'+encodeURIComponent(eventId)+'/command/excon/intelligence/history',signal);}
  reviewExerciseAdvice(eventId:string,runId:string,input:ExerciseAdviceDecision){return this.postJson<StoredExerciseAdvice>('/events/'+encodeURIComponent(eventId)+'/command/excon/intelligence/history/'+encodeURIComponent(runId)+'/review',input);}
  getExerciseBlueprint(eventId:string,signal?:AbortSignal){return this.fetchJson<ExerciseBlueprintOverview>('/events/'+encodeURIComponent(eventId)+'/command/excon/blueprint',signal);}
  saveExerciseBlueprint(eventId:string,input:ExerciseBlueprintInput){return this.postJson<ExerciseBlueprint>('/events/'+encodeURIComponent(eventId)+'/command/excon/blueprint',input);}
  getExerciseIntelligence(eventId:string,signal?:AbortSignal){
    return this.fetchJson<ExerciseIntelligenceOverview>('/events/'+encodeURIComponent(eventId)+'/command/excon/intelligence',signal);
  }
  requestExerciseAdvice(eventId:string,input:ExerciseAdviceInput){
    return this.postJson<ExerciseAdviceResult>('/events/'+encodeURIComponent(eventId)+'/command/excon/intelligence/advice',input);
  }
  getExconDashboard(eventId:string,signal?:AbortSignal) {
    return this.fetchJson<ExconDashboardResponse>('/events/'+encodeURIComponent(eventId)+'/command/excon',signal);
  }

  getExerciseBroadcastPlans(eventId:string) {
    return this.fetchJson<ExerciseBroadcastPlanResponse[]>('/events/'+encodeURIComponent(eventId)+'/notifications/plans');
  }
  createExerciseBroadcastPlan(eventId:string,body:ExerciseBroadcastPlanInput) {
    return this.postJson<ExerciseBroadcastPlanResponse>('/events/'+encodeURIComponent(eventId)+'/notifications/plans',body);
  }
  reviseExerciseBroadcastPlan(eventId:string,id:string,body:ExerciseBroadcastPlanRevision) {
    return this.patchJson<ExerciseBroadcastPlanResponse>('/events/'+encodeURIComponent(eventId)+'/notifications/plans/'+encodeURIComponent(id),body);
  }
  scheduleExerciseBroadcastPlan(eventId:string,id:string,revision:number,scheduledAt:string) {
    return this.postJson<ExerciseBroadcastPlanResponse>('/events/'+encodeURIComponent(eventId)+'/notifications/plans/'+encodeURIComponent(id)+'/schedule',{revision,scheduledAt});
  }
  cancelExerciseBroadcastPlan(eventId:string,id:string,revision:number) {
    return this.postJson<ExerciseBroadcastPlanResponse>('/events/'+encodeURIComponent(eventId)+'/notifications/plans/'+encodeURIComponent(id)+'/cancel',{revision});
  }

  getExerciseBroadcastTeams(eventId: string) {
    return this.fetchJson<Array<{id: string; name: string}>>('/events/' + encodeURIComponent(eventId) + '/notifications/teams');
  }
  previewExerciseBroadcastAudience(eventId: string, query: ExerciseBroadcastAudienceQuery) {
    const params = new URLSearchParams({audience: query.audience, kind: query.kind});
    if (query.unitId) params.set('unitId', query.unitId);
    return this.fetchJson<{eligible:number;kind:string;audience:string;unitId:string|null}>(
      '/events/' + encodeURIComponent(eventId) + '/notifications/audience?' + params.toString());
  }
  sendExerciseBroadcast(eventId: string, payload: ExerciseBroadcastRequest) {
    return this.postJson<ExerciseBroadcastReceipt>(
      '/events/' + encodeURIComponent(eventId) + '/notifications/broadcasts', payload);
  }
  listExerciseBroadcasts(eventId: string) {
    return this.fetchJson<ExerciseBroadcastHistory>(
      '/events/' + encodeURIComponent(eventId) + '/notifications/broadcasts');
  }

  async getNotifications(eventId?: string): Promise<{ ok: boolean; data?: NotificationListResponse; error?: string }> {
    const q = eventId ? `?eventId=${encodeURIComponent(eventId)}` : '';
    return this.fetchJson<NotificationListResponse>(`/notifications${q}`);
  }

  async markNotificationRead(id: string): Promise<{ ok: boolean; error?: string }> {
    return this.patchJson<{ success: boolean }>(`/notifications/${id}/read`, { read: true });
  }

  async markAllNotificationsRead(eventId?: string): Promise<{ ok: boolean; error?: string }> {
    const q = eventId ? `?eventId=${encodeURIComponent(eventId)}` : '';
    return this.postJson<{ success: boolean }>(`/notifications/mark-all-read${q}`, {});
  }

  async dismissNotification(id: string): Promise<{ ok: boolean; error?: string }> {
    return this.deleteJson<{ success: boolean }>(`/notifications/${id}`);
  }

  // ============================================================================
  // Identity Provider Settings & Public Auth
  // ============================================================================

  async listIdentityProviders(): Promise<{ ok: boolean; data?: IdentityProviderSummary[]; error?: string }> {
    return this.fetchJson<IdentityProviderSummary[]>('/admin/settings/identity');
  }

  async loginLdap(payload: LdapAuthRequest) {
    return this.postJson<unknown>('/auth/ldap/login', payload);
  }

  async listPlatformAdmins(query: string) {
    return this.fetchJson<{ accounts: PlatformAdminAccount[]; hasMore: boolean }>(
      `/admin/platform-administrators?q=${encodeURIComponent(query)}`);
  }

  async setPlatformAdmin(userId: string, enabled: boolean) {
    return this.putJson<{ ok: boolean }>(`/admin/platform-administrators/${userId}`, { enabled });
  }

  async listLdapTeamAccounts(eventId: string|undefined, query: string, unassigned: boolean, status: 'ALL'|'ACTIVE'|'DISABLED'='ALL', page = 1) {
    const params = new URLSearchParams({ q: query, unassigned: String(unassigned && Boolean(eventId)), page: String(page) });
    if(eventId)params.set('eventId',eventId);
    if(status!=='ALL')params.set('status',status);
    return this.fetchJson<{ accounts: LdapTeamAccount[]; hasMore: boolean }>(`/admin/settings/identity/ldap/accounts?${params}`);
  }

  async setLdapTeamAssignment(identityId: string, eventId: string, assignment: LdapTeamAssignment) {
    return this.putJson<{ ok: boolean }>(`/admin/settings/identity/ldap/accounts/${identityId}/events/${eventId}`, assignment);
  }

  async setLdapAccountEnabled(identityId: string, enabled: boolean, reason: string) {
    return this.patchJson<{userId:string;status:'ACTIVE'|'DISABLED';changed:boolean}>(
      `/admin/settings/identity/ldap/accounts/${encodeURIComponent(identityId)}/status`,
      { enabled, reason }
    );
  }

  async saveLdapProvider(payload: { id?: string; name: string; config: LdapConfig; bindPassword?: string }): Promise<{ ok: boolean; data?: IdentityProviderSummary; error?: string }> {
    return this.postJson<IdentityProviderSummary>('/admin/settings/identity/ldap', payload);
  }

  async saveOidcProvider(payload: { id?: string; name: string; config: OidcConfig; clientSecret?: string }): Promise<{ ok: boolean; data?: IdentityProviderSummary; error?: string }> {
    return this.postJson<IdentityProviderSummary>('/admin/settings/identity/oidc', payload);
  }

  async toggleIdentityProvider(id: string, enabled: boolean): Promise<{ ok: boolean; data?: IdentityProviderSummary; error?: string }> {
    return this.patchJson<IdentityProviderSummary>(`/admin/settings/identity/${id}/toggle`, { enabled });
  }

  async testIdentityProvider(id: string): Promise<{ ok: boolean; data?: { ok: boolean; mode: 'CONFIGURATION'; networkChecked: false; message: string }; error?: string }> {
    return this.postJson<{ ok: boolean; mode: 'CONFIGURATION'; networkChecked: false; message: string }>(`/admin/settings/identity/${id}/test`, { mode: 'CONFIGURATION' });
  }

  async deleteIdentityProvider(id: string): Promise<{ ok: boolean; error?: string }> {
    return this.deleteJson<{ success: boolean }>(`/admin/settings/identity/${id}`);
  }

  async getPublicAuthProviders(): Promise<{ ok: boolean; data?: Array<{ id: string; name: string; category: string; displayName: string }>; error?: string }> {
    return this.fetchJson<Array<{ id: string; name: string; category: string; displayName: string }>>('/auth/providers');
  }

  private async deleteJson<T>(path: string): Promise<{ ok: boolean; data?: T; error?: string }> {
    try {
      const res = await this.request(`${this.baseUrl}${path}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const errJson = (await res.json().catch(() => ({}))) as { message?: string };
        return { ok: false, error: errJson.message || `HTTP ${res.status}` };
      }
      // A successful DELETE commonly returns HTTP 204 with an empty body.
      // Treat that as success; parse JSON only when the server actually sends it.
      const raw = await res.text();
      const data = raw ? (JSON.parse(raw) as T) : undefined;
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}

export const apiClient = new CyrisApiClient();

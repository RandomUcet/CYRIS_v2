'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { useDialogAccessibility } from '@/hooks/useDialogAccessibility';
import { RecordHeader } from '@/components/common/RecordHeader';
import { RecordTabs, TabItem } from '@/components/common/RecordTabs';
import { RecordInspector } from '@/components/common/RecordInspector';
import { RecordIdentifier, StatusBadge, PriorityBadge } from '@/components/common/Badges';
import { TimelineView } from '@/components/common/TimelineView';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  Cpu,
  CheckCircle2,
  Clock,
  Layers,
  ArrowRight,
  HardDrive,
  Hash,
  FileText,
  AlertTriangle,
  Play,
  Check,
  Award,
  Plus,
  X,
  Share2,
  Shield,
  Download,
} from 'lucide-react';
import type {
  ForensicAnalysisDetailDto,
  ForensicFindingDto,
  ForensicAcquisitionDto,
  TechnicalIndicatorDto,
  ForensicFindingType,
  VerificationState,
} from '@cyris/contracts';

export default function ForensicAnalysisDetailPage() {
  const {eventId,analysisId}=useParams<{eventId:string;analysisId:string}>();
  const {currentUser,viewAs,loading}=useAuth();
  if(loading)return <AppShell><LoadingState/></AppShell>;
  return <ForensicWorkspace key={JSON.stringify([eventId,analysisId,currentUser?.user.id,viewAs?.id,currentUser?.memberships.find(m=>m.eventId===eventId)?.permissions])} eventId={eventId} analysisId={analysisId}/>;
}
function ForensicWorkspace({eventId,analysisId}:{eventId:string;analysisId:string}){
  const router=useRouter();
  const {viewAs}=useAuth();
  const { formatTime, locale } = usePreferences();
  const cs=locale==='cs';
  const tr=(cz:string,en:string)=>cs?cz:en;

  const [activeTab, setActiveTab] = useState<'overview' | 'evidence' | 'findings' | 'indicators' | 'acquisitions' | 'documents' | 'timeline' | 'relations'>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [analysis, setAnalysis] = useState<ForensicAnalysisDetailDto | null>(null);
  const [timelineItems, setTimelineItems] = useState<any[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [relationships, setRelationships] = useState<any[]>([]);

  // Workflow Editor State
  const [methodology, setMethodology] = useState('');
  const [findingsText, setFindingsText] = useState('');
  const [conclusion, setConclusion] = useState('');
  const [savingOverview, setSavingOverview] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [handoffOpen,setHandoffOpen]=useState(false);
  const [handoffLoading,setHandoffLoading]=useState(false);
  const [handoffSaving,setHandoffSaving]=useState(false);
  const [handoffError,setHandoffError]=useState<string|null>(null);
  const [handoffCandidates,setHandoffCandidates]=useState<Array<{id:string;displayName:string}>>([]);
  const [handoffTarget,setHandoffTarget]=useState('');
  const [handoffReason,setHandoffReason]=useState('');

  // Modal: Add Finding
  const [showFindingModal, setShowFindingModal] = useState(false);
  const [findingForm, setFindingForm] = useState<{
    findingType: string;
    title: string;
    description: string;
    confidence: 'CONFIRMED' | 'PROBABLE' | 'SUSPECTED' | 'UNVERIFIED';
  }>({
    findingType: 'ARTIFACT',
    title: '',
    description: '',
    confidence: 'CONFIRMED',
  });
  const [findingSubmitting, setFindingSubmitting] = useState(false);

  // Modal: Add Acquisition
  const [showAcquisitionModal, setShowAcquisitionModal] = useState(false);
  const [acquisitionForm, setAcquisitionForm] = useState<{
    acquisitionType: 'PHYSICAL' | 'LOGICAL' | 'TARGETED' | 'MEMORY_DUMP' | 'TRIAGE';
    toolName: string;
    toolVersion: string;
    hashAlgorithm: string;
    sourceHash: string;
    imageHash: string;
    storageReference: string;
    notes: string;
  }>({
    acquisitionType: 'PHYSICAL',
    toolName: '',
    toolVersion: '',
    hashAlgorithm: 'SHA256',
    sourceHash: '',
    imageHash: '',
    storageReference: '',
    notes: '',
  });
  const [acqSubmitting, setAcqSubmitting] = useState(false);
  useDialogAccessibility(showFindingModal || showAcquisitionModal, () => { if (!findingSubmitting && !acqSubmitting) { setShowFindingModal(false); setShowAcquisitionModal(false); } });

  // Permissions
  const canAccept=!viewAs&&!!analysis?.actions?.accept;
  const canWork=!viewAs&&!!analysis?.actions?.work&&['ACCEPTED','IN_PROGRESS'].includes(analysis?.status??'');
  const canComplete=!viewAs&&!!analysis?.actions?.complete;
  const canApprove=!viewAs&&!!analysis?.actions?.approve;
  const canReassign=!viewAs&&!!analysis?.actions?.reassign;
  const reportDirty=!!analysis&&canWork&&(methodology!==(analysis.methodology??'')||findingsText!==(analysis.findings??'')||conclusion!==(analysis.conclusion??''));
  const handoffBlocked=reportDirty||savingOverview||actionLoading||findingSubmitting||acqSubmitting;

  async function openHandoff(){
    if(!canReassign||handoffBlocked||handoffLoading)return;
    setHandoffOpen(true);setHandoffLoading(true);setHandoffError(null);setHandoffCandidates([]);setHandoffTarget('');setHandoffReason('');
    try{
      const res=await apiClient.listForensicReassignmentCandidates(eventId,analysisId);
      if(!res.ok||!res.data)throw new Error(res.error||tr('Nelze načíst analytiky.','Unable to load examiners.'));
      setHandoffCandidates(res.data);
    }catch(err){setHandoffError(err instanceof Error?err.message:tr('Chyba připojení.','Connection error.'));}
    finally{setHandoffLoading(false);}
  }

  async function submitHandoff(e:React.FormEvent){
    e.preventDefault();
    if(!analysis||!canReassign||handoffBlocked||handoffSaving||!handoffCandidates.some(c=>c.id===handoffTarget)||!handoffReason.trim())return;
    setHandoffSaving(true);setHandoffError(null);
    try{
      const res=await apiClient.reassignForensicAnalysis(eventId,analysisId,{assignedToUserId:handoffTarget,expectedUpdatedAt:analysis.updatedAt,reason:handoffReason.trim()});
      if(!res.ok||!res.data)throw new Error(res.error||tr('Předání se nezdařilo.','Handover failed.'));
      setAnalysis(res.data);setMethodology(res.data.methodology??'');setFindingsText(res.data.findings??'');setConclusion(res.data.conclusion??'');setHandoffOpen(false);
    }catch(err){setHandoffError(err instanceof Error?err.message:tr('Chyba připojení.','Connection error.'));}
    finally{setHandoffSaving(false);}
  }

  const fetchAnalysisDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getForensicAnalysis(eventId, analysisId);
      if (res.ok && res.data) {
        setAnalysis(res.data);
        setMethodology(res.data.methodology || '');
        setFindingsText(res.data.findings || '');
        setConclusion(res.data.conclusion || '');
      } else {
        setError(res.error || 'Failed to load forensic analysis');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const fetchTimeline = async () => {
    setTimelineLoading(true);
    try {
      const res = await apiClient.getResourceTimeline(analysisId);
      if (res.ok && res.data) {
        setTimelineItems(Array.isArray(res.data) ? res.data : []);
      }
    } catch (err) {
      console.error('Failed to load forensics timeline', err);
    } finally {
      setTimelineLoading(false);
    }
  };

  const fetchRelationships = async () => {
    try {
      const res = await apiClient.getRelationships(analysisId);
      if (res.ok && res.data) {
        setRelationships(Array.isArray(res.data) ? res.data : []);
      }
    } catch (err) {
      console.error('Failed to load relationships', err);
    }
  };

  useEffect(() => {
    if (eventId && analysisId) {
      fetchAnalysisDetails();
    }
  }, [eventId, analysisId]);

  useEffect(() => {
    if (analysisId && activeTab === 'timeline') {
      fetchTimeline();
    } else if (analysisId && activeTab === 'relations') {
      fetchRelationships();
    }
  }, [analysisId, activeTab]);

  const handleUpdateStatus = async (status: string) => {
    setActionLoading(true);
    try {
      const res = await apiClient.updateForensicStatus(eventId, analysisId, {
        status: status as any,
        ...(status==='COMPLETED'&&canWork?{methodology,findings:findingsText,conclusion}:{}),
      });
      if (res.ok && res.data) {
        setAnalysis(res.data);
      } else {
        alert(res.error || `Failed to transition analysis to ${status}`);
      }
    } catch (err: any) {
      alert(err.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveOverview = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!canWork||savingOverview)return;
    setSavingOverview(true);
    try {
      const res = await apiClient.updateForensicAnalysis(eventId, analysisId, {
        methodology: methodology.trim() || undefined,
        findings: findingsText.trim() || undefined,
        conclusion: conclusion.trim() || undefined,
      });
      if (res.ok && res.data) {
        setAnalysis(res.data);
        setMethodology(res.data.methodology??'');setFindingsText(res.data.findings??'');setConclusion(res.data.conclusion??'');
        alert('Analysis notes saved successfully');
      } else {
        alert(res.error || 'Failed to save notes');
      }
    } catch (err: any) {
      alert(err.message || 'Network error');
    } finally {
      setSavingOverview(false);
    }
  };

  const handleCreateFinding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!findingForm.title.trim() || !findingForm.description.trim()) {
      alert('Title and description are required');
      return;
    }
    setFindingSubmitting(true);
    try {
      const res = await apiClient.createForensicFinding(eventId, analysisId, {
        findingType: findingForm.findingType,
        title: findingForm.title.trim(),
        description: findingForm.description.trim(),
        confidence: findingForm.confidence,
      });
      if (res.ok) {
        setShowFindingModal(false);
        setFindingForm({
          findingType: 'ARTIFACT',
          title: '',
          description: '',
          confidence: 'CONFIRMED',
        });
        fetchAnalysisDetails();
      } else {
        alert(res.error || 'Failed to add finding');
      }
    } catch (err: any) {
      alert(err.message || 'Network error');
    } finally {
      setFindingSubmitting(false);
    }
  };

  const handleCreateAcquisition = async (e: React.FormEvent) => {
    e.preventDefault();
    setAcqSubmitting(true);
    try {
      const res = await apiClient.createForensicAcquisition(eventId, analysisId, {
        acquisitionType: acquisitionForm.acquisitionType,
        toolName: acquisitionForm.toolName || undefined,
        toolVersion: acquisitionForm.toolVersion || undefined,
        hashAlgorithm: acquisitionForm.hashAlgorithm,
        sourceHash: acquisitionForm.sourceHash || undefined,
        imageHash: acquisitionForm.imageHash || undefined,
        storageReference: acquisitionForm.storageReference || undefined,
        notes: acquisitionForm.notes || undefined,
      });
      if (res.ok) {
        setShowAcquisitionModal(false);
        fetchAnalysisDetails();
      } else {
        alert(res.error || 'Failed to add acquisition record');
      }
    } catch (err: any) {
      alert(err.message || 'Network error');
    } finally {
      setAcqSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AppShell
        breadcrumbs={[
          { label: 'Event', href: `/events/${eventId}/overview` },
          { label: 'Forensics', href: `/events/${eventId}/forensics` },
        ]}
      >
        <LoadingState message="Loading forensic analysis details..." />
      </AppShell>
    );
  }

  if (error || !analysis) {
    return (
      <AppShell
        breadcrumbs={[
          { label: 'Event', href: `/events/${eventId}/overview` },
          { label: 'Forensics', href: `/events/${eventId}/forensics` },
        ]}
      >
        <ErrorState message={error || 'Analysis record not found'} onRetry={fetchAnalysisDetails} />
      </AppShell>
    );
  }

  const tabs: TabItem[] = [
    { id: 'overview', label: 'Overview', icon: <Cpu size={14} /> },
    {
      id: 'evidence',
      label: 'Evidence & Devices',
      count: (analysis.evidenceLinks?.length || 0) + (analysis.deviceLinks?.length || 0),
      icon: <HardDrive size={14} />,
    },
    {
      id: 'findings',
      label: 'Findings',
      count: analysis.findingsList?.length || 0,
      icon: <CheckCircle2 size={14} />,
    },
    {
      id: 'acquisitions',
      label: 'Acquisitions / Hashes',
      count: analysis.acquisitions?.length || 0,
      icon: <Shield size={14} />,
    },
    { id: 'documents', label: 'Documents', icon: <FileText size={14} /> },
    { id: 'timeline', label: 'Timeline', icon: <Clock size={14} /> },
    { id: 'relations', label: 'Relations', count: relationships.length, icon: <Share2 size={14} /> },
  ];

  return (
    <AppShell
      breadcrumbs={[
        { label: 'Event', href: `/events/${eventId}/overview` },
        { label: 'Forensics', href: `/events/${eventId}/forensics` },
        { label: analysis.analysisNumber, href: `/events/${eventId}/forensics/${analysis.id}` },
      ]}
    >
      <div className="workspace-container">
        {/* Record Header */}
        <RecordHeader
          identifier={analysis.analysisNumber}
          title={analysis.purpose || `${analysis.analysisType.replace(/_/g, ' ')} Analysis`}
          status={analysis.status}
          priority={analysis.priority}
          owningUnit={analysis.unitName??'Digital Forensics'}
          lead={analysis.analystName??'Unassigned'}
          leadLabel="Examiner"
          dates={[
            { label: 'Requested', value: formatTime(analysis.requestedAt) },
            ...(analysis.startedAt
              ? [{ label: 'Started', value: formatTime(analysis.startedAt) }]
              : []),
            ...(analysis.completedAt
              ? [{ label: 'Completed', value: formatTime(analysis.completedAt) }]
              : []),
          ]}
          actions={
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {analysis.reportAvailable&&<Link className="btn btn-secondary" href={'/events/'+eventId+'/forensics/'+analysisId+'/print'}
                target="_blank" rel="noopener noreferrer">Vytisknout forenzní zprávu</Link>}
              {analysis.status === 'REQUESTED' && canAccept && (
                <button
                  className="btn btn-primary"
                  onClick={() => handleUpdateStatus('ACCEPTED')}
                  disabled={actionLoading||handoffSaving}
                >
                  <Check size={14} style={{ marginRight: '6px' }} />
                  Accept Analysis Request
                </button>
              )}
              {analysis.status === 'ACCEPTED' && canWork && (
                <button
                  className="btn btn-primary"
                  onClick={() => handleUpdateStatus('IN_PROGRESS')}
                  disabled={actionLoading||handoffSaving}
                >
                  <Play size={14} style={{ marginRight: '6px' }} />
                  Start Examination
                </button>
              )}
              {analysis.status === 'IN_PROGRESS' && canComplete && (
                <button
                  className="btn btn-primary"
                  onClick={() => handleUpdateStatus('COMPLETED')}
                  disabled={actionLoading||handoffSaving}
                >
                  <CheckCircle2 size={14} style={{ marginRight: '6px' }} />
                  Complete Analysis
                </button>
              )}
              {analysis.status === 'COMPLETED' && canApprove && (
                <button
                  className="btn btn-primary"
                  onClick={() => handleUpdateStatus('APPROVED')}
                  disabled={actionLoading||handoffSaving}
                  style={{ background: 'var(--color-success)', borderColor: 'var(--color-success)' }}
                >
                  <Award size={14} style={{ marginRight: '6px' }} />
                  Approve Forensic Report
                </button>
              )}
            </div>
          }
        />

        {canReassign&&<section className="card" style={{padding:16,marginBottom:16}} aria-label={tr('Předání analýzy','Analysis handover')}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
            <div><strong>{tr('Odpovědný analytik','Assigned examiner')}</strong><div style={{fontSize:13,color:'var(--color-text-dim)'}}>{analysis.analystName??tr('Nepřiděleno','Unassigned')} · {analysis.unitName??tr('Forenzní pracoviště','Forensic unit')}</div></div>
            {!handoffOpen&&<button type="button" className="btn btn-secondary" disabled={handoffBlocked} onClick={openHandoff}>{tr('Předat analýzu','Hand over analysis')}</button>}
          </div>
          {reportDirty&&<p style={{fontSize:13}}>{tr('Před předáním nejprve uložte rozepsaný protokol.','Save your report draft before handing over the analysis.')}</p>}
          {handoffOpen&&<form onSubmit={submitHandoff} style={{display:'grid',gap:12,marginTop:12}}>
            <p style={{margin:0,fontSize:13}}>{tr('Předáním uvnitř týmu zůstávají zachovány stav, uložené nálezy a protokol. Nový analytik obdrží oznámení.','Handover within the team preserves status, saved findings and report. The new examiner receives a notification.')}</p>
            {handoffLoading?<p role="status">{tr('Načítám dostupné analytiky…','Loading eligible examiners…')}</p>:<>
              <label className="field-label" htmlFor="handoff-examiner">{tr('Nový analytik','New examiner')}</label>
              <select id="handoff-examiner" className="field-input" value={handoffTarget} onChange={e=>setHandoffTarget(e.target.value)} required disabled={handoffSaving||!handoffCandidates.length}>
                <option value="">{tr('Vyberte analytika','Select examiner')}</option>{handoffCandidates.map(c=><option key={c.id} value={c.id}>{c.displayName}</option>)}
              </select>
              {!handoffCandidates.length&&!handoffError&&<p>{tr('V týmu není jiný oprávněný analytik.','No other eligible examiner in this team.')}</p>}
              <label className="field-label" htmlFor="handoff-reason">{tr('Důvod předání','Reason for handover')}</label>
              <textarea id="handoff-reason" className="field-input" rows={2} maxLength={1000} required value={handoffReason} onChange={e=>setHandoffReason(e.target.value)} disabled={handoffSaving}/>
            </>}
            {handoffError&&<p role="alert" style={{color:'var(--color-danger)'}}>{handoffError}</p>}
            <div style={{display:'flex',justifyContent:'flex-end',gap:8,flexWrap:'wrap'}}>
              <button type="button" className="btn btn-secondary" disabled={handoffSaving||handoffLoading} onClick={()=>setHandoffOpen(false)}>{tr('Zrušit','Cancel')}</button>
              <button type="submit" className="btn btn-primary" disabled={handoffLoading||handoffSaving||handoffBlocked||!handoffTarget||!handoffReason.trim()}>{handoffSaving?tr('Předávám…','Handing over…'):tr('Potvrdit předání','Confirm handover')}</button>
            </div>
          </form>}
        </section>}

        {/* Record Tabs */}
        <RecordTabs
          tabs={tabs}
          activeTab={activeTab}
          onChange={(t) => setActiveTab(t as any)}
        />

        {/* Tab Content */}
        <div style={{ marginTop: '16px' }}>
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="forensic-overview-grid">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="card" style={{ padding: '20px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-bright)', marginBottom: '12px' }}>
                    Forensic Examination Summary
                  </h3>
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-dim)', marginBottom: '4px' }}>
                      Purpose & Tasking
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--color-text-bright)' }}>
                      {analysis.purpose || 'None provided'}
                    </div>
                  </div>

                  <form onSubmit={handleSaveOverview}>
                    {!canWork&&<p role="status" style={{fontSize:13,color:'var(--color-text-dim)',marginBottom:14}}>{analysis.status==='REQUESTED'?tr('Žádanka čeká na převzetí. Odborný report lze upravit až po převzetí a s příslušným oprávněním.','Request awaits acceptance. Report editing requires acceptance and the appropriate permission.'):tr('Report je v tomto stavu nebo pro vaši roli pouze ke čtení.','Report is read-only in this state or for your role.')}</p>}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div>
                        <label className="forensic-report-label" htmlFor="forensic-methodology">Methodology & Toolchain</label>
                        <textarea
                          id="forensic-methodology" className="field-input forensic-report-field"
                          rows={5}
                          value={methodology}
                          onChange={(e) => setMethodology(e.target.value)}
                          placeholder="e.g. Write blocker acquisition, Volatility 3 memory triage, Autopsy keyword indexing..."
                          disabled={!canWork||handoffSaving}
                        />
                      </div>

                      <div>
                        <label className="forensic-report-label" htmlFor="forensic-findings">Technical Findings & Artifacts Summary</label>
                        <textarea
                          id="forensic-findings" className="field-input forensic-report-field"
                          rows={6}
                          value={findingsText}
                          onChange={(e) => setFindingsText(e.target.value)}
                          placeholder="Summary of detected user artifacts, deleted files, network beacons, or malware signatures..."
                          disabled={!canWork||handoffSaving}
                        />
                      </div>

                      <div>
                        <label className="forensic-report-label" htmlFor="forensic-conclusion">Forensic Conclusion / Opinion</label>
                        <textarea
                          id="forensic-conclusion" className="field-input forensic-report-field"
                          rows={5}
                          value={conclusion}
                          onChange={(e) => setConclusion(e.target.value)}
                          placeholder="Final opinion of the forensic examiner regarding authenticity, intent, and timeline consistency..."
                          disabled={!canWork||handoffSaving}
                        />
                      </div>

                      {canWork && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <button type="submit" className="btn btn-secondary" disabled={savingOverview||!canWork||handoffSaving}>
                            {savingOverview ? 'Saving...' : 'Save Overview Notes'}
                          </button>
                        </div>
                      )}
                    </div>
                  </form>
                </div>
              </div>

              {/* Sidebar Inspector */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="card" style={{ padding: '16px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-bright)', marginBottom: '12px' }}>
                    Analysis Metadata
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-text-dim)' }}>Type:</span>
                      <span style={{ fontWeight: 500 }}>{analysis.analysisType}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-text-dim)' }}>Status:</span>
                      <StatusBadge status={analysis.status} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-text-dim)' }}>Priority:</span>
                      <PriorityBadge priority={analysis.priority} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-text-dim)' }}>Findings count:</span>
                      <span style={{ fontWeight: 500 }}>{analysis.findingsList?.length || 0}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-text-dim)' }}>Acquisitions:</span>
                      <span style={{ fontWeight: 500 }}>{analysis.acquisitions?.length || 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: EVIDENCE & DEVICES */}
          {activeTab === 'evidence' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="card" style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-bright)', marginBottom: '12px' }}>
                  Target Evidence Items
                </h3>
                {analysis.evidenceLinks && analysis.evidenceLinks.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {analysis.evidenceLinks.map((ev) => (
                      <div
                        key={ev.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          borderRadius: '4px',
                          background: 'var(--color-bg-surface)',
                          border: '1px solid var(--color-border-subtle)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <HardDrive size={16} style={{ color: 'var(--color-accent-ops)' }} />
                          <div>
                            <div style={{ fontWeight: 500 }}>
                              <RecordIdentifier value={ev.evidenceNumber} /> {ev.description}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>
                              Status: {ev.status}
                            </div>
                          </div>
                        </div>
                        <Link href={`/events/${eventId}/evidence/${ev.id}`} className="btn btn-secondary btn-sm">
                          View Evidence
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '13px', color: 'var(--color-text-dim)' }}>
                    No target evidence items directly linked.
                  </div>
                )}
              </div>

              <div className="card" style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-bright)', marginBottom: '12px' }}>
                  Target Devices
                </h3>
                {analysis.deviceLinks && analysis.deviceLinks.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {analysis.deviceLinks.map((dev) => (
                      <div
                        key={dev.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          borderRadius: '4px',
                          background: 'var(--color-bg-surface)',
                          border: '1px solid var(--color-border-subtle)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <Cpu size={16} style={{ color: 'var(--color-accent-ops)' }} />
                          <div>
                            <div style={{ fontWeight: 500 }}>{dev.name}</div>
                            <div style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>
                              Type: {dev.deviceType}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '13px', color: 'var(--color-text-dim)' }}>
                    No target devices directly linked.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: FINDINGS */}
          {activeTab === 'findings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text-bright)' }}>
                    Structured Forensic Findings
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--color-text-dim)' }}>
                    Individually verified digital artifacts, signatures, and timeline correlations.
                  </p>
                </div>
                {analysis.status !== 'APPROVED' && (
                  <button className="btn btn-primary" disabled={!canWork||handoffSaving} onClick={() => setShowFindingModal(true)}>
                    <Plus size={14} style={{ marginRight: '6px' }} />
                    Add Finding
                  </button>
                )}
              </div>

              {analysis.findingsList && analysis.findingsList.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {analysis.findingsList.map((f) => (
                    <div
                      key={f.id}
                      className="card"
                      style={{ padding: '16px', borderLeft: '3px solid var(--color-accent-ops)' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span className="badge badge-info" style={{ fontSize: '11px' }}>
                              {f.findingType}
                            </span>
                            <StatusBadge status={f.confidence} />
                          </div>
                          <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-bright)' }}>
                            {f.title}
                          </h4>
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>
                          {formatTime(f.createdAt)}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: '13px',
                          color: 'var(--color-text-dim)',
                          marginTop: '8px',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {f.description}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No Structured Findings Recorded"
                  description="Examiners can record granular findings, file correlations, and persistence mechanisms."
                  action={
                    analysis.status !== 'APPROVED' ? (
                      <button className="btn btn-primary btn-sm" disabled={!canWork||handoffSaving} onClick={() => setShowFindingModal(true)}>
                        <Plus size={14} style={{ marginRight: '6px' }} />
                        Add Finding
                      </button>
                    ) : undefined
                  }
                />
              )}
            </div>
          )}

          {/* TAB 4: ACQUISITIONS & HASHES */}
          {activeTab === 'acquisitions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text-bright)' }}>
                    Forensic Acquisitions & Hash Verification
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--color-text-dim)' }}>
                    Cryptographic image verification, tool versions, and external storage pointers.
                  </p>
                </div>
                <button className="btn btn-primary" disabled={!canWork||handoffSaving} onClick={() => setShowAcquisitionModal(true)}>
                  <Plus size={14} style={{ marginRight: '6px' }} />
                  Record Acquisition
                </button>
              </div>

              {analysis.acquisitions && analysis.acquisitions.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {analysis.acquisitions.map((acq) => (
                    <div key={acq.id} className="card" style={{ padding: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--color-text-bright)' }}>
                          {acq.acquisitionType} Acquisition ({acq.toolName} {acq.toolVersion})
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>
                          Started: {formatTime(acq.startedAt)}
                        </span>
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                          gap: '12px',
                          background: 'var(--color-bg-surface)',
                          padding: '12px',
                          borderRadius: '4px',
                          fontFamily: 'monospace',
                          fontSize: '12px',
                        }}
                      >
                        <div>
                          <div style={{ color: 'var(--color-text-dim)', fontSize: '11px' }}>
                            SOURCE HASH ({acq.hashAlgorithm})
                          </div>
                          <div style={{ wordBreak: 'break-all', color: 'var(--color-text-bright)' }}>
                            {acq.sourceHash || 'N/A'}
                          </div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--color-text-dim)', fontSize: '11px' }}>
                            IMAGE HASH ({acq.hashAlgorithm})
                          </div>
                          <div
                            style={{
                              wordBreak: 'break-all',
                              color:
                                acq.sourceHash && acq.imageHash && acq.sourceHash === acq.imageHash
                                  ? 'var(--color-success)'
                                  : 'var(--color-text-bright)',
                            }}
                          >
                            {acq.imageHash || 'N/A'}
                          </div>
                        </div>
                      </div>

                      {acq.storageReference && (
                        <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--color-text-dim)' }}>
                          <strong>Storage Reference:</strong> {acq.storageReference}
                        </div>
                      )}
                      {acq.notes && (
                        <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--color-text-dim)' }}>
                          <strong>Notes:</strong> {acq.notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No Forensic Acquisitions Recorded"
                  description="Record physical or logical image hashes, external storage references, and acquisition tools."
                  action={
                    <button className="btn btn-primary btn-sm" disabled={!canWork||handoffSaving} onClick={() => setShowAcquisitionModal(true)}>
                      <Plus size={14} style={{ marginRight: '6px' }} />
                      Record Acquisition
                    </button>
                  }
                />
              )}
            </div>
          )}

          {/* TAB 5: DOCUMENTS */}
          {activeTab === 'documents' && (
            <div className="card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-bright)' }}>
                  Forensic Documents & Reports
                </h3>
                <Link href={`/events/${eventId}/documents`} className="btn btn-secondary btn-sm">
                  Document Registry
                </Link>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--color-text-dim)' }}>
                Official forensic reports, memory dumps analyses, and executive summaries stored in the unified document domain.
              </p>
            </div>
          )}

          {/* TAB 6: TIMELINE */}
          {activeTab === 'timeline' && (
            <div className="card" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-bright)', marginBottom: '14px' }}>
                Forensic Examination Timeline
              </h3>
              {timelineLoading ? (
                <LoadingState message="Loading timeline events..." />
              ) : timelineItems.length > 0 ? (
                <TimelineView items={timelineItems} />
              ) : (
                <EmptyState
                  title="No Timeline Events"
                  description="Timeline entries are recorded automatically as examinations progress."
                />
              )}
            </div>
          )}

          {/* TAB 7: RELATIONS */}
          {activeTab === 'relations' && (
            <div className="card" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-bright)', marginBottom: '14px' }}>
                Connected Resources
              </h3>
              {relationships.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {relationships.map((rel: any) => (
                    <div
                      key={rel.id}
                      style={{
                        padding: '10px 14px',
                        background: 'var(--color-bg-surface)',
                        borderRadius: '4px',
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>{rel.relationshipType}</span>
                      <span style={{ color: 'var(--color-text-dim)', fontSize: '12px' }}>
                        Target: {rel.targetResourceId}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No Direct Relationships"
                  description="Use Global Relationships to correlate this forensic examination with suspects, victims, or cases."
                />
              )}
            </div>
          )}
        </div>

        {/* Modal: Add Finding */}
        {showFindingModal && (
          <div className="modal-backdrop" role="presentation">
            <div className="modal-dialog" role="dialog" aria-modal="true" aria-label="Record Forensic Finding" style={{ maxWidth: '540px' }}>
              <div className="modal-header">
                <h3 className="modal-title">Record Forensic Finding</h3>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowFindingModal(false)}
                  style={{ padding: '4px' }}
                >
                  <X size={16} />
                </button>
              </div>
              <form onSubmit={handleCreateFinding}>
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label className="field-label">Finding Type *</label>
                      <select
                        className="field-input"
                        value={findingForm.findingType}
                        onChange={(e) =>
                          setFindingForm({ ...findingForm, findingType: e.target.value })
                        }
                      >
                        <option value="ARTIFACT">Digital Artifact</option>
                        <option value="COMMUNICATION">Network Communication</option>
                        <option value="MALWARE">Malware</option>
                        <option value="EXFILTRATION">Exfiltration Activity</option>
                        <option value="SYSTEM_LOG">System Log</option>
                        <option value="DELETED_FILE">Deleted File</option>
                        <option value="TIMELINE_EVENT">Timeline Event</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="field-label">Confidence</label>
                      <select
                        className="field-input"
                        value={findingForm.confidence}
                        onChange={(e) =>
                          setFindingForm({
                            ...findingForm,
                            confidence: e.target.value as any,
                          })
                        }
                      >
                        <option value="CONFIRMED">Confirmed</option>
                        <option value="PROBABLE">Probable</option>
                        <option value="SUSPECTED">Suspected</option>
                        <option value="UNVERIFIED">Unverified</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="field-label">Finding Title *</label>
                    <input
                      type="text"
                      className="field-input"
                      placeholder="e.g. Scheduled Task 'WindowsUpdateHealth' executing rundll32.exe"
                      value={findingForm.title}
                      onChange={(e) => setFindingForm({ ...findingForm, title: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <label className="field-label">Description & Technical Details *</label>
                    <textarea
                      className="field-input"
                      rows={4}
                      placeholder="Detailed location, registry key, process ancestry, or decoded command line..."
                      value={findingForm.description}
                      onChange={(e) => setFindingForm({ ...findingForm, description: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowFindingModal(false)}
                    disabled={findingSubmitting}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={findingSubmitting}>
                    {findingSubmitting ? 'Recording...' : 'Record Finding'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Add Acquisition */}
        {showAcquisitionModal && (
          <div className="modal-backdrop" role="presentation">
            <div className="modal-dialog" role="dialog" aria-modal="true" aria-label="Record Forensic Acquisition" style={{ maxWidth: '560px' }}>
              <div className="modal-header">
                <h3 className="modal-title">Record Forensic Acquisition</h3>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowAcquisitionModal(false)}
                  style={{ padding: '4px' }}
                >
                  <X size={16} />
                </button>
              </div>
              <form onSubmit={handleCreateAcquisition}>
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label className="field-label">Acquisition Type</label>
                      <select
                        className="field-input"
                        value={acquisitionForm.acquisitionType}
                        onChange={(e) => setAcquisitionForm({ ...acquisitionForm, acquisitionType: e.target.value as any })}
                      >
                        <option value="PHYSICAL">Physical Image</option>
                        <option value="LOGICAL">Logical Image</option>
                        <option value="TARGETED">Targeted Triage</option>
                        <option value="MEMORY_DUMP">Memory Dump</option>
                      </select>
                    </div>

                    <div>
                      <label className="field-label">Hash Algorithm</label>
                      <select
                        className="field-input"
                        value={acquisitionForm.hashAlgorithm}
                        onChange={(e) => setAcquisitionForm({ ...acquisitionForm, hashAlgorithm: e.target.value })}
                      >
                        <option value="SHA256">SHA-256</option>
                        <option value="SHA1">SHA-1</option>
                        <option value="MD5">MD5</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label className="field-label">Tool Name</label>
                      <input
                        type="text"
                        className="field-input"
                        value={acquisitionForm.toolName}
                        onChange={(e) => setAcquisitionForm({ ...acquisitionForm, toolName: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="field-label">Tool Version</label>
                      <input
                        type="text"
                        className="field-input"
                        value={acquisitionForm.toolVersion}
                        onChange={(e) => setAcquisitionForm({ ...acquisitionForm, toolVersion: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="field-label">Source Hash</label>
                    <input
                      type="text"
                      className="field-input"
                      placeholder="e.g. 8f4e2b..."
                      value={acquisitionForm.sourceHash}
                      onChange={(e) => setAcquisitionForm({ ...acquisitionForm, sourceHash: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="field-label">Acquired Image Hash (Verification)</label>
                    <input
                      type="text"
                      className="field-input"
                      placeholder="e.g. 8f4e2b..."
                      value={acquisitionForm.imageHash}
                      onChange={(e) => setAcquisitionForm({ ...acquisitionForm, imageHash: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="field-label">Storage Reference</label>
                    <input
                      type="text"
                      className="field-input"
                      placeholder="e.g. NAS-VOL1:/forensic_images/E-0001_raw.dd"
                      value={acquisitionForm.storageReference}
                      onChange={(e) => setAcquisitionForm({ ...acquisitionForm, storageReference: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="field-label">Notes</label>
                    <input
                      type="text"
                      className="field-input"
                      placeholder="Write-blocker model, sector count, transfer errors..."
                      value={acquisitionForm.notes}
                      onChange={(e) => setAcquisitionForm({ ...acquisitionForm, notes: e.target.value })}
                    />
                  </div>
                </div>

                <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowAcquisitionModal(false)}
                    disabled={acqSubmitting}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={acqSubmitting}>
                    {acqSubmitting ? 'Saving...' : 'Save Acquisition Record'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

'use client';

import type { LabAnalysisDetail } from '@cyris/contracts';
import React, { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { RecordHeader } from '@/components/common/RecordHeader';
import {ActionFeedback,type ActionMessage} from '@/components/common/ActionFeedback';
import { RecordTabs } from '@/components/common/RecordTabs';
import { RecordInspector } from '@/components/common/RecordInspector';
import { RecordIdentifier, StatusBadge } from '@/components/common/Badges';
import { TimelineView } from '@/components/common/TimelineView';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  FlaskConical,
  CheckCircle2,
  Clock,
  Layers,
  ArrowRight,
  FolderOpen,
  Briefcase,
  Play,
  Check,
  Award,
  AlertCircle,
  FileCheck,
} from 'lucide-react';

const STAGES = ['REQUESTED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'APPROVED'] as const;

export default function LabAnalysisDetailPage() {
  const {eventId,analysisId}=useParams<{eventId:string;analysisId:string}>();
  const {currentUser,viewAs,loading}=useAuth();
  if(loading)return <AppShell><LoadingState/></AppShell>;
  return <LabDetailWorkspace key={JSON.stringify([eventId,analysisId,currentUser?.user.id,viewAs?.id,currentUser?.memberships.find(m=>m.eventId===eventId)?.permissions])} eventId={eventId} analysisId={analysisId}/>;
}
function LabDetailWorkspace({eventId,analysisId}:{eventId:string;analysisId:string}){
  const router=useRouter();
  const { hasPermission, user, viewAs } = useAuth();
  const { formatTime, locale } = usePreferences();

  const [activeTab, setActiveTab] = useState<'workflow' | 'evidence' | 'timeline'>('workflow');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [analysisData, setAnalysisData] = useState<LabAnalysisDetail | null>(null);
  const [timelineItems, setTimelineItems] = useState<any[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  // Workflow Editor State
  const [method, setMethod] = useState('');
  const [findings, setFindings] = useState('');
  const [conclusion, setConclusion] = useState('');
  const [updating, setUpdating] = useState(false);
  const [actionMessage,setActionMessage]=useState<ActionMessage|null>(null);
  const fail=(message:string)=>setActionMessage({kind:'error',message});
  const success=(message:string)=>setActionMessage({kind:'success',message});
  const [showCorrection,setShowCorrection]=useState(false);
  const [correctionReason,setCorrectionReason]=useState('');
  const [correctionError,setCorrectionError]=useState('');
  const correctionTrigger=useRef<HTMLButtonElement>(null);
  const correctionField=useRef<HTMLTextAreaElement>(null);
  useEffect(()=>{if(showCorrection)correctionField.current?.focus();},[showCorrection]);
  const [rejectionReason,setRejectionReason]=useState('');
  const [showReject,setShowReject]=useState(false);
  const [receiptNotes,setReceiptNotes]=useState<Record<string,string>>({});
  const [receiptError,setReceiptError]=useState('');
  const [labUnits, setLabUnits] = useState<Array<{ id: string; name: string }>>([]);
  const [eligibleWorkers, setEligibleWorkers] = useState<Array<{ id: string; displayName: string }>>([]);
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [reassignReason, setReassignReason] = useState('');

  const cs = locale === 'cs';
  const canReassign = !viewAs && hasPermission('lab.reassign', eventId);
  const canCorrect = !viewAs && hasPermission('lab.correct', eventId);

  const fetchAnalysisDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getLabAnalysis(eventId, analysisId);
      if (res.ok && res.data) {
        setAnalysisData(res.data);
        setMethod(res.data.method || '');
        setFindings(res.data.findings || '');
        setConclusion(res.data.conclusion || '');
      } else {
        setError(res.error || 'Failed to load analysis record');
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
      console.error('Failed to load lab timeline', err);
    } finally {
      setTimelineLoading(false);
    }
  };

  useEffect(() => {
    if (eventId && analysisId) {
      fetchAnalysisDetails();
      apiClient.getLabUnits(eventId).then((res) => {
        if (res.ok && res.data) setLabUnits(res.data);
      });
    }
  }, [eventId, analysisId]);

  useEffect(() => {
    if (!selectedUnitId) {
      setEligibleWorkers([]);
      setSelectedWorkerId('');
      return;
    }
    apiClient.getLabWorkers(eventId, selectedUnitId).then((res) => {
      if (res.ok && res.data) setEligibleWorkers(res.data);
    });
  }, [eventId, selectedUnitId]);

  useEffect(() => {
    if (analysisId && activeTab === 'timeline') {
      fetchTimeline();
    }
  }, [analysisId, activeTab]);

  const handleStatusTransition = async (nextStatus: string) => {
    if(updating)return;
    if(nextStatus==='COMPLETED'&&!conclusion.trim()){setActiveTab('workflow');fail(cs?'Před dokončením vyplňte závěr reportu.':'Enter the report conclusion before completing.');return;}
    setActionMessage(null);setUpdating(true);
    try {
      const res = await apiClient.updateLabAnalysis(eventId, analysisId, {
        status: nextStatus,
        ...(nextStatus==='COMPLETED'?{method,findings,conclusion}:{}),
        ...(nextStatus==='REJECTED'?{notes:rejectionReason.trim()}:{}),
      });

      if (res.ok) {
        if(nextStatus==='REJECTED'){setShowReject(false);setRejectionReason('');}
        success(cs?'Stav žádanky byl změněn.':'Request status updated.');
        await fetchAnalysisDetails();
      } else {
        fail(res.error || (cs?'Změna stavu se nezdařila.':'Transition failed.'));
      }
    } catch (err: any) {
      fail(err.message||(cs?'Chyba připojení.':'Connection error.'));
    } finally {
      setUpdating(false);
    }
  };

  async function confirmReceipt(item:LabAnalysisDetail['evidenceItems'][number]){
    const condition=receiptNotes[item.id]?.trim();
    if(!condition||!item.pendingReceiptTransferId||updating||viewAs)return;
    setUpdating(true);setReceiptError('');
    try{
      const result=await apiClient.confirmLabSampleReceipt(eventId,analysisId,{evidenceId:item.id,transferId:item.pendingReceiptTransferId,condition});
      if(!result.ok)throw Error(result.error||'Receipt failed');
      setReceiptNotes(old=>({...old,[item.id]:''}));
      await fetchAnalysisDetails();
    }catch(error){setReceiptError(error instanceof Error?error.message:String(error));}
    finally{setUpdating(false);}
  }
  const handleSaveDraft = async () => {
    if(updating)return;
    setActionMessage(null);setUpdating(true);
    try {
      const res = await apiClient.updateLabAnalysis(eventId, analysisId, {
        method,
        findings,
        conclusion,
      });

      if (res.ok) {
        success(cs?'Rozpracovaný protokol byl uložen.':'Analysis draft saved.');
        await fetchAnalysisDetails();
      } else {
        fail(res.error || (cs?'Protokol se nepodařilo uložit.':'Failed to save analysis.'));
      }
    } catch (err: any) {
      fail(err.message||(cs?'Chyba připojení.':'Connection error.'));
    } finally {
      setUpdating(false);
    }
  };

  const closeCorrection=()=>{
    if(updating)return;
    setShowCorrection(false);
    setCorrectionError('');
    correctionTrigger.current?.focus();
  };
  const handleCorrection = async () => {
    if(updating||!canCorrect||!showCorrection)return;
    const reason=correctionReason.trim();
    if(reason.length<3){
      setCorrectionError(cs?'Uveďte důvod alespoň o třech znacích.':'Enter a reason of at least three characters.');
      correctionField.current?.focus();
      return;
    }
    setCorrectionError('');setActionMessage(null);setUpdating(true);
    try {
      const res = await apiClient.correctLabAnalysis(eventId, analysisId, { status:'REQUESTED', reason });
      if (!res.ok) {
        setCorrectionError(res.error || (cs?'Oprava se nezdařila.':'Correction failed.'));
        return;
      }
      setShowCorrection(false);setCorrectionReason('');
      success(cs?'Žádanka byla znovu otevřena.':'Request reopened.');
      await fetchAnalysisDetails();
    } catch(err) {
      setCorrectionError(err instanceof Error?err.message:(cs?'Chyba připojení.':'Connection error.'));
    } finally {
      setUpdating(false);
    }
  };

  const handleDistribute = async () => {
    if (!reassignReason.trim() || !selectedUnitId) return;
    setUpdating(true);
    try {
      const res = await apiClient.reassignLabAnalysis(eventId, analysisId, {
        assignedToUserId: null,
        assignedUnitId: selectedUnitId,
        reason: reassignReason.trim(),
      });
      if (res.ok) {
        setReassignReason('');
        await fetchAnalysisDetails();
      }
      else fail(res.error || (cs?'Přidělení se nezdařilo.':'Distribution failed.'));
    } finally {
      setUpdating(false);
    }
  };

  const handleReassign = async () => {
    if (!selectedUnitId || !selectedWorkerId || reassignReason.trim().length < 3) return;
    setUpdating(true);
    try {
      const res = await apiClient.reassignLabAnalysis(eventId, analysisId, {
        assignedUnitId: selectedUnitId,
        assignedToUserId: selectedWorkerId,
        reason: reassignReason.trim(),
      });
      if (res.ok) {
        setReassignReason('');
        await fetchAnalysisDetails();
      } else fail(res.error || (cs?'Přeřazení se nezdařilo.':'Reassignment failed.'));
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <AppShell
        breadcrumbs={[
          { label: 'Operations Support', href: `/events/${eventId}/lab` },
          { label: 'Laboratory', href: `/events/${eventId}/lab` },
          { label: 'Loading...' },
        ]}
      >
        <div style={{ padding: '40px' }}>
          <LoadingState message="Accessing laboratory protocol..." />
        </div>
      </AppShell>
    );
  }

  if (error || !analysisData) {
    return (
      <AppShell
        breadcrumbs={[
          { label: 'Operations Support', href: `/events/${eventId}/lab` },
          { label: 'Laboratory', href: `/events/${eventId}/lab` },
          { label: 'Error' },
        ]}
      >
        <div style={{ padding: '40px' }}>
          <ErrorState message={error || 'Analysis record not found'} onRetry={fetchAnalysisDetails} />
        </div>
      </AppShell>
    );
  }

  const currentStageIndex = STAGES.findIndex(stage => stage === analysisData.status);
  const evidenceItems: LabAnalysisDetail['evidenceItems'] = analysisData.evidenceItems ?? [];
  const actions: LabAnalysisDetail['actions'] = analysisData.actions;
  const canEdit = !viewAs && actions?.work && ['REQUESTED','ACCEPTED','IN_PROGRESS'].includes(analysisData.status);

  return (
    <AppShell
      breadcrumbs={[
        { label: 'Operations Support', href: `/events/${eventId}/lab` },
        { label: 'Laboratory', href: `/events/${eventId}/lab` },
        { label: analysisData.analysisNumber || analysisData.id },
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Record Header */}
        <RecordHeader
          identifier={analysisData.analysisNumber || analysisData.id}
          title={analysisData.analysisType || analysisData.analysisNumber}
          status={<StatusBadge status={analysisData.status} />}
          priority={<span className="badge badge-neutral">FORENSIC ANALYSIS</span>}
          classification={<span className="badge badge-neutral">LAB REPORT</span>}
          owningUnit={analysisData.unitName || '—'}
          lead={analysisData.analystName || '—'}
          actions={
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {analysisData.reportAvailable&&<Link className="btn btn-secondary" href={'/events/'+eventId+'/lab/'+analysisId+'/print'}
                target="_blank" rel="noopener noreferrer">Vytisknout laboratorní zprávu</Link>}
              <button
                onClick={() => setInspectorOpen(!inspectorOpen)}
                className={`btn ${inspectorOpen ? 'btn-secondary' : 'btn-ghost'}`}
                style={{ fontSize: '12px' }}
              >
                <Layers size={13} style={{ marginRight: '4px' }} />
                {inspectorOpen ? 'Hide' : 'Inspect'}
              </button>
              {canReassign && !analysisData.assignedToUserId && (
                <button onClick={handleDistribute} disabled={updating} className="btn btn-secondary">
                  Distribute to queue
                </button>
              )}
              {canCorrect && (
                <button ref={correctionTrigger} type="button" aria-expanded={showCorrection} aria-controls={showCorrection?'lab-correction-form':undefined} onClick={()=>{setShowCorrection(true);correctionField.current?.focus();}} disabled={updating} className="btn btn-secondary">
                  {cs?'Znovu otevřít / opravit':'Reopen / correct'}
                </button>
              )}
            </div>
          }
        />

        {canCorrect&&showCorrection&&<form id="lab-correction-form" aria-labelledby="lab-correction-title" aria-busy={updating} onSubmit={event=>{event.preventDefault();void handleCorrection();}} style={{padding:16,display:'grid',gap:8,borderBottom:'1px solid var(--color-border-subtle)'}}>
          <h2 id="lab-correction-title" style={{fontSize:14,margin:0}}>{cs?'Znovu otevřít žádanku':'Reopen request'}</h2>
          <p id="lab-correction-help" style={{margin:0,fontSize:13}}>{cs?'Stav se změní na Požadováno. Důvod opravy bude zaznamenán. Před potvrzením uložte případné rozepsané změny protokolu.':'The status will change to Requested. The correction reason will be recorded. Save any unsaved protocol edits before confirming.'}</p>
          <label htmlFor="lab-correction-reason">{cs?'Důvod opravy (povinný)':'Correction reason (required)'}</label>
          <textarea ref={correctionField} id="lab-correction-reason" className="input-field" rows={3} required minLength={3} disabled={updating} aria-invalid={!!correctionError} aria-describedby={'lab-correction-help'+(correctionError?' lab-correction-error':'')} value={correctionReason} onChange={event=>{setCorrectionReason(event.target.value);setCorrectionError('');}}/>
          {correctionError&&<p id="lab-correction-error" role="alert" style={{margin:0,overflowWrap:'anywhere'}}>{correctionError}</p>}
          <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
            <button type="button" className="btn btn-secondary" disabled={updating} onClick={closeCorrection}>{cs?'Zrušit':'Cancel'}</button>
            <button type="submit" className="btn btn-primary" disabled={updating}>{updating?(cs?'Ukládám…':'Saving…'):(cs?'Potvrdit znovuotevření':'Confirm reopening')}</button>
          </div>
        </form>}
        {canReassign && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '10px 24px', borderBottom: '1px solid var(--color-border-subtle)' }}>
            <select className="input-field" value={selectedUnitId} onChange={(e) => setSelectedUnitId(e.target.value)} aria-label="Destination laboratory">
              <option value="">Select destination laboratory</option>
              {labUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select>
            <select className="input-field" value={selectedWorkerId} onChange={(e) => setSelectedWorkerId(e.target.value)} disabled={!selectedUnitId} aria-label="Eligible laboratory worker">
              <option value="">Unassigned queue</option>
              {eligibleWorkers.map((worker) => <option key={worker.id} value={worker.id}>{worker.displayName}</option>)}
            </select>
            <input className="input-field" value={reassignReason} onChange={(e) => setReassignReason(e.target.value)} placeholder="Reason" aria-label="Reassignment reason" />
            <button onClick={selectedWorkerId ? handleReassign : handleDistribute} disabled={updating || !selectedUnitId || reassignReason.trim().length < 3} className="btn btn-secondary">
              {selectedWorkerId ? 'Reassign' : 'Place in queue'}
            </button>
          </div>
        )}

        {/* Lifecycle Stepper Bar */}
        <div
          style={{
            background: 'var(--color-bg-panel)',
            borderBottom: '1px solid var(--color-border-subtle)',
            padding: '12px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            overflowX: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {STAGES.map((stage, idx) => {
              const isPast = idx < currentStageIndex;
              const isCurrent = idx === currentStageIndex;
              const isFuture = idx > currentStageIndex;

              return (
                <React.Fragment key={stage}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      opacity: isFuture ? 0.45 : 1,
                    }}
                  >
                    <div
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '10px',
                        fontWeight: 700,
                        background: isCurrent
                          ? 'var(--color-accent-ops)'
                          : isPast
                          ? 'rgba(34, 197, 94, 0.2)'
                          : 'var(--color-bg-subtle)',
                        color: isCurrent
                          ? '#ffffff'
                          : isPast
                          ? 'var(--color-success)'
                          : 'var(--color-text-dim)',
                        border: isPast ? '1px solid var(--color-success)' : 'none',
                      }}
                    >
                      {isPast ? <Check size={12} /> : idx + 1}
                    </div>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: isCurrent ? 700 : 500,
                        letterSpacing: '0.04em',
                        color: isCurrent
                          ? 'var(--color-text-main)'
                          : isPast
                          ? 'var(--color-text-muted)'
                          : 'var(--color-text-dim)',
                      }}
                    >
                      {stage.replace('_', ' ')}
                    </span>
                  </div>
                  {idx < STAGES.length - 1 && (
                    <div
                      style={{
                        width: '24px',
                        height: '2px',
                        background: idx < currentStageIndex ? 'var(--color-success)' : 'var(--color-border-subtle)',
                      }}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Quick Lifecycle Action Button */}
          <div>
            {analysisData.status === 'REQUESTED' && !viewAs && actions?.accept && (
              <button
                onClick={() => handleStatusTransition('ACCEPTED')}
                disabled={updating}
                className="btn btn-primary"
                style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              >
                <CheckCircle2 size={13} />
                {cs ? 'Převzít požadavek' : 'Accept request'}
              </button>
            )}
            {analysisData.status==='REQUESTED'&&!viewAs&&actions?.accept&&<button type="button" className="btn btn-secondary" style={{marginLeft:8}} disabled={updating} onClick={()=>setShowReject(value=>!value)}>{cs?'Odmítnout vzorek':'Reject sample'}</button>}
            {analysisData.status === 'ACCEPTED' && !viewAs && actions?.work && (
              <button
                onClick={() => handleStatusTransition('IN_PROGRESS')}
                disabled={updating}
                className="btn btn-primary"
                style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              >
                <Play size={13} />
                {cs ? 'Zahájit rozbor' : 'Start analysis'}
              </button>
            )}
            {analysisData.status === 'IN_PROGRESS' && !viewAs && actions?.complete && (
              <button
                onClick={() => handleStatusTransition('COMPLETED')}
                disabled={updating}
                className="btn btn-primary"
                style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              >
                <FileCheck size={13} />
                {cs ? 'Dokončit rozbor' : 'Complete analysis'}
              </button>
            )}
            {analysisData.status === 'COMPLETED' && !viewAs && actions?.approve && (
              <button
                onClick={() => handleStatusTransition('APPROVED')}
                disabled={updating}
                className="btn btn-primary"
                style={{
                  fontSize: '11px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: 'var(--color-success)',
                  borderColor: 'var(--color-success)',
                }}
              >
                <Award size={13} />
                Approve & Certify Report
              </button>
            )}
            {analysisData.status === 'APPROVED' && (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--color-success)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Award size={14} /> CERTIFIED FORENSIC REPORT
              </span>
            )}
          </div>
        </div>
        {showReject&&analysisData.status==='REQUESTED'&&!viewAs&&actions?.accept&&<section style={{padding:16,borderBottom:'1px solid var(--border-default)',display:'grid',gap:8}}>
          <label htmlFor="lab-rejection-reason">{cs?'Důvod odmítnutí vzorku (viditelný žadateli)':'Sample rejection reason (visible to requester)'}</label>
          <textarea id="lab-rejection-reason" className="input-field" rows={3} maxLength={2000} value={rejectionReason} onChange={event=>setRejectionReason(event.target.value)} />
          <div style={{display:'flex',gap:8}}><button type="button" className="btn btn-secondary" disabled={updating} onClick={()=>setShowReject(false)}>{cs?'Zrušit':'Cancel'}</button><button type="button" className="btn btn-primary" disabled={updating||!rejectionReason.trim()} onClick={()=>void handleStatusTransition('REJECTED')}>{cs?'Potvrdit odmítnutí':'Confirm rejection'}</button></div>
        </section>}
        {analysisData.status==='REJECTED'&&<section style={{padding:16,borderBottom:'1px solid var(--border-default)'}}>
          <strong>{cs?'Důvod odmítnutí vzorku':'Sample rejection reason'}</strong>
          <p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{analysisData.rejectionReason||(cs?'Důvod u historického záznamu není dostupný.':'No reason available for this historical record.')}</p>
        </section>}

        <ActionFeedback message={actionMessage} busy={updating} onDismiss={()=>setActionMessage(null)}/>
        {/* Local Navigation Tabs */}
        <RecordTabs
          tabs={[
            { id: 'workflow', label: 'Protocol & Findings', icon: <FlaskConical size={14} /> },
            { id: 'evidence', label: 'Evidence Input', count: evidenceItems.length, icon: <FolderOpen size={14} /> },
            { id: 'timeline', label: 'Activity Timeline', count: timelineItems.length, icon: <Clock size={14} /> },
          ]}
          activeTab={activeTab}
          onChange={(tab) => setActiveTab(tab as any)}
        />

        {/* Main Body */}
        <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            {/* WORKFLOW TAB */}
            {activeTab === 'workflow' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Objective Card */}
                <div
                  style={{
                    background: 'var(--color-bg-surface)',
                    border: '1px solid var(--color-border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '16px 20px',
                  }}
                >
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: 'var(--color-text-dim)',
                      letterSpacing: '0.06em',
                      marginBottom: '8px',
                    }}
                  >
                    {cs ? 'Zadání' : 'Objective'}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--color-text-main)', lineHeight: '1.6' }}>
                    {analysisData.purpose || 'No explicit purpose documented upon request.'}
                  </div>
                </div>

                {/* Method & Findings Editor */}
                <div
                  style={{
                    background: 'var(--color-bg-surface)',
                    border: '1px solid var(--color-border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '18px 20px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '16px',
                    }}
                  >
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-main)' }}>
                      {cs ? 'Výsledek rozboru' : 'Analysis results'}
                    </span>
                    {canEdit && (
                      <button
                        onClick={handleSaveDraft}
                        disabled={updating}
                        className="btn btn-secondary"
                        style={{ fontSize: '11px' }}
                      >
                        {cs ? 'Uložit rozpracovaný výsledek' : 'Save draft'}
                      </button>
                    )}
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label htmlFor="lab-method" style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                      {cs ? 'Použitá metoda' : 'Method'}
                    </label>
                    <textarea id="lab-method"
                      rows={3}
                      placeholder="Describe the approved exercise analysis method"
                      value={method}
                      onChange={(e) => setMethod(e.target.value)}
                      readOnly={!canEdit}
                      className="input-field"
                      style={{ width: '100%', resize: 'vertical' }}
                    />
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label htmlFor="lab-findings" style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                      {cs ? 'Zjištění' : 'Findings'}
                    </label>
                    <textarea id="lab-findings"
                      rows={5}
                      placeholder="Record observations and findings from the sample"
                      value={findings}
                      onChange={(e) => setFindings(e.target.value)}
                      readOnly={!canEdit}
                      className="input-field"
                      style={{ width: '100%', resize: 'vertical' }}
                    />
                  </div>

                  <div>
                    <label htmlFor="lab-conclusion" style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                      {cs ? 'Závěr' : 'Conclusion'}
                    </label>
                    <textarea id="lab-conclusion"
                      rows={3}
                      placeholder="Summarize the result and its limitations"
                      value={conclusion}
                      onChange={(e) => setConclusion(e.target.value)}
                      readOnly={!canEdit}
                      className="input-field"
                      style={{ width: '100%', resize: 'vertical' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* EVIDENCE TAB */}
            {activeTab === 'evidence' && (
              <div>
                <div style={{ marginBottom: '14px', fontSize: '13px', color: 'var(--color-text-dim)' }}>
                  Target physical or digital item submitted for this laboratory protocol.
                </div>
                {receiptError&&<p role="alert">{receiptError}</p>}
                {evidenceItems.length?evidenceItems.map(item=><section key={item.id} style={{padding:12,border:'1px solid var(--border-default)',marginBottom:8,display:'grid',gap:8}}>
                  {item.canOpen===false?<div><strong>{item.evidenceNumber}</strong> · {item.title}<p style={{margin:'4px 0 0',fontSize:12}}>{cs?'Identifikace předaného vzorku; detail evidence vyžaduje samostatné oprávnění.':'Submitted sample identification; full evidence requires separate permission.'}</p></div>:
                    <Link className="btn btn-secondary" href={`/events/${eventId}/evidence/${item.id}`}><FolderOpen size={15}/><strong>{item.evidenceNumber}</strong> {item.title} <ArrowRight size={12}/></Link>}
                  {item.receipt?<div role="status"><strong>{cs?'Fyzické převzetí potvrzeno':'Physical receipt confirmed'}</strong><p style={{fontSize:13}}>{formatTime(item.receipt.receivedAt)} · {item.receipt.condition}</p></div>:
                    item.status==='IN_TRANSIT'&&<p>{cs?'Fyzické převzetí zatím nepotvrzeno.':'Physical receipt not confirmed.'}</p>}
                  {!viewAs&&item.pendingReceiptTransferId&&<div style={{display:'grid',gap:6}}>
                    <label htmlFor={'sample-condition-'+item.id}>{cs?'Skutečný stav přijatého vzorku':'Observed condition of received sample'}</label>
                    <textarea id={'sample-condition-'+item.id} className="input-field" rows={2} maxLength={2000} value={receiptNotes[item.id]??''} onChange={event=>setReceiptNotes(old=>({...old,[item.id]:event.target.value}))}/>
                    <button className="btn btn-primary" type="button" disabled={updating||!receiptNotes[item.id]?.trim()} onClick={()=>void confirmReceipt(item)}>{cs?'Potvrdit fyzické převzetí':'Confirm physical receipt'}</button>
                  </div>}
                </section>):<EmptyState title={cs?'Žádné dostupné vzorky':'No accessible evidence'}/>}

              </div>
            )}

            {/* TIMELINE TAB */}
            {activeTab === 'timeline' && (
              <div>
                <div style={{ marginBottom: '14px', fontSize: '13px', color: 'var(--color-text-dim)' }}>
                  Activity history and state transitions for analysis{' '}
                  <strong style={{ color: 'var(--color-text-main)' }}>{analysisData.analysisNumber}</strong>.
                </div>
                {timelineLoading ? (
                  <LoadingState message="Reconstructing laboratory timeline..." />
                ) : (
                  <TimelineView items={timelineItems} />
                )}
              </div>
            )}
          </div>

          {/* Contextual Right Inspector */}
          <RecordInspector
            title="Analysis Protocol Controls"
            isOpen={inspectorOpen}
            onClose={() => setInspectorOpen(false)}
            rows={[
              { label: 'Analysis Number', value: analysisData.analysisNumber || analysisData.id, copyable: true },
              { label: cs?'Žadatel':'Requester', value: analysisData.requesterName||'—' },
              { label: 'Lifecycle Stage', value: <StatusBadge status={analysisData.status} /> },
              { label: cs?'Žádající tým':'Requesting team', value: analysisData.requestingUnitName || '—' },
              { label: cs?'Odpovědná laboratoř':'Assigned laboratory', value: analysisData.unitName || '—' },
              { label: 'Analyst', value: analysisData.analystName || '—' },
              { label: 'Target Evidence', value: evidenceItems.map(item => item.evidenceNumber).join(', ') || '—' },
              { label: 'Requested At', value: formatTime(analysisData.createdAt) },
              { label: 'Last Modified', value: formatTime(analysisData.updatedAt || analysisData.createdAt) },
            ]}
          />
        </div>
      </div>
    </AppShell>
  );
}

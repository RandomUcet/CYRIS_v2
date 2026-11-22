'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { ResourcePicker } from '@/components/common/ResourcePicker';
import { CourtRequestsPanel } from '@/components/court/CourtRequestsPanel';
import { useDialogAccessibility } from '@/hooks/useDialogAccessibility';
import { RecordHeader } from '@/components/common/RecordHeader';
import { RecordTabs, TabItem } from '@/components/common/RecordTabs';
import { RecordIdentifier, StatusBadge } from '@/components/common/Badges';
import { TimelineView } from '@/components/common/TimelineView';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  Award,
  Users,
  AlertTriangle,
  Folder,
  Clock,
  FileText,
  CheckCircle2,
  Plus,
  X,
  Play,
  Check,
  Ban,
  Shield,
  Briefcase,
  ArrowRight,
  Gavel,
} from 'lucide-react';
import type {
  CourtCaseDetailDto,
  CourtCasePartyDto,
  ChargeDto,
  CourtExhibitDto,
  CourtHearingDto,
  CourtFilingDto,
  CourtDecisionDto,
  CourtPartyRole,
  CourtCaseStatus,
  ExhibitStatus,
  HearingStatus,
  CourtDecisionType,
} from '@cyris/contracts';

export default function CourtCaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventId = params.eventId as string;
  const courtCaseId = params.courtCaseId as string;
  const { hasPermission } = useAuth();
  const { formatTime, formatDate } = usePreferences();

  const [activeTab, setActiveTab] = useState<
    'overview' | 'parties' | 'charges' | 'exhibits' | 'hearings' | 'filings' | 'decisions' | 'timeline' | 'requests'
  >(searchParams.get('tab') === 'requests' ? 'requests' : 'overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [courtCase, setCourtCase] = useState<CourtCaseDetailDto | null>(null);
  const [timelineItems, setTimelineItems] = useState<any[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // Status transition loading
  const [actionLoading, setActionLoading] = useState(false);

  // Modals state
  const [showPartyModal, setShowPartyModal] = useState(false);
  const [partyForm, setPartyForm] = useState<{ personId: string; role: CourtPartyRole; representationNotes: string }>({
    personId: '',
    role: 'ACCUSED',
    representationNotes: '',
  });

  const [showChargeModal, setShowChargeModal] = useState(false);
  const [chargeForm, setChargeForm] = useState({ code: '', title: '', description: '' });

  const [showExhibitModal, setShowExhibitModal] = useState(false);
  const [exhibitForm, setExhibitForm] = useState({ evidenceId: '', documentId: '' });

  const [showHearingModal, setShowHearingModal] = useState(false);
  const [hearingForm, setHearingForm] = useState({ title: 'Preliminary Hearing', scheduledAt: '' });

  const [showFilingModal, setShowFilingModal] = useState(false);
  const [filingForm, setFilingForm] = useState({ documentId: '', filingType: 'MOTION' });

  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [decisionForm, setDecisionForm] = useState<{
    decisionType: CourtDecisionType;
    summary: string;
    reasoning: string;
  }>({
    decisionType: 'VERDICT_CONVICTION',
    summary: '',
    reasoning: '',
  });

  const [modalSubmitting, setModalSubmitting] = useState(false);
  useDialogAccessibility(showPartyModal || showChargeModal || showExhibitModal || showHearingModal || showFilingModal || showDecisionModal, () => { if (!modalSubmitting) { setShowPartyModal(false); setShowChargeModal(false); setShowExhibitModal(false); setShowHearingModal(false); setShowFilingModal(false); setShowDecisionModal(false); } });

  // Permissions
  const canUpdateCourt = hasPermission('court.update');
  const canManageCharges = hasPermission('court.charge.manage');
  const canSubmitExhibit = hasPermission('court.exhibit.submit');
  const canDecideExhibit = hasPermission('court.exhibit.decide');
  const canManageHearing = hasPermission('court.hearing.manage');
  const canCreateFiling = hasPermission('court.filing.create');
  const canCreateDecision = hasPermission('court.decision.create');
  const canReadRequests = hasPermission('court.request.read');

  const fetchCourtCaseDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getCourtCase(eventId, courtCaseId);
      if (res.ok && res.data) {
        setCourtCase(res.data);
      } else {
        setError(res.error || 'Failed to load court matter details');
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
      const res = await apiClient.getResourceTimeline(courtCaseId);
      if (res.ok && res.data) {
        setTimelineItems(Array.isArray(res.data) ? res.data : []);
      }
    } catch (err) {
      console.error('Failed to load court timeline', err);
    } finally {
      setTimelineLoading(false);
    }
  };

  useEffect(() => {
    if (eventId && courtCaseId) {
      fetchCourtCaseDetails();
    }
  }, [eventId, courtCaseId]);

  useEffect(() => {
    if (courtCaseId && activeTab === 'timeline') {
      fetchTimeline();
    }
  }, [courtCaseId, activeTab]);

  const handleUpdateStatus = async (status: CourtCaseStatus) => {
    setActionLoading(true);
    try {
      const res = await apiClient.updateCourtCase(eventId, courtCaseId, { status });
      if (res.ok && res.data) {
        setCourtCase(res.data);
      } else {
        alert(res.error || 'Failed to update matter status');
      }
    } catch (err: any) {
      alert(err.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Submit Modals Handlers
  const handleAddParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partyForm.personId.trim()) return alert('Party Resource ID is required');
    setModalSubmitting(true);
    try {
      const res = await apiClient.addCourtParty(eventId, courtCaseId, {
        partyResourceId: partyForm.personId.trim(),
        partyRole: partyForm.role,
        notes: partyForm.representationNotes.trim() || undefined,
      });
      if (res.ok) {
        setShowPartyModal(false);
        setPartyForm({ personId: '', role: 'ACCUSED', representationNotes: '' });
        fetchCourtCaseDetails();
      } else {
        alert(res.error || 'Failed to add party');
      }
    } catch (err: any) {
      alert(err.message || 'Action failed');
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleAddCharge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chargeForm.title.trim()) return alert('Charge title is required');
    setModalSubmitting(true);
    try {
      const res = await apiClient.addCourtCharge(eventId, courtCaseId, {
        code: chargeForm.code.trim() || undefined,
        title: chargeForm.title.trim(),
        description: chargeForm.description.trim() || 'Filed charge allegation specification',
      });
      if (res.ok) {
        setShowChargeModal(false);
        setChargeForm({ code: '', title: '', description: '' });
        fetchCourtCaseDetails();
      } else {
        alert(res.error || 'Failed to file charge');
      }
    } catch (err: any) {
      alert(err.message || 'Action failed');
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleSubmitExhibit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exhibitForm.evidenceId.trim()) return alert('Evidence ID is required');
    setModalSubmitting(true);
    try {
      const res = await apiClient.submitCourtExhibit(eventId, courtCaseId, {
        evidenceId: exhibitForm.evidenceId.trim(),
        documentId: exhibitForm.documentId.trim() || undefined,
      });
      if (res.ok) {
        setShowExhibitModal(false);
        setExhibitForm({ evidenceId: '', documentId: '' });
        fetchCourtCaseDetails();
      } else {
        alert(res.error || 'Failed to submit exhibit');
      }
    } catch (err: any) {
      alert(err.message || 'Action failed');
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleDecideExhibit = async (exhibitId: string, status: 'ADMITTED' | 'EXCLUDED') => {
    const reason = prompt(`Enter judicial reasoning for ${status} exhibit:`);
    if (reason === null) return;
    try {
      const res = await apiClient.decideCourtExhibit(eventId, courtCaseId, exhibitId, {
        status,
        decisionReason: reason.trim() || 'Judicial determination',
      });
      if (res.ok) {
        fetchCourtCaseDetails();
      } else {
        alert(res.error || 'Failed to decide exhibit');
      }
    } catch (err: any) {
      alert(err.message || 'Action failed');
    }
  };

  const handleScheduleHearing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hearingForm.title.trim() || !hearingForm.scheduledAt) return alert('Title and time required');
    setModalSubmitting(true);
    try {
      const res = await apiClient.createCourtHearing(eventId, courtCaseId, {
        title: hearingForm.title.trim(),
        scheduledAt: new Date(hearingForm.scheduledAt).toISOString(),
      });
      if (res.ok) {
        setShowHearingModal(false);
        setHearingForm({ title: 'Preliminary Hearing', scheduledAt: '' });
        fetchCourtCaseDetails();
      } else {
        alert(res.error || 'Failed to schedule hearing');
      }
    } catch (err: any) {
      alert(err.message || 'Action failed');
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleUpdateHearingStatus = async (hearingId: string, status: HearingStatus) => {
    try {
      const res = await apiClient.updateCourtHearingStatus(eventId, courtCaseId, hearingId, { status });
      if (res.ok) {
        fetchCourtCaseDetails();
      } else {
        alert(res.error || 'Failed to update hearing status');
      }
    } catch (err: any) {
      alert(err.message || 'Action failed');
    }
  };

  const handleCreateFiling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!filingForm.documentId.trim()) return alert('Document ID required');
    setModalSubmitting(true);
    try {
      const res = await apiClient.createCourtFiling(eventId, courtCaseId, {
        documentId: filingForm.documentId.trim(),
        filingType: filingForm.filingType,
      });
      if (res.ok) {
        setShowFilingModal(false);
        setFilingForm({ documentId: '', filingType: 'MOTION' });
        fetchCourtCaseDetails();
      } else {
        alert(res.error || 'Failed to record filing');
      }
    } catch (err: any) {
      alert(err.message || 'Action failed');
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleCreateDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decisionForm.summary.trim()) return alert('Decision summary is required');
    setModalSubmitting(true);
    try {
      const res = await apiClient.createCourtDecision(eventId, courtCaseId, {
        decisionType: decisionForm.decisionType as any,
        summary: decisionForm.summary.trim(),
        reasoning: decisionForm.reasoning.trim() || undefined,
      });
      if (res.ok) {
        setShowDecisionModal(false);
        setDecisionForm({ decisionType: 'VERDICT_CONVICTION', summary: '', reasoning: '' });
        fetchCourtCaseDetails();
      } else {
        alert(res.error || 'Failed to issue decision');
      }
    } catch (err: any) {
      alert(err.message || 'Action failed');
    } finally {
      setModalSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AppShell
        breadcrumbs={[
          { label: 'Event', href: `/events/${eventId}/overview` },
          { label: 'Court', href: `/events/${eventId}/court` },
        ]}
      >
        <LoadingState message="Loading court matter details..." />
      </AppShell>
    );
  }

  if (error || !courtCase) {
    return (
      <AppShell
        breadcrumbs={[
          { label: 'Event', href: `/events/${eventId}/overview` },
          { label: 'Court', href: `/events/${eventId}/court` },
        ]}
      >
        <ErrorState message={error || 'Legal matter record not found'} onRetry={fetchCourtCaseDetails} />
      </AppShell>
    );
  }

  const tabs: TabItem[] = [
    { id: 'overview', label: 'Matter Overview', icon: <Award size={14} /> },
    { id: 'parties', label: 'Parties', count: courtCase.parties?.length || 0, icon: <Users size={14} /> },
    { id: 'charges', label: 'Charges', count: courtCase.charges?.length || 0, icon: <AlertTriangle size={14} /> },
    { id: 'exhibits', label: 'Exhibits', count: courtCase.exhibits?.length || 0, icon: <Folder size={14} /> },
    { id: 'hearings', label: 'Hearings', count: courtCase.hearings?.length || 0, icon: <Clock size={14} /> },
    { id: 'filings', label: 'Filings', count: courtCase.filings?.length || 0, icon: <FileText size={14} /> },
    { id: 'decisions', label: 'Decisions', count: courtCase.decisions?.length || 0, icon: <Gavel size={14} /> },
    ...(canReadRequests ? [{ id: 'requests', label: 'Žádosti o podklady', icon: <FileText size={14} /> }] : []),
    { id: 'timeline', label: 'Legal Progression', icon: <Clock size={14} /> },
  ];

  return (
    <AppShell
      breadcrumbs={[
        { label: 'Event', href: `/events/${eventId}/overview` },
        { label: 'Court', href: `/events/${eventId}/court` },
        { label: courtCase.courtCaseNumber, href: `/events/${eventId}/court/${courtCase.id}` },
      ]}
    >
      <div className="workspace-container">
        {/* Record Header */}
        <RecordHeader
          identifier={courtCase.courtCaseNumber}
          title={courtCase.title}
          status={courtCase.status}
          owningUnit="Judicial / Tribunal Proceeding"
          lead={courtCase.originatingCaseId ? `Originating Case: ${courtCase.originatingCaseId.slice(0, 8)}` : null}
          leadLabel="Origin"
          dates={[
            { label: 'Opened', value: formatDate(courtCase.openedAt) },
            ...(courtCase.closedAt
              ? [{ label: 'Closed', value: formatDate(courtCase.closedAt) }]
              : []),
          ]}
          actions={
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Link className="btn btn-secondary" href={`/events/${eventId}/court/${courtCaseId}/print`} target="_blank" rel="noopener noreferrer">
                <FileText size={14} /> { 'Vytisknout spis' }
              </Link>
              {courtCase.status === 'PREPARATION' && canUpdateCourt && (
                <button
                  className="btn btn-primary"
                  onClick={() => handleUpdateStatus('FILED')}
                  disabled={actionLoading}
                >
                  <FileText size={14} style={{ marginRight: '6px' }} />
                  File Indictment / Case
                </button>
              )}
              {courtCase.status === 'FILED' && canUpdateCourt && (
                <button
                  className="btn btn-primary"
                  onClick={() => handleUpdateStatus('ACTIVE')}
                  disabled={actionLoading}
                >
                  <Play size={14} style={{ marginRight: '6px' }} />
                  Open Proceeding
                </button>
              )}
              {courtCase.status === 'ACTIVE' && canUpdateCourt && (
                <button
                  className="btn btn-secondary"
                  onClick={() => handleUpdateStatus('DELIBERATION')}
                  disabled={actionLoading}
                >
                  <Clock size={14} style={{ marginRight: '6px' }} />
                  Begin Deliberation
                </button>
              )}
              {courtCase.status === 'DELIBERATION' && canUpdateCourt && (
                <button
                  className="btn btn-primary"
                  onClick={() => handleUpdateStatus('DECIDED')}
                  disabled={actionLoading}
                  style={{ background: 'var(--color-success)', borderColor: 'var(--color-success)' }}
                >
                  <Gavel size={14} style={{ marginRight: '6px' }} />
                  Issue Final Decision
                </button>
              )}
            </div>
          }
        />

        {/* Record Tabs */}
        <RecordTabs
          tabs={tabs}
          activeTab={activeTab}
          onChange={(t) => setActiveTab(t as any)}
        />

        {/* Tab Content */}
        <div style={{ marginTop: '16px' }}>
          {activeTab === 'requests' && canReadRequests && <CourtRequestsPanel eventId={eventId} courtCaseId={courtCaseId}/>}
                    {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '16px' }}>
              <div className="card" style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-bright)', marginBottom: '12px' }}>
                  Matter Summary & Scope
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--color-text-dim)', lineHeight: 1.6 }}>
                  {courtCase.summary || 'No summary or indictment brief recorded for this matter.'}
                </p>

                {courtCase.originatingCaseId && (
                  <div style={{ marginTop: '20px', padding: '12px', background: 'var(--color-bg-surface)', borderRadius: '4px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>Originating Operational Case:</div>
                    <Link
                      href={`/events/${eventId}/cases/${courtCase.originatingCaseId}`}
                      className="btn btn-secondary btn-sm"
                      style={{ marginTop: '6px' }}
                    >
                      <Briefcase size={13} style={{ marginRight: '6px' }} />
                      View Case Record ({courtCase.originatingCaseId})
                    </Link>
                  </div>
                )}
              </div>

              <div className="card" style={{ padding: '16px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-bright)', marginBottom: '12px' }}>
                  Judicial Statistics
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-text-dim)' }}>Parties:</span>
                    <span style={{ fontWeight: 500 }}>{courtCase.parties?.length || 0}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-text-dim)' }}>Filed Charges:</span>
                    <span style={{ fontWeight: 500 }}>{courtCase.charges?.length || 0}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-text-dim)' }}>Exhibits Admitted:</span>
                    <span style={{ fontWeight: 500 }}>
                      {courtCase.exhibits?.filter((e) => e.status === 'ADMITTED').length || 0} /{' '}
                      {courtCase.exhibits?.length || 0}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-text-dim)' }}>Hearings Held:</span>
                    <span style={{ fontWeight: 500 }}>{courtCase.hearings?.length || 0}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-text-dim)' }}>Decisions Rendered:</span>
                    <span style={{ fontWeight: 500 }}>{courtCase.decisions?.length || 0}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PARTIES */}
          {activeTab === 'parties' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text-bright)' }}>
                    Matter Parties & Legal Roles
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--color-text-dim)' }}>
                    Accused subjects, prosecution, legal defence counsel, and expert witnesses.
                  </p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowPartyModal(true)}>
                  <Plus size={14} style={{ marginRight: '6px' }} />
                  Add Party
                </button>
              </div>

              {courtCase.parties && courtCase.parties.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {courtCase.parties.map((p) => (
                    <div
                      key={p.id}
                      className="card"
                      style={{
                        padding: '12px 16px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Users size={16} style={{ color: 'var(--color-accent-ops)' }} />
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--color-text-bright)' }}>
                            {p.partyName || `Party ${p.partyResourceId}`}
                          </div>
                          {p.notes && (
                            <div style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>
                              Notes: {p.notes}
                            </div>
                          )}
                        </div>
                      </div>
                      <span className="badge badge-neutral" style={{ fontSize: '11px', fontWeight: 600 }}>
                        {p.partyRole}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No Parties Registered"
                  description="Link accused persons or legal counsel from the Canonical Person registry."
                  action={
                    <button className="btn btn-primary btn-sm" onClick={() => setShowPartyModal(true)}>
                      <Plus size={14} style={{ marginRight: '6px' }} />
                      Add Party
                    </button>
                  }
                />
              )}
            </div>
          )}

          {/* TAB 3: CHARGES */}
          {activeTab === 'charges' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text-bright)' }}>
                    Charges & Allegations
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--color-text-dim)' }}>
                    Formal legal accusations filed against accused subjects in this proceeding.
                  </p>
                </div>
                {canManageCharges && (
                  <button className="btn btn-primary" onClick={() => setShowChargeModal(true)}>
                    <Plus size={14} style={{ marginRight: '6px' }} />
                    Add Charge
                  </button>
                )}
              </div>

              {courtCase.charges && courtCase.charges.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {courtCase.charges.map((ch) => (
                    <div
                      key={ch.id}
                      className="card"
                      style={{ padding: '14px 16px', borderLeft: '3px solid var(--color-warning)' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          {ch.code && (
                            <span className="badge badge-neutral" style={{ fontSize: '11px', marginRight: '8px' }}>
                              {ch.code}
                            </span>
                          )}
                          <span style={{ fontWeight: 600, color: 'var(--color-text-bright)', fontSize: '15px' }}>
                            {ch.title}
                          </span>
                        </div>
                        <StatusBadge status={ch.status} />
                      </div>
                      {ch.description && (
                        <div style={{ fontSize: '13px', color: 'var(--color-text-dim)', marginTop: '6px' }}>
                          {ch.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No Charges Filed"
                  description="Prosecution can file formal statutory or scenario charges."
                  action={
                    canManageCharges ? (
                      <button className="btn btn-primary btn-sm" onClick={() => setShowChargeModal(true)}>
                        <Plus size={14} style={{ marginRight: '6px' }} />
                        Add Charge
                      </button>
                    ) : undefined
                  }
                />
              )}
            </div>
          )}

          {/* TAB 4: EXHIBITS */}
          {activeTab === 'exhibits' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text-bright)' }}>
                    Court Exhibits & Evidence Admission
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--color-text-dim)' }}>
                    Exhibits reference canonical Evidence records. Tribunal renders binding admission decisions.
                  </p>
                </div>
                {canSubmitExhibit && (
                  <button className="btn btn-primary" onClick={() => setShowExhibitModal(true)}>
                    <Plus size={14} style={{ marginRight: '6px' }} />
                    Submit Exhibit
                  </button>
                )}
              </div>

              {courtCase.exhibits && courtCase.exhibits.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {courtCase.exhibits.map((ex) => (
                    <div key={ex.id} className="card" style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <Folder size={16} style={{ color: 'var(--color-accent-ops)' }} />
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--color-text-bright)' }}>
                              <RecordIdentifier value={ex.evidenceNumber || ex.exhibitNumber} /> {ex.evidenceDescription || `Exhibit ${ex.exhibitNumber}`}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>
                              Submitted at {formatTime(ex.proposedAt)}
                              {ex.decisionReason && ` • Judicial Note: ${ex.decisionReason}`}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <StatusBadge status={ex.status} />

                          {canDecideExhibit && ex.status === 'SUBMITTED' && (
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleDecideExhibit(ex.id, 'ADMITTED')}
                                style={{ color: 'var(--color-success)' }}
                              >
                                <Check size={13} style={{ marginRight: '4px' }} /> Admit
                              </button>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleDecideExhibit(ex.id, 'EXCLUDED')}
                                style={{ color: 'var(--color-danger)' }}
                              >
                                <Ban size={13} style={{ marginRight: '4px' }} /> Exclude
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No Exhibits Submitted"
                  description="Submit physical, digital, or documentary evidence for judicial admission."
                  action={
                    canSubmitExhibit ? (
                      <button className="btn btn-primary btn-sm" onClick={() => setShowExhibitModal(true)}>
                        <Plus size={14} style={{ marginRight: '6px' }} />
                        Submit Exhibit
                      </button>
                    ) : undefined
                  }
                />
              )}
            </div>
          )}

          {/* TAB 5: HEARINGS */}
          {activeTab === 'hearings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text-bright)' }}>
                    Hearings & Sessions
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--color-text-dim)' }}>
                    Calendar and active sessions for arraignment, evidence examination, and sentencing.
                  </p>
                </div>
                {canManageHearing && (
                  <button className="btn btn-primary" onClick={() => setShowHearingModal(true)}>
                    <Plus size={14} style={{ marginRight: '6px' }} />
                    Schedule Hearing
                  </button>
                )}
              </div>

              {courtCase.hearings && courtCase.hearings.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {courtCase.hearings.map((h) => (
                    <div key={h.id} className="card" style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--color-text-bright)' }}>{h.title}</div>
                          <div style={{ fontSize: '12px', color: 'var(--color-text-dim)', marginTop: '2px' }}>
                            Scheduled: {formatTime(h.scheduledAt)}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <StatusBadge status={h.status} />

                          {canManageHearing && (
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {h.status === 'SCHEDULED' && (
                                <button
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => handleUpdateHearingStatus(h.id, 'IN_SESSION')}
                                >
                                  <Play size={13} style={{ marginRight: '4px' }} /> Start Session
                                </button>
                              )}
                              {h.status === 'IN_SESSION' && (
                                <button
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => handleUpdateHearingStatus(h.id, 'COMPLETED')}
                                >
                                  <Check size={13} style={{ marginRight: '4px' }} /> Conclude Hearing
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No Hearings Scheduled"
                  description="Schedule judicial proceedings, bail hearings, or oral arguments."
                  action={
                    canManageHearing ? (
                      <button className="btn btn-primary btn-sm" onClick={() => setShowHearingModal(true)}>
                        <Plus size={14} style={{ marginRight: '6px' }} />
                        Schedule Hearing
                      </button>
                    ) : undefined
                  }
                />
              )}
            </div>
          )}

          {/* TAB 6: FILINGS */}
          {activeTab === 'filings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text-bright)' }}>
                    Court Filings & Submissions
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--color-text-dim)' }}>
                    Motions, briefs, and responses linking back to the unified Document domain.
                  </p>
                </div>
                {canCreateFiling && (
                  <button className="btn btn-primary" onClick={() => setShowFilingModal(true)}>
                    <Plus size={14} style={{ marginRight: '6px' }} />
                    Record Filing
                  </button>
                )}
              </div>

              {courtCase.filings && courtCase.filings.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {courtCase.filings.map((fil) => (
                    <div key={fil.id} className="card" style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--color-text-bright)' }}>
                            {fil.documentTitle || `Filing ${fil.filingType}`}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>
                            Type: {fil.filingType} • Filed: {formatTime(fil.filedAt)}
                          </div>
                        </div>
                        <Link href={`/events/${eventId}/documents`} className="btn btn-secondary btn-sm">
                          View Document
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No Court Filings Recorded"
                  description="File motions, witness lists, or trial briefs."
                  action={
                    canCreateFiling ? (
                      <button className="btn btn-primary btn-sm" onClick={() => setShowFilingModal(true)}>
                        <Plus size={14} style={{ marginRight: '6px' }} />
                        Record Filing
                      </button>
                    ) : undefined
                  }
                />
              )}
            </div>
          )}

          {/* TAB 7: DECISIONS */}
          {activeTab === 'decisions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text-bright)' }}>
                    Judicial Decisions & Verdicts
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--color-text-dim)' }}>
                    Binding tribunal rulings, judgments, sentencing orders, and dismissals.
                  </p>
                </div>
                {canCreateDecision && (
                  <button className="btn btn-primary" onClick={() => setShowDecisionModal(true)}>
                    <Plus size={14} style={{ marginRight: '6px' }} />
                    Issue Decision
                  </button>
                )}
              </div>

              {courtCase.decisions && courtCase.decisions.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {courtCase.decisions.map((dec) => (
                    <div
                      key={dec.id}
                      className="card"
                      style={{ padding: '16px', borderLeft: '3px solid var(--color-success)' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="badge badge-success" style={{ fontWeight: 600 }}>
                          {dec.decisionType}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>
                          Issued: {formatTime(dec.decidedAt)}
                        </span>
                      </div>
                      <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-bright)', marginTop: '8px' }}>
                        {dec.summary}
                      </h4>
                      {dec.reasoning && (
                        <div style={{ fontSize: '13px', color: 'var(--color-text-dim)', marginTop: '6px' }}>
                          <strong>Reasoning:</strong> {dec.reasoning}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No Decisions Rendered"
                  description="Judges and tribunals issue official orders and final judgments."
                  action={
                    canCreateDecision ? (
                      <button className="btn btn-primary btn-sm" onClick={() => setShowDecisionModal(true)}>
                        <Plus size={14} style={{ marginRight: '6px' }} />
                        Issue Decision
                      </button>
                    ) : undefined
                  }
                />
              )}
            </div>
          )}

          {/* TAB 8: TIMELINE */}
          {activeTab === 'timeline' && (
            <div className="card" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-bright)', marginBottom: '14px' }}>
                Legal Proceeding Progression
              </h3>
              {timelineLoading ? (
                <LoadingState message="Loading legal timeline..." />
              ) : timelineItems.length > 0 ? (
                <TimelineView items={timelineItems} />
              ) : (
                <EmptyState
                  title="No Timeline Entries"
                  description="Legal steps (charges, exhibits, hearings, decisions) automatically populate the progression timeline."
                />
              )}
            </div>
          )}
        </div>

        {/* Modal: Add Party */}
        {showPartyModal && (
          <div className="modal-backdrop" role="presentation">
            <div className="modal-dialog" role="dialog" aria-modal="true" aria-label="Add Party to Matter" style={{ maxWidth: '480px' }}>
              <div className="modal-header">
                <h3 className="modal-title">Add Party to Matter</h3>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowPartyModal(false)}
                  style={{ padding: '4px' }}
                >
                  <X size={16} />
                </button>
              </div>
              <form onSubmit={handleAddParty}>
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <ResourcePicker
                      eventId={eventId}
                      value={partyForm.personId}
                      onChange={(value) => setPartyForm(current => ({ ...current, personId: value }))}
                      types="person"
                      label="Person / legal party"
                      placeholder="Search a registered person by name…"
                      required
                    />
                  </div>
                  <div>
                    <label className="field-label">Party Role *</label>
                    <select
                      className="field-input"
                      value={partyForm.role}
                      onChange={(e) => setPartyForm({ ...partyForm, role: e.target.value as CourtPartyRole })}
                    >
                      <option value="ACCUSED">Accused / Defendant</option>
                      <option value="PROSECUTION">Prosecutor / State Representative</option>
                      <option value="DEFENCE">Defence Counsel</option>
                      <option value="WITNESS">Witness</option>
                      <option value="EXPERT">Expert Witness</option>
                      <option value="OTHER">Other Party</option>
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Representation Notes</label>
                    <input
                      type="text"
                      className="field-input"
                      placeholder="e.g. Public defender assigned / Retained counsel"
                      value={partyForm.representationNotes}
                      onChange={(e) => setPartyForm({ ...partyForm, representationNotes: e.target.value })}
                    />
                  </div>
                </div>
                <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowPartyModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={modalSubmitting}>
                    {modalSubmitting ? 'Adding...' : 'Add Party'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Add Charge */}
        {showChargeModal && (
          <div className="modal-backdrop" role="presentation">
            <div className="modal-dialog" role="dialog" aria-modal="true" aria-label="File Charge" style={{ maxWidth: '480px' }}>
              <div className="modal-header">
                <h3 className="modal-title">File Charge</h3>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowChargeModal(false)}
                  style={{ padding: '4px' }}
                >
                  <X size={16} />
                </button>
              </div>
              <form onSubmit={handleAddCharge}>
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label className="field-label">Statute / Charge Code (optional)</label>
                    <input
                      type="text"
                      className="field-input"
                      placeholder="e.g. § 230-1 / CR-2026-09"
                      value={chargeForm.code}
                      onChange={(e) => setChargeForm({ ...chargeForm, code: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="field-label">Charge Title *</label>
                    <input
                      type="text"
                      className="field-input"
                      placeholder="e.g. Unauthorized Access to Critical Energy Infrastructure"
                      value={chargeForm.title}
                      onChange={(e) => setChargeForm({ ...chargeForm, title: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="field-label">Description / Factual Basis</label>
                    <textarea
                      className="field-input"
                      rows={3}
                      value={chargeForm.description}
                      onChange={(e) => setChargeForm({ ...chargeForm, description: e.target.value })}
                    />
                  </div>
                </div>
                <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowChargeModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={modalSubmitting}>
                    {modalSubmitting ? 'Filing...' : 'File Charge'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Submit Exhibit */}
        {showExhibitModal && (
          <div className="modal-backdrop" role="presentation">
            <div className="modal-dialog" role="dialog" aria-modal="true" aria-label="Submit Evidence Exhibit" style={{ maxWidth: '480px' }}>
              <div className="modal-header">
                <h3 className="modal-title">Submit Evidence Exhibit</h3>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowExhibitModal(false)}
                  style={{ padding: '4px' }}
                >
                  <X size={16} />
                </button>
              </div>
              <form onSubmit={handleSubmitExhibit}>
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <ResourcePicker
                      eventId={eventId}
                      value={exhibitForm.evidenceId}
                      onChange={(value) => setExhibitForm(current => ({ ...current, evidenceId: value }))}
                      types="evidence"
                      label="Evidence exhibit"
                      placeholder="Search by evidence number or title…"
                      required
                    />
                  </div>
                  <div>
                    <label className="field-label">Document ID (optional)</label>
                    <input
                      type="text"
                      className="field-input"
                      placeholder="Associated forensic report or photo document"
                      value={exhibitForm.documentId}
                      onChange={(e) => setExhibitForm({ ...exhibitForm, documentId: e.target.value })}
                    />
                  </div>
                </div>
                <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowExhibitModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={modalSubmitting}>
                    {modalSubmitting ? 'Submitting...' : 'Submit Exhibit'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Schedule Hearing */}
        {showHearingModal && (
          <div className="modal-backdrop" role="presentation">
            <div className="modal-dialog" role="dialog" aria-modal="true" aria-label="Schedule Hearing" style={{ maxWidth: '480px' }}>
              <div className="modal-header">
                <h3 className="modal-title">Schedule Hearing</h3>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowHearingModal(false)}
                  style={{ padding: '4px' }}
                >
                  <X size={16} />
                </button>
              </div>
              <form onSubmit={handleScheduleHearing}>
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label className="field-label">Hearing Title *</label>
                    <input
                      type="text"
                      className="field-input"
                      value={hearingForm.title}
                      onChange={(e) => setHearingForm({ ...hearingForm, title: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="field-label">Scheduled Date & Time *</label>
                    <input
                      type="datetime-local"
                      className="field-input"
                      value={hearingForm.scheduledAt}
                      onChange={(e) => setHearingForm({ ...hearingForm, scheduledAt: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowHearingModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={modalSubmitting}>
                    {modalSubmitting ? 'Scheduling...' : 'Schedule Hearing'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Record Filing */}
        {showFilingModal && (
          <div className="modal-backdrop" role="presentation">
            <div className="modal-dialog" role="dialog" aria-modal="true" aria-label="Record Court Filing" style={{ maxWidth: '480px' }}>
              <div className="modal-header">
                <h3 className="modal-title">Record Court Filing</h3>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowFilingModal(false)}
                  style={{ padding: '4px' }}
                >
                  <X size={16} />
                </button>
              </div>
              <form onSubmit={handleCreateFiling}>
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <ResourcePicker
                      eventId={eventId}
                      value={filingForm.documentId}
                      onChange={(value) => setFilingForm(current => ({ ...current, documentId: value }))}
                      types="document"
                      label="Filed document"
                      placeholder="Search by document number or title…"
                      required
                    />
                  </div>
                  <div>
                    <label className="field-label">Filing Type *</label>
                    <input
                      type="text"
                      className="field-input"
                      placeholder="e.g. MOTION, INDICTMENT_BRIEF, DEFENCE_SUBMISSION"
                      value={filingForm.filingType}
                      onChange={(e) => setFilingForm({ ...filingForm, filingType: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowFilingModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={modalSubmitting}>
                    {modalSubmitting ? 'Recording...' : 'Record Filing'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Issue Decision */}
        {showDecisionModal && (
          <div className="modal-backdrop" role="presentation">
            <div className="modal-dialog" role="dialog" aria-modal="true" aria-label="Issue Judicial Decision" style={{ maxWidth: '520px' }}>
              <div className="modal-header">
                <h3 className="modal-title">Issue Judicial Decision</h3>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowDecisionModal(false)}
                  style={{ padding: '4px' }}
                >
                  <X size={16} />
                </button>
              </div>
              <form onSubmit={handleCreateDecision}>
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label className="field-label">Decision Type *</label>
                    <select
                      className="field-input"
                      value={decisionForm.decisionType}
                      onChange={(e) =>
                        setDecisionForm({ ...decisionForm, decisionType: e.target.value as CourtDecisionType })
                      }
                    >
                      <option value="VERDICT_CONVICTION">Verdict: Conviction</option>
                      <option value="VERDICT_ACQUITTAL">Verdict: Acquittal</option>
                      <option value="DISMISSAL">Dismissal</option>
                      <option value="INTERLOCUTORY_ORDER">Interlocutory Order</option>
                      <option value="SENTENCE">Sentence</option>
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Summary / Ruling *</label>
                    <textarea
                      className="field-input"
                      rows={2}
                      placeholder="e.g. Defendant found GUILTY on count 1; sentenced to 4 years imprisonment."
                      value={decisionForm.summary}
                      onChange={(e) => setDecisionForm({ ...decisionForm, summary: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="field-label">Legal Reasoning & Findings</label>
                    <textarea
                      className="field-input"
                      rows={4}
                      placeholder="Factual findings, applicable legal standards, and credibility assessments..."
                      value={decisionForm.reasoning}
                      onChange={(e) => setDecisionForm({ ...decisionForm, reasoning: e.target.value })}
                    />
                  </div>
                </div>
                <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowDecisionModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={modalSubmitting}>
                    {modalSubmitting ? 'Issuing...' : 'Issue Decision'}
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

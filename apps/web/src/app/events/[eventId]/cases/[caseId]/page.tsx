'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { RecordHeader } from '@/components/common/RecordHeader';
import { RecordTabs } from '@/components/common/RecordTabs';
import { RecordInspector } from '@/components/common/RecordInspector';
import { RecordIdentifier, StatusBadge, PriorityBadge } from '@/components/common/Badges';
import { TimelineView } from '@/components/common/TimelineView';
import { RelationshipGraph } from '@/components/common/RelationshipGraph';
import { DataTable, Column } from '@/components/common/DataTable';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  Briefcase,
  AlertTriangle,
  FolderOpen,
  Share2,
  Clock,
  User,
  Shield,
  Layers,
  Edit2,
  Plus,
  ArrowRight,
  FileText,
  Activity,
  CheckCircle2,
  X,
  Sparkles,
} from 'lucide-react';
import { SummarizeCaseModal } from '@/components/intelligence/SummarizeCaseModal';
import { WritingAssistModal } from '@/components/intelligence/WritingAssistModal';

export default function CaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const caseId = params.caseId as string;
  const { hasPermission } = useAuth();
  const { formatTime } = usePreferences();

  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'evidence' | 'relations'>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [caseData, setCaseData] = useState<any>(null);
  const [timelineItems, setTimelineItems] = useState<any[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  // Inspector toggle
  const [inspectorOpen, setInspectorOpen] = useState(true);

  // Edit Case Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editStatus, setEditStatus] = useState('OPEN');
  const [editPriority, setEditPriority] = useState('MEDIUM');
  const [editDescription, setEditDescription] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Add Relationship Modal
  const [showRelModal, setShowRelModal] = useState(false);
  const [targetResourceId, setTargetResourceId] = useState('');
  const [relType, setRelType] = useState('RELATED_TO');
  const [addingRel, setAddingRel] = useState(false);
  const [relationshipCandidates, setRelationshipCandidates] = useState<Array<{ id: string; label: string; type: string }>>([]);

  // CYRIS Intelligence Modals
  const [showSummarizeModal, setShowSummarizeModal] = useState(false);
  const [showWritingAssistModal, setShowWritingAssistModal] = useState(false);

  const canUpdate = hasPermission('case.update');

  const fetchCaseDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getCaseWorkspace(eventId, caseId);
      if (res.ok && res.data) {
        const workspace = res.data;
        setCaseData({
          ...workspace.case,
          evidence: workspace.related?.evidence ?? [],
          incident: workspace.related?.incidents?.[0] ?? null,
          incidents: workspace.related?.incidents ?? [],
          entities: workspace.related?.entities ?? [],
          tasks: workspace.related?.tasks ?? [],
          relationships: [
            ...(workspace.related?.incidents ?? []),
            ...(workspace.related?.evidence ?? []),
            ...(workspace.related?.entities ?? []),
          ],
          allowedTransitions: workspace.allowedTransitions ?? [],
          recentActivity: workspace.recentActivity ?? [],
        });
        setEditStatus(workspace.case.status || 'OPEN');
        setEditPriority(workspace.case.priority || 'MEDIUM');
        setEditDescription(workspace.case.summary || '');
      } else {
        setError(res.error || 'Failed to load case');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const fetchTimeline = async () => {
    setTimelineLoading(true);
    setTimelineError(null);
    try {
      const res = await apiClient.getCaseTimeline(caseId);
      if (res.ok && res.data) {
        setTimelineItems(Array.isArray(res.data) ? res.data : (res.data.items ?? []));
      } else {
        setTimelineItems([]);
        setTimelineError(res.error || 'Timeline could not be loaded.');
      }
    } catch (err: any) {
      setTimelineItems([]);
      setTimelineError(err.message || 'Timeline could not be loaded.');
    } finally {
      setTimelineLoading(false);
    }
  };

  useEffect(() => {
    if (eventId && caseId) {
      fetchCaseDetails();
    }
  }, [eventId, caseId]);

  useEffect(() => {
    if (caseId && (activeTab === 'timeline' || activeTab === 'overview')) {
      fetchTimeline();
    }
  }, [caseId, activeTab]);

  useEffect(() => {
    if (!showRelModal || !eventId) return;
    Promise.all([
      apiClient.getIncidents(eventId),
      apiClient.getPersons(eventId),
      apiClient.getOrganisations(eventId),
      apiClient.getLocations(eventId),
      apiClient.getVehicles(eventId),
      apiClient.getDevices(eventId),
      apiClient.getEvidence(eventId),
    ]).then((results) => {
      const [incidents, persons, organisations, locations, vehicles, devices, evidence] = results;
      const candidates: Array<{ id: string; label: string; type: string }> = [];
      const add = (result: any, type: string, identifier: string, title: string) => {
        if (!result.ok || !Array.isArray(result.data)) return;
        result.data.forEach((item: any) => candidates.push({
          id: item.id,
          type,
          label: `${item[identifier] ? `${item[identifier]} — ` : ''}${item[title] || item.displayName || item.name || item.label}`,
        }));
      };
      add(incidents, 'Incident', 'incidentNumber', 'title');
      add(persons, 'Person', 'personNumber', 'displayName');
      add(organisations, 'Organisation', 'organisationNumber', 'name');
      add(locations, 'Location', 'locationNumber', 'name');
      add(vehicles, 'Vehicle', 'vehicleNumber', 'label');
      add(devices, 'Device', 'deviceNumber', 'label');
      add(evidence, 'Evidence', 'evidenceNumber', 'title');
      setRelationshipCandidates(candidates);
    }).catch(() => setRelationshipCandidates([]));
  }, [showRelModal, eventId]);

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingEdit(true);
    try {
      const res = await apiClient.updateCase(eventId, caseId, {
        status: editStatus,
        priority: editPriority,
        summary: editDescription,
      });
      if (res.ok) {
        setShowEditModal(false);
        fetchCaseDetails();
      } else {
        setError(res.error || 'Update failed');
      }
    } catch (err: any) {
      setError(err.message || 'Update failed');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleAddRelationship = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetResourceId.trim()) return;
    setAddingRel(true);
    try {
      const res = await apiClient.createRelationship(caseId, {
        targetResourceId: targetResourceId.trim(),
        relationshipType: relType,
      });
      if (res.ok) {
        setShowRelModal(false);
        setTargetResourceId('');
        fetchCaseDetails();
      } else {
        setError(res.error || 'Failed to create relationship');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create relationship');
    } finally {
      setAddingRel(false);
    }
  };

  if (loading) {
    return (
      <AppShell
        breadcrumbs={[
          { label: 'Operations', href: `/events/${eventId}/overview` },
          { label: 'Cases', href: `/events/${eventId}/cases` },
          { label: 'Loading...' },
        ]}
      >
        <div style={{ padding: '40px' }}>
          <LoadingState message="Retrieving operational case workspace..." />
        </div>
      </AppShell>
    );
  }

  if (error || !caseData) {
    return (
      <AppShell
        breadcrumbs={[
          { label: 'Operations', href: `/events/${eventId}/overview` },
          { label: 'Cases', href: `/events/${eventId}/cases` },
          { label: 'Error' },
        ]}
      >
        <div style={{ padding: '40px' }}>
          <ErrorState message={error || 'Case not found'} onRetry={fetchCaseDetails} />
        </div>
      </AppShell>
    );
  }

  const linkedIncident = caseData.incident;
  const linkedEvidence = caseData.evidence || [];
  const relationships = caseData.relationships || [];

  const evidenceColumns: Column<any>[] = [
    {
      header: 'Identifier',
      accessor: (item) => <RecordIdentifier id={item.evidenceNumber || item.id} prefix="" />,
      width: '130px',
    },
    {
      header: 'Title & Summary',
      accessor: (item) => (
        <div>
          <span style={{ fontWeight: 600, color: 'var(--color-text-main)' }}>{item.title}</span>
          {item.summary && (
            <div style={{ fontSize: '11px', color: 'var(--color-text-dim)' }}>{item.summary}</div>
          )}
        </div>
      ),
    },
    {
      header: 'Type',
      accessor: (item) => <span className="badge badge-neutral">{item.type}</span>,
      width: '110px',
    },
    {
      header: 'Status',
      accessor: (item) => <StatusBadge status={item.status} />,
      width: '110px',
    },
    {
      header: 'Actions',
      accessor: (item) => (
        <Link
          href={`/events/${eventId}/evidence/${item.id}`}
          className="btn btn-secondary"
          style={{ padding: '3px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
        >
          Inspect <ArrowRight size={12} />
        </Link>
      ),
      width: '100px',
    },
  ];

  return (
    <AppShell
      breadcrumbs={[
        { label: 'Operations', href: `/events/${eventId}/overview` },
        { label: 'Cases', href: `/events/${eventId}/cases` },
        { label: caseData.caseNumber || caseData.id },
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Record Header */}
        <RecordHeader
          identifier={caseData.caseNumber || caseData.id}
          title={caseData.title}
          status={<StatusBadge status={caseData.status} />}
          priority={<PriorityBadge priority={caseData.priority} />}
          owningUnit={caseData.owningUnitId ? `Unit: ${caseData.owningUnitId.slice(0, 8)}` : undefined}
          lead={caseData.leadUserId ? `Lead: ${caseData.leadUserId.slice(0, 8)}` : 'Unassigned'}
          actions={
            <div style={{ display: 'flex', gap: '8px' }}>
              <Link href={`/events/${eventId}/cases`} className="btn btn-ghost" style={{ fontSize: '12px' }}>
                Back to Cases
              </Link>
              <button
                onClick={() => setInspectorOpen(!inspectorOpen)}
                className={`btn ${inspectorOpen ? 'btn-secondary' : 'btn-ghost'}`}
                style={{ fontSize: '12px' }}
                title="Toggle Context Inspector"
              >
                <Layers size={13} style={{ marginRight: '4px' }} />
                {inspectorOpen ? 'Hide Inspector' : 'Show Inspector'}
              </button>
              <button
                type="button"
                onClick={() => setShowSummarizeModal(true)}
                className="btn btn-secondary"
                style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                title="Synthesize case facts, correlations, and lab findings using CYRIS Intelligence"
              >
                <FileText size={13} style={{ color: 'var(--color-accent)' }} />
                Summarize Case
              </button>
              {canUpdate && (
                <button
                  onClick={() => setShowEditModal(true)}
                  className="btn btn-secondary"
                  style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                >
                  <Edit2 size={13} />
                  Modify Case
                </button>
              )}
            </div>
          }
        />

        {/* Local Navigation Tabs */}
        <RecordTabs
          tabs={[
            { id: 'overview', label: 'Overview', icon: <Briefcase size={14} /> },
            { id: 'timeline', label: 'Timeline', count: timelineItems.length, icon: <Clock size={14} /> },
            { id: 'evidence', label: 'Evidence', count: linkedEvidence.length, icon: <FolderOpen size={14} /> },
            { id: 'relations', label: 'Relations', count: relationships.length, icon: <Share2 size={14} /> },
          ]}
          activeTab={activeTab}
          onChange={(tab) => setActiveTab(tab as any)}
        />

        {/* Workbench Body with Adaptive Inspector */}
        <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
          {/* Main Workspace Area */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px 24px',
            }}
          >
            {/* OVERVIEW TAB */}
            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', maxWidth: '960px' }}>
                {/* Summary & Operational Context */}
                <div>
                  <div className="cyris-section-header">
                    <span className="cyris-section-title">
                      <span className="cyris-signal-marker" />
                      Summary & Operational Context
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: '13px',
                      color: 'var(--text-primary)',
                      lineHeight: '1.6',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {caseData.summary || 'No operational summary provided for this case.'}
                  </div>
                </div>

                {/* Operational Assignments */}
                <div>
                  <div className="cyris-section-header">
                    <span className="cyris-section-title">
                      <span className="cyris-signal-marker" />
                      Operational Assignments
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: '16px',
                      fontSize: '12px',
                    }}
                  >
                    <div>
                      <div style={{ color: 'var(--text-muted)', marginBottom: '2px', fontSize: '11px' }}>
                        Investigative Lead
                      </div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {caseData.leadUserId ? `Operator (${caseData.leadUserId.slice(0, 8)})` : 'Unassigned'}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)', marginBottom: '2px', fontSize: '11px' }}>
                        Owning Unit
                      </div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {caseData.owningUnitId ? `Unit (${caseData.owningUnitId.slice(0, 8)})` : 'Investigation'}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)', marginBottom: '2px', fontSize: '11px' }}>
                        Classification
                      </div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Connected Trigger Incident */}
                {linkedIncident && (
                  <div>
                    <div className="cyris-section-header">
                      <span className="cyris-section-title">
                        <span className="cyris-signal-marker" />
                        Connected Trigger Incident
                      </span>
                      <Link
                        href={`/events/${eventId}/incidents/${linkedIncident.id}`}
                        style={{
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        View Incident <ArrowRight size={11} />
                      </Link>
                    </div>
                    <div className="workspace-sheet">
                      <div className="workspace-row">
                        <div style={{ minWidth: '90px' }}>
                          <RecordIdentifier id={linkedIncident.incidentNumber || linkedIncident.id} prefix="" />
                        </div>
                        <div style={{ flex: 1, fontWeight: 600, color: 'var(--text-primary)' }}>
                          {linkedIncident.title}
                        </div>
                        <StatusBadge status={linkedIncident.status} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Secured Evidence Items */}
                <div>
                  <div className="cyris-section-header">
                    <span className="cyris-section-title">
                      <span className="cyris-signal-marker" />
                      Secured Evidence Items ({linkedEvidence.length})
                    </span>
                    <button
                      onClick={() => setActiveTab('evidence')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        fontSize: '11px',
                        cursor: 'pointer',
                      }}
                    >
                      All Items →
                    </button>
                  </div>
                  <div className="workspace-sheet">
                    {linkedEvidence.length === 0 ? (
                      <div style={{ padding: '14px', fontSize: '12px', color: 'var(--text-dim)' }}>
                        No physical or digital evidence attached to this case.
                      </div>
                    ) : (
                      linkedEvidence.slice(0, 5).map((e: any) => (
                        <div key={e.id} className="workspace-row">
                          <div style={{ minWidth: '90px' }}>
                            <RecordIdentifier id={e.evidenceNumber || e.id} prefix="" />
                          </div>
                          <div style={{ flex: 1, fontSize: '12px', color: 'var(--text-primary)', fontWeight: 500 }}>
                            {e.title}
                          </div>
                          <StatusBadge status={e.status} />
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <div className="cyris-section-header">
                    <span className="cyris-section-title">
                      <span className="cyris-signal-marker" />
                      Case Tasks ({(caseData.tasks || []).length})
                    </span>
                    <Link href={`/events/${eventId}/tasks?sourceResourceId=${caseId}`} className="btn btn-secondary">
                      <Plus size={13} /> Create Task
                    </Link>
                  </div>
                  <div className="workspace-sheet">
                    {(caseData.tasks || []).length === 0 ? (
                      <div style={{ padding: '14px', fontSize: '12px', color: 'var(--text-dim)' }}>
                        No tasks have been created from this case.
                      </div>
                    ) : (
                      caseData.tasks.slice(0, 5).map((task: any) => (
                        <div key={task.id} className="workspace-row">
                          <RecordIdentifier id={task.taskNumber || task.id} prefix="" />
                          <div style={{ flex: 1, fontWeight: 500 }}>{task.title}</div>
                          <StatusBadge status={task.status} />
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <div className="cyris-section-header">
                    <span className="cyris-section-title">
                      <span className="cyris-signal-marker" />
                      Related Entities ({(caseData.entities || []).length})
                    </span>
                  </div>
                  <div className="workspace-sheet">
                    {(caseData.entities || []).length === 0 ? (
                      <div style={{ padding: '14px', fontSize: '12px', color: 'var(--text-dim)' }}>
                        No registry entities are linked to this case.
                      </div>
                    ) : (
                      caseData.entities.slice(0, 8).map((entity: any) => (
                        <div key={entity.id} className="workspace-row">
                          <span className="badge badge-neutral">{entity.resourceType}</span>
                          <div style={{ flex: 1, fontWeight: 500 }}>{entity.title}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Recent Case Activity */}
                <div>
                  <div className="cyris-section-header">
                    <span className="cyris-section-title">
                      <span className="cyris-signal-marker" />
                      Recent Case Activity
                    </span>
                    <button
                      onClick={() => setActiveTab('timeline')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        fontSize: '11px',
                        cursor: 'pointer',
                      }}
                    >
                      Full Chronology →
                    </button>
                  </div>
                  {timelineLoading ? (
                    <div style={{ padding: '14px', fontSize: '12px', color: 'var(--text-dim)' }}>
                      Loading activity spine...
                    </div>
                  ) : timelineError ? (
                    <ErrorState message={timelineError} onRetry={fetchTimeline} />
                  ) : timelineItems.length === 0 ? (
                    <div style={{ padding: '14px', fontSize: '12px', color: 'var(--text-dim)' }}>
                      No activity recorded for this case yet.
                    </div>
                  ) : (
                    <TimelineView items={timelineItems.slice(0, 4)} />
                  )}
                </div>
              </div>
            )}

            {/* TIMELINE TAB */}
            {activeTab === 'timeline' && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '16px',
                  }}
                >
                  <div style={{ fontSize: '13px', color: 'var(--color-text-dim)' }}>
                    Aggregated operational events, evidence custody transfers, and actions recorded for Case{' '}
                    <strong style={{ color: 'var(--color-text-main)' }}>{caseData.caseNumber}</strong>.
                  </div>
                  <button
                    onClick={fetchTimeline}
                    className="btn btn-secondary"
                    style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    Refresh Timeline
                  </button>
                </div>

                {timelineLoading ? (
                  <LoadingState message="Reconstructing case activity spine..." />
                ) : timelineError ? (
                  <ErrorState message={timelineError} onRetry={fetchTimeline} />
                ) : (
                  <TimelineView items={timelineItems} />
                )}
              </div>
            )}

            {/* EVIDENCE TAB */}
            {activeTab === 'evidence' && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '14px',
                  }}
                >
                  <div style={{ fontSize: '13px', color: 'var(--color-text-dim)' }}>
                    Physical and digital evidence registered and secured within this investigation.
                  </div>
                  <Link
                    href={`/events/${eventId}/evidence?caseId=${caseId}`}
                    className="btn btn-primary"
                    style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    <Plus size={14} /> Register Evidence
                  </Link>
                </div>

                {linkedEvidence.length === 0 ? (
                  <EmptyState
                    title="No evidence attached"
                    description="No evidence has been linked to this case yet."
                    actionLabel="Register Evidence"
                    onAction={() => router.push(`/events/${eventId}/evidence?caseId=${caseId}`)}
                  />
                ) : (
                  <div
                    style={{
                      background: 'var(--color-bg-surface)',
                      border: '1px solid var(--color-border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      overflow: 'hidden',
                    }}
                  >
                    <DataTable
                      columns={evidenceColumns}
                      data={linkedEvidence}
                      keyExtractor={(item) => item.id}
                      onRowClick={(item) => router.push(`/events/${eventId}/evidence/${item.id}`)}
                    />
                  </div>
                )}
              </div>
            )}

            {/* RELATIONS TAB */}
            {activeTab === 'relations' && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '14px',
                  }}
                >
                  <div style={{ fontSize: '13px', color: 'var(--color-text-dim)' }}>
                    Resource topology and relationship graph centered on this case.
                  </div>
                  <button
                    onClick={() => setShowRelModal(true)}
                    className="btn btn-primary"
                    style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    <Plus size={14} /> Add Relationship
                  </button>
                </div>

                <RelationshipGraph
                  centerResourceId={caseId}
                  relationships={relationships}
                  currentResourceTitle={caseData.title}
                  currentResourceType="CASE"
                  height="540px"
                  onNodeSelect={(node) => {
                    console.log('Selected node in graph:', node);
                  }}
                />
              </div>
            )}
          </div>

          {/* Contextual Right Inspector */}
          <RecordInspector
            title="Case Context & Controls"
            isOpen={inspectorOpen}
            onClose={() => setInspectorOpen(false)}
            rows={[
              { label: 'Case Identifier', value: caseData.caseNumber || caseData.id, copyable: true },
              { label: 'Canonical Resource ID', value: caseData.id, copyable: true },
              { label: 'Current Status', value: <StatusBadge status={caseData.status} /> },
              { label: 'Priority Level', value: <PriorityBadge priority={caseData.priority} /> },
              { label: 'Owning Unit', value: caseData.owningUnitId || 'Investigation Unit' },
              { label: 'Lead Investigator', value: caseData.leadUserId || 'None specified' },
              { label: 'Opened At', value: formatTime(caseData.createdAt) },
              { label: 'Last Modified', value: formatTime(caseData.updatedAt || caseData.createdAt) },
            ]}
            actions={
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {canUpdate && (
                  <button
                    onClick={() => setShowEditModal(true)}
                    className="btn btn-secondary"
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    Edit Case Metadata
                  </button>
                )}
                <button
                  onClick={() => setShowRelModal(true)}
                  className="btn btn-secondary"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  Link Another Resource
                </button>
              </div>
            }
          />
        </div>

        {/* Modal: Edit Case */}
        {showEditModal && (
          <div
            className="dialog-overlay"
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              backdropFilter: 'blur(2px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '16px',
            }}
          >
            <div
              className="dialog-surface"
              style={{
                width: '100%',
                maxWidth: '480px',
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-strong)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-lg)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  background: 'var(--color-bg-panel)',
                  borderBottom: '1px solid var(--color-border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Edit2 size={15} color="var(--color-accent-ops)" />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-main)' }}>
                    Modify Case {caseData.caseNumber}
                  </span>
                </div>
                <button
                  onClick={() => setShowEditModal(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', cursor: 'pointer' }}
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSaveEdit} className="dialog-body" style={{ padding: '18px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                      Status
                    </label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                      className="select-field"
                      style={{ width: '100%' }}
                    >
                      {(caseData.allowedTransitions?.length
                        ? caseData.allowedTransitions
                        : ['OPEN', 'INVESTIGATING', 'PENDING', 'REFERRED', 'CLOSED', 'ARCHIVED']
                      ).map((status: string) => (
                        <option key={status} value={status}>{status.replace('_', ' ')}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                      Priority
                    </label>
                    <select
                      value={editPriority}
                      onChange={(e) => setEditPriority(e.target.value)}
                      className="select-field"
                      style={{ width: '100%' }}
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="CRITICAL">Critical</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)' }}>
                      Summary
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowWritingAssistModal(true)}
                      className="btn btn-secondary"
                      style={{ fontSize: '11px', padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      <Sparkles size={11} style={{ color: 'var(--color-accent)' }} />
                      Assist Writing
                    </button>
                  </div>
                  <textarea
                    rows={4}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="input-field"
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="btn btn-secondary"
                    disabled={savingEdit}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={savingEdit}>
                    {savingEdit ? 'Updating...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Add Relationship */}
        {showRelModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              backdropFilter: 'blur(2px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '16px',
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: '460px',
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-strong)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-lg)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  background: 'var(--color-bg-panel)',
                  borderBottom: '1px solid var(--color-border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Share2 size={15} color="var(--color-accent-ops)" />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-main)' }}>
                    Establish Graph Link
                  </span>
                </div>
                <button
                  onClick={() => setShowRelModal(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', cursor: 'pointer' }}
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleAddRelationship} style={{ padding: '18px' }}>
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                    Related resource *
                  </label>
                  <select
                    required
                    value={targetResourceId}
                    onChange={(e) => setTargetResourceId(e.target.value)}
                    className="select-field"
                    style={{ width: '100%' }}
                  >
                    <option value="">Select a resource</option>
                    {relationshipCandidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.type} — {candidate.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: '18px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                    Relationship Type
                  </label>
                  <select
                    value={relType}
                    onChange={(e) => setRelType(e.target.value)}
                    className="select-field"
                    style={{ width: '100%' }}
                  >
                    <option value="RELATED_TO">RELATED_TO</option>
                    <option value="INVESTIGATES">INVESTIGATES</option>
                    <option value="AFFECTS">AFFECTS</option>
                    <option value="SUSPECT_IN">SUSPECT_IN</option>
                    <option value="VICTIM_OF">VICTIM_OF</option>
                    <option value="USED_IN">USED_IN</option>
                    <option value="COMMUNICATED_WITH">COMMUNICATED_WITH</option>
                  </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setShowRelModal(false)}
                    className="btn btn-secondary"
                    disabled={addingRel}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={addingRel}>
                    {addingRel ? 'Linking...' : 'Connect Link'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* CYRIS Intelligence Modals */}
        <SummarizeCaseModal
          isOpen={showSummarizeModal}
          onClose={() => setShowSummarizeModal(false)}
          caseId={caseId}
          caseNumber={caseData.caseNumber || caseData.id}
          onApplySummary={async (newSummary) => {
            setEditDescription(newSummary);
            setCaseData((prev: any) => ({ ...prev, summary: newSummary }));
            try {
              await apiClient.updateCase(eventId, caseId, { summary: newSummary });
            } catch (err) {
              console.error('Failed to persist applied summary:', err);
            }
          }}
        />

        <WritingAssistModal
          isOpen={showWritingAssistModal}
          onClose={() => setShowWritingAssistModal(false)}
          initialText={editDescription}
          onApply={(improved) => setEditDescription(improved)}
          fieldLabel="Case Summary"
          context="case_summary"
        />
      </div>
    </AppShell>
  );
}

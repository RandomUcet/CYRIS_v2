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
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  AlertTriangle,
  Briefcase,
  Clock,
  Share2,
  Layers,
  ArrowRight,
  Edit2,
  X,
  Plus,
} from 'lucide-react';

export default function IncidentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { formatTime } = usePreferences();
  const eventId = params.eventId as string;
  const incidentId = params.incidentId as string;
  const { hasPermission } = useAuth();

  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'relations'>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [incidentData, setIncidentData] = useState<any>(null);
  const [timelineItems, setTimelineItems] = useState<any[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  // Edit Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editStatus, setEditStatus] = useState('REPORTED');
  const [editPriority, setEditPriority] = useState('HIGH');
  const [editSummary, setEditSummary] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Add Relationship Modal
  const [showRelModal, setShowRelModal] = useState(false);
  const [targetResourceId, setTargetResourceId] = useState('');
  const [relType, setRelType] = useState('AFFECTS');
  const [addingRel, setAddingRel] = useState(false);

  const canUpdate = hasPermission('incident.update');

  const fetchIncidentDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getIncident(eventId, incidentId);
      if (res.ok && res.data) {
        setIncidentData(res.data);
        setEditStatus(res.data.status || 'REPORTED');
        setEditPriority(res.data.priority || 'HIGH');
        setEditSummary(res.data.summary || '');
      } else {
        setError(res.error || 'Failed to load incident record');
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
      const res = await apiClient.getResourceTimeline(incidentId);
      if (res.ok && res.data) {
        setTimelineItems(Array.isArray(res.data) ? res.data : []);
      }
    } catch (err) {
      console.error('Failed to load incident timeline', err);
    } finally {
      setTimelineLoading(false);
    }
  };

  useEffect(() => {
    if (eventId && incidentId) {
      fetchIncidentDetails();
    }
  }, [eventId, incidentId]);

  useEffect(() => {
    if (incidentId && activeTab === 'timeline') {
      fetchTimeline();
    }
  }, [incidentId, activeTab]);

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingEdit(true);
    try {
      const res = await apiClient.updateIncident(eventId, incidentId, {
        status: editStatus,
        priority: editPriority,
        summary: editSummary,
      });

      if (res.ok) {
        setShowEditModal(false);
        fetchIncidentDetails();
      } else {
        alert(res.error || 'Update failed');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleAddRelationship = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetResourceId.trim()) return;
    setAddingRel(true);
    try {
      const res = await apiClient.createRelationship(incidentId, {
        targetResourceId: targetResourceId.trim(),
        relationshipType: relType,
      });
      if (res.ok) {
        setShowRelModal(false);
        setTargetResourceId('');
        fetchIncidentDetails();
      } else {
        alert(res.error || 'Failed to create relationship');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setAddingRel(false);
    }
  };

  if (loading) {
    return (
      <AppShell
        breadcrumbs={[
          { label: 'Operations', href: `/events/${eventId}/overview` },
          { label: 'Incidents', href: `/events/${eventId}/incidents` },
          { label: 'Loading...' },
        ]}
      >
        <div style={{ padding: '40px' }}>
          <LoadingState message="Accessing incident record..." />
        </div>
      </AppShell>
    );
  }

  if (error || !incidentData) {
    return (
      <AppShell
        breadcrumbs={[
          { label: 'Operations', href: `/events/${eventId}/overview` },
          { label: 'Incidents', href: `/events/${eventId}/incidents` },
          { label: 'Error' },
        ]}
      >
        <div style={{ padding: '40px' }}>
          <ErrorState message={error || 'Incident not found'} onRetry={fetchIncidentDetails} />
        </div>
      </AppShell>
    );
  }

  const linkedCase = incidentData.case;
  const relationships = incidentData.relationships || [];

  return (
    <AppShell
      breadcrumbs={[
        { label: 'Operations', href: `/events/${eventId}/overview` },
        { label: 'Incidents', href: `/events/${eventId}/incidents` },
        { label: incidentData.incidentNumber || incidentData.id },
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <RecordHeader
          identifier={incidentData.incidentNumber || incidentData.id}
          title={incidentData.title}
          status={<StatusBadge status={incidentData.status} />}
          priority={<PriorityBadge priority={incidentData.priority} />}
          classification={<span className="badge badge-neutral">OPERATIONAL ALERT</span>}
          owningUnit={incidentData.owningUnitId ? `Unit: ${incidentData.owningUnitId.slice(0, 8)}` : undefined}
          lead={incidentData.leadUserId ? `Owner: ${incidentData.leadUserId.slice(0, 8)}` : 'SOC Triage Desk'}
          actions={
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setInspectorOpen(!inspectorOpen)}
                className={`btn ${inspectorOpen ? 'btn-secondary' : 'btn-ghost'}`}
                style={{ fontSize: '12px' }}
              >
                <Layers size={13} style={{ marginRight: '4px' }} />
                {inspectorOpen ? 'Hide' : 'Inspect'}
              </button>
              {canUpdate && (
                <button
                  onClick={() => setShowEditModal(true)}
                  className="btn btn-secondary"
                  style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                >
                  <Edit2 size={13} />
                  Update Triage
                </button>
              )}
            </div>
          }
        />

        {/* Tabs */}
        <RecordTabs
          tabs={[
            { id: 'overview', label: 'Triage Overview', icon: <AlertTriangle size={14} /> },
            { id: 'timeline', label: 'Timeline', count: timelineItems.length, icon: <Clock size={14} /> },
            { id: 'relations', label: 'Affected Resources & Graph', count: relationships.length, icon: <Share2 size={14} /> },
          ]}
          activeTab={activeTab}
          onChange={(tab) => setActiveTab(tab as any)}
        />

        {/* Body */}
        <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Summary */}
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
                    Incident Summary & Impact
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--color-text-main)', lineHeight: '1.6' }}>
                    {incidentData.summary || 'No detailed impact summary documented.'}
                  </div>
                </div>

                {/* Linked Case */}
                {linkedCase ? (
                  <div
                    style={{
                      background: 'rgba(2, 132, 199, 0.05)',
                      border: '1px solid var(--color-border-subtle)',
                      borderLeft: '3px solid var(--color-accent-ops)',
                      borderRadius: 'var(--radius-md)',
                      padding: '14px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <Briefcase size={14} color="var(--color-accent-ops)" />
                        <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-accent-ops)' }}>
                          Escalated Investigation Case
                        </span>
                        <RecordIdentifier id={linkedCase.caseNumber || linkedCase.id} prefix="" />
                        <StatusBadge status={linkedCase.status} />
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-main)' }}>
                        {linkedCase.title}
                      </div>
                    </div>
                    <Link
                      href={`/events/${eventId}/cases/${linkedCase.id}`}
                      className="btn btn-secondary"
                      style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      Open Case <ArrowRight size={12} />
                    </Link>
                  </div>
                ) : (
                  <div
                    style={{
                      background: 'var(--color-bg-surface)',
                      border: '1px dashed var(--color-border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '16px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>
                      This incident has not yet been elevated or linked to a formal investigation case.
                    </div>
                    <Link
                      href={`/events/${eventId}/cases`}
                      className="btn btn-secondary"
                      style={{ fontSize: '11px' }}
                    >
                      Escalate to New Case
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* TIMELINE TAB */}
            {activeTab === 'timeline' && (
              <div>
                <div style={{ marginBottom: '14px', fontSize: '13px', color: 'var(--color-text-dim)' }}>
                  Chronological event history for Incident{' '}
                  <strong style={{ color: 'var(--color-text-main)' }}>{incidentData.incidentNumber}</strong>.
                </div>
                {timelineLoading ? (
                  <LoadingState message="Reconstructing incident timeline..." />
                ) : (
                  <TimelineView items={timelineItems} />
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
                    Affected infrastructure, target systems, and connected resources.
                  </div>
                  <button
                    onClick={() => setShowRelModal(true)}
                    className="btn btn-primary"
                    style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    <Plus size={14} /> Link Resource
                  </button>
                </div>

                <RelationshipGraph
                  centerResourceId={incidentId}
                  relationships={relationships}
                  currentResourceTitle={incidentData.title}
                  currentResourceType="INCIDENT"
                  height="540px"
                />
              </div>
            )}
          </div>

          {/* Contextual Right Inspector */}
          <RecordInspector
            title="Incident Triage Inspector"
            isOpen={inspectorOpen}
            onClose={() => setInspectorOpen(false)}
            rows={[
              { label: 'Incident Number', value: incidentData.incidentNumber || incidentData.id, copyable: true },
              { label: 'Resource UUID', value: incidentData.id, copyable: true },
              { label: 'Current Status', value: <StatusBadge status={incidentData.status} /> },
              { label: 'Severity Level', value: <PriorityBadge priority={incidentData.priority} /> },
              { label: 'Occurred / Detected', value: incidentData.occurredAt ? formatTime(incidentData.occurredAt) : 'Not recorded' },
              { label: 'Assigned Lead', value: incidentData.leadUserId || 'SOC Shift Lead' },
              { label: 'Connected Case', value: linkedCase?.caseNumber || 'Unlinked' },
              { label: 'Created At', value: formatTime(incidentData.createdAt) },
            ]}
          />
        </div>

        {/* Modal: Update Triage */}
        {showEditModal && (
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
                    Update Incident Triage Status
                  </span>
                </div>
                <button
                  onClick={() => setShowEditModal(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', cursor: 'pointer' }}
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSaveEdit} style={{ padding: '18px' }}>
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
                      <option value="REPORTED">Reported</option>
                      <option value="TRIAGED">Triaged</option>
                      <option value="CONTAINED">Contained</option>
                      <option value="RESOLVED">Resolved</option>
                      <option value="CLOSED">Closed</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                      Severity
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
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                    Updated Impact Summary
                  </label>
                  <textarea
                    rows={4}
                    value={editSummary}
                    onChange={(e) => setEditSummary(e.target.value)}
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
                    {savingEdit ? 'Saving...' : 'Save Triage'}
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
                    Link Affected Resource
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
                    Resource UUID *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 0192a4b5-..."
                    value={targetResourceId}
                    onChange={(e) => setTargetResourceId(e.target.value)}
                    className="input-field"
                    style={{ width: '100%' }}
                    autoFocus
                  />
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
                    <option value="AFFECTS">AFFECTS</option>
                    <option value="TARGETS">TARGETS</option>
                    <option value="ORIGINATED_FROM">ORIGINATED_FROM</option>
                    <option value="RELATED_TO">RELATED_TO</option>
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
      </div>
    </AppShell>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { ResourcePicker } from '@/components/common/ResourcePicker';
import { RecordHeader } from '@/components/common/RecordHeader';
import { RecordTabs } from '@/components/common/RecordTabs';
import { RecordInspector } from '@/components/common/RecordInspector';
import { RecordIdentifier, StatusBadge } from '@/components/common/Badges';
import { TimelineView } from '@/components/common/TimelineView';
import { RelationshipGraph } from '@/components/common/RelationshipGraph';
import { EvidenceLabel } from '@/components/common/EvidenceLabel';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { useEvent } from '@/contexts/EventContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  FolderOpen,
  ShieldCheck,
  Clock,
  Share2,
  Printer,
  ArrowRightLeft,
  ArrowRight,
  Briefcase,
  Layers,
  MapPin,
  X,
  User,
  Plus,
} from 'lucide-react';

export default function EvidenceDetailPage() {
  const {eventId,evidenceId}=useParams<{eventId:string;evidenceId:string}>();
  const {currentUser,viewAs,loading}=useAuth();
  if(loading)return <AppShell><LoadingState message="Loading workspace…"/></AppShell>;
  return <EvidenceWorkspace key={JSON.stringify([eventId,evidenceId,currentUser?.user.id,viewAs?.id])} eventId={eventId} evidenceId={evidenceId}/>;
}
function EvidenceWorkspace({eventId,evidenceId}:{eventId:string;evidenceId:string}) {
  const router = useRouter();
  const { hasPermission, user } = useAuth();
  const { currentEvent } = useEvent();
  const { formatTime, locale } = usePreferences();

  const [activeTab, setActiveTab] = useState<'overview' | 'custody' | 'timeline' | 'relations'>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [evidenceData, setEvidenceData] = useState<any>(null);
  const [timelineItems, setTimelineItems] = useState<any[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // Inspector & Modals
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferData, setTransferData] = useState({
    toUserId: '',
    toUnitId: '',
    reason: '',
    storageLocation: '',
  });
  const [transferring, setTransferring] = useState(false);

  // Add Relationship Modal
  const [showRelModal, setShowRelModal] = useState(false);
  const [targetResourceId, setTargetResourceId] = useState('');
  const [relType, setRelType] = useState('RELATED_TO');
  const [addingRel, setAddingRel] = useState(false);

  const canTransfer = hasPermission('evidence.transfer', eventId);

  const fetchEvidenceDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getEvidenceItem(eventId, evidenceId);
      if (res.ok && res.data) {
        setEvidenceData(res.data);
      } else {
        setError(res.error || 'Failed to load evidence item');
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
      const res = await apiClient.getResourceTimeline(evidenceId);
      if (res.ok && res.data) {
        setTimelineItems(Array.isArray(res.data) ? res.data : []);
      }
    } catch (err) {
      console.error('Failed to load evidence timeline', err);
    } finally {
      setTimelineLoading(false);
    }
  };

  useEffect(() => {
    if (eventId && evidenceId) {
      fetchEvidenceDetails();
    }
  }, [eventId, evidenceId]);

  useEffect(() => {
    if (evidenceId && activeTab === 'timeline') {
      fetchTimeline();
    }
  }, [evidenceId, activeTab]);

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferData.reason.trim()) {
      alert('Custody transfer reason is mandatory for legal continuity.');
      return;
    }

    setTransferring(true);
    try {
      const res = await apiClient.transferEvidence(eventId, evidenceId, {
        toUserId: transferData.toUserId.trim() || undefined,
        toUnitId: transferData.toUnitId.trim() || undefined,
        reason: transferData.reason.trim(),
        storageLocation: transferData.storageLocation.trim() || undefined,
      });

      if (res.ok) {
        setShowTransferModal(false);
        setTransferData({ toUserId: '', toUnitId: '', reason: '', storageLocation: '' });
        fetchEvidenceDetails();
      } else {
        alert(res.error || 'Custody transfer failed');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setTransferring(false);
    }
  };

  const handleAddRelationship = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetResourceId.trim()||targetResourceId===evidenceId||addingRel) return;
    setAddingRel(true);
    try {
      const res = await apiClient.createRelationship(evidenceId, {
        targetResourceId: targetResourceId.trim(),
        relationshipType: relType,
      });
      if (res.ok) {
        setShowRelModal(false);
        setTargetResourceId('');
        fetchEvidenceDetails();
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
          { label: 'Operations Support', href: `/events/${eventId}/evidence` },
          { label: 'Evidence', href: `/events/${eventId}/evidence` },
          { label: 'Loading...' },
        ]}
      >
        <div style={{ padding: '40px' }}>
          <LoadingState message="Accessing evidence vault & chain of custody..." />
        </div>
      </AppShell>
    );
  }

  if (error || !evidenceData) {
    return (
      <AppShell
        breadcrumbs={[
          { label: 'Operations Support', href: `/events/${eventId}/evidence` },
          { label: 'Evidence', href: `/events/${eventId}/evidence` },
          { label: 'Error' },
        ]}
      >
        <div style={{ padding: '40px' }}>
          <ErrorState message={error || 'Evidence not found'} onRetry={fetchEvidenceDetails} />
        </div>
      </AppShell>
    );
  }

  const evidence = evidenceData.evidence || evidenceData;
  const custodyHistory = evidenceData.custodyHistory ?? evidenceData.custody ?? evidenceData.transfers ?? [];
  const linkedCase = evidenceData.case;
  const relationships = evidenceData.relationships || [];

  return (
    <AppShell
      breadcrumbs={[
        { label: 'Operations Support', href: `/events/${eventId}/evidence` },
        { label: 'Evidence', href: `/events/${eventId}/evidence` },
        { label: evidence.evidenceNumber || evidence.id },
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Record Header */}
        <RecordHeader
          identifier={evidence.evidenceNumber || evidence.id}
          title={evidence.title}
          status={<StatusBadge status={evidence.status} />}
          priority={<span className="badge badge-neutral">{evidence.type}</span>}
          classification={<span className="badge badge-neutral">FORENSIC CUSTODY</span>}
          owningUnit={evidence.currentHolderUnitId ? `Unit: ${evidence.currentHolderUnitId.slice(0, 8)}` : undefined}
          lead={evidence.currentHolderUserId ? `Holder: ${evidence.currentHolderUserId.slice(0, 8)}` : 'Secure Storage'}
          actions={
            <div style={{ display: 'flex', gap: '8px' }}>
              {hasPermission('lab.request', eventId) && (
                <Link className="btn btn-secondary" href={`/events/${eventId}/lab?fromEvidence=${evidenceId}`}>
                  {locale === 'cs' ? 'Zadat laboratorní rozbor' : 'Request lab analysis'}
                </Link>
              )}
              <button
                onClick={() => setShowPrintModal(true)}
                className="btn btn-secondary"
                style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                title="Print physical evidence identification label"
              >
                <Printer size={13} />
                Print Label
              </button>
              {canTransfer && (
                <button
                  onClick={() => setShowTransferModal(true)}
                  className="btn btn-primary"
                  style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                >
                  <ArrowRightLeft size={13} />
                  Transfer Custody
                </button>
              )}
              <button
                onClick={() => setInspectorOpen(!inspectorOpen)}
                className={`btn ${inspectorOpen ? 'btn-secondary' : 'btn-ghost'}`}
                style={{ fontSize: '12px' }}
              >
                <Layers size={13} style={{ marginRight: '4px' }} />
                {inspectorOpen ? 'Hide' : 'Inspect'}
              </button>
            </div>
          }
        />

        {/* Local Navigation Tabs */}
        <RecordTabs
          tabs={[
            { id: 'overview', label: 'Overview', icon: <FolderOpen size={14} /> },
            { id: 'custody', label: 'Chain of Custody', count: custodyHistory.length, icon: <ShieldCheck size={14} /> },
            { id: 'timeline', label: 'Timeline', count: timelineItems.length, icon: <Clock size={14} /> },
            { id: 'relations', label: 'Relations', count: relationships.length, icon: <Share2 size={14} /> },
          ]}
          activeTab={activeTab}
          onChange={(tab) => setActiveTab(tab as any)}
        />

        {/* Workbench Body */}
        <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Description & Storage */}
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
                    Physical & Forensic Description
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--color-text-main)', lineHeight: '1.6' }}>
                    {evidence.description || 'No physical description recorded.'}
                  </div>
                </div>

                {/* Storage & Holder Card */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div
                    style={{
                      background: 'var(--color-bg-surface)',
                      border: '1px solid var(--color-border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '14px 18px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <MapPin size={15} color="var(--color-accent-ops)" />
                      <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-dim)' }}>
                        Current Storage Location
                      </span>
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-main)' }}>
                      {evidence.storageLocation || 'Secure Evidence Room'}
                    </div>
                  </div>

                  <div
                    style={{
                      background: 'var(--color-bg-surface)',
                      border: '1px solid var(--color-border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '14px 18px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <User size={15} color="var(--color-accent-ops)" />
                      <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-dim)' }}>
                        Current Responsible Custodian
                      </span>
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-main)' }}>
                      {evidence.currentHolderUserId ? `User ${evidence.currentHolderUserId.slice(0, 8)}` : 'Station Custodian / Unit Vault'}
                    </div>
                  </div>
                </div>

                {/* Linked Case Reference */}
                {linkedCase && (
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
                          Associated Investigation Case
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
                )}
              </div>
            )}

            {/* CHAIN OF CUSTODY TAB */}
            {activeTab === 'custody' && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '16px',
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--color-text-main)' }}>
                      Legal Chain of Custody Record
                    </h3>
                    <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: 'var(--color-text-dim)' }}>
                      Unbroken provenance verification from initial scene seizure through forensic custody transfers.
                    </p>
                  </div>
                  {canTransfer && (
                    <button
                      onClick={() => setShowTransferModal(true)}
                      className="btn btn-primary"
                      style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                    >
                      <ArrowRightLeft size={13} />
                      Log Custody Transfer
                    </button>
                  )}
                </div>

                {custodyHistory.length === 0 ? (
                  <div
                    style={{
                      background: 'var(--color-bg-surface)',
                      border: '1px solid var(--color-border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '30px',
                      textAlign: 'center',
                      color: 'var(--color-text-dim)',
                    }}
                  >
                    No transfer events registered yet. Item remains in initial seizure state.
                  </div>
                ) : (
                  <div className="custody-stream" style={{ maxWidth: '800px' }}>
                    {custodyHistory.map((entry: any, index: number) => {
                      const timeStr = formatTime(entry.transferredAt || entry.createdAt);
                      const fromStr = entry.fromUserId ? `User (${entry.fromUserId.slice(0, 8)})` : 'Scene / Seizure';
                      const toStr = entry.toUserId
                        ? `User (${entry.toUserId.slice(0, 8)})`
                        : entry.toUnitId
                        ? `Unit (${entry.toUnitId.slice(0, 8)})`
                        : 'Forensics Vault';
                      const action = entry.action || (index === 0 ? 'SECURED' : 'TRANSFER');

                      return (
                        <div key={entry.id || index} className="custody-stream-item">
                          <div className="custody-time">{timeStr}</div>
                          <div className="custody-action">{action}</div>
                          <div style={{ flex: 1 }}>
                            <div className="custody-flow">
                              <span>{fromStr}</span>
                              <span style={{ color: 'var(--text-muted)' }}>→</span>
                              <span>{toStr}</span>
                            </div>
                            {entry.reason && <div className="custody-meta">Reason: {entry.reason}</div>}
                            {entry.storageLocation && (
                              <div className="custody-meta" style={{ color: 'var(--text-dim)' }}>
                                Storage: {entry.storageLocation}
                              </div>
                            )}
                          </div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)' }}>
                            #{index + 1}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TIMELINE TAB */}
            {activeTab === 'timeline' && (
              <div>
                <div style={{ marginBottom: '14px', fontSize: '13px', color: 'var(--color-text-dim)' }}>
                  Operational and lifecycle activity log for Evidence{' '}
                  <strong style={{ color: 'var(--color-text-main)' }}>{evidence.evidenceNumber}</strong>.
                </div>
                {timelineLoading ? (
                  <LoadingState message="Reconstructing evidence activity log..." />
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
                    Resource topology and relationship graph centered on this evidence item.
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
                  centerResourceId={evidenceId}
                  relationships={relationships}
                  currentResourceTitle={evidence.title}
                  currentResourceType="EVIDENCE"
                  height="540px"
                />
              </div>
            )}
          </div>

          {/* Contextual Right Inspector */}
          <RecordInspector
            title="Evidence Vault Inspector"
            isOpen={inspectorOpen}
            onClose={() => setInspectorOpen(false)}
            rows={[
              { label: 'Evidence Number', value: evidence.evidenceNumber || evidence.id, copyable: true },
              { label: 'Resource UUID', value: evidence.id, copyable: true },
              { label: 'Category / Type', value: evidence.type },
              { label: 'Custody Status', value: <StatusBadge status={evidence.status} /> },
              { label: 'Associated Case', value: linkedCase?.caseNumber || 'None' },
              { label: 'Current Holder', value: evidence.currentHolderUserId || 'Vault Custodian' },
              { label: 'Storage Location', value: evidence.storageLocation || 'Vault' },
              { label: 'Secured At', value: formatTime(evidence.createdAt) },
            ]}
            actions={
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  onClick={() => setShowPrintModal(true)}
                  className="btn btn-secondary"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <Printer size={13} style={{ marginRight: '6px' }} />
                  Print Forensic Label
                </button>
                {canTransfer && (
                  <button
                    onClick={() => setShowTransferModal(true)}
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    Transfer Custody
                  </button>
                )}
              </div>
            }
          />
        </div>

        {/* Modal: Transfer Custody */}
        {showTransferModal && (
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
                  <ArrowRightLeft size={16} color="var(--color-accent-ops)" />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-main)' }}>
                    Execute Custody Transfer
                  </span>
                </div>
                <button
                  onClick={() => setShowTransferModal(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', cursor: 'pointer' }}
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleTransfer} style={{ padding: '18px' }}>
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                    Reason for Transfer (Mandatory) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Forensic image acquisition requested by DFIR"
                    value={transferData.reason}
                    onChange={(e) => setTransferData({ ...transferData, reason: e.target.value })}
                    className="input-field"
                    style={{ width: '100%' }}
                    autoFocus
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                      Recipient User UUID
                    </label>
                    <input
                      type="text"
                      placeholder="Optional User UUID"
                      value={transferData.toUserId}
                      onChange={(e) => setTransferData({ ...transferData, toUserId: e.target.value })}
                      className="input-field"
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                      Recipient Unit UUID
                    </label>
                    <input
                      type="text"
                      placeholder="Optional Unit UUID"
                      value={transferData.toUnitId}
                      onChange={(e) => setTransferData({ ...transferData, toUnitId: e.target.value })}
                      className="input-field"
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '18px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                    New Physical Storage Location
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Digital Forensics Lab - Locker 3"
                    value={transferData.storageLocation}
                    onChange={(e) => setTransferData({ ...transferData, storageLocation: e.target.value })}
                    className="input-field"
                    style={{ width: '100%' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setShowTransferModal(false)}
                    className="btn btn-secondary"
                    disabled={transferring}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={transferring}>
                    {transferring ? 'Logging Transfer...' : 'Commit Transfer'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Print Evidence Identification Label */}
        {showPrintModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
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
                padding: '20px',
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Printer size={16} color="var(--color-accent-ops)" />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-main)' }}>
                    Forensic Physical Label
                  </span>
                </div>
                <button
                  onClick={() => setShowPrintModal(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', cursor: 'pointer' }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* The SVG QR & Barcode Evidence Label */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                <EvidenceLabel
                  evidenceNumber={evidence.evidenceNumber || 'E-0001'}
                  title={evidence.title}
                  eventName={currentEvent?.name || 'CZECH CYBERTRON 2027'}
                  caseNumber={linkedCase?.caseNumber}
                  securedAt={evidence.createdAt}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  onClick={() => setShowPrintModal(false)}
                  className="btn btn-secondary"
                >
                  Close
                </button>
                <button
                  onClick={() => window.print()}
                  className="btn btn-primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Printer size={14} />
                  Print Label Now
                </button>
              </div>
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
                    Connect Evidence to Resource
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
                  <ResourcePicker eventId={eventId} label="Related record" required disabled={addingRel} value={targetResourceId} onChange={setTargetResourceId} placeholder="Search by name, title or identifier…"/>
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
                    <option value="ATTACHED_TO">ATTACHED_TO</option>
                    <option value="EXTRACTED_FROM">EXTRACTED_FROM</option>
                    <option value="USED_IN">USED_IN</option>
                    <option value="FOUND_AT">FOUND_AT</option>
                    <option value="BELONGS_TO">BELONGS_TO</option>
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

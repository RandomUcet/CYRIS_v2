'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import {
  apiClient,
} from '@/lib/api-client';
import { usePreferences } from '@/contexts/PreferencesContext';
import type {
  ScenarioControlRunSheet,
  ScenarioInjectResponse,
  ScenarioPhaseResponse,
  AudiencePreviewResponse,
} from '@cyris/contracts';

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('cs-CZ', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

const compactButtonStyle: React.CSSProperties = {
  padding: '5px 9px',
  backgroundColor: 'var(--bg-active)',
  border: '1px solid var(--border-subtle)',
  color: 'var(--text-primary)',
  borderRadius: '3px',
  fontSize: '11px',
  cursor: 'pointer',
};

const compactInputStyle: React.CSSProperties = {
  padding: '5px 7px',
  backgroundColor: 'var(--bg-card)',
  border: '1px solid var(--border-subtle)',
  color: 'var(--text-primary)',
  fontSize: '11px',
};

export default function ScenarioControlPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [runSheet, setRunSheet] = useState<ScenarioControlRunSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedInject, setSelectedInject] = useState<ScenarioInjectResponse | null>(null);

  // Modals & Action States
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Audience Preview Modal State
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [audiencePreview, setAudiencePreview] = useState<AudiencePreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Create Inject Modal State
  const [showCreateInjectModal, setShowCreateInjectModal] = useState(false);
  const [showCreatePhaseModal, setShowCreatePhaseModal] = useState(false);
  const [newPhaseCode, setNewPhaseCode] = useState('');
  const [newPhaseTitle, setNewPhaseTitle] = useState('');
  const [newPhaseDescription, setNewPhaseDescription] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newSummary, setNewSummary] = useState('');
  const [newParticipantTitle, setNewParticipantTitle] = useState('');
  const [newParticipantContent, setNewParticipantContent] = useState('');
  const [newPriority, setNewPriority] = useState<'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'>('NORMAL');
  const [newTriggerType, setNewTriggerType] = useState<'MANUAL' | 'SCHEDULED_TIME' | 'CONDITION'>('MANUAL');
  const [newReleasePolicy, setNewReleasePolicy] = useState<'MANUAL_CONFIRMATION' | 'AUTO_RELEASE'>('MANUAL_CONFIRMATION');
  const [newNotes, setNewNotes] = useState('');
  const [newPhaseId, setNewPhaseId] = useState('');
  const [newScheduledAt, setNewScheduledAt] = useState('');
  const [newEffect, setNewEffect] = useState<'NONE' | 'CREATE_INCIDENT'>('NONE');
  const [units, setUnits] = useState<Array<{ id: string; name: string }>>([]);
  const [newTargetUnitId, setNewTargetUnitId] = useState('');
  const [clockTime, setClockTime] = useState('');

  // Fetch Run Sheet
  const loadRunSheet = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    const res = await apiClient.getScenarioControlRunSheet(eventId);
    if (res.ok && res.data) {
      setRunSheet(res.data);
      // Keep selected inject in sync
      if (selectedInject) {
        const updated = res.data.injects.find((i) => i.id === selectedInject.id);
        if (updated) setSelectedInject(updated);
      }
    } else {
      setError(res.error || 'Failed to load scenario control run sheet');
    }
    if (!quiet) setLoading(false);
  }, [eventId, selectedInject]);

  useEffect(() => {
    loadRunSheet();
    apiClient.getUnits(eventId).then((res) => {
      if (res.ok && res.data) {
        setUnits(res.data.map((unit: { id: string; name: string }) => ({ id: unit.id, name: unit.name })));
      }
    });
    // Lightweight polling every 4 seconds
    const interval = setInterval(() => {
      loadRunSheet(true);
    }, 4000);
    return () => clearInterval(interval);
  }, [eventId]);

  // Actions
  const handleRelease = async (injectId: string) => {
    const inject = runSheet?.injects.find((item) => item.id === injectId);
    if (!inject) return;
    const target = inject.targets[0]?.unitName || inject.targets[0]?.userFullName || 'ALL EVENT';
    if (!confirm(`Release ${inject.injectNumber} — ${inject.title}?\nTarget: ${target}\nScenario time: ${formatDateTime(runSheet?.clock.scenarioTime)}`)) return;
    setActionLoading(true);
    const res = await apiClient.releaseScenarioInject(eventId, injectId);
    if (!res.ok) {
      alert(`Release failed: ${res.error}`);
    } else {
      await loadRunSheet(true);
    }
    setActionLoading(false);
  };

  const handleClock = async (action: 'PAUSE' | 'RESUME' | 'ADVANCE' | 'SET_TIME') => {
    const res = await apiClient.updateScenarioClock(eventId, {
      action,
      minutes: action === 'ADVANCE' ? 5 : undefined,
      scenarioTime: action === 'SET_TIME' ? new Date(clockTime).toISOString() : undefined,
    });
    if (!res.ok) alert(`Clock update failed: ${res.error}`);
    else await loadRunSheet(true);
  };

  const handleOverrideRelease = async () => {
    if (!selectedInject) return;
    if (!overrideReason || overrideReason.trim().length < 5) {
      setOverrideError('Mandatory override reason required (min 5 characters)');
      return;
    }
    setActionLoading(true);
    setOverrideError(null);
    const res = await apiClient.overrideReleaseScenarioInject(eventId, selectedInject.id, overrideReason);
    if (!res.ok) {
      setOverrideError(res.error || 'Override release failed');
    } else {
      setShowOverrideModal(false);
      setOverrideReason('');
      await loadRunSheet(true);
    }
    setActionLoading(false);
  };

  const handleCancelInject = async (injectId: string) => {
    if (!confirm('Are you sure you want to cancel this inject?')) return;
    setActionLoading(true);
    const res = await apiClient.cancelScenarioInject(eventId, injectId);
    if (!res.ok) {
      alert(`Cancel failed: ${res.error}`);
    } else {
      await loadRunSheet(true);
    }
    setActionLoading(false);
  };

  const handleOpenPreview = async (injectId: string) => {
    setShowPreviewModal(true);
    setPreviewLoading(true);
    setAudiencePreview(null);
    const res = await apiClient.previewScenarioAudience(eventId, injectId);
    if (res.ok && res.data) {
      setAudiencePreview(res.data);
    } else {
      alert(`Preview failed: ${res.error}`);
      setShowPreviewModal(false);
    }
    setPreviewLoading(false);
  };

  const handleActivatePhase = async (phase: ScenarioPhaseResponse) => {
    if (!confirm(`Activate phase ${phase.code} — ${phase.title}?`)) return;
    const res = await apiClient.updateScenarioPhase(eventId, phase.id, {
      status: 'ACTIVE',
      forceActive: true,
    });
    if (!res.ok) {
      alert(`Phase activation failed: ${res.error}`);
    } else {
      await loadRunSheet(true);
    }
  };

  const handleCompletePhase = async (phase: ScenarioPhaseResponse) => {
    const res = await apiClient.updateScenarioPhase(eventId, phase.id, {
      status: 'COMPLETED',
    });
    if (!res.ok) {
      alert(`Phase completion failed: ${res.error}`);
    } else {
      await loadRunSheet(true);
    }
  };

  const handleCreatePhase = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newPhaseCode.trim() || !newPhaseTitle.trim()) {
      alert('Phase code and name are required.');
      return;
    }
    setActionLoading(true);
    const res = await apiClient.createScenarioPhase(eventId, {
      code: newPhaseCode.trim(),
      title: newPhaseTitle.trim(),
      description: newPhaseDescription.trim() || undefined,
      sequence: (runSheet?.phases.length ?? 0) + 1,
      status: 'PLANNED',
    });
    if (!res.ok) {
      alert(`Create phase failed: ${res.error}`);
    } else {
      setShowCreatePhaseModal(false);
      setNewPhaseCode('');
      setNewPhaseTitle('');
      setNewPhaseDescription('');
      await loadRunSheet(true);
    }
    setActionLoading(false);
  };

  const handleCreateInject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newSummary.trim()) {
      alert('Title and Controller Summary are required.');
      return;
    }
    setActionLoading(true);
    const res = await apiClient.createScenarioInject(eventId, {
      phaseId: newPhaseId || undefined,
      title: newTitle.trim(),
      controllerSummary: newSummary.trim(),
      participantTitle: newParticipantTitle.trim() || undefined,
      participantContent: newParticipantContent.trim() || undefined,
      priority: newPriority,
      triggerType: newTriggerType,
      releasePolicy: newReleasePolicy,
      controllerNotes: newNotes.trim() || undefined,
      scheduledAt: newScheduledAt ? new Date(newScheduledAt).toISOString() : undefined,
      targets: newTargetUnitId
        ? [{ targetType: 'UNIT', targetUnitId: newTargetUnitId }]
        : [{ targetType: 'EVENT' }],
      actions: newEffect === 'CREATE_INCIDENT'
        ? [{ actionType: 'CREATE_INCIDENT', targetType: 'EVENT', parameters: { title: newTitle.trim(), description: newSummary.trim(), priority: newPriority === 'CRITICAL' ? 'CRITICAL' : newPriority === 'HIGH' ? 'HIGH' : newPriority === 'LOW' ? 'LOW' : 'MEDIUM' } }]
        : [],
    });
    if (!res.ok) {
      alert(`Create inject failed: ${res.error}`);
    } else {
      setShowCreateInjectModal(false);
      setNewTitle('');
      setNewSummary('');
      setNewParticipantTitle('');
      setNewParticipantContent('');
      setNewNotes('');
      setNewScheduledAt('');
      setNewEffect('NONE');
      setNewTargetUnitId('');
      await loadRunSheet(true);
    }
    setActionLoading(false);
  };

  if (loading && !runSheet) {
    return (
      <AppShell breadcrumbs={[{ label: 'Operations', href: `/events/${eventId}/overview` }, { label: 'Scenario Control' }]}>
        <div style={{ padding: '32px 40px', color: 'var(--text-muted)' }}>Loading scenario control run sheet...</div>
      </AppShell>
    );
  }

  if (error && !runSheet) {
    return (
      <AppShell breadcrumbs={[{ label: 'Operations', href: `/events/${eventId}/overview` }, { label: 'Scenario Control' }]}>
        <div style={{ padding: '32px 40px', color: 'var(--accent-danger)' }}>Error: {error}</div>
      </AppShell>
    );
  }

  const injects = runSheet?.injects ?? [];
  const releasedList = injects.filter((i) => i.status === 'RELEASED');
  const readyList = injects.filter((i) => i.status === 'READY');
  const blockedList = injects.filter((i) => i.status === 'BLOCKED');
  const scheduledList = injects.filter((i) => i.status === 'SCHEDULED');
  const dueList = scheduledList.filter((i) => i.isDue);
  const upcomingScheduledList = scheduledList.filter((i) => !i.isDue);
  const draftList = injects.filter((i) => i.status === 'DRAFT');

  return (
    <AppShell breadcrumbs={[{ label: 'Operations', href: `/events/${eventId}/overview` }, { label: 'Scenario Control' }]}>
    <div style={{ display: 'flex', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      {/* MAIN WORKSPACE SHEET */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '28px 40px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        {/* WORKSPACE HEADER */}
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '16px', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="cyris-signal-marker" />
              <h1 style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)', margin: 0 }}>
                Scenario Control
              </h1>
              <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-dim)' }}>
                EXERCISE RUN SHEET
              </span>
            </div>
            <nav aria-label="Scenario navigation" style={{ display: 'flex', gap: '12px', fontSize: '11px' }}>
              <Link href={`/events/${eventId}/overview`} style={{ color: 'var(--accent-active)' }}>Event Overview</Link>
              <Link href={`/events/${eventId}/scenario-data`} style={{ color: 'var(--accent-active)' }}>Scenario Data</Link>
              <Link href={`/events/${eventId}/registry`} style={{ color: 'var(--accent-active)' }}>Registry</Link>
            </nav>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                onClick={() => setShowCreateInjectModal(true)}
                style={{
                  padding: '5px 12px',
                  backgroundColor: 'var(--cyris-orange)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '3px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                + New Inject
              </button>
              <button
                onClick={() => setShowCreatePhaseModal(true)}
                style={{ ...compactButtonStyle, backgroundColor: 'transparent' }}
              >
                + New Phase
              </button>
            </div>
          </div>

          <div style={{ marginTop: '12px', padding: '14px 16px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>SCENARIO CLOCK</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '3px' }}>
                {formatDateTime(runSheet?.clock.scenarioTime)}
              </div>
              <div style={{ fontSize: '11px', color: runSheet?.clock.paused ? 'var(--accent-warning)' : 'var(--accent-success)', marginTop: '2px' }}>
                {runSheet?.clock.mode.replace('_', ' ')} · {runSheet?.clock.paused ? 'PAUSED' : 'RUNNING'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => handleClock(runSheet?.clock.paused ? 'RESUME' : 'PAUSE')} style={compactButtonStyle}>
                {runSheet?.clock.paused ? 'Resume' : 'Pause'}
              </button>
              <button type="button" onClick={() => handleClock('ADVANCE')} style={compactButtonStyle}>+5 min</button>
              <input
                type="datetime-local"
                value={clockTime}
                onChange={(event) => setClockTime(event.target.value)}
                style={{ ...compactInputStyle, colorScheme: 'dark' }}
              />
              <button type="button" onClick={() => clockTime && handleClock('SET_TIME')} style={compactButtonStyle}>Set time</button>
            </div>
          </div>

          {/* ACTIVE PHASE BANNER */}
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderLeft: '3px solid var(--cyris-orange)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                <span style={{ fontSize: '11px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--cyris-orange)' }}>
                  ACTIVE PHASE
                </span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {runSheet?.activePhase
                    ? `${runSheet.activePhase.code} — ${runSheet.activePhase.title}`
                    : 'NO ACTIVE PHASE CONFIGURED'}
                </span>
              </div>
              {runSheet?.activePhase?.description && (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {runSheet.activePhase.description}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              {runSheet?.phases.map((p) => {
                const isActive = p.status === 'ACTIVE';
                const isCompleted = p.status === 'COMPLETED';
                return (
                  <div
                    key={p.id}
                    style={{
                      padding: '4px 8px',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      backgroundColor: isActive ? 'rgba(225, 92, 25, 0.15)' : 'var(--bg-active)',
                      border: isActive ? '1px solid var(--cyris-orange)' : '1px solid var(--border-subtle)',
                      color: isActive ? 'var(--cyris-orange)' : isCompleted ? 'var(--accent-success)' : 'var(--text-dim)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span>{p.code}</span>
                    <span style={{ fontSize: '9px', textTransform: 'uppercase' }}>{p.status}</span>
                    {!isActive && p.status !== 'COMPLETED' && (
                      <button
                        onClick={() => handleActivatePhase(p)}
                        title="Activate Phase"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          padding: 0,
                          fontSize: '10px',
                        }}
                      >
                        ▶
                      </button>
                    )}
                    {isActive && (
                      <button
                        onClick={() => handleCompletePhase(p)}
                        title="Complete Phase"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--accent-success)',
                          cursor: 'pointer',
                          padding: 0,
                          fontSize: '10px',
                        }}
                      >
                        ✓
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* SUMMARY STATS BAR */}
        <div style={{ display: 'flex', gap: '16px', fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>
          <span>TOTAL: <strong style={{ color: 'var(--text-primary)' }}>{runSheet?.summary.total}</strong></span>
          <span>RELEASED: <strong style={{ color: 'var(--accent-success)' }}>{runSheet?.summary.released}</strong></span>
          <span>READY: <strong style={{ color: 'var(--accent-active)' }}>{runSheet?.summary.ready}</strong></span>
          <span>BLOCKED: <strong style={{ color: 'var(--accent-danger)' }}>{runSheet?.summary.blocked}</strong></span>
          <span>SCHEDULED: <strong style={{ color: 'var(--accent-warning)' }}>{runSheet?.summary.scheduled}</strong></span>
          <span>DRAFT: <strong style={{ color: 'var(--text-dim)' }}>{runSheet?.summary.draft}</strong></span>
        </div>

        {/* SECTION: READY (Actionable for Controllers) */}
        {readyList.length > 0 && (
          <div>
            <div className="cyris-section-header" style={{ marginBottom: '8px' }}>
              <span className="cyris-signal-marker" />
              <span>READY FOR RELEASE</span>
              <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--accent-active)' }}>
                ({readyList.length})
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {readyList.map((inj) => (
                <InjectRunSheetRow
                  key={inj.id}
                  inject={inj}
                  selected={selectedInject?.id === inj.id}
                  onSelect={() => setSelectedInject(inj)}
                  onRelease={() => handleRelease(inj.id)}
                  onOverride={() => { setSelectedInject(inj); setShowOverrideModal(true); }}
                  onPreview={() => handleOpenPreview(inj.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* SECTION: BLOCKED (Prerequisites or Conditions pending) */}
        {blockedList.length > 0 && (
          <div>
            <div className="cyris-section-header" style={{ marginBottom: '8px' }}>
              <span className="cyris-signal-marker" />
              <span>BLOCKED INJECTS</span>
              <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--accent-danger)' }}>
                ({blockedList.length})
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {blockedList.map((inj) => (
                <InjectRunSheetRow
                  key={inj.id}
                  inject={inj}
                  selected={selectedInject?.id === inj.id}
                  onSelect={() => setSelectedInject(inj)}
                  onRelease={() => handleRelease(inj.id)}
                  onOverride={() => { setSelectedInject(inj); setShowOverrideModal(true); }}
                  onPreview={() => handleOpenPreview(inj.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* SECTION: SCHEDULED TIME */}
        {dueList.length > 0 && (
          <div>
            <div className="cyris-section-header" style={{ marginBottom: '8px' }}>
              <span className="cyris-signal-marker" />
              <span>DUE — RELEASE MANUALLY</span>
              <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--accent-warning)' }}>({dueList.length})</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {dueList.map((inj) => (
                <InjectRunSheetRow key={inj.id} inject={inj} selected={selectedInject?.id === inj.id}
                  onSelect={() => setSelectedInject(inj)} onRelease={() => handleRelease(inj.id)}
                  onOverride={() => { setSelectedInject(inj); setShowOverrideModal(true); }}
                  onPreview={() => handleOpenPreview(inj.id)} />
              ))}
            </div>
          </div>
        )}

        {upcomingScheduledList.length > 0 && (
          <div>
            <div className="cyris-section-header" style={{ marginBottom: '8px' }}>
              <span className="cyris-signal-marker" />
              <span>SCHEDULED RELEASES</span>
              <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--accent-warning)' }}>
                ({upcomingScheduledList.length})
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {upcomingScheduledList.map((inj) => (
                <InjectRunSheetRow
                  key={inj.id}
                  inject={inj}
                  selected={selectedInject?.id === inj.id}
                  onSelect={() => setSelectedInject(inj)}
                  onRelease={() => handleRelease(inj.id)}
                  onOverride={() => { setSelectedInject(inj); setShowOverrideModal(true); }}
                  onPreview={() => handleOpenPreview(inj.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* SECTION: RELEASED (Delivered historical) */}
        {releasedList.length > 0 && (
          <div>
            <div className="cyris-section-header" style={{ marginBottom: '8px' }}>
              <span className="cyris-signal-marker" />
              <span>RELEASED INJECTS</span>
              <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--accent-success)' }}>
                ({releasedList.length})
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {releasedList.map((inj) => (
                <InjectRunSheetRow
                  key={inj.id}
                  inject={inj}
                  selected={selectedInject?.id === inj.id}
                  onSelect={() => setSelectedInject(inj)}
                  onRelease={() => handleRelease(inj.id)}
                  onOverride={() => { setSelectedInject(inj); setShowOverrideModal(true); }}
                  onPreview={() => handleOpenPreview(inj.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* SECTION: DRAFT */}
        {draftList.length > 0 && (
          <div>
            <div className="cyris-section-header" style={{ marginBottom: '8px' }}>
              <span className="cyris-signal-marker" />
              <span>DRAFTS & IN PREPARATION</span>
              <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text-dim)' }}>
                ({draftList.length})
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {draftList.map((inj) => (
                <InjectRunSheetRow
                  key={inj.id}
                  inject={inj}
                  selected={selectedInject?.id === inj.id}
                  onSelect={() => setSelectedInject(inj)}
                  onRelease={() => handleRelease(inj.id)}
                  onOverride={() => { setSelectedInject(inj); setShowOverrideModal(true); }}
                  onPreview={() => handleOpenPreview(inj.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* CONTEXTUAL INSPECTOR DRAWER */}
      {selectedInject && (
        <div
          style={{
            width: '420px',
            borderLeft: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-surface)',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
          }}
        >
          {/* INSPECTOR HEADER */}
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span className="record-identifier">{selectedInject.injectNumber}</span>
                <span
                  style={{
                    fontSize: '10px',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '2px',
                    backgroundColor:
                      selectedInject.status === 'RELEASED'
                        ? 'rgba(34, 197, 94, 0.15)'
                        : selectedInject.status === 'READY'
                        ? 'rgba(56, 189, 248, 0.15)'
                        : selectedInject.status === 'BLOCKED'
                        ? 'rgba(239, 68, 68, 0.15)'
                        : 'var(--bg-active)',
                    color:
                      selectedInject.status === 'RELEASED'
                        ? 'var(--accent-success)'
                        : selectedInject.status === 'READY'
                        ? 'var(--accent-active)'
                        : selectedInject.status === 'BLOCKED'
                        ? 'var(--accent-danger)'
                        : 'var(--text-dim)',
                  }}
                >
                  {selectedInject.status}
                </span>
                <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text-dim)' }}>
                  {selectedInject.priority}
                </span>
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {selectedInject.title}
              </div>
            </div>

            <button
              onClick={() => setSelectedInject(null)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-dim)',
                fontSize: '16px',
                cursor: 'pointer',
                padding: '2px 6px',
              }}
            >
              ✕
            </button>
          </div>

          {/* INSPECTOR CONTENT */}
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* ACTION TOOLBAR */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {selectedInject.status === 'READY' && (
                <button
                  disabled={actionLoading}
                  onClick={() => handleRelease(selectedInject.id)}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: 'var(--accent-success)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '3px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Release to Participants
                </button>
              )}

              {selectedInject.status !== 'RELEASED' && (
                <button
                  disabled={actionLoading}
                  onClick={() => setShowOverrideModal(true)}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: 'transparent',
                    border: '1px solid var(--accent-warning)',
                    color: 'var(--accent-warning)',
                    borderRadius: '3px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Override & Release
                </button>
              )}

              <button
                onClick={() => handleOpenPreview(selectedInject.id)}
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                  borderRadius: '3px',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                Preview as Audience
              </button>

              {selectedInject.status !== 'RELEASED' && selectedInject.status !== 'CANCELLED' && (
                <button
                  disabled={actionLoading}
                  onClick={() => handleCancelInject(selectedInject.id)}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: 'transparent',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    color: 'var(--accent-danger)',
                    borderRadius: '3px',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel Inject
                </button>
              )}
            </div>

            {/* BLOCK REASONS IF ANY */}
            {selectedInject.blockedReasons.length > 0 && (
              <div
                style={{
                  padding: '10px 12px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  fontSize: '11px',
                  color: 'var(--accent-danger)',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: '4px' }}>BLOCKED CONDITIONS</div>
                <ul style={{ margin: 0, paddingLeft: '16px' }}>
                  {selectedInject.blockedReasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* PARTICIPANT CONTENT SECTION */}
            <div>
              <div className="cyris-section-header" style={{ marginBottom: '8px' }}>
                <span className="cyris-signal-marker" />
                <span>PARTICIPANT CONTENT</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                DELIVERY AUDIENCE
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginBottom: '10px' }}>
                {selectedInject.targets.length > 0
                  ? selectedInject.targets.map((t) => t.unitName ?? t.userFullName ?? (t.targetType === 'EVENT' ? 'Whole Event (All Active Participants)' : t.targetType)).join(', ')
                  : 'Whole Event (All Active Participants)'}
              </div>

              <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                PARTICIPANT TITLE
              </div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px' }}>
                {selectedInject.participantTitle ?? selectedInject.title}
              </div>

              <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                PARTICIPANT MESSAGE / BRIEFING BODY
              </div>
              <div
                style={{
                  padding: '10px 12px',
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  lineHeight: '1.5',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {selectedInject.participantContent ?? '(No separate body prose. Title will be released as briefing update.)'}
              </div>
            </div>

            {/* CONTROLLED DISCLOSURES */}
            <div>
              <div className="cyris-section-header" style={{ marginBottom: '8px' }}>
                <span className="cyris-signal-marker" />
                <span>CONTROLLED RESOURCE DISCLOSURES</span>
              </div>
              {selectedInject.actions.length === 0 ? (
                <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                  No secret resources will be granted or visibility changed.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {selectedInject.actions.map((act) => (
                    <div
                      key={act.id}
                      style={{
                        padding: '6px 10px',
                        backgroundColor: 'var(--bg-card)',
                        border: '1px solid var(--border-subtle)',
                        fontSize: '11px',
                      }}
                    >
                      <div style={{ fontWeight: 600, color: 'var(--accent-active)' }}>
                        {act.actionType}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '10px', fontFamily: 'monospace' }}>
                        Resource: {act.resourceId}
                      </div>
                      <div style={{ color: 'var(--text-muted)' }}>
                        Target: {act.unitName ?? act.userName ?? act.targetType}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* CONTROLLER ONLY (CONFIDENTIAL EXERCISE CONTROL) */}
            <div
              style={{
                padding: '12px',
                backgroundColor: 'rgba(225, 92, 25, 0.05)',
                border: '1px solid rgba(225, 92, 25, 0.3)',
                borderLeft: '3px solid var(--cyris-orange)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <span style={{ fontSize: '10px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--cyris-orange)' }}>
                  CONTROLLER ONLY · SECRET EXERCISE CONTEXT
                </span>
              </div>

              <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '2px' }}>
                CONTROLLER SUMMARY
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginBottom: '10px', lineHeight: '1.4' }}>
                {selectedInject.controllerSummary}
              </div>

              <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '2px' }}>
                TRIGGER & POLICY
              </div>
              <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                Trigger: {selectedInject.triggerType} · Policy: {selectedInject.releasePolicy}
              </div>

              {selectedInject.conditions.length > 0 && (
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '2px' }}>
                    CONDITIONS ({selectedInject.conditionLogic})
                  </div>
                  {selectedInject.conditions.map((condition) => {
                    const labels: Record<string, string> = {
                      TASK_STATUS: 'Operational task status',
                      RECOVERY_OBJECTIVE_STATUS: 'Recovery objective status',
                      INJECT_RELEASED: 'Inject released',
                      CASE_STATUS: 'Case status',
                      INCIDENT_STATUS: 'Incident status',
                      EVIDENCE_STATUS: 'Evidence status',
                      LAB_STATUS: 'Laboratory status',
                      ACTIVITY_OCCURRED: 'Activity occurred',
                    };
                    return (
                      <div key={condition.id} style={{ fontSize: '11px', color: condition.isSatisfied ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                        • {labels[condition.conditionType] ?? condition.conditionType}: {condition.targetStatus ?? 'configured target'}
                        {!condition.isSatisfied && ' (unmet)'}
                      </div>
                    );
                  })}
                </div>
              )}

              {selectedInject.dependencies.length > 0 && (
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '2px' }}>
                    PREREQUISITE DEPENDENCIES
                  </div>
                  {selectedInject.dependencies.map((d) => (
                    <div key={d.id} style={{ fontSize: '11px', fontFamily: 'monospace', color: d.status === 'RELEASED' ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                      • {d.injectNumber}: {d.title} ({d.status})
                    </div>
                  ))}
                </div>
              )}

              {selectedInject.controllerNotes && (
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '2px' }}>
                    CONTROLLER NOTES
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                    {selectedInject.controllerNotes}
                  </div>
                </div>
              )}
            </div>

            {/* RELEASE AUDIT HISTORY */}
            {selectedInject.releasedAt && (
              <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-dim)' }}>
                Released at: {selectedInject.releasedAt}
              </div>
            )}
          </div>
        </div>
      )}

      {/* OVERRIDE RELEASE MODAL */}
      {showOverrideModal && selectedInject && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              width: '460px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--accent-warning)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent-warning)' }}>
                MANUAL OVERRIDE AND RELEASE
              </span>
            </div>

            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
              You are manually releasing <strong>{selectedInject.injectNumber}</strong> while prerequisites or conditions may not yet be met.
              An operational justification is strictly audited.
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                MANDATORY OVERRIDE REASON (MIN 5 CHARACTERS)
              </label>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="e.g. Exercise timetable shifted due to tactical drill delay"
                style={{
                  width: '100%',
                  height: '80px',
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  padding: '8px',
                }}
              />
            </div>

            {overrideError && (
              <div style={{ fontSize: '11px', color: 'var(--accent-danger)' }}>
                {overrideError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => { setShowOverrideModal(false); setOverrideError(null); }}
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                disabled={actionLoading}
                onClick={handleOverrideRelease}
                style={{
                  padding: '6px 14px',
                  backgroundColor: 'var(--accent-warning)',
                  color: '#000000',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {actionLoading ? 'Overriding...' : 'Confirm Override Release'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AUDIENCE PREVIEW MODAL */}
      {showPreviewModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              width: '560px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="cyris-signal-marker" />
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  AUDIENCE VIEW PREVIEW
                </span>
                <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-dim)' }}>
                  {audiencePreview?.injectNumber}
                </span>
              </div>
              <button
                onClick={() => setShowPreviewModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {previewLoading ? (
              <div style={{ padding: '20px', color: 'var(--text-muted)' }}>Computing target preview...</div>
            ) : audiencePreview ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '2px' }}>
                    INTENDED TARGET AUDIENCE
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {audiencePreview.targetAudienceDescription}
                  </div>
                </div>

                <div
                  style={{
                    padding: '12px',
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ fontSize: '11px', color: 'var(--accent-active)', fontWeight: 700, marginBottom: '4px' }}>
                    PARTICIPANT BRIEFING PROSE
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
                    {audiencePreview.participantTitle}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                    {audiencePreview.participantContent ?? '(No extra body prose)'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                    RESOURCES BECOMING ACCESSIBLE UPON RELEASE
                  </div>
                  {audiencePreview.disclosedResources.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      No hidden resources granted.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {audiencePreview.disclosedResources.map((r) => (
                        <div key={r.resourceId} style={{ fontSize: '11px', color: 'var(--accent-success)' }}>
                          ✓ {r.visibilityAction} ({r.resourceId})
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    padding: '10px 12px',
                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 700, marginBottom: '4px' }}>
                    CONFIDENTIALITY GUARANTEE — REMAINS STRICTLY HIDDEN
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    {audiencePreview.hiddenControllerMetadata.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowPreviewModal(false)}
                style={{
                  padding: '6px 14px',
                  backgroundColor: 'var(--bg-active)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreatePhaseModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <form onSubmit={handleCreatePhase} style={{ width: 'min(460px, calc(100vw - 32px))', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ color: 'var(--text-primary)' }}>CREATE SCENARIO PHASE</strong>
              <button type="button" onClick={() => setShowCreatePhaseModal(false)} style={{ background: 'none', border: 0, color: 'var(--text-dim)', cursor: 'pointer' }}>✕</button>
            </div>
            <label style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
              CODE *
              <input value={newPhaseCode} onChange={(e) => setNewPhaseCode(e.target.value)} placeholder="PHASE-01" style={{ ...compactInputStyle, width: '100%', marginTop: '4px' }} />
            </label>
            <label style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
              NAME *
              <input value={newPhaseTitle} onChange={(e) => setNewPhaseTitle(e.target.value)} placeholder="Investigation" style={{ ...compactInputStyle, width: '100%', marginTop: '4px' }} />
            </label>
            <label style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
              DESCRIPTION
              <textarea value={newPhaseDescription} onChange={(e) => setNewPhaseDescription(e.target.value)} style={{ ...compactInputStyle, width: '100%', minHeight: '70px', marginTop: '4px' }} />
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" onClick={() => setShowCreatePhaseModal(false)} style={compactButtonStyle}>Cancel</button>
              <button type="submit" disabled={actionLoading} style={{ ...compactButtonStyle, backgroundColor: 'var(--cyris-orange)', color: '#fff' }}>Create phase</button>
            </div>
          </form>
        </div>
      )}

      {/* CREATE INJECT MODAL */}
      {showCreateInjectModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <form
            onSubmit={handleCreateInject}
            style={{
              width: '540px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="cyris-signal-marker" />
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  PREPARE SCENARIO INJECT
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateInjectModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                INJECT TITLE *
              </label>
              <input
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Threat actor announces leaked credentials"
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                CONTROLLER SUMMARY (INTERNAL CONTEXT) *
              </label>
              <textarea
                required
                value={newSummary}
                onChange={(e) => setNewSummary(e.target.value)}
                placeholder="Explain the exercise stimulus, truth, and intended training objective"
                style={{
                  width: '100%',
                  height: '60px',
                  padding: '6px 8px',
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                  PHASE
                </label>
                <select
                  value={newPhaseId}
                  onChange={(e) => setNewPhaseId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                  }}
                >
                  <option value="">Unassigned</option>
                  {runSheet?.phases.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.title}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                    SCENARIO TIME (OPTIONAL)
                  </label>
                  <input
                    type="datetime-local"
                    value={newScheduledAt}
                    onChange={(e) => setNewScheduledAt(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '12px', colorScheme: 'dark' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                    RELEASE EFFECT
                  </label>
                  <select
                    value={newEffect}
                    onChange={(e) => setNewEffect(e.target.value as 'NONE' | 'CREATE_INCIDENT')}
                    style={{ width: '100%', padding: '6px 8px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '12px' }}
                  >
                    <option value="NONE">NONE / INFORMATION ONLY</option>
                    <option value="CREATE_INCIDENT">CREATE INCIDENT</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                  PRIORITY
                </label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                  }}
                >
                  <option value="LOW">LOW</option>
                  <option value="NORMAL">NORMAL</option>
                  <option value="HIGH">HIGH</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                DELIVERY TARGET
              </label>
              <select
                value={newTargetUnitId}
                onChange={(e) => setNewTargetUnitId(e.target.value)}
                style={{ width: '100%', padding: '6px 8px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '12px' }}
              >
                <option value="">Whole Event — All Active Participants</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>{unit.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                  TRIGGER TYPE
                </label>
                <select
                  value={newTriggerType}
                  onChange={(e) => setNewTriggerType(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                  }}
                >
                  <option value="MANUAL">MANUAL</option>
                  <option value="SCHEDULED_TIME">SCHEDULED_TIME</option>
                  <option value="CONDITION">CONDITION</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                  RELEASE POLICY
                </label>
                <select
                  value={newReleasePolicy}
                  onChange={(e) => setNewReleasePolicy(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                  }}
                >
                  <option value="MANUAL_CONFIRMATION">MANUAL_CONFIRMATION</option>
                  <option value="AUTO_RELEASE">AUTO_RELEASE</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                PARTICIPANT BRIEFING TITLE (OPTIONAL)
              </label>
              <input
                value={newParticipantTitle}
                onChange={(e) => setNewParticipantTitle(e.target.value)}
                placeholder="Leave blank to use inject title"
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                PARTICIPANT BRIEFING CONTENT (OPTIONAL)
              </label>
              <textarea
                value={newParticipantContent}
                onChange={(e) => setNewParticipantContent(e.target.value)}
                placeholder="Exact text delivered to participants"
                style={{
                  width: '100%',
                  height: '50px',
                  padding: '6px 8px',
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowCreateInjectModal(false)}
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                style={{
                  padding: '6px 14px',
                  backgroundColor: 'var(--cyris-orange)',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {actionLoading ? 'Creating...' : 'Create Inject'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
    </AppShell>
  );
}

// Subcomponent: Run Sheet Row
function InjectRunSheetRow({
  inject,
  selected,
  onSelect,
  onRelease,
  onOverride,
  onPreview,
}: {
  inject: ScenarioInjectResponse;
  selected: boolean;
  onSelect: () => void;
  onRelease: () => void;
  onOverride: () => void;
  onPreview: () => void;
}) {
  const { formatTime } = usePreferences();
  const isReleased = inject.status === 'RELEASED';
  const isReady = inject.status === 'READY';
  const isBlocked = inject.status === 'BLOCKED';

  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '8px 12px',
        borderBottom: '1px solid var(--border-subtle)',
        backgroundColor: selected ? 'var(--bg-active)' : 'transparent',
        borderLeft: selected ? '2px solid var(--cyris-orange)' : '2px solid transparent',
        cursor: 'pointer',
        gap: '14px',
        fontSize: '12px',
      }}
    >
      {/* TIMESTAMP OR TRIGGER */}
      <div style={{ width: '130px', fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-dim)' }}>
        {inject.releasedAt
          ? formatTime(inject.releasedAt)
          : inject.scheduledAt
          ? formatTime(inject.scheduledAt)
          : inject.triggerType}
      </div>

      {/* IDENTIFIER */}
      <div style={{ width: '75px' }}>
        <span className="record-identifier">{inject.injectNumber}</span>
      </div>

      {/* TITLE & SUMMARY */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {inject.title}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {isBlocked && inject.blockedReasons.length > 0
            ? `Waiting for: ${inject.blockedReasons.join(' · ')}`
            : inject.controllerSummary}
        </div>
      </div>

      {/* PRIORITY & STATUS PILL */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <span
          style={{
            fontSize: '9px',
            fontFamily: 'monospace',
            fontWeight: 700,
            padding: '1px 5px',
            borderRadius: '2px',
            backgroundColor:
              isReleased
                ? 'rgba(34, 197, 94, 0.15)'
                : isReady
                ? 'rgba(56, 189, 248, 0.15)'
                : isBlocked
                ? 'rgba(239, 68, 68, 0.15)'
                : 'var(--bg-card)',
            color:
              isReleased
                ? 'var(--accent-success)'
                : isReady
                ? 'var(--accent-active)'
                : isBlocked
                ? 'var(--accent-danger)'
                : 'var(--text-dim)',
          }}
        >
          {inject.status}
        </span>
      </div>

      {/* ROW ACTIONS */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
        {isReady && (
          <button
            onClick={onRelease}
            style={{
              padding: '3px 8px',
              backgroundColor: 'var(--accent-success)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '2px',
              fontSize: '10px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Release
          </button>
        )}
        {isBlocked && (
          <button
            onClick={onOverride}
            style={{
              padding: '3px 8px',
              backgroundColor: 'transparent',
              border: '1px solid var(--accent-warning)',
              color: 'var(--accent-warning)',
              borderRadius: '2px',
              fontSize: '10px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Override
          </button>
        )}
      </div>
    </div>
  );
}

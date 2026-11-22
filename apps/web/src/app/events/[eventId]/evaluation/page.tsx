'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { useDialogAccessibility } from '@/hooks/useDialogAccessibility';
import { RecordIdentifier } from '@/components/common/Badges';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { workspaceLabel } from '@/lib/workspace-navigation';
import {
  Target,
  Eye,
  Plus,
  RefreshCw,
  Lock,
  Award,
  CheckCircle,
  X,
} from 'lucide-react';
import type {
  EvaluationObjectiveItem,
  EvaluationObservationItem,
} from '@cyris/contracts';

export default function EvaluationPage() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const eventId = params.eventId as string;
  const { hasPermission } = useAuth();
  const { formatTime, locale } = usePreferences();
  const tr = (label: string) => workspaceLabel(locale, label);

  const activeTab = pathname.endsWith('/observations') ? 'OBSERVATIONS' : 'OBJECTIVES';

  const [objectives, setObjectives] = useState<EvaluationObjectiveItem[]>([]);
  const [observations, setObservations] = useState<EvaluationObservationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fast Live Observation Form State
  const [selectedObjectiveId, setSelectedObjectiveId] = useState('');
  const [relatedRecordId, setRelatedRecordId] = useState('');
  const [observationType, setObservationType] = useState<
    'NOTE' | 'CRITERION_EVALUATION' | 'SIGNIFICANT_MOMENT' | 'DEFICIENCY' | 'COMMENDATION'
  >('NOTE');
  const [note, setNote] = useState('');
  const [result, setResult] = useState<'MET' | 'PARTIALLY_MET' | 'NOT_MET' | 'EXCEEDED' | 'UNOBSERVED'>('MET');
  const [score, setScore] = useState<number | ''>('');
  const [savingObservation, setSavingObservation] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Modal: Add Objective
  const [showAddObjModal, setShowAddObjModal] = useState(false);
  const [newObjCode, setNewObjCode] = useState('');
  const [newObjTitle, setNewObjTitle] = useState('');
  const [newObjDesc, setNewObjDesc] = useState('');
  const [newObjWeight, setNewObjWeight] = useState('1.0');
  const [submittingObj, setSubmittingObj] = useState(false);
  useDialogAccessibility(showAddObjModal, () => { if (!submittingObj) setShowAddObjModal(false); });

  const [locking, setLocking] = useState(false);

  const canManage = hasPermission('evaluation.manage');
  const canLock = hasPermission('evaluation.lock');

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [objsRes, obsRes] = await Promise.all([
        apiClient.listEvaluationObjectives(eventId),
        apiClient.listEvaluationObservations(eventId),
      ]);

      if (objsRes.ok && objsRes.data) {
        setObjectives(objsRes.data);
      }
      if (obsRes.ok && obsRes.data) {
        setObservations(obsRes.data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load evaluation data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (eventId) {
      fetchData();
    }
  }, [eventId]);

  const handleFastObservationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) {
      setSaveError('Observation note is required');
      return;
    }

    setSavingObservation(true);
    setSaveError(null);
    try {
      const res = await apiClient.createEvaluationObservation(eventId, {
        objectiveId: selectedObjectiveId || undefined,
        relatedResourceId: relatedRecordId.trim() || undefined,
        observationType,
        note: note.trim(),
        result: result || undefined,
        score: score !== '' ? Number(score) : undefined,
      });

      if (res.ok && res.data) {
        setSaveSuccess(true);
        setNote('');
        setRelatedRecordId('');
        setScore('');
        setTimeout(() => setSaveSuccess(false), 2000);
        fetchData();
      } else {
        setSaveError(res.error || 'Failed to save observation');
      }
    } catch (err: any) {
      setSaveError(err.message);
    } finally {
      setSavingObservation(false);
    }
  };

  const handleCreateObjective = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newObjCode.trim() || !newObjTitle.trim()) return;

    setSubmittingObj(true);
    try {
      const res = await apiClient.createEvaluationObjective(eventId, {
        code: newObjCode.trim(),
        title: newObjTitle.trim(),
        description: newObjDesc.trim(),
        weight: Number(newObjWeight) || 1,
        status: 'ACTIVE',
      });

      if (res.ok && res.data) {
        setShowAddObjModal(false);
        setNewObjCode('');
        setNewObjTitle('');
        setNewObjDesc('');
        fetchData();
      }
    } finally {
      setSubmittingObj(false);
    }
  };

  const handleLockEvaluation = async () => {
    if (!confirm('Lock evaluation? This prevents further edits to live observations.')) return;
    setLocking(true);
    try {
      await apiClient.lockEvaluation(eventId, { reason: 'Exercise evaluation phase locked.' });
      fetchData();
    } finally {
      setLocking(false);
    }
  };

  return (
    <AppShell
      title="Exercise Evaluation"
      breadcrumbs={[{ label: 'Evaluation', href: `/events/${eventId}/evaluation` }]}
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={fetchData}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            {tr("Refresh")}
          </button>
          <button
            onClick={() => router.push(`/events/${eventId}/evaluation/after-action`)}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
          >
            <Award size={13} style={{ color: 'var(--color-accent-ops)' }} />
            After Action Review
          </button>
          {canManage && (
            <button
              onClick={() => setShowAddObjModal(true)}
              className="btn btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
            >
              <Plus size={14} />
              New Objective
            </button>
          )}
          {canLock && (
            <button
              onClick={handleLockEvaluation}
              disabled={locking}
              className="btn btn-ghost"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
            >
              <Lock size={13} />
              Lock
            </button>
          )}
        </div>
      }
    >
      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1400px' }}>
        {/* Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--color-border-subtle)',
            paddingBottom: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '13px' }}>
            <button
              onClick={() => router.push(`/events/${eventId}/evaluation/observations`)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 10px',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === 'OBSERVATIONS' ? '2px solid var(--color-accent-ops)' : '2px solid transparent',
                color: activeTab === 'OBSERVATIONS' ? 'var(--color-accent-ops)' : 'var(--color-text-dim)',
                fontWeight: activeTab === 'OBSERVATIONS' ? 700 : 500,
                cursor: 'pointer',
              }}
            >
              <Eye size={14} />
              Live Observations & Field Notes ({observations.length})
            </button>
            <button
              onClick={() => router.push(`/events/${eventId}/evaluation`)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 10px',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === 'OBJECTIVES' ? '2px solid var(--color-accent-ops)' : '2px solid transparent',
                color: activeTab === 'OBJECTIVES' ? 'var(--color-accent-ops)' : 'var(--color-text-dim)',
                fontWeight: activeTab === 'OBJECTIVES' ? 700 : 500,
                cursor: 'pointer',
              }}
            >
              <Target size={14} />
              Exercise Objectives ({objectives.length})
            </button>
          </div>

          <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-dim)' }}>
            Confidential · Evaluator / Exercise Control Access Only
          </div>
        </div>

        {loading ? (
          <LoadingState message={tr("Loading evaluation framework...")} />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchData} />
        ) : activeTab === 'OBSERVATIONS' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
            {/* Left Column: Observations Log */}
            <div
              style={{
                backgroundColor: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div
                style={{
                  padding: '12px 16px',
                  backgroundColor: 'var(--color-bg-panel)',
                  borderBottom: '1px solid var(--color-border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: 'var(--color-text-main)',
                }}
              >
                <span>{tr("Recorded Live Observations")}</span>
                <span style={{ fontSize: '11px', color: 'var(--color-text-dim)', fontWeight: 500 }}>
                  {observations.length} total
                </span>
              </div>

              {observations.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-text-dim)', fontSize: '12px' }}>
                  No evaluator observations recorded yet. Use the logger on the right to record field observations.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {observations.map((obs) => (
                    <div
                      key={obs.id}
                      style={{
                        padding: '14px 16px',
                        borderBottom: '1px solid var(--color-border-subtle)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)' }}>
                            {formatTime(obs.observedAt)}
                          </span>
                          {obs.objectiveCode && (
                            <RecordIdentifier id={obs.objectiveCode} prefix="" />
                          )}
                          {obs.targetUnitName && (
                            <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                              Unit: {obs.targetUnitName}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {obs.result && (
                            <span
                              style={{
                                padding: '1px 6px',
                                borderRadius: '3px',
                                backgroundColor: 'var(--color-bg-panel)',
                                border: '1px solid var(--color-border-subtle)',
                                fontSize: '10px',
                                fontFamily: 'var(--font-mono)',
                                color: 'var(--color-text-main)',
                              }}
                            >
                              {obs.result}
                            </span>
                          )}
                          {obs.score !== null && obs.score !== undefined && (
                            <span
                              style={{
                                padding: '1px 6px',
                                borderRadius: '3px',
                                backgroundColor: 'rgba(245, 158, 11, 0.15)',
                                color: 'var(--color-accent-ops)',
                                fontWeight: 700,
                                fontSize: '10px',
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              Score: {obs.score}
                            </span>
                          )}
                        </div>
                      </div>

                      <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-main)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                        {obs.note}
                      </p>

                      {obs.relatedResourceId && (
                        <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-dim)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>{tr("Related Record:")}</span>
                          <span style={{ color: 'var(--color-accent-ops)' }}>{obs.relatedResourceId}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right Column: Fast Live Observation Form */}
            <div
              style={{
                backgroundColor: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '16px',
                boxShadow: 'var(--shadow-sm)',
                height: 'fit-content',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '10px', marginBottom: '14px' }}>
                <Eye size={15} style={{ color: 'var(--color-accent-ops)' }} />
                <h3 style={{ margin: 0, fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-main)' }}>
                  Fast Live Observation
                </h3>
              </div>

              {saveSuccess && (
                <div style={{ marginBottom: '12px', padding: '8px 12px', backgroundColor: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: 'var(--radius-xs)', color: 'var(--color-status-success)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle size={13} /> Observation recorded successfully!
                </div>
              )}

              {saveError && (
                <div style={{ marginBottom: '12px', padding: '8px 12px', backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 'var(--radius-xs)', color: 'var(--color-danger)', fontSize: '12px' }}>
                  {saveError}
                </div>
              )}

              <form onSubmit={handleFastObservationSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '4px' }}>
                    Objective
                  </label>
                  <select
                    value={selectedObjectiveId}
                    onChange={(e) => setSelectedObjectiveId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      backgroundColor: 'var(--color-bg-panel)',
                      border: '1px solid var(--color-border-subtle)',
                      borderRadius: 'var(--radius-xs)',
                      color: 'var(--color-text-main)',
                      fontSize: '12px',
                    }}
                  >
                    <option value="">(Optional) General Observation</option>
                    {objectives.map((obj) => (
                      <option key={obj.id} value={obj.id}>
                        {obj.code} — {obj.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '4px' }}>
                    Related Record ID (Evidence, Incident, Task, Case...)
                  </label>
                  <input
                    type="text"
                    value={relatedRecordId}
                    onChange={(e) => setRelatedRecordId(e.target.value)}
                    placeholder="e.g. E-0042, INC-0004, TASK-0021"
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      backgroundColor: 'var(--color-bg-panel)',
                      border: '1px solid var(--color-border-subtle)',
                      borderRadius: 'var(--radius-xs)',
                      color: 'var(--color-text-main)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '12px',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '4px' }}>
                    Observation Note <span style={{ color: 'var(--color-danger)' }}>*</span>
                  </label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={4}
                    placeholder="e.g. Correctly verified image hash before analysis..."
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      backgroundColor: 'var(--color-bg-panel)',
                      border: '1px solid var(--color-border-subtle)',
                      borderRadius: 'var(--radius-xs)',
                      color: 'var(--color-text-main)',
                      fontSize: '12px',
                      lineHeight: 1.4,
                    }}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '4px' }}>
                      Result Assessment
                    </label>
                    <select
                      value={result}
                      onChange={(e) => setResult(e.target.value as any)}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        backgroundColor: 'var(--color-bg-panel)',
                        border: '1px solid var(--color-border-subtle)',
                        borderRadius: 'var(--radius-xs)',
                        color: 'var(--color-text-main)',
                        fontSize: '11px',
                      }}
                    >
                      <option value="EXCEEDED">{tr("Exceeded")}</option>
                      <option value="MET">{tr("Met")}</option>
                      <option value="PARTIALLY_MET">{tr("Partially Met")}</option>
                      <option value="NOT_MET">{tr("Not Met")}</option>
                      <option value="UNOBSERVED">{tr("Unobserved")}</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '4px' }}>
                      Score (0-5, Optional)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={score}
                      onChange={(e) => setScore(e.target.value ? Number(e.target.value) : '')}
                      placeholder="e.g. 4"
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        backgroundColor: 'var(--color-bg-panel)',
                        border: '1px solid var(--color-border-subtle)',
                        borderRadius: 'var(--radius-xs)',
                        color: 'var(--color-text-main)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                      }}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingObservation}
                  className="btn btn-primary"
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '6px' }}
                >
                  <CheckCircle size={14} />
                  {savingObservation ? 'Saving...' : 'Save Observation'}
                </button>
              </form>
            </div>
          </div>
        ) : (
          /* OBJECTIVES TAB */
          <div
            style={{
              backgroundColor: 'var(--color-bg-surface)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-sm)',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--color-bg-panel)', borderBottom: '1px solid var(--color-border-subtle)', color: 'var(--color-text-dim)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                  <th style={{ padding: '10px 16px', width: '120px' }}>{tr("Code")}</th>
                  <th style={{ padding: '10px 16px' }}>{tr("Title & Description")}</th>
                  <th style={{ padding: '10px 16px', width: '120px' }}>{tr("Category")}</th>
                  <th style={{ padding: '10px 16px', width: '90px' }}>{tr("Weight")}</th>
                  <th style={{ padding: '10px 16px', width: '130px' }}>{tr("Criteria Count")}</th>
                </tr>
              </thead>
              <tbody>
                {objectives.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-dim)' }}>
                      No evaluation objectives registered for this event.
                    </td>
                  </tr>
                ) : (
                  objectives.map((obj) => (
                    <tr key={obj.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                      <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-accent-ops)' }}>
                        <RecordIdentifier id={obj.code} prefix="" />
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--color-text-main)' }}>{obj.title}</div>
                        {obj.description && (
                          <div style={{ color: 'var(--color-text-secondary)', fontSize: '11px', marginTop: '2px' }}>{obj.description}</div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-dim)' }}>
                        {obj.category || 'GENERAL'}
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-text-main)' }}>
                        {obj.weight ?? 1.0}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--color-text-dim)' }}>
                        {obj.criteria?.length || 0} criteria
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Objective Modal */}
      {showAddObjModal && (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowAddObjModal(false)}>
          <div className="modal-dialog" role="dialog" aria-modal="true" aria-label="Add Evaluation Objective" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--color-text-main)' }}>
                Add Evaluation Objective
              </h3>
              <button className="btn btn-ghost" type="button" onClick={() => setShowAddObjModal(false)}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateObjective} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '4px' }}>
                  Objective Code *
                </label>
                <input
                  type="text"
                  value={newObjCode}
                  onChange={(e) => setNewObjCode(e.target.value)}
                  placeholder="e.g. OBJ-INC-01"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    backgroundColor: 'var(--color-bg-panel)',
                    border: '1px solid var(--color-border-subtle)',
                    borderRadius: 'var(--radius-xs)',
                    color: 'var(--color-text-main)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                  }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '4px' }}>
                  Title *
                </label>
                <input
                  type="text"
                  value={newObjTitle}
                  onChange={(e) => setNewObjTitle(e.target.value)}
                  placeholder="e.g. Timely Initial Incident Assessment"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    backgroundColor: 'var(--color-bg-panel)',
                    border: '1px solid var(--color-border-subtle)',
                    borderRadius: 'var(--radius-xs)',
                    color: 'var(--color-text-main)',
                    fontSize: '12px',
                  }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '4px' }}>
                  {tr("Description")}
                </label>
                <textarea
                  value={newObjDesc}
                  onChange={(e) => setNewObjDesc(e.target.value)}
                  rows={3}
                  placeholder="Details of performance expectations..."
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    backgroundColor: 'var(--color-bg-panel)',
                    border: '1px solid var(--color-border-subtle)',
                    borderRadius: 'var(--radius-xs)',
                    color: 'var(--color-text-main)',
                    fontSize: '12px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '4px' }}>
                  {tr("Weight")}
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="10"
                  value={newObjWeight}
                  onChange={(e) => setNewObjWeight(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    backgroundColor: 'var(--color-bg-panel)',
                    border: '1px solid var(--color-border-subtle)',
                    borderRadius: 'var(--radius-xs)',
                    color: 'var(--color-text-main)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddObjModal(false)}>
                  {tr("Cancel")}
                </button>
                <button type="submit" disabled={submittingObj} className="btn btn-primary">
                  {submittingObj ? 'Creating...' : 'Create Objective'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}

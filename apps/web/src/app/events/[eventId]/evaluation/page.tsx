'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { RecordIdentifier, StatusBadge } from '@/components/common/Badges';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  Target,
  Eye,
  Plus,
  RefreshCw,
  Search,
  Lock,
  Unlock,
  Award,
  Clock,
  CheckCircle,
  FileText,
  AlertTriangle,
  X,
  ExternalLink,
} from 'lucide-react';
import type {
  EvaluationObjectiveItem,
  EvaluationObservationItem,
} from '@cyris/contracts';

export default function EvaluationPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const { user, hasPermission } = useAuth();
  const { formatTime } = usePreferences();

  const [activeTab, setActiveTab] = useState<'OBSERVATIONS' | 'OBJECTIVES'>('OBSERVATIONS');

  const [objectives, setObjectives] = useState<EvaluationObjectiveItem[]>([]);
  const [observations, setObservations] = useState<EvaluationObservationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fast Live Observation Form State
  const [targetUnitName, setTargetUnitName] = useState('');
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
  const [newObjWeight, setNewObjWeight] = useState('1');
  const [submittingObj, setSubmittingObj] = useState(false);

  // Controller Lock / Publish
  const [locking, setLocking] = useState(false);

  const canManage = hasPermission('evaluation.manage');
  const canObserve = hasPermission('evaluation.observe');
  const canScore = hasPermission('evaluation.score');
  const canLock = hasPermission('evaluation.lock');
  const canPublish = hasPermission('evaluation.publish');

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [objRes, obsRes] = await Promise.all([
        apiClient.listEvaluationObjectives(eventId),
        apiClient.listEvaluationObservations(eventId),
      ]);

      if (objRes.ok && objRes.data) {
        setObjectives(objRes.data);
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
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => router.push(`/events/${eventId}/evaluation/after-action`)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition font-mono"
          >
            <Award size={13} className="text-amber-400" />
            After Action Review
          </button>
          {canManage && (
            <button
              onClick={() => setShowAddObjModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded transition shadow-sm"
            >
              <Plus size={14} />
              New Objective
            </button>
          )}
          {canLock && (
            <button
              onClick={handleLockEvaluation}
              disabled={locking}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition"
            >
              <Lock size={13} />
              Lock
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center gap-4 text-xs font-medium">
            <button
              onClick={() => setActiveTab('OBSERVATIONS')}
              className={`pb-2 transition border-b-2 flex items-center gap-2 ${
                activeTab === 'OBSERVATIONS'
                  ? 'border-blue-500 text-blue-400 font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye size={14} />
              Live Observations & Field Notes ({observations.length})
            </button>
            <button
              onClick={() => setActiveTab('OBJECTIVES')}
              className={`pb-2 transition border-b-2 flex items-center gap-2 ${
                activeTab === 'OBJECTIVES'
                  ? 'border-blue-500 text-blue-400 font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Target size={14} />
              Exercise Objectives ({objectives.length})
            </button>
          </div>

          <div className="text-[11px] font-mono text-slate-500">
            Confidential · Evaluator / Exercise Control Access Only
          </div>
        </div>

        {loading ? (
          <LoadingState message="Loading evaluation framework..." />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchData} />
        ) : activeTab === 'OBSERVATIONS' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column (2 Cols): Observations Log */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow">
                <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between font-mono text-xs">
                  <span className="font-bold uppercase tracking-wider text-slate-200">
                    Recorded Live Observations
                  </span>
                  <span className="text-slate-500">{observations.length} total</span>
                </div>

                {observations.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500 font-mono">
                    No evaluator observations recorded yet. Use the quick logger on the right.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/60 font-mono text-xs">
                    {observations.map((obs) => (
                      <div key={obs.id} className="p-4 hover:bg-slate-800/20 transition space-y-2">
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500">
                              {formatTime(obs.observedAt)}
                            </span>
                            {obs.objectiveCode && (
                              <span className="bg-blue-950/80 text-blue-300 border border-blue-800 px-1.5 py-0.5 rounded font-bold">
                                {obs.objectiveCode}
                              </span>
                            )}
                            {obs.targetUnitName && (
                              <span className="text-slate-300 font-sans font-medium">
                                Unit: {obs.targetUnitName}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 font-mono">
                            {obs.result && (
                              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px]">
                                {obs.result}
                              </span>
                            )}
                            {obs.score !== null && obs.score !== undefined && (
                              <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800 font-bold text-[10px]">
                                Score: {obs.score}
                              </span>
                            )}
                          </div>
                        </div>

                        <p className="text-slate-200 font-sans text-xs leading-relaxed whitespace-pre-wrap">
                          {obs.note}
                        </p>

                        {obs.relatedResourceId && (
                          <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5 pt-1">
                            <span className="text-slate-500">Related Record:</span>
                            <span className="text-blue-400">{obs.relatedResourceId}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column (1 Col): Fast Live Observation Form */}
            <div className="space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 shadow">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-2 mb-3">
                  <Eye size={15} className="text-blue-400" />
                  <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-200">
                    Fast Live Observation
                  </h3>
                </div>

                {saveSuccess && (
                  <div className="mb-3 p-2 bg-emerald-950/60 border border-emerald-800 rounded text-emerald-300 text-xs font-mono flex items-center gap-1.5">
                    <CheckCircle size={13} />
                    Observation recorded successfully!
                  </div>
                )}

                {saveError && (
                  <div className="mb-3 p-2 bg-red-950/60 border border-red-800 rounded text-red-300 text-xs font-mono">
                    {saveError}
                  </div>
                )}

                <form onSubmit={handleFastObservationSubmit} className="space-y-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">
                      Objective
                    </label>
                    <select
                      value={selectedObjectiveId}
                      onChange={(e) => setSelectedObjectiveId(e.target.value)}
                      className="w-full px-2 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-200 font-mono focus:outline-none focus:border-blue-500"
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
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">
                      Related Record ID (Evidence, Incident, Task, Case...)
                    </label>
                    <input
                      type="text"
                      value={relatedRecordId}
                      onChange={(e) => setRelatedRecordId(e.target.value)}
                      placeholder="e.g. E-0042, INC-0004, TASK-0021"
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">
                      Observation Note <span className="text-rose-400">*</span>
                    </label>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={4}
                      placeholder="e.g. Correctly verified image hash before analysis..."
                      className="w-full p-2 bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-blue-500"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-mono text-slate-400 mb-1">
                        Result Assessment
                      </label>
                      <select
                        value={result}
                        onChange={(e) => setResult(e.target.value as any)}
                        className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-slate-200 font-mono focus:outline-none focus:border-blue-500 text-[11px]"
                      >
                        <option value="EXCEEDED">Exceeded</option>
                        <option value="MET">Met</option>
                        <option value="PARTIALLY_MET">Partially Met</option>
                        <option value="NOT_MET">Not Met</option>
                        <option value="UNOBSERVED">Unobserved</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-mono text-slate-400 mb-1">
                        Score (0-5, Optional)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={score}
                        onChange={(e) => setScore(e.target.value ? Number(e.target.value) : '')}
                        placeholder="e.g. 4"
                        className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-slate-200 font-mono focus:outline-none focus:border-blue-500 text-[11px]"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={savingObservation}
                    className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow"
                  >
                    <CheckCircle size={14} />
                    {savingObservation ? 'Saving...' : 'Save Observation'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        ) : (
          /* OBJECTIVES TAB */
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950/70 border-b border-slate-800 text-slate-400 uppercase font-mono tracking-wider text-[11px]">
                    <th className="py-2.5 px-4 w-28">Code</th>
                    <th className="py-2.5 px-4">Title & Description</th>
                    <th className="py-2.5 px-4 w-28">Category</th>
                    <th className="py-2.5 px-4 w-24">Weight</th>
                    <th className="py-2.5 px-4 w-32">Criteria Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {objectives.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500 font-mono">
                        No evaluation objectives registered for this event.
                      </td>
                    </tr>
                  ) : (
                    objectives.map((obj) => (
                      <tr key={obj.id} className="hover:bg-slate-800/30">
                        <td className="py-3 px-4 font-mono font-bold text-blue-400">{obj.code}</td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-200">{obj.title}</div>
                          {obj.description && (
                            <div className="text-slate-400 text-xs mt-0.5">{obj.description}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                          {obj.category || 'GENERAL'}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-300">
                          {obj.weight ?? 1.0}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-400">
                          {obj.criteria?.length || 0} criteria
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* New Objective Modal */}
      {showAddObjModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleCreateObjective}
            className="bg-slate-900 border border-slate-700 rounded-lg max-w-md w-full p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="font-semibold text-slate-100 text-sm">Add Evaluation Objective</h4>
              <button
                type="button"
                onClick={() => setShowAddObjModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1">Code (e.g. OBJ-04)</label>
                <input
                  type="text"
                  value={newObjCode}
                  onChange={(e) => setNewObjCode(e.target.value)}
                  placeholder="OBJ-01"
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Title</label>
                <input
                  type="text"
                  value={newObjTitle}
                  onChange={(e) => setNewObjTitle(e.target.value)}
                  placeholder="e.g. Preserve digital evidence integrity"
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Description</label>
                <textarea
                  value={newObjDesc}
                  onChange={(e) => setNewObjDesc(e.target.value)}
                  rows={3}
                  placeholder="Scope, expected performance..."
                  className="w-full p-2 bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Evaluation Weight</label>
                <input
                  type="number"
                  step="0.1"
                  value={newObjWeight}
                  onChange={(e) => setNewObjWeight(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowAddObjModal(false)}
                className="px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 rounded transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingObj}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded transition"
              >
                {submittingObj ? 'Saving...' : 'Add Objective'}
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}

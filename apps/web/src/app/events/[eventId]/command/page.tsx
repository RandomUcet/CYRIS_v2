'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { RecordIdentifier, StatusBadge, PriorityBadge } from '@/components/common/Badges';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  Radio,
  FileText,
  AlertTriangle,
  RefreshCw,
  Clock,
  Heart,
  CheckSquare,
  Shield,
  Activity,
  Plus,
  Sparkles,
  ExternalLink,
  X,
} from 'lucide-react';
import type { OperationalPictureResponse } from '@cyris/contracts';
import { DefconPanel } from '@/components/command/DefconPanel';

export default function CommandPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const { user, hasPermission } = useAuth();
  const { formatTime } = usePreferences();

  const [data, setData] = useState<OperationalPictureResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // SITREP drafting modal
  const [showSitrepModal, setShowSitrepModal] = useState(false);
  const [sitrepTitle, setSitrepTitle] = useState('');
  const [sitrepSummary, setSitrepSummary] = useState('');
  const [submittingSitrep, setSubmittingSitrep] = useState(false);
  const [sitrepResult, setSitrepResult] = useState<string | null>(null);
  const [sitrepError, setSitrepError] = useState<string | null>(null);

  const fetchOperationalPicture = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getOperationalPicture(eventId);
      if (res.ok && res.data) {
        setData(res.data);
      } else {
        setError(res.error || 'Failed to load operational picture');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (eventId) {
      fetchOperationalPicture();
    }
  }, [eventId]);

  const handleCreateSitrep = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sitrepTitle.trim()) {
      setSitrepError('Title is required');
      return;
    }
    setSubmittingSitrep(true);
    setSitrepError(null);
    try {
      const res = await apiClient.createSitrep(eventId, {
        title: sitrepTitle.trim(),
        summary: sitrepSummary.trim() || 'Command Operational Snapshot',
        incidentIds: data?.criticalIncidents.map((i) => i.id) ?? [],
        taskIds: data?.priorityTasks.map((t) => t.id) ?? [],
        includeMedicalSummary: true,
        visibility: 'EVENT',
      });

      if (res.ok && res.data) {
        setSitrepResult(`SITREP created: ${res.data.documentNumber || res.data.title}`);
        setTimeout(() => {
          setShowSitrepModal(false);
          setSitrepResult(null);
          setSitrepTitle('');
          setSitrepSummary('');
        }, 1500);
      } else {
        setSitrepError(res.error || 'Failed to publish SITREP');
      }
    } catch (err: any) {
      setSitrepError(err.message);
    } finally {
      setSubmittingSitrep(false);
    }
  };

  return (
    <AppShell breadcrumbs={[{ label: 'Command', href: `/events/${eventId}/command` }]}>
      <div className="space-y-6 max-w-7xl mx-auto">
        <DefconPanel eventId={eventId} />
        {/* Command Header Banner */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-950/80 border border-blue-800/60 flex items-center justify-center text-blue-400">
              <Radio size={20} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider font-mono">
                Command Operational Picture
              </h2>
              <p className="text-xs text-slate-400">
                Real-time operational synthesis from canonical exercise services.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchOperationalPicture}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              onClick={() => {
                setSitrepTitle(`SITREP — ${formatTime(new Date())}`);
                setShowSitrepModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded transition shadow-sm"
            >
              <FileText size={14} />
              Produce SITREP
            </button>
          </div>

          {/* Operational Medical Status Pill (Limited Operational Summary, zero clinical notes) */}
          {data?.medicalSummary && (
            <div className="flex items-center gap-4 bg-slate-950/80 border border-slate-800 px-4 py-2 rounded-lg text-xs font-mono">
              <div className="flex items-center gap-2 text-rose-400 font-semibold">
                <Heart size={14} />
                Medical Status:
              </div>
              <div className="text-slate-300">
                <span className="font-bold text-rose-300">{data.medicalSummary.activeCasualties}</span> active casualties
              </div>
              <span className="text-slate-700">|</span>
              <div className="text-slate-400">
                <span className="font-bold text-emerald-400">{data.medicalSummary.transferredCasualties}</span> transferred
              </div>
              <span className="text-slate-700">|</span>
              <div className="text-slate-400">
                <span className="font-bold text-slate-300">{data.medicalSummary.stabilizedCasualties}</span> stabilized
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <LoadingState message="Assembling operational picture..." />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchOperationalPicture} />
        ) : !data ? (
          <EmptyState title="No operational data" description="No operational picture available." />
        ) : (
          <div className="space-y-6">
            {/* Section 1: Critical / High Incidents */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow">
              <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={15} className="text-amber-400" />
                  <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-200">
                    Critical / High Incidents ({data.criticalIncidents.length})
                  </h3>
                </div>
                <button
                  onClick={() => router.push(`/events/${eventId}/incidents`)}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-mono"
                >
                  View all <ExternalLink size={12} />
                </button>
              </div>

              {data.criticalIncidents.length === 0 ? (
                <div className="p-4 text-xs text-slate-500 font-mono text-center">
                  No active critical or high severity incidents recorded.
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500 text-[11px] uppercase">
                      <th className="py-2 px-4 w-28">Code</th>
                      <th className="py-2 px-4">Title</th>
                      <th className="py-2 px-4 w-24">Severity</th>
                      <th className="py-2 px-4 w-28">Status</th>
                      <th className="py-2 px-4 w-40">Reported</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {data.criticalIncidents.map((inc) => (
                      <tr
                        key={inc.id}
                        onClick={() => router.push(`/events/${eventId}/incidents`)}
                        className="hover:bg-slate-800/40 cursor-pointer transition"
                      >
                        <td className="py-2.5 px-4 font-mono font-medium text-slate-300">
                          <RecordIdentifier code={inc.incidentNumber} />
                        </td>
                        <td className="py-2.5 px-4 font-medium text-slate-200">{inc.title}</td>
                        <td className="py-2.5 px-4">
                          <PriorityBadge priority={inc.priority} />
                        </td>
                        <td className="py-2.5 px-4">
                          <StatusBadge status={inc.status} />
                        </td>
                        <td className="py-2.5 px-4 text-slate-400 text-[11px] font-mono">
                          {formatTime(inc.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Section 2: Priority Tasks */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow">
              <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckSquare size={15} className="text-blue-400" />
                  <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-200">
                    Priority Operational Tasks ({data.priorityTasks.length})
                  </h3>
                </div>
                <button
                  onClick={() => router.push(`/events/${eventId}/tasks`)}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-mono"
                >
                  View all <ExternalLink size={12} />
                </button>
              </div>

              {data.priorityTasks.length === 0 ? (
                <div className="p-4 text-xs text-slate-500 font-mono text-center">
                  No high priority operational tasks active.
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500 text-[11px] uppercase">
                      <th className="py-2 px-4 w-28">Identifier</th>
                      <th className="py-2 px-4">Title</th>
                      <th className="py-2 px-4 w-24">Priority</th>
                      <th className="py-2 px-4 w-32">Status</th>
                      <th className="py-2 px-4 w-44">Assigned Unit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {data.priorityTasks.map((t) => (
                      <tr
                        key={t.id}
                        onClick={() => router.push(`/events/${eventId}/tasks`)}
                        className="hover:bg-slate-800/40 cursor-pointer transition"
                      >
                        <td className="py-2.5 px-4 font-mono font-medium text-slate-300">
                          <RecordIdentifier code={t.taskNumber} />
                        </td>
                        <td className="py-2.5 px-4 font-medium text-slate-200">
                          <div>{t.title}</div>
                          {t.blockedReason && (
                            <div className="text-[11px] text-amber-400 font-normal mt-0.5">
                              Blocked: {t.blockedReason}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          <PriorityBadge priority={t.priority} />
                        </td>
                        <td className="py-2.5 px-4">
                          <StatusBadge status={t.status} />
                        </td>
                        <td className="py-2.5 px-4 text-slate-300 font-mono text-[11px]">
                          {t.assignedUnitName || <span className="text-slate-600">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Section 3: Recent Significant Events (Timeline Run-Sheet) */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow">
              <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock size={15} className="text-indigo-400" />
                  <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-200">
                    Recent Significant Events
                  </h3>
                </div>
                <button
                  onClick={() => router.push(`/events/${eventId}/timeline`)}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-mono"
                >
                  Full timeline <ExternalLink size={12} />
                </button>
              </div>

              {data.recentActivities.length === 0 ? (
                <div className="p-4 text-xs text-slate-500 font-mono text-center">
                  No recent operational events recorded.
                </div>
              ) : (
                <div className="divide-y divide-slate-800/60 font-mono text-xs">
                  {data.recentActivities.map((act) => (
                    <div
                      key={act.id}
                      className="px-4 py-2.5 flex items-start gap-4 hover:bg-slate-800/30 transition"
                    >
                      <div className="w-28 shrink-0 text-slate-500 text-[11px]">
                        {formatTime(act.occurredAt)}
                      </div>
                      <div className="flex-1">
                        <span className="font-semibold text-slate-200 mr-2">{act.title}</span>
                        {act.summary && <span className="text-slate-400 font-sans text-xs">{act.summary}</span>}
                      </div>
                      <div className="text-[10px] text-slate-500 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                        {act.activityType}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Produce SITREP Modal */}
      {showSitrepModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleCreateSitrep}
            className="bg-slate-900 border border-slate-700 rounded-lg max-w-lg w-full p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-semibold text-slate-100 text-sm flex items-center gap-2">
                <FileText size={16} className="text-blue-400" />
                Produce Situation Report (SITREP)
              </h3>
              <button
                type="button"
                onClick={() => setShowSitrepModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {sitrepError && (
              <div className="p-2.5 bg-red-950/50 border border-red-800 rounded text-red-300 text-xs">
                {sitrepError}
              </div>
            )}

            {sitrepResult && (
              <div className="p-2.5 bg-emerald-950/50 border border-emerald-800 rounded text-emerald-300 text-xs font-mono">
                {sitrepResult}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1">
                  Report Title <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={sitrepTitle}
                  onChange={(e) => setSitrepTitle(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Command Assessment / Notes</label>
                <textarea
                  value={sitrepSummary}
                  onChange={(e) => setSitrepSummary(e.target.value)}
                  rows={4}
                  placeholder="Operational commentary, unit directives, threat posture..."
                  className="w-full p-2 bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="p-3 bg-slate-950/60 rounded border border-slate-800 text-slate-400 space-y-1 text-[11px] font-mono">
                <div className="text-slate-300 font-semibold uppercase text-[10px]">Auto-Included In Snapshot:</div>
                <div>• {data?.criticalIncidents.length || 0} Critical / High Incidents</div>
                <div>• {data?.priorityTasks.length || 0} Priority Operational Tasks</div>
                <div>• Current Medical Casualties Status ({data?.medicalSummary?.activeCasualties || 0} active)</div>
                <div>• Stored as canonical SITREP document with version tracking and relationships</div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowSitrepModal(false)}
                className="px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 rounded transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingSitrep}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded transition shadow-sm"
              >
                {submittingSitrep ? 'Publishing...' : 'Generate & Archive SITREP'}
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}

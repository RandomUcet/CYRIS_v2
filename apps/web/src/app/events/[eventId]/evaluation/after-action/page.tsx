'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  Award,
  ArrowLeft,
  RefreshCw,
  FileText,
  Lock,
  Globe,
  CheckCircle,
  Clock,
  Sparkles,
} from 'lucide-react';
import type { AfterActionReviewResponse } from '@cyris/contracts';

export default function AfterActionPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const { hasPermission } = useAuth();
  const { formatTime } = usePreferences();

  const [aar, setAar] = useState<AfterActionReviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [publishing, setPublishing] = useState(false);
  const [publishMessage, setPublishMessage] = useState<string | null>(null);

  const canPublish = hasPermission('evaluation.publish');

  const fetchAar = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getAfterActionReview(eventId);
      if (res.ok && res.data) {
        setAar(res.data);
      } else {
        setError(res.error || 'Failed to compile After Action Review');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (eventId) {
      fetchAar();
    }
  }, [eventId]);

  const handlePublish = async () => {
    if (!confirm('Publish After Action Review summary? This authorizes release of post-exercise evaluation findings.')) return;
    setPublishing(true);
    try {
      const res = await apiClient.publishEvaluation(eventId, {
        notes: 'Official After Action Review concluded.',
      });
      if (res.ok) {
        setPublishMessage('AAR successfully published.');
        fetchAar();
      }
    } finally {
      setPublishing(false);
    }
  };

  return (
    <AppShell
      title="After Action Review (AAR)"
      breadcrumbs={[
        { label: 'Evaluation', href: `/events/${eventId}/evaluation` },
        { label: 'After Action', href: `/events/${eventId}/evaluation/after-action` },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(`/events/${eventId}/evaluation`)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition"
          >
            <ArrowLeft size={13} />
            Back to Live
          </button>
          <button
            onClick={fetchAar}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          {canPublish && (
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded transition shadow-sm"
            >
              <Globe size={13} />
              Publish Findings
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-6 max-w-6xl mx-auto font-sans">
        {/* Banner */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 flex items-center justify-between shadow">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-950/80 border border-amber-800/60 flex items-center justify-center text-amber-400">
              <Award size={20} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider font-mono">
                Post-Exercise Evaluator Synthesis
              </h2>
              <p className="text-xs text-slate-400">
                Aggregated observation notes, human scoring metrics, and canonical fact linkage.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="bg-slate-950 px-3 py-1.5 rounded border border-slate-800 text-slate-300">
              Status: <strong className="text-white">{aar?.status || 'DRAFT'}</strong>
            </div>
          </div>
        </div>

        {publishMessage && (
          <div className="p-3 bg-emerald-950/60 border border-emerald-800 rounded text-emerald-300 text-xs font-mono flex items-center gap-2">
            <CheckCircle size={14} />
            {publishMessage}
          </div>
        )}

        {loading ? (
          <LoadingState message="Compiling After Action Review..." />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchAar} />
        ) : !aar ? (
          <EmptyState title="No AAR data" description="After action review data could not be compiled." />
        ) : (
          <div className="space-y-6">
            {/* Executive Synthesis Summary */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-3">
              <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <FileText size={14} className="text-blue-400" />
                Exercise Summary
              </h3>
              <p className="text-slate-300 text-xs leading-relaxed whitespace-pre-wrap">
                {aar.observationsCount} field observations recorded across {aar.objectivesCount} exercise objectives.
                Exercise evaluation status: {aar.status}. Generated on {formatTime(aar.generatedAt)}.
              </p>
            </div>

            {/* Performance by Objective */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow">
              <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-800 font-mono text-xs font-bold uppercase text-slate-200">
                Objectives Assessment Summary ({aar.objectives.length})
              </div>

              <div className="divide-y divide-slate-800/60">
                {aar.objectives.map((obj) => (
                  <div key={obj.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-blue-400 text-xs">{obj.code}</span>
                        <span className="font-semibold text-slate-200 text-xs">{obj.title}</span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400">
                        Weight: {obj.weight ?? 1.0}
                      </span>
                    </div>

                    {obj.description && (
                      <p className="text-slate-400 text-xs">{obj.description}</p>
                    )}

                    <div className="flex items-center gap-4 text-[11px] font-mono text-slate-400 pt-1">
                      <span>Criteria defined: <strong className="text-slate-200">{obj.criteria.length}</strong></span>
                      {obj.targetUnitName && (
                        <span>Assigned Unit: <strong className="text-slate-300">{obj.targetUnitName}</strong></span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Field Observations */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow">
              <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-800 font-mono text-xs font-bold uppercase text-slate-200 flex items-center justify-between">
                <span>Recent Field Observations ({aar.recentObservations.length})</span>
                <span className="text-[11px] font-normal text-slate-400">Total recorded: {aar.observationsCount}</span>
              </div>

              <div className="divide-y divide-slate-800/60 font-mono text-xs">
                {aar.recentObservations.length === 0 ? (
                  <div className="p-4 text-center text-slate-500">No field observations logged yet.</div>
                ) : (
                  aar.recentObservations.map((obs) => (
                    <div key={obs.id} className="px-4 py-2.5 flex items-center justify-between hover:bg-slate-800/20">
                      <div className="flex items-center gap-3">
                        <span className="text-slate-500 text-[11px]">
                          {formatTime(obs.observedAt)}
                        </span>
                        {obs.targetUnitName && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                            {obs.targetUnitName}
                          </span>
                        )}
                        <span className="text-slate-200 font-sans font-medium">{obs.note}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {obs.score !== null && obs.score !== undefined && (
                          <span className="text-amber-400 font-bold text-[11px]">Score: {obs.score}</span>
                        )}
                        <span className="text-[10px] text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                          {obs.observationType}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

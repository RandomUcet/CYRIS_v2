'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { RecordIdentifier } from '@/components/common/Badges';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  Award,
  ArrowLeft,
  RefreshCw,
  FileText,
  Globe,
  CheckCircle,
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => router.push(`/events/${eventId}/evaluation`)}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
          >
            <ArrowLeft size={13} />
            Back to Live
          </button>
          <button
            onClick={fetchAar}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            Refresh
          </button>
          {canPublish && (
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="btn btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
            >
              <Globe size={13} />
              Publish Findings
            </button>
          )}
        </div>
      }
    >
      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1200px' }}>
        {/* Banner */}
        <div
          style={{
            backgroundColor: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-accent-ops)',
              }}
            >
              <Award size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-main)' }}>
                Post-Exercise Evaluator Synthesis
              </h2>
              <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                Aggregated observation notes, human scoring metrics, and canonical fact linkage.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
            <div style={{ backgroundColor: 'var(--color-bg-panel)', padding: '6px 12px', borderRadius: 'var(--radius-xs)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-main)' }}>
              Status: <strong>{aar?.status || 'DRAFT'}</strong>
            </div>
          </div>
        </div>

        {publishMessage && (
          <div style={{ padding: '10px 14px', backgroundColor: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: 'var(--radius-xs)', color: 'var(--color-status-success)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Executive Synthesis Summary */}
            <div
              style={{
                backgroundColor: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={14} style={{ color: 'var(--color-accent-ops)' }} />
                Exercise Summary
              </h3>
              <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '13px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {aar.observationsCount} field observations recorded across {aar.objectivesCount} exercise objectives.
                Exercise evaluation status: {aar.status}. Generated on {formatTime(aar.generatedAt)}.
              </p>
            </div>

            {/* Performance by Objective */}
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
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: 'var(--color-text-main)',
                }}
              >
                Objectives Assessment Summary ({aar.objectives.length})
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {aar.objectives.map((obj) => (
                  <div key={obj.id} style={{ padding: '16px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <RecordIdentifier id={obj.code} prefix="" />
                        <span style={{ fontWeight: 600, color: 'var(--color-text-main)', fontSize: '13px' }}>{obj.title}</span>
                      </div>
                      <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-dim)' }}>
                        Weight: {obj.weight ?? 1.0}
                      </span>
                    </div>

                    {obj.description && (
                      <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '12px' }}>{obj.description}</p>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-dim)', paddingTop: '4px' }}>
                      <span>Criteria defined: <strong style={{ color: 'var(--color-text-main)' }}>{obj.criteria.length}</strong></span>
                      {obj.targetUnitName && (
                        <span>Assigned Unit: <strong style={{ color: 'var(--color-text-main)' }}>{obj.targetUnitName}</strong></span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Field Observations */}
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
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: 'var(--color-text-main)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>Recent Field Observations ({aar.recentObservations.length})</span>
                <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--color-text-dim)' }}>Total recorded: {aar.observationsCount}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {aar.recentObservations.length === 0 ? (
                  <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-dim)', fontSize: '12px' }}>
                    No field observations logged yet.
                  </div>
                ) : (
                  aar.recentObservations.map((obs) => (
                    <div
                      key={obs.id}
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--color-border-subtle)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ color: 'var(--color-text-dim)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                          {formatTime(obs.observedAt)}
                        </span>
                        {obs.targetUnitName && (
                          <span style={{ padding: '2px 6px', borderRadius: '3px', backgroundColor: 'var(--color-bg-panel)', border: '1px solid var(--color-border-subtle)', fontSize: '10px' }}>
                            {obs.targetUnitName}
                          </span>
                        )}
                        <span style={{ color: 'var(--color-text-main)', fontWeight: 500 }}>{obs.note}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {obs.score !== null && obs.score !== undefined && (
                          <span style={{ color: 'var(--color-accent-ops)', fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                            Score: {obs.score}
                          </span>
                        )}
                        <span style={{ fontSize: '10px', color: 'var(--color-text-dim)', backgroundColor: 'var(--color-bg-panel)', padding: '2px 6px', borderRadius: '3px', border: '1px solid var(--color-border-subtle)', fontFamily: 'var(--font-mono)' }}>
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

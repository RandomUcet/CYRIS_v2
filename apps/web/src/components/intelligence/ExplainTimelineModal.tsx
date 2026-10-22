'use client';

import React, { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { useEvent } from '@/contexts/EventContext';
import {
  HelpCircle,
  X,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  ArrowRight,
  GitCommit,
  GitBranch,
} from 'lucide-react';
import type { ExplainTimelineResponse } from '@cyris/contracts';

interface ExplainTimelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  activityId?: string;
  resourceId?: string;
  eventTitle?: string;
}

export function ExplainTimelineModal({
  isOpen,
  onClose,
  activityId,
  resourceId,
  eventTitle = 'Timeline Event',
}: ExplainTimelineModalProps) {
  const { selectedEventId } = useEvent();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExplainTimelineResponse | null>(null);

  const fetchExplanation = async () => {
    if (!selectedEventId || (!activityId && !resourceId)) return;

    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.explainTimeline(selectedEventId, {
        activityId,
        resourceId,
      });

      if (res.ok && res.data) {
        setResult(res.data);
      } else {
        setError(res.error || 'Failed to analyze event causation');
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Connection error to AI gateway');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setResult(null);
      setError(null);
      fetchExplanation();
    }
  }, [isOpen, activityId, resourceId, selectedEventId]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: '20px',
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: '6px',
          width: '100%',
          maxWidth: '640px',
          boxShadow: '0 12px 32px rgba(0,0,0,0.2)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <HelpCircle size={18} style={{ color: 'var(--color-accent)' }} />
            <div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                Event Causation — {eventTitle}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                CYRIS Intelligence • Explicit Causation Only • No Hallucinated Triggers
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {loading ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <RefreshCw size={24} className="animate-spin" style={{ color: 'var(--color-accent)', margin: '0 auto 12px auto' }} />
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                Tracing Activity Causation
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                Inspecting parent causation IDs, custody transfers, and related timeline batches...
              </div>
            </div>
          ) : error ? (
            <div
              style={{
                padding: '14px',
                backgroundColor: 'rgba(211, 47, 47, 0.08)',
                border: '1px solid rgba(211, 47, 47, 0.3)',
                borderRadius: '6px',
                fontSize: '12px',
                color: 'var(--color-danger)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
              }}
            >
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong>Unable to explain causation:</strong>
                <div style={{ marginTop: '4px' }}>{error}</div>
              </div>
            </div>
          ) : result ? (
            <>
              {/* Context Sufficiency Notice */}
              {!result.hasSufficientContext && (
                <div
                  style={{
                    padding: '10px 14px',
                    backgroundColor: 'rgba(237, 108, 2, 0.08)',
                    border: '1px solid rgba(237, 108, 2, 0.3)',
                    borderRadius: '4px',
                    fontSize: '12px',
                    color: '#c25e00',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                  <span>
                    <strong>Bounded Context:</strong> CYRIS contains limited direct parent linkages for this specific event. Causation is strictly limited to recorded data.
                  </span>
                </div>
              )}

              {/* Causation Explanation */}
              <div
                style={{
                  backgroundColor: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  padding: '16px',
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                  Causal Analysis
                </div>
                <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap' }}>
                  {result.explanation}
                </div>
              </div>

              {/* Step-by-Step Causal Chain */}
              {result.causalChain.length > 0 && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: '10px' }}>
                    Recorded Upstream Chain ({result.causalChain.length} steps)
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {result.causalChain.map((step) => (
                      <div
                        key={step.step}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px',
                          backgroundColor: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          padding: '10px 12px',
                          borderRadius: '4px',
                          fontSize: '12px',
                        }}
                      >
                        <div
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            backgroundColor: 'rgba(0, 102, 204, 0.1)',
                            color: 'var(--color-accent)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '10px',
                            fontWeight: 600,
                            flexShrink: 0,
                          }}
                        >
                          {step.step}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                            {step.title}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                            Type: <code>{step.type}</code> {step.timestamp ? `• ${step.timestamp.substring(0, 19).replace('T', ' ')}` : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <ShieldCheck size={13} style={{ color: 'var(--color-success)' }} />
            Non-hallucinated causation analysis.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary"
            style={{ fontSize: '12px', padding: '7px 16px' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { useEvent } from '@/contexts/EventContext';
import {
  FileText,
  X,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  ShieldCheck,
  Tag,
  Link2,
  HelpCircle,
} from 'lucide-react';
import type { SummarizeCaseResponse } from '@cyris/contracts';

interface SummarizeCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  caseNumber: string;
  onApplySummary?: (summaryText: string) => void;
}

export function SummarizeCaseModal({
  isOpen,
  onClose,
  caseId,
  caseNumber,
  onApplySummary,
}: SummarizeCaseModalProps) {
  const { selectedEventId } = useEvent();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SummarizeCaseResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchSummary = async () => {
    if (!selectedEventId || !caseId) return;

    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.summarizeCase(selectedEventId, caseId);
      if (res.ok && res.data) {
        setResult(res.data);
      } else {
        setError(res.error || 'Failed to generate case intelligence summary');
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
      setCopied(false);
      fetchSummary();
    }
  }, [isOpen, caseId, selectedEventId]);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (result?.summary) {
      navigator.clipboard.writeText(result.summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

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
          maxWidth: '720px',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileText size={18} style={{ color: 'var(--color-accent)' }} />
            <div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                Case Intelligence Summary — {caseNumber}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                CYRIS Intelligence • Permitted Records Only
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
                Synthesizing Case Intelligence
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                Querying permitted evidence, relationships, lab findings, and timeline events...
              </div>
            </div>
          ) : error ? (
            <div
              style={{
                padding: '16px',
                backgroundColor: 'rgba(211, 47, 47, 0.08)',
                border: '1px solid rgba(211, 47, 47, 0.3)',
                borderRadius: '6px',
                fontSize: '12px',
                color: 'var(--color-danger)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong>Unable to generate Case summary:</strong>
                <div style={{ marginTop: '4px' }}>{error}</div>
                <button
                  type="button"
                  onClick={fetchSummary}
                  className="btn btn-secondary"
                  style={{ marginTop: '10px', fontSize: '11px', padding: '4px 10px' }}
                >
                  Retry Analysis
                </button>
              </div>
            </div>
          ) : result ? (
            <>
              {/* Provenance & Citation Bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  backgroundColor: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                  fontSize: '11px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    style={{
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono, monospace)',
                      fontWeight: 600,
                      backgroundColor: 'rgba(0, 102, 204, 0.1)',
                      color: 'var(--color-accent)',
                      padding: '2px 6px',
                      borderRadius: '3px',
                    }}
                  >
                    DRAFT
                  </span>
                  <span style={{ color: 'var(--color-text-secondary)' }}>
                    Model: {result.model} ({result.durationMs}ms)
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Referenced:</span>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {result.referencedCodes.map((code) => (
                      <span
                        key={code}
                        style={{
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono, monospace)',
                          backgroundColor: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          padding: '1px 5px',
                          borderRadius: '2px',
                        }}
                      >
                        {code}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Executive Summary */}
              <div
                style={{
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  padding: '16px',
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                  Executive Briefing
                </div>
                <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap' }}>
                  {result.summary}
                </div>
              </div>

              {/* Three-part Factual Classification Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                {/* 1. Confirmed Facts */}
                <div
                  style={{
                    backgroundColor: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                    borderTop: '3px solid var(--color-success)',
                    borderRadius: '4px',
                    padding: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <CheckCircle2 size={13} style={{ color: 'var(--color-success)' }} />
                    <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-text-primary)' }}>
                      Confirmed Facts
                    </span>
                  </div>
                  {result.sections.confirmedFacts.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
                      {result.sections.confirmedFacts.map((fact, idx) => (
                        <li key={idx} style={{ marginBottom: '4px' }}>{fact}</li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                      No verified facts logged yet.
                    </div>
                  )}
                </div>

                {/* 2. Correlations */}
                <div
                  style={{
                    backgroundColor: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                    borderTop: '3px solid var(--color-accent)',
                    borderRadius: '4px',
                    padding: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <Link2 size={13} style={{ color: 'var(--color-accent)' }} />
                    <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-text-primary)' }}>
                      Correlations & Links
                    </span>
                  </div>
                  {result.sections.correlations.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
                      {result.sections.correlations.map((corr, idx) => (
                        <li key={idx} style={{ marginBottom: '4px' }}>{corr}</li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                      No correlations recorded.
                    </div>
                  )}
                </div>

                {/* 3. Unverified Information */}
                <div
                  style={{
                    backgroundColor: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                    borderTop: '3px solid #f59e0b',
                    borderRadius: '4px',
                    padding: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <HelpCircle size={13} style={{ color: '#f59e0b' }} />
                    <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-text-primary)' }}>
                      Unverified / Leads
                    </span>
                  </div>
                  {result.sections.unverified.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
                      {result.sections.unverified.map((unv, idx) => (
                        <li key={idx} style={{ marginBottom: '4px' }}>{unv}</li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                      None recorded.
                    </div>
                  )}
                </div>
              </div>
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
            Advisory draft output for investigators.
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              style={{ fontSize: '12px', padding: '7px 14px' }}
            >
              Close
            </button>
            {result && (
              <>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="btn btn-secondary"
                  style={{
                    fontSize: '12px',
                    padding: '7px 12px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                {onApplySummary && (
                  <button
                    type="button"
                    onClick={() => {
                      onApplySummary(result.summary);
                      onClose();
                    }}
                    className="btn btn-primary"
                    style={{
                      fontSize: '12px',
                      padding: '7px 16px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <Check size={13} />
                    Apply to Case Summary
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

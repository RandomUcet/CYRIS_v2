'use client';

import React, { useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { useEvent } from '@/contexts/EventContext';
import {
  Sparkles,
  X,
  Check,
  Copy,
  AlertCircle,
  RefreshCw,
  Languages,
  ShieldCheck,
  AlignLeft,
} from 'lucide-react';
import type { WritingAssistActionValue, WritingAssistResponse } from '@cyris/contracts';

interface WritingAssistModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialText: string;
  onApply: (improvedText: string) => void;
  fieldLabel?: string;
  context?: string;
}

export function WritingAssistModal({
  isOpen,
  onClose,
  initialText,
  onApply,
  fieldLabel = 'Field',
  context = 'general',
}: WritingAssistModalProps) {
  const { selectedEventId } = useEvent();
  const [inputText, setInputText] = useState(initialText);
  const [action, setAction] = useState<WritingAssistActionValue>('IMPROVE');
  const [targetLang, setTargetLang] = useState<'cs' | 'en'>('en');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WritingAssistResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Sync initialText when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setInputText(initialText);
      setResult(null);
      setError(null);
      setCopied(false);
    }
  }, [isOpen, initialText]);

  useEffect(() => {
    if (!isOpen) return;
    dialogRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!selectedEventId) {
      setError('No active event selected');
      return;
    }
    if (!inputText.trim()) {
      setError('Please provide text to assist with');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await apiClient.writingAssist(selectedEventId, {
        text: inputText,
        action,
        context,
        targetLanguage: action === 'TRANSLATE_CS_EN' ? targetLang : undefined,
      });

      if (res.ok && res.data) {
        setResult(res.data);
      } else {
        setError(res.error || 'Writing Assist is temporarily unavailable. Your original text has not been changed.');
      }
    } catch (err: unknown) {
      setError('Writing Assist is temporarily unavailable. Your original text has not been changed.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (result?.draft) {
      navigator.clipboard.writeText(result.draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleApply = () => {
    if (result?.draft) {
      onApply(result.draft);
      onClose();
    }
  };

  const actions: Array<{ value: WritingAssistActionValue; label: string; desc: string }> = [
    { value: 'IMPROVE', label: 'Improve Writing', desc: 'Clarity, flow, and terminology' },
    { value: 'CONCISE', label: 'Make Concise', desc: 'Brief, high-impact phrasing' },
    { value: 'FORMAL', label: 'Make Formal', desc: 'Institutional investigation style' },
    { value: 'CORRECT_LANGUAGE', label: 'Correct Language', desc: 'Fix grammar, typos, punctuation' },
    { value: 'TRANSLATE_CS_EN', label: 'Translate CS ↔ EN', desc: 'Preserves technical terms' },
  ];

  return (
    <div
      className="dialog-overlay dialog-overlay-top"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="dialog-surface"
        role="dialog"
        aria-modal="true"
        aria-labelledby="writing-assist-title"
        tabIndex={-1}
      >
        {/* Header */}
        <div className="dialog-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlignLeft size={18} style={{ color: 'var(--color-accent)' }} />
            <div>
              <div id="writing-assist-title" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                Writing Assist — {fieldLabel}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                CYRIS Intelligence • Factual uncertainty preserved
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

        {/* Modal Body */}
        <div className="dialog-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Action Selector */}
          <div>
            <label htmlFor="writing-assist-action" style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
              Action
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '5px' }}>
              <select
                id="writing-assist-action"
                value={action}
                onChange={(event) => setAction(event.target.value as WritingAssistActionValue)}
                className="select-field"
                disabled={loading}
              >
                {actions.map((act) => (
                  <option key={act.value} value={act.value}>
                    {act.label}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                {actions.find((item) => item.value === action)?.desc}
              </span>
            </div>

            {action === 'TRANSLATE_CS_EN' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '10px' }}>
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Translate into:</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="targetLang"
                    value="en"
                    checked={targetLang === 'en'}
                    onChange={() => setTargetLang('en')}
                  />
                  English
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="targetLang"
                    value="cs"
                    checked={targetLang === 'cs'}
                    onChange={() => setTargetLang('cs')}
                  />
                  Čeština (Czech)
                </label>
              </div>
            )}
          </div>

          {/* Original Input Textarea */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
              Original Content
            </label>
            <textarea
              rows={4}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Enter text to analyze, clarify, or rephrase..."
              className="input"
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '13px',
                lineHeight: 1.5,
                resize: 'vertical',
              }}
            />
          </div>

          {/* Error Banner */}
          {error && (
            <div
              style={{
                padding: '10px 14px',
                backgroundColor: 'rgba(211, 47, 47, 0.08)',
                border: '1px solid rgba(211, 47, 47, 0.3)',
                borderRadius: '4px',
                fontSize: '12px',
                color: 'var(--color-danger)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* Output Suggestion Box */}
          {result && (
            <div
              style={{
                backgroundColor: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: '6px',
                padding: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      fontFamily: 'var(--font-mono, monospace)',
                      color: 'var(--color-accent)',
                      backgroundColor: 'rgba(0, 102, 204, 0.1)',
                      padding: '2px 8px',
                      borderRadius: '3px',
                    }}
                  >
                    DRAFT SUGGESTION
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                    Factual uncertainty preserved • Model: {result.model} ({result.durationMs}ms)
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="btn btn-secondary"
                    style={{ fontSize: '11px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    onClick={handleApply}
                    className="btn btn-primary"
                    style={{ fontSize: '11px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Check size={12} />
                    Apply to Field
                  </button>
                </div>
              </div>

              <div
                style={{
                  fontSize: '13px',
                  lineHeight: 1.6,
                  color: 'var(--color-text-primary)',
                  whiteSpace: 'pre-wrap',
                  backgroundColor: 'var(--color-surface)',
                  padding: '12px 14px',
                  borderRadius: '4px',
                  border: '1px solid var(--color-border)',
                }}
              >
                {result.draft}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="dialog-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <ShieldCheck size={13} style={{ color: 'var(--color-success)' }} />
            Output remains uncommitted until accepted.
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              style={{ fontSize: '12px', padding: '7px 14px' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading || !inputText.trim()}
              className="btn btn-primary"
              style={{
                fontSize: '12px',
                padding: '7px 16px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Analyzing...' : 'Generate Suggestion'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

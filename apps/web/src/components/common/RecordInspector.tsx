'use client';

import React, { useState } from 'react';
import { X, Copy, Check } from 'lucide-react';

export interface InspectorRow {
  label: string;
  value: any;
  copyable?: boolean;
}

export interface RecordInspectorProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  rows?: InspectorRow[];
  actions?: React.ReactNode;
  children?: React.ReactNode;
  width?: string;
}

export function RecordInspector({
  title,
  isOpen,
  onClose,
  rows,
  actions,
  children,
  width = 'var(--inspector-width, 320px)',
}: RecordInspectorProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <>
      {/* Mobile/Tablet Backdrop overlay */}
      <div
        className="inspector-backdrop"
        onClick={onClose}
        style={{
          display: 'none',
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          zIndex: 40,
        }}
      />

      <aside
        className="record-inspector-pane"
        style={{
          width,
          background: 'var(--color-bg-panel)',
          borderLeft: '1px solid var(--color-border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          flexShrink: 0,
          zIndex: 45,
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--color-border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--color-bg-surface)',
          }}
        >
          <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-main)' }}>{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost"
            style={{ padding: '4px', height: 'auto', minWidth: 'auto', color: 'var(--color-text-dim)' }}
            aria-label="Close Inspector"
          >
            <X size={15} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {rows && rows.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
              {rows.map((r, i) => (
                <div
                  key={i}
                  style={{
                    padding: '8px 10px',
                    background: 'var(--color-bg-surface)',
                    border: '1px solid var(--color-border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <div
                    style={{
                      fontSize: '10px',
                      textTransform: 'uppercase',
                      color: 'var(--color-text-dim)',
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      marginBottom: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>{r.label}</span>
                    {r.copyable && typeof r.value === 'string' && (
                      <button
                        type="button"
                        onClick={() => handleCopy(r.label, r.value)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: copiedKey === r.label ? 'var(--color-success)' : 'var(--color-text-dim)',
                          cursor: 'pointer',
                          padding: '0 2px',
                        }}
                        title="Copy to clipboard"
                      >
                        {copiedKey === r.label ? <Check size={11} /> : <Copy size={11} />}
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-main)', wordBreak: 'break-word' }}>
                    {r.value}
                  </div>
                </div>
              ))}
            </div>
          )}

          {actions && (
            <div style={{ borderTop: rows ? '1px solid var(--color-border-subtle)' : 'none', paddingTop: rows ? '14px' : '0' }}>
              {actions}
            </div>
          )}

          {children}
        </div>
      </aside>

      <style jsx global>{`
        @media (max-width: 1024px) {
          .inspector-backdrop {
            display: block !important;
          }
          .record-inspector-pane {
            position: fixed !important;
            right: 0 !important;
            top: var(--topbar-height) !important;
            bottom: 0 !important;
            box-shadow: -10px 0 30px rgba(0, 0, 0, 0.5) !important;
            max-width: 90vw !important;
          }
        }
      `}</style>
    </>
  );
}

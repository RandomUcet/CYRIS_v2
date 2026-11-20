'use client';

import React from 'react';
import { AlertCircle, Inbox, Loader2 } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { workspaceLabel } from '@/lib/workspace-navigation';

export function LoadingState({ message }: { message?: string }) {
  const { t, locale } = usePreferences();
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem 1rem', color: 'var(--text-muted)', gap: '8px' }}>
      <Loader2 size={16} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
      <span style={{ fontSize: '13px' }}>{message ? workspaceLabel(locale, message) : t('state.loading')}</span>
      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  actionLabel,
  onAction,
}: {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { t, locale } = usePreferences();
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2.5rem 1rem',
        color: 'var(--text-muted)',
        textAlign: 'center',
        gap: '4px',
      }}
    >
      {icon ? (
        <div style={{ marginBottom: '6px', opacity: 0.8 }}>{icon}</div>
      ) : (
        <Inbox size={26} strokeWidth={1.5} style={{ marginBottom: '4px', opacity: 0.5 }} />
      )}
      <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>{title ? workspaceLabel(locale, title) : t('state.emptyTitle')}</div>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '380px' }}>{description ? workspaceLabel(locale, description) : t('state.emptyDescription')}</div>
      {action ? (
        <div style={{ marginTop: '10px' }}>{action}</div>
      ) : actionLabel && onAction ? (
        <div style={{ marginTop: '10px' }}>
          <button onClick={onAction} className="btn btn-primary" style={{ fontSize: '12px' }}>
            {actionLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  const { t, locale } = usePreferences();
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2.5rem 1rem',
        color: 'var(--status-danger)',
        background: 'var(--status-danger-bg)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: 'var(--radius-sm)',
        margin: '1rem',
        textAlign: 'center',
        gap: '8px',
      }}
    >
      <AlertCircle size={24} />
      <div style={{ fontWeight: 600, fontSize: '14px' }}>{title || t('state.errorTitle')}</div>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '420px' }}>{message}</div>
      {onRetry && (
        <button type="button" onClick={onRetry} style={{ marginTop: '8px' }}>
          {t('state.retry')}
        </button>
      )}
    </div>
  );
}

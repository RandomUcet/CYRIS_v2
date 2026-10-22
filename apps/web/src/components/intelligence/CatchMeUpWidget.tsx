'use client';

import React, { useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { useEvent } from '@/contexts/EventContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { RefreshCw, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import type { CatchMeUpResponse, CatchMeUpPeriodValue } from '@cyris/contracts';

export function CatchMeUpWidget() {
  const { selectedEventId } = useEvent();
  const { formatTime } = usePreferences();
  const [period, setPeriod] = useState<CatchMeUpPeriodValue>('LAST_2_HOURS');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [briefing, setBriefing] = useState<CatchMeUpResponse | null>(null);
  const [expanded, setExpanded] = useState(false);

  const fetchBriefing = async (selectedPeriod: CatchMeUpPeriodValue = period) => {
    if (!selectedEventId) return;

    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.catchMeUp(selectedEventId, selectedPeriod);
      if (res.ok && res.data) {
        setBriefing(res.data);
        setExpanded(true);
      } else {
        setError(res.error || 'Failed to generate operational briefing');
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Connection error');
    } finally {
      setLoading(false);
    }
  };

  const lastTimeStr = briefing?.generatedAt ? formatTime(briefing.generatedAt) : null;

  return (
    <div style={{ margin: '4px 0 16px 0' }}>
      {/* Ambient Inline Trigger Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11px',
          color: 'var(--text-muted)',
          padding: '6px 0',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>
            {lastTimeStr ? `Last briefing: ${lastTimeStr}` : 'Ambient operational briefing'}
          </span>
          {briefing && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--accent-active)',
                fontSize: '11px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
                padding: 0,
              }}
            >
              {expanded ? 'Hide summary' : 'Show summary'}
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <select
            value={period}
            onChange={(e) => {
              const val = e.target.value as CatchMeUpPeriodValue;
              setPeriod(val);
              void fetchBriefing(val);
            }}
            style={{
              padding: '2px 6px',
              fontSize: '11px',
              height: '24px',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-secondary)',
            }}
          >
            <option value="LAST_2_HOURS">Last 2 Hours</option>
            <option value="TODAY">Today</option>
            <option value="LAST_LOGIN">Since Last Login</option>
          </select>

          <button
            type="button"
            onClick={() => void fetchBriefing()}
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              fontSize: '11px',
              height: '24px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Briefing…' : 'Catch me up'}
          </button>
        </div>
      </div>

      {/* Error Notice */}
      {error && (
        <div
          style={{
            marginTop: '8px',
            padding: '6px 10px',
            borderRadius: 'var(--radius-xs)',
            backgroundColor: 'var(--status-danger-bg)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            fontSize: '11px',
            color: 'var(--status-danger)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <AlertTriangle size={12} />
          <span>{error}</span>
        </div>
      )}

      {/* Ambient Briefing Content */}
      {briefing && expanded && (
        <div
          style={{
            padding: '12px 16px',
            marginTop: '8px',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-xs)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {briefing.briefing}
          </div>

          {briefing.items && briefing.items.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--text-muted)',
                  marginBottom: '6px',
                }}
              >
                Operational Highlights ({briefing.items.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {briefing.items.map((item, idx) => (
                  <div key={idx} style={{ fontSize: '11px', display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', fontSize: '10px' }}>
                      {item.category}
                    </span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.title}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>— {item.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

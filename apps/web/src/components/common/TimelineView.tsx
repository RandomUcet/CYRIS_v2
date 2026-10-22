'use client';

import React, { useState } from 'react';
import { ChevronRight, ChevronDown, HelpCircle } from 'lucide-react';
import type { ActivityEventItem } from '@cyris/contracts';
import { EmptyState } from './StateViews';
import { usePreferences } from '@/contexts/PreferencesContext';

interface TimelineViewProps {
  items: ActivityEventItem[];
  emptyTitle?: string;
  emptyDescription?: string;
  onExplainActivity?: (item: ActivityEventItem) => void;
}

export function TimelineView({
  items,
  emptyTitle = 'No timeline events recorded',
  emptyDescription = 'No operational activities have been logged for this scope yet.',
  onExplainActivity,
}: TimelineViewProps) {
  const { locale, timezone } = usePreferences();
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (!items || items.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="timeline-container" style={{ padding: '16px 20px', position: 'relative' }}>
      <div className="timeline-spine" />

      {items.map((item) => {
        const isExpanded = Boolean(expandedIds[item.id]);
        const dateObj = new Date(item.occurredAt);
        let timeStr = '—';
        let dateStr = '—';
        try {
          timeStr = new Intl.DateTimeFormat(locale, { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(dateObj);
          dateStr = new Intl.DateTimeFormat(locale, { timeZone: timezone, month: 'short', day: 'numeric' }).format(dateObj);
        } catch {
          timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          dateStr = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }

        let nodeClass = '';
        if (item.activityType.includes('danger') || item.activityType.includes('rejected')) nodeClass = 'danger';
        else if (item.activityType.includes('transferred') || item.activityType.includes('status')) nodeClass = 'warning';
        else if (item.activityType.includes('completed') || item.activityType.includes('approved')) nodeClass = 'success';
        else if (item.visibility === 'RESTRICTED') nodeClass = 'restricted';

        return (
          <div key={item.id} className="timeline-entry">
            <div className="timeline-timestamp" title={dateObj.toISOString()}>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{timeStr}</div>
              <div style={{ fontSize: '10px' }}>{dateStr}</div>
            </div>

            <div className={`timeline-node ${nodeClass}`} />

            <div className="timeline-content">
              <div
                className="timeline-header"
                onClick={() => toggleExpand(item.id)}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                    {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </span>
                  <span className="timeline-title">{item.title}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="timeline-type">{item.activityType}</span>
                  {item.visibility !== 'EVENT' && (
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: 600,
                        padding: '1px 4px',
                        borderRadius: '2px',
                        background: 'var(--status-restricted-bg)',
                        color: 'var(--status-restricted)',
                      }}
                    >
                      {item.visibility}
                    </span>
                  )}
                </div>
              </div>

              {item.summary && <div className="timeline-body">{item.summary}</div>}

              {item.reason && !isExpanded && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Reason: {item.reason}
                </div>
              )}

              {isExpanded && (
                <div className="timeline-details">
                  {item.reason && (
                    <div>
                      <strong style={{ color: 'var(--text-secondary)' }}>Reason:</strong> {item.reason}
                    </div>
                  )}

                  {item.actorUserId && (
                    <div>
                      <strong style={{ color: 'var(--text-secondary)' }}>Actor ID:</strong> <code>{item.actorUserId}</code>
                    </div>
                  )}

                  {item.causationId && (
                    <div>
                      <strong style={{ color: 'var(--text-secondary)' }}>Triggered / Caused by:</strong>{' '}
                      <code>{item.causationId}</code>
                    </div>
                  )}

                  {item.relatedResourceIds && item.relatedResourceIds.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                      <strong style={{ color: 'var(--text-secondary)' }}>Related Resources:</strong>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {item.relatedResourceIds.map((rid) => (
                          <code key={rid}>{rid.slice(0, 8)}…</code>
                        ))}
                      </div>
                    </div>
                  )}

                  {item.source && (
                    <div>
                      <strong style={{ color: 'var(--text-secondary)' }}>Source:</strong> {item.source}
                    </div>
                  )}

                  {onExplainActivity && (
                    <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onExplainActivity(item);
                        }}
                        className="btn btn-secondary"
                        style={{ fontSize: '11px', padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        <HelpCircle size={11} style={{ color: 'var(--accent-active)' }} />
                        Explain Causation
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

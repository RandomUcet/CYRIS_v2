'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import { usePreferences } from '@/contexts/PreferencesContext';

interface TimelinePanelProps {
  eventId: string;
}

export function TimelinePanel({ eventId }: TimelinePanelProps) {
  const { formatTime } = usePreferences();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('');

  const loadTimeline = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getEventTimeline(eventId, typeFilter || undefined);
      if (res.ok && res.data?.items) {
        setItems(res.data.items);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTimeline();
  }, [eventId, typeFilter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4>Event Operational Timeline ({items.length} events)</h4>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <label style={{ fontSize: '0.85rem' }}>Filter by Type:</label>
          <input
            placeholder="e.g. evidence.transferred"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ width: '200px' }}
          />
          <button type="button" onClick={() => void loadTimeline()}>Refresh</button>
        </div>
      </div>

      {loading ? <p>Loading timeline...</p> : items.length === 0 ? <p>No activity events found.</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                padding: '0.75rem 1rem',
                borderLeft: '4px solid #3b82f6',
                background: 'var(--card-bg)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#6b7280' }}>
                <span>{formatTime(item.occurredAt)}</span>
                <span>Type: <code>{item.activityType}</code> · Scope: {item.visibility}</span>
              </div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', marginTop: '0.25rem' }}>{item.title}</div>
              {item.summary && <div style={{ fontSize: '0.85rem', color: '#4b5563', marginTop: '0.25rem' }}>{item.summary}</div>}
              {item.reason && <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.2rem' }}>Reason: {item.reason}</div>}
              {item.causationId && <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.15rem' }}>Causation ID: <code>{item.causationId}</code></div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { usePreferences } from '@/contexts/PreferencesContext';
import type {
  ParticipantBriefingsListResponse,
  ParticipantBriefing,
} from '@cyris/contracts';

export default function BriefingsPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [briefingsData, setBriefingsData] = useState<ParticipantBriefingsListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const loadBriefings = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    const res = await apiClient.getParticipantBriefings(eventId);
    if (res.ok && res.data) {
      setBriefingsData(res.data);
    } else {
      setError(res.error || 'Failed to load operational briefings');
    }
    if (!quiet) setLoading(false);
  }, [eventId]);

  useEffect(() => {
    loadBriefings();
    const interval = setInterval(() => {
      loadBriefings(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [eventId]);

  const handleMarkRead = async (deliveryId: string) => {
    setActionLoadingId(deliveryId);
    const res = await apiClient.markBriefingRead(eventId, deliveryId);
    if (res.ok) {
      await loadBriefings(true);
    }
    setActionLoadingId(null);
  };

  const handleAcknowledge = async (deliveryId: string) => {
    setActionLoadingId(deliveryId);
    const res = await apiClient.acknowledgeBriefing(eventId, deliveryId);
    if (res.ok) {
      await loadBriefings(true);
    }
    setActionLoadingId(null);
  };

  if (loading && !briefingsData) {
    return (
      <div style={{ padding: '32px 40px', color: 'var(--text-muted)' }}>
        Loading operational briefings...
      </div>
    );
  }

  if (error && !briefingsData) {
    return (
      <div style={{ padding: '32px 40px', color: 'var(--accent-danger)' }}>
        Error: {error}
      </div>
    );
  }

  const newBriefings = briefingsData?.newBriefings ?? [];
  const earlierBriefings = briefingsData?.earlierBriefings ?? [];

  return (
    <div
      style={{
        padding: '28px 40px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        maxWidth: '900px',
      }}
    >
      {/* WORKSPACE HEADER */}
      <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <span className="cyris-signal-marker" />
          <h1 style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)', margin: 0 }}>
            Operational Briefings
          </h1>
          {briefingsData && briefingsData.unreadCount > 0 && (
            <span
              style={{
                fontSize: '11px',
                fontFamily: 'monospace',
                fontWeight: 700,
                padding: '2px 6px',
                backgroundColor: 'rgba(225, 92, 25, 0.2)',
                color: 'var(--cyris-orange)',
                border: '1px solid rgba(225, 92, 25, 0.4)',
                borderRadius: '3px',
              }}
            >
              {briefingsData.unreadCount} NEW
            </span>
          )}
        </div>
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
          Official incident communications, intelligence advisories, and situation updates delivered to your operational unit.
        </p>
      </div>

      {newBriefings.length === 0 && earlierBriefings.length === 0 && (
        <div style={{ padding: '32px 0', color: 'var(--text-dim)', fontStyle: 'italic', fontSize: '13px' }}>
          No operational briefings have been released to your unit yet.
        </div>
      )}

      {/* NEW BRIEFINGS */}
      {newBriefings.length > 0 && (
        <div>
          <div className="cyris-section-header" style={{ marginBottom: '12px' }}>
            <span className="cyris-signal-marker" />
            <span>NEW / UNREAD BRIEFINGS</span>
            <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--cyris-orange)' }}>
              ({newBriefings.length})
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {newBriefings.map((b) => (
              <BriefingItemCard
                key={b.deliveryId}
                briefing={b}
                eventId={eventId}
                isNew
                actionLoading={actionLoadingId === b.deliveryId}
                onMarkRead={() => handleMarkRead(b.deliveryId)}
                onAcknowledge={() => handleAcknowledge(b.deliveryId)}
              />
            ))}
          </div>
        </div>
      )}

      {/* EARLIER BRIEFINGS */}
      {earlierBriefings.length > 0 && (
        <div>
          <div className="cyris-section-header" style={{ marginBottom: '12px' }}>
            <span className="cyris-signal-marker" />
            <span>EARLIER DELIVERIES</span>
            <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text-dim)' }}>
              ({earlierBriefings.length})
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {earlierBriefings.map((b) => (
              <BriefingItemCard
                key={b.deliveryId}
                briefing={b}
                eventId={eventId}
                isNew={false}
                actionLoading={actionLoadingId === b.deliveryId}
                onMarkRead={() => handleMarkRead(b.deliveryId)}
                onAcknowledge={() => handleAcknowledge(b.deliveryId)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BriefingItemCard({
  briefing,
  eventId,
  isNew,
  actionLoading,
  onMarkRead,
  onAcknowledge,
}: {
  briefing: ParticipantBriefing;
  eventId: string;
  isNew: boolean;
  actionLoading: boolean;
  onMarkRead: () => void;
  onAcknowledge: () => void;
}) {
  const { formatTime } = usePreferences();
  const timeStr = formatTime(briefing.deliveredAt);

  return (
    <div
      style={{
        padding: '16px 20px',
        backgroundColor: isNew ? 'var(--bg-card)' : 'transparent',
        border: isNew ? '1px solid var(--border-subtle)' : '1px solid var(--border-subtle)',
        borderLeft: isNew ? '3px solid var(--cyris-orange)' : '3px solid transparent',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      {/* HEADER ROW */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '11px', fontFamily: 'monospace', color: isNew ? 'var(--cyris-orange)' : 'var(--text-dim)' }}>
            {timeStr}
          </span>
          <span className="record-identifier">{briefing.injectNumber}</span>
          {isNew && (
            <span
              style={{
                fontSize: '9px',
                fontFamily: 'monospace',
                fontWeight: 700,
                color: 'var(--cyris-orange)',
                backgroundColor: 'rgba(225, 92, 25, 0.15)',
                padding: '1px 5px',
                borderRadius: '2px',
              }}
            >
              NEW
            </span>
          )}
          {briefing.requiresAcknowledgement && (
            <span
              style={{
                fontSize: '9px',
                fontFamily: 'monospace',
                fontWeight: 700,
                color: briefing.acknowledgedAt ? 'var(--accent-success)' : 'var(--accent-warning)',
                backgroundColor: briefing.acknowledgedAt ? 'rgba(34, 197, 94, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                padding: '1px 5px',
                borderRadius: '2px',
                border: briefing.acknowledgedAt ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
              }}
            >
              {briefing.acknowledgedAt ? 'ACKNOWLEDGED' : 'ACKNOWLEDGEMENT REQUIRED'}
            </span>
          )}
        </div>

        {/* ACTIONS */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {briefing.requiresAcknowledgement && !briefing.acknowledgedAt && (
            <button
              disabled={actionLoading}
              onClick={onAcknowledge}
              style={{
                padding: '4px 10px',
                backgroundColor: 'var(--cyris-orange)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '2px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {actionLoading ? 'Acknowledging...' : 'Acknowledge Receipt'}
            </button>
          )}

          {isNew && (
            <button
              disabled={actionLoading}
              onClick={onMarkRead}
              style={{
                padding: '4px 10px',
                backgroundColor: 'transparent',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                borderRadius: '2px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              Mark Read
            </button>
          )}
        </div>
      </div>

      {/* BRIEFING TITLE */}
      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
        {briefing.title}
      </div>

      {/* BRIEFING CONTENT */}
      {briefing.content && (
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
          {briefing.content}
        </div>
      )}

      {/* DISCLOSED RESOURCES LINKS */}
      {briefing.disclosedResources.length > 0 && (
        <div style={{ marginTop: '6px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text-dim)', marginBottom: '4px' }}>
            ACCESSIBLE EVIDENCE & RESOURCES DISCLOSED:
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {briefing.disclosedResources.map((res) => (
              <a
                key={res.resourceId}
                href={`/events/${eventId}/${res.resourceType === 'evidence' ? 'evidence' : res.resourceType === 'case' ? 'cases' : 'registry'}/${res.resourceId}`}
                style={{
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  color: 'var(--accent-active)',
                  textDecoration: 'none',
                  padding: '2px 6px',
                  backgroundColor: 'var(--bg-active)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                ↗ {res.identifier ?? `${res.resourceType} (${res.resourceId.substring(0, 8)})`}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { RecordIdentifier } from '@/components/common/Badges';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import { usePreferences } from '@/contexts/PreferencesContext';
import { RefreshCw, ExternalLink } from 'lucide-react';
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

  const newBriefings = briefingsData?.newBriefings ?? [];
  const earlierBriefings = briefingsData?.earlierBriefings ?? [];

  return (
    <AppShell
      breadcrumbs={[
        { label: 'Operations', href: `/events/${eventId}/overview` },
        { label: 'Briefings' },
      ]}
      title="Operational Briefings"
      actions={
        <button
          onClick={() => void loadBriefings()}
          className="btn btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
        >
          <RefreshCw size={13} className={loading ? 'spin' : ''} />
          Refresh
        </button>
      }
    >
      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1000px' }}>
        {loading && !briefingsData ? (
          <LoadingState message="Loading operational briefings..." />
        ) : error && !briefingsData ? (
          <ErrorState message={error} onRetry={() => void loadBriefings()} />
        ) : newBriefings.length === 0 && earlierBriefings.length === 0 ? (
          <EmptyState
            title="No operational briefings"
            description="No briefings or tactical advisories have been delivered to your operational unit yet."
          />
        ) : (
          <>
            {/* NEW BRIEFINGS */}
            {newBriefings.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-accent-ops)' }} />
                  <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-text-main)' }}>
                    New / Unread Briefings ({newBriefings.length})
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
                      onMarkRead={() => void handleMarkRead(b.deliveryId)}
                      onAcknowledge={() => void handleAcknowledge(b.deliveryId)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* EARLIER BRIEFINGS */}
            {earlierBriefings.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', marginTop: newBriefings.length > 0 ? '12px' : '0' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-border-subtle)' }} />
                  <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-text-dim)' }}>
                    Earlier Deliveries ({earlierBriefings.length})
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {earlierBriefings.map((b) => (
                    <BriefingItemCard
                      key={b.deliveryId}
                      briefing={b}
                      eventId={eventId}
                      isNew={false}
                      actionLoading={actionLoadingId === b.deliveryId}
                      onMarkRead={() => void handleMarkRead(b.deliveryId)}
                      onAcknowledge={() => void handleAcknowledge(b.deliveryId)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
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
        backgroundColor: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-subtle)',
        borderLeft: isNew ? '3px solid var(--color-accent-ops)' : '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: isNew ? 'var(--color-accent-ops)' : 'var(--color-text-dim)' }}>
            {timeStr}
          </span>
          <RecordIdentifier id={briefing.injectNumber} prefix="" />
          {isNew && (
            <span
              style={{
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                color: 'var(--color-accent-ops)',
                backgroundColor: 'rgba(2, 132, 199, 0.15)',
                padding: '1px 6px',
                borderRadius: '3px',
              }}
            >
              NEW
            </span>
          )}
          {briefing.requiresAcknowledgement && (
            <span
              style={{
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                color: briefing.acknowledgedAt ? 'var(--color-status-success)' : 'var(--color-accent-ops)',
                backgroundColor: briefing.acknowledgedAt ? 'rgba(34, 197, 94, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                padding: '1px 6px',
                borderRadius: '3px',
                border: briefing.acknowledgedAt ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
              }}
            >
              {briefing.acknowledgedAt ? 'ACKNOWLEDGED' : 'ACKNOWLEDGEMENT REQUIRED'}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {briefing.requiresAcknowledgement && !briefing.acknowledgedAt && (
            <button
              disabled={actionLoading}
              onClick={onAcknowledge}
              className="btn btn-primary"
              style={{ padding: '4px 10px', fontSize: '11px' }}
            >
              {actionLoading ? 'Acknowledging...' : 'Acknowledge Receipt'}
            </button>
          )}

          {isNew && (
            <button
              disabled={actionLoading}
              onClick={onMarkRead}
              className="btn btn-secondary"
              style={{ padding: '4px 10px', fontSize: '11px' }}
            >
              Mark Read
            </button>
          )}
        </div>
      </div>

      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-main)' }}>
        {briefing.title}
      </div>

      {briefing.content && (
        <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
          {briefing.content}
        </div>
      )}

      {briefing.disclosedResources && briefing.disclosedResources.length > 0 && (
        <div style={{ marginTop: '4px', paddingTop: '8px', borderTop: '1px solid var(--color-border-subtle)' }}>
          <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-dim)', marginBottom: '4px' }}>
            ACCESSIBLE EVIDENCE & RESOURCES DISCLOSED:
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {briefing.disclosedResources.map((res) => (
              <Link
                key={res.resourceId}
                href={`/events/${eventId}/${res.resourceType === 'evidence' ? 'evidence' : res.resourceType === 'case' ? 'cases' : 'registry'}/${res.resourceId}`}
                style={{
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-accent-ops)',
                  textDecoration: 'none',
                  padding: '2px 6px',
                  backgroundColor: 'var(--color-bg-panel)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: '3px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <ExternalLink size={11} /> {res.identifier ?? `${res.resourceType} (${res.resourceId.substring(0, 8)})`}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

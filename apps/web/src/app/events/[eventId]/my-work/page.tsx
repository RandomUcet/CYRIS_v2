'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { StatusBadge } from '@/components/common/Badges';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import type { MyWorkResponse, MyWorkView } from '@cyris/contracts';

export default function MyWorkPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const { user, hasPermission, isPlatformAdmin } = useAuth();
  const { formatDate } = usePreferences();
  const [view, setView] = useState<MyWorkView>('personal');
  const [unitId, setUnitId] = useState('');
  const [units, setUnits] = useState<Array<{ id: string; name: string }>>([]);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<MyWorkResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const requestSequence = useRef(0);
  const canViewUnit = hasPermission('task.read', eventId) || hasPermission('lab.read', eventId);
  const canViewEvent = isPlatformAdmin || hasPermission('task.read', eventId) || hasPermission('lab.read', eventId);

  useEffect(() => {
    if (!eventId) return;
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError(null);
    if (view === 'unit' && !unitId) {
      setLoading(false);
      setResult(null);
      return;
    }
    apiClient.listMyWork(eventId, {
      view,
      unitId: view === 'unit' ? unitId || undefined : undefined,
      page,
      limit: 50,
    }).then((response) => {
      if (sequence !== requestSequence.current) return;
      if (response.ok && response.data) setResult(response.data);
      else setError(response.error || 'Unable to load My Work');
    }).catch((cause) => {
      if (sequence !== requestSequence.current) return;
      setError(cause instanceof Error ? cause.message : 'Unable to load My Work');
    }).finally(() => setLoading(false));
  }, [eventId, page, refreshNonce, unitId, view]);

  useEffect(() => {
    if (!eventId || !canViewUnit) return;
    let active = true;
    apiClient.getUnits(eventId).then((response) => {
      if (active && response.ok && response.data) {
        const membershipUnitIds = new Set(
          user?.memberships
            .filter((membership) => membership.status === 'ACTIVE' && membership.eventId === eventId)
            .flatMap((membership) => membership.unitIds) ?? []
        );
        setUnits(response.data.map((unit: { id: string; name: string }) => ({
          id: unit.id,
          name: unit.name,
        })).filter((unit) => isPlatformAdmin || membershipUnitIds.has(unit.id)));
      }
    });
    return () => {
      active = false;
    };
  }, [eventId, canViewUnit, isPlatformAdmin, user]);

  const selectView = (next: MyWorkView) => {
    setView(next);
    setPage(1);
  };

  return (
    <AppShell breadcrumbs={[{ label: 'Operations' }, { label: 'My Work' }]}>
      <div style={{ padding: '20px 24px' }}>
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>My Work</h1>
          <p style={{ color: 'var(--color-text-muted)', margin: '6px 0 0' }}>
            Read-only view of authorized operational tasks and laboratory analyses.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {(['personal', ...(canViewUnit ? ['unit'] : []), ...(canViewEvent ? ['event'] : [])] as MyWorkView[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => selectView(option)}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid var(--color-border-subtle)',
                background: view === option ? 'var(--color-surface-raised)' : 'transparent',
                color: 'var(--color-text-main)',
              }}
            >
              {option === 'personal' ? 'My work' : option === 'unit' ? 'Unit queue' : 'Event overview'}
            </button>
          ))}
          {view === 'unit' && (
            <select
              value={unitId}
              onChange={(event) => {
                setUnitId(event.target.value);
                setPage(1);
              }}
              aria-label="Select unit"
            >
              <option value="">Select unit</option>
              {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select>
          )}
        </div>
        {loading && <LoadingState />}
        {!loading && error && <ErrorState message={error} onRetry={() => setRefreshNonce((value) => value + 1)} />}
        {!loading && !error && result && result.items.length === 0 && <EmptyState title="No authorized work" />}
        {!loading && !error && result && result.items.length > 0 && (
          <>
            <div style={{ display: 'grid', gap: 8 }}>
              {result.items.map((item) => (
                <button
                  key={`${item.kind}-${item.id}`}
                  type="button"
                  onClick={() => router.push(item.href)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '120px 1fr 140px 160px',
                    gap: 12,
                    alignItems: 'center',
                    textAlign: 'left',
                    padding: 12,
                    border: '1px solid var(--color-border-subtle)',
                    borderRadius: 6,
                    background: 'var(--color-surface)',
                    color: 'var(--color-text-main)',
                  }}
                >
                  <span>{item.identifier}</span>
                  <span>{item.title}<small style={{ display: 'block', color: 'var(--color-text-muted)' }}>{item.kind}</small></span>
                  <StatusBadge status={item.status} />
                  <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>{formatDate(item.updatedAt)}</span>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button>
              <span style={{ padding: '6px 0' }}>Page {result.page}</span>
              <button type="button" disabled={page * result.limit >= result.total} onClick={() => setPage((current) => current + 1)}>Next</button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

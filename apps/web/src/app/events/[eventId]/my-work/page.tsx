'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { StatusBadge } from '@/components/common/Badges';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import type { MyWorkResponse, MyWorkView, ServiceStatusResponse, ServiceStatusState } from '@cyris/contracts';

export default function MyWorkPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const { user, hasPermission, isPlatformAdmin } = useAuth();
  const { formatDate, t } = usePreferences();
  const [view, setView] = useState<MyWorkView>('personal');
  const [unitId, setUnitId] = useState('');
  const [units, setUnits] = useState<Array<{ id: string; name: string }>>([]);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<MyWorkResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [serviceStatus, setServiceStatus] = useState<ServiceStatusResponse | null>(null);
  const [serviceStatusError, setServiceStatusError] = useState<string | null>(null);

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
    }).finally(() => {
      if (sequence === requestSequence.current) setLoading(false);
    });
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

  useEffect(() => {
    if (!eventId) return;
    let active = true;
    setServiceStatusError(null);
    apiClient.getServiceStatus(eventId).then((response) => {
      if (!active) return;
      if (response.ok && response.data) setServiceStatus(response.data);
      else setServiceStatusError(response.error || 'Unable to load service status');
    }).catch((cause) => {
      if (active) setServiceStatusError(cause instanceof Error ? cause.message : 'Unable to load service status');
    });
    return () => {
      active = false;
    };
  }, [eventId, refreshNonce]);

  const serviceStateLabel = (state: ServiceStatusState) => t(`serviceStatus.state.${state.toLowerCase()}`);
  const serviceImpactLabel = (impact: string) => t(`serviceStatus.impact.${impact.toLowerCase()}`);

  const selectView = (next: MyWorkView) => {
    setView(next);
    setPage(1);
  };

  return (
    <AppShell breadcrumbs={[{ label: 'Operations' }, { label: 'My Work' }]}>
      <div className="my-work-page">
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>My Work</h1>
          <p className="my-work-subtitle">
            {t('myWork.subtitle')}
          </p>
        </div>
        <div className="my-work-toolbar">
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
        <section className="service-status-panel" aria-labelledby="service-status-title">
          <div className="service-status-heading">
            <div>
              <h2 id="service-status-title">{t('serviceStatus.title')}</h2>
              <p>{t('serviceStatus.subtitle')}</p>
            </div>
            {serviceStatus && <time dateTime={serviceStatus.generatedAt}>{formatDate(serviceStatus.generatedAt)}</time>}
          </div>
          {serviceStatusError && <p className="service-status-error">{serviceStatusError}</p>}
          {!serviceStatus && !serviceStatusError && <p className="service-status-muted">{t('serviceStatus.loading')}</p>}
          {serviceStatus && (
            <div className="service-status-list">
              {serviceStatus.items.map((item, index) => (
                <div className="service-status-item" key={`${item.service}-${item.revision ?? 'baseline'}-${index}`}>
                  <div>
                    <strong>{item.service}</strong>
                    {item.reason && <small>{item.reason}</small>}
                  </div>
                  <span className={`service-status-badge service-status-${item.state.toLowerCase()}`}>
                    {serviceStateLabel(item.state)}
                  </span>
                  <span className="service-status-impact">{serviceImpactLabel(item.impact)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
        {loading && <LoadingState />}
        {!loading && error && <ErrorState message={error} onRetry={() => setRefreshNonce((value) => value + 1)} />}
        {!loading && !error && result && result.items.length === 0 && (
          <EmptyState title={t('myWork.emptyTitle')} description={t('myWork.emptyDescription')} />
        )}
        {!loading && !error && result && result.items.length > 0 && (
          <>
            <div className="my-work-list">
              {result.items.map((item) => (
                <button
                  key={`${item.kind}-${item.id}`}
                  type="button"
                  onClick={() => router.push(item.href)}
                  className="my-work-item"
                >
                  <span>{item.identifier}</span>
                  <span><strong>{item.title}</strong><small>{item.kind} · {t('myWork.nextAction')}</small></span>
                  <StatusBadge status={item.status} />
                  <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>{formatDate(item.updatedAt)}</span>
                </button>
              ))}
            </div>
            <div className="my-work-pagination">
              <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>{t('myWork.previous')}</button>
              <span style={{ padding: '6px 0' }}>{t('myWork.page')} {result.page}</span>
              <button type="button" disabled={page * result.limit >= result.total} onClick={() => setPage((current) => current + 1)}>{t('myWork.next')}</button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

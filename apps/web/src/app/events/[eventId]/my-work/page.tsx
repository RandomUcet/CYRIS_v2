'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { StatusBadge } from '@/components/common/Badges';
import { apiClient } from '@/lib/api-client';
import Link from 'next/link';
import { useServiceStatus } from '@/hooks/useServiceStatus';
import { usePreferences } from '@/contexts/PreferencesContext';
import type { MyWorkResponse, MyWorkView } from '@cyris/contracts';

export default function MyWorkPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const { data: serviceStatus, error: serviceStatusError } = useServiceStatus(eventId);
  const [guideOpen, setGuideOpen] = useState(false);
  const { formatDate, t, locale } = usePreferences();
  const cs = locale === 'cs';
  const [view, setView] = useState<MyWorkView>('personal');
  const [unitId, setUnitId] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<MyWorkResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);


  const requestSequence = useRef(0);
  const availableViews = result?.availableViews ?? ['personal'];
  const units = result?.availableUnits ?? [];
  const needsUnitSelection = view === 'unit' && !unitId;

  useEffect(() => {
    setView('personal'); setUnitId(''); setPage(1); setResult(null);
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError(null);
    if (view === 'unit' && !unitId) {
      setLoading(false);
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


  const selectView = (next: MyWorkView) => {
    setView(next);
    setPage(1);
  };

  return (
    <AppShell breadcrumbs={[{ label: 'Operations' }, { label: 'My Work' }]}>
      <div className="my-work-page">
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>{cs ? 'Moje práce' : 'My Work'}</h1>
          <p className="my-work-subtitle">
            {t('myWork.subtitle')}
          </p>
        </div>
        <details className="work-guide" open={guideOpen} onToggle={e=>setGuideOpen(e.currentTarget.open)}>
          <summary>{cs?'Jak začít pracovat':'How to get started'}</summary>
          <div><p>{cs?'Zde najdete úkoly a požadavky, které jsou vám přiděleny. Otevřete záznam, přečtěte si zadání a pracujte podle jeho dostupných akcí. Než začnete, zkontrolujte brífinky a případná omezení služeb.':'Open your assigned tasks and requests, read their instructions and use the actions available on each record. Check briefings and service restrictions before starting.'}</p>
          <Link href={`/events/${eventId}/support`}>{cs?'Nevíte si rady? Napište EXCONu.':'Need help? Ask EXCON.'}</Link></div>
        </details>
        <div className="my-work-toolbar">
          {(availableViews as MyWorkView[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => selectView(option)}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid var(--color-border-subtle)',
                background: view === option ? 'var(--bg-active)' : 'transparent',
                color: 'var(--color-text-main)',
              }}
            >
              {option === 'personal' ? (cs ? 'Moje práce' : 'My work') : option === 'unit' ? (cs ? 'Práce týmu' : 'Unit queue') : (cs ? 'Přehled cvičení' : 'Event overview')}
            </button>
          ))}
          {view === 'unit' && (
            <select
              value={unitId}
              onChange={(event) => {
                setUnitId(event.target.value);
                setPage(1);
              }}
              aria-label={cs ? 'Vybrat tým' : 'Select unit'}
            >
              <option value="">{cs ? 'Vyber tým' : 'Select unit'}</option>
              {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select>
          )}
        </div>
        <Link className="service-mini" href={`/events/${eventId}/service-status`}>
          <span><strong>{t('serviceStatus.title')}</strong><small>{serviceStatusError?(cs?'Stav není dostupný':'Status unavailable'):serviceStatus?(serviceStatus.current.activeCount?(cs?'Probíhá simulované omezení':'Exercise disruption active'):(cs?'Bez aktivního omezení':'No active disruption')):t('serviceStatus.loading')}</small></span>
          <span className={'service-pill '+(serviceStatusError?'unknown':serviceStatus?.current.activeCount?'restricted':serviceStatus?'normal':'unknown')}>{serviceStatus&&!serviceStatusError?t('serviceStatus.impact.'+serviceStatus.current.impact.toLowerCase()):'—'}</span>
          <span aria-hidden="true">›</span>
        </Link>

        {loading && <LoadingState />}
        {!loading && error && <ErrorState message={error} onRetry={() => setRefreshNonce((value) => value + 1)} />}
        {!loading && !error && needsUnitSelection && <EmptyState title={cs ? 'Vyber tým' : 'Select a team'} description={cs ? 'Zobrazí se úkoly a laboratorní požadavky vybraného týmu.' : 'See the selected team’s tasks and laboratory requests.'} />}
        {!loading && !error && !needsUnitSelection && result && result.items.length === 0 && (
          <EmptyState title={t('myWork.emptyTitle')} description={t('myWork.emptyDescription')} />
        )}
        {!loading && !error && !needsUnitSelection && result && result.items.length > 0 && (
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
                  <span><strong>{item.title}</strong><small>{item.kind === 'LAB_ANALYSIS' ? (cs ? 'Laboratorní požadavek' : 'Laboratory request') : (cs ? 'Úkol' : 'Task')} · {t('myWork.nextAction')}</small></span>
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

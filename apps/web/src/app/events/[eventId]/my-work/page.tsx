'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { StatusBadge } from '@/components/common/Badges';
import { apiClient } from '@/lib/api-client';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useServiceStatus } from '@/hooks/useServiceStatus';
import { useEvent } from '@/contexts/EventContext';
import { workspaceItemLabel } from '@/lib/workspace-navigation';
import { usePreferences } from '@/contexts/PreferencesContext';
import { serviceModuleLabels, type MyWorkResponse, type MyWorkView } from '@cyris/contracts';

export default function MyWorkPage() {
  const { eventId } = useParams<{ eventId: string }>();
  return <WorkQueue key={eventId} eventId={eventId} />;
}

function WorkQueue({ eventId }: { eventId: string }) {
  const { viewAs } = useAuth();
  const { data: serviceStatus, error: serviceStatusError } = useServiceStatus();
  const [guideOpen, setGuideOpen] = useState(false);
  const { formatDate, t, locale } = usePreferences();
  const { workspace } = useEvent();
  const team = workspace?.eventId === eventId ? workspace : null;
  const shortcuts = (team?.sections ?? [])
    .filter(section => ['analysis-section', 'medical-section', 'command-section', 'forensics-section', 'investigation-section', 'prosecution-section', 'evidence-section'].includes(section.id))
    .flatMap(section => section.items.slice(0, 1));
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
    const refresh = () => setRefreshNonce(n => n + 1);
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

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
      if (response.ok && response.data) {
        setResult(response.data);
        const lastPage = Math.max(1, Math.ceil(response.data.total / response.data.limit));
        if (page > lastPage) setPage(lastPage);
      }
      else setError(response.error || 'Unable to load My Work');
    }).catch((cause) => {
      if (sequence !== requestSequence.current) return;
      setError(cause instanceof Error ? cause.message : 'Unable to load My Work');
    }).finally(() => {
      if (sequence === requestSequence.current) setLoading(false);
    });
    return () => { requestSequence.current++; };
  }, [eventId, page, refreshNonce, unitId, view]);


  const selectView = (next: MyWorkView) => {
    if (next === 'unit' && units.length === 1) setUnitId(units[0]!.id);
    setView(next);
    setPage(1);
  };

  return (
    <AppShell breadcrumbs={[{ label: 'Operations' }, { label: 'My Work' }]}>
      <div className="my-work-page">
        <div style={{ marginBottom: 16 }}>
          {team && team.unitNames.length > 0 && <p className="work-team-name">{team.unitNames.join(' · ')}</p>}
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>{cs ? 'Moje práce' : 'My Work'}</h1>
          <p className="my-work-subtitle">
            {t('myWork.subtitle')}
          </p>
        </div>
        {team && team.unitNames.length > 0 && (
          <nav className="work-shortcuts" aria-label={cs ? 'Pracoviště týmu' : 'Team workspaces'}>
            <Link target={viewAs ? undefined : "_blank"} rel="noopener" href={`/events/${eventId}/boards${team.unitIds.length === 1 ? '/' + team.unitIds[0] : ''}`}>
              {cs ? 'Otevřít týmovou obrazovku' : 'Open team display'} ↗</Link>
            {shortcuts.map(item =>
              <Link key={item.href} href={item.href}>{workspaceItemLabel(locale, item)} <span aria-hidden="true">→</span></Link>)}
          </nav>
        )}
        <details className="work-guide" open={guideOpen} onToggle={e=>setGuideOpen(e.currentTarget.open)}>
          <summary>{cs?'Jak začít pracovat':'How to get started'}</summary>
          <div><p>{cs?'Zde najdete úkoly a požadavky, které jsou vám přiděleny. Otevřete záznam, přečtěte si zadání a pracujte podle jeho dostupných akcí. Nové pokyny najdete v části Briefingy.':'Open your assigned tasks and requests, read their instructions and use the actions available on each record. Open Briefings for new instructions.'}</p>
          <Link href={`/events/${eventId}/support`}>{cs?'Potřebujete pomoc? Obraťte se na podporu.':'Need help? Contact support.'}</Link></div>
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
          <button type="button" disabled={loading || needsUnitSelection} onClick={() => setRefreshNonce(n => n + 1)}>{t('action.refresh')}</button>
        </div>
        <Link className="service-mini" href={`/events/${eventId}/service-status`}>
          <span><strong>{t('serviceStatus.title')}</strong><small>{serviceStatusError?(cs?'Stav není dostupný':'Status unavailable'):serviceStatus?(serviceStatus.items.length ? serviceStatus.items.map(item => serviceModuleLabels[item.service][cs ? 'cs' : 'en']).join(' · ') : (cs ? 'Všechny vaše služby jsou dostupné' : 'All your services are available')):t('serviceStatus.loading')}</small></span>
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
                <Link
                  key={`${item.kind}-${item.id}`}
                  href={item.href}
                  className="my-work-item"
                >
                  <span>{item.identifier}</span>
                  <span><strong>{item.title}</strong><small>{item.kind === 'LAB_ANALYSIS' ? (cs ? 'Laboratorní požadavek' : 'Laboratory request') : (cs ? 'Úkol' : 'Task')}</small></span>
                  <StatusBadge status={item.status} />
                  <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>{formatDate(item.updatedAt)}</span>
                </Link>
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

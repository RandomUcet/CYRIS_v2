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
import { serviceModuleLabels, type MyWorkResponse, type MyWorkView, type MyWorkKind } from '@cyris/contracts';

export default function MyWorkPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const {currentUser,viewAs,loading}=useAuth();
  if(loading)return <AppShell><LoadingState/></AppShell>;
  return <WorkQueue key={JSON.stringify([eventId,currentUser?.user.id,viewAs?.id,currentUser?.memberships.find(m=>m.eventId===eventId)?.permissions,currentUser?.platformPermissions])} eventId={eventId} />;
}

function WorkQueue({ eventId }: { eventId: string }) {
  const { viewAs } = useAuth();
  const { data: serviceStatus, error: serviceStatusError } = useServiceStatus();
  const [guideOpen, setGuideOpen] = useState(false);
  const { formatDate, t, locale } = usePreferences();
  const { workspace } = useEvent();
  const team = workspace?.eventId === eventId ? workspace : null;
  const shortcuts = (team?.sections ?? [])
    .filter(section => ['analysis-section', 'medical-section', 'command-section', 'forensics-section', 'investigation-section', 'prosecution-section', 'evidence-section','legal-request-inbox'].includes(section.id))
    .flatMap(section => section.items.slice(0, 1));
  const cs = locale === 'cs';
  const [view, setView] = useState<MyWorkView>('personal');
  const [unitId, setUnitId] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<MyWorkResponse | null>(null);
  const [fetching,setFetching]=useState(true);
  const [kind,setKind]=useState<MyWorkKind|''>('');
  const [resultKey,setResultKey]=useState('');
  const queryKey=JSON.stringify([eventId,view,view==='unit'?unitId:'',page,kind]);
  const displayResult=resultKey===queryKey?result:null;
  const loading=fetching&&!displayResult;
  const refreshing=fetching&&!!displayResult;
  const inFlight=useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);


  const requestSequence = useRef(0);
  const availableViews = result?.availableViews ?? ['personal','requested'];
  const units = result?.availableUnits ?? [];
  const needsUnitSelection = view === 'unit' && !unitId;
  const kindLabels:Record<MyWorkKind,string>=cs?{TASK:'Úkoly',LAB_ANALYSIS:'Laboratoř',FORENSIC_ANALYSIS:'Digitální forenzika',COURT_REQUEST:'Právní žádosti',MEDICAL_ENCOUNTER:'Zdravotnictví'}:{TASK:'Tasks',LAB_ANALYSIS:'Laboratory',FORENSIC_ANALYSIS:'Digital forensics',COURT_REQUEST:'Legal requests',MEDICAL_ENCOUNTER:'Medical'};
  const availableKinds=result?.availableKinds??[];

  useEffect(() => {
    const refresh = () => {if(!inFlight.current)setRefreshNonce(n => n + 1);};
    window.addEventListener('focus', refresh);
    const timer=window.setInterval(()=>{if(!document.hidden)refresh();},20000);
    return () => {window.removeEventListener('focus', refresh);window.clearInterval(timer);};
  }, []);

  useEffect(() => {
    if (!eventId) return;
    const sequence = ++requestSequence.current;
    setFetching(true);
    setError(null);
    if (view === 'unit' && !unitId) {
      inFlight.current=false;setFetching(false);
      return;
    }
    inFlight.current=true;
    apiClient.listMyWork(eventId, {
      view,
      unitId: view === 'unit' ? unitId || undefined : undefined,
      page,
      limit: 50,
      kind:kind||undefined,
    }).then((response) => {
      if (sequence !== requestSequence.current) return;
      if (response.ok && response.data) {
        setResult(response.data);setResultKey(queryKey);
        if(kind&&response.data.availableKinds&&!response.data.availableKinds.includes(kind)){setKind('');setPage(1);return;}
        const lastPage = Math.max(1, Math.ceil(response.data.total / response.data.limit));
        if (page > lastPage) setPage(lastPage);
      }
      else {setResult(null);setError(response.error || 'Unable to load My Work');}
    }).catch((cause) => {
      if (sequence !== requestSequence.current) return;
      setResult(null);setError(cause instanceof Error ? cause.message : 'Unable to load My Work');
    }).finally(() => {
      if (sequence === requestSequence.current){inFlight.current=false;setFetching(false);}
    });
    return () => { requestSequence.current++;inFlight.current=false; };
  }, [eventId, page, refreshNonce, unitId, view,kind,queryKey]);


  const selectView = (next: MyWorkView) => {
    if (next === 'unit' && units.length === 1) setUnitId(units[0]!.id);
    setView(next);
    setKind('');setPage(1);
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
          <div><p>{cs?'Zde najdete přidělenou práci i vlastní odeslané žádanky a výsledky. Otevřete záznam a pracujte podle jeho dostupných akcí. Nové pokyny najdete v části Briefingy.':'Find assigned work, outgoing requests and results here. Open the record and use its available actions. Open Briefings for new instructions.'}</p>
          <Link href={`/events/${eventId}/support`}>{cs?'Potřebujete pomoc? Obraťte se na podporu.':'Need help? Contact support.'}</Link></div>
        </details>
        {!!team?.teamGuides?.length&&<details className="work-guide">
          <summary>{cs?'Metodiky a checklisty týmu':'Team guides and checklists'}</summary>
          <div style={{display:'grid',gap:12}}>
            <p style={{fontSize:12,color:'var(--color-text-dim)'}}>{cs?'Výchozí cvičební pomůcky k odbornému posouzení instruktorem. Nejde o schválené odborné postupy ani záznam splnění.':'Exercise starter prompts for instructor review. Not approved professional procedures or completion records.'}</p>
            {team.teamGuides.map(guide=><section key={guide.unitId}>
              <h3 style={{fontSize:14,marginBottom:6}}>{guide.unitName} <small>{guide.version}</small></h3>
              <ol style={{paddingLeft:20,display:'grid',gap:6}}>{guide.items.map((item,index)=><li key={index}>{cs?item.cs:item.en}</li>)}</ol>
            </section>)}
          </div>
        </details>}
        <div className="my-work-toolbar">
          {(availableViews as MyWorkView[]).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={view===option}
              onClick={() => selectView(option)}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid var(--color-border-subtle)',
                background: view === option ? 'var(--bg-active)' : 'transparent',
                color: 'var(--color-text-main)',
              }}
            >
              {option==='approval'?(cs?'Ke schválení':'Awaiting approval'):option==='requested'?(cs?'Moje žádanky a výsledky':'My requests and results'):option === 'personal' ? (cs ? 'Moje práce' : 'My work') : option === 'unit' ? (cs ? 'Práce týmu' : 'Unit queue') : (cs ? 'Přehled cvičení' : 'Event overview')}
            </button>
          ))}
          {view === 'unit' && (
            <select
              value={unitId}
              onChange={(event) => {
                setUnitId(event.target.value);
                setKind('');setPage(1);
              }}
              aria-label={cs ? 'Vybrat tým' : 'Select unit'}
            >
              <option value="">{cs ? 'Vyber tým' : 'Select unit'}</option>
              {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select>
          )}
          {(availableKinds.length>1||kind)&&!needsUnitSelection&&<select value={kind} aria-label={cs?'Filtrovat agendu':'Filter work type'} onChange={e=>{setKind(e.target.value as MyWorkKind|'');setPage(1);}}>
            <option value="">{cs?'Všechny agendy':'All work types'}</option>
            {availableKinds.map(value=><option key={value} value={value}>{kindLabels[value]}</option>)}
          </select>}
          <button type="button" disabled={fetching || needsUnitSelection} onClick={() => setRefreshNonce(n => n + 1)}>{refreshing?(cs?'Obnovuji…':'Refreshing…'):t('action.refresh')}</button>
        </div>
        <Link className="service-mini" href={`/events/${eventId}/service-status`}>
          <span><strong>{t('serviceStatus.title')}</strong><small>{serviceStatusError?(cs?'Stav není dostupný':'Status unavailable'):serviceStatus?(serviceStatus.items.length ? serviceStatus.items.map(item => serviceModuleLabels[item.service][cs ? 'cs' : 'en']).join(' · ') : (cs ? 'Všechny vaše služby jsou dostupné' : 'All your services are available')):t('serviceStatus.loading')}</small></span>
          <span className={'service-pill '+(serviceStatusError?'unknown':serviceStatus?.current.activeCount?'restricted':serviceStatus?'normal':'unknown')}>{serviceStatus&&!serviceStatusError?t('serviceStatus.impact.'+serviceStatus.current.impact.toLowerCase()):'—'}</span>
          <span aria-hidden="true">›</span>
        </Link>

        {loading && <LoadingState />}
        {displayResult&&!loading&&!error&&!needsUnitSelection&&<p style={{fontSize:12,color:'var(--color-text-muted)'}} aria-live="polite">{cs?'Záznamy:':'Records:'} {displayResult.total}</p>}
        {!loading && error && <ErrorState message={error} onRetry={() => setRefreshNonce((value) => value + 1)} />}
        {!loading && !error && needsUnitSelection && <EmptyState title={cs ? 'Vyber tým' : 'Select a team'} description={cs ? 'Zobrazí se dostupné úkoly a odborné rozbory vybraného týmu.' : 'See the selected team’s accessible tasks and specialist requests.'} />}
        {!loading && !error && !needsUnitSelection && displayResult && displayResult.items.length === 0 && (
          <EmptyState title={view==='approval'?(cs?'Žádné protokoly ke schválení':'No reports awaiting approval'):t('myWork.emptyTitle')} description={view==='approval'?(cs?'Dokončené protokoly, které smíte schválit, se zobrazí zde.':'Completed reports you can approve will appear here.'):t('myWork.emptyDescription')} />
        )}
        {!loading && !error && !needsUnitSelection && displayResult && displayResult.items.length > 0 && (
          <>
            <div className="my-work-list">
              {displayResult.items.map((item) => (
                <Link
                  key={`${item.kind}-${item.id}`}
                  href={item.href}
                  className="my-work-item"
                >
                  <span>{item.identifier}</span>
                  <span><strong>{item.kind==='MEDICAL_ENCOUNTER'?(item.status==='TRANSFERRED'?(cs?'Pacient čeká na převzetí':'Patient awaiting handover'):(cs?'Zdravotnický případ':'Medical encounter')):item.title}</strong><small>{item.kind === 'LAB_ANALYSIS' ? (cs ? 'Laboratorní požadavek' : 'Laboratory request') : item.kind==='FORENSIC_ANALYSIS'?(cs?'Digitální forenzní analýza':'Digital forensic analysis'):item.kind==='COURT_REQUEST'?(cs?'Právní žádost':'Legal request'):item.kind==='MEDICAL_ENCOUNTER'?(cs?'Zdravotnictví':'Medical'):(cs ? 'Úkol' : 'Task')}{item.assignedUnitName?' · '+item.assignedUnitName:''}{item.reportAvailable?' · '+(cs?'Schválený protokol':'Approved report'):''}</small></span>
                  <StatusBadge status={item.status} />
                  <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>{formatDate(item.updatedAt)}</span>
                </Link>
              ))}
            </div>
            <div className="my-work-pagination">
              <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>{t('myWork.previous')}</button>
              <span style={{ padding: '6px 0' }}>{t('myWork.page')} {displayResult.page}</span>
              <button type="button" disabled={page * displayResult.limit >= displayResult.total} onClick={() => setPage((current) => current + 1)}>{t('myWork.next')}</button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

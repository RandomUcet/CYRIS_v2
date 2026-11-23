'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { AudiencePreviewResponse, ScenarioControlRunSheet, ScenarioInjectResponse, ScenarioPhaseResponse } from '@cyris/contracts';
import { AppShell } from '@/components/layout/AppShell';
import { ErrorState, LoadingState } from '@/components/common/StateViews';
import { useAuth } from '@/contexts/AuthContext';
import { useEvent } from '@/contexts/EventContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useServiceReadOnly } from '@/hooks/useServiceStatus';
import { apiClient } from '@/lib/api-client';
import { InjectDesigner } from './InjectDesigner';
import { ScenarioDialog } from './ScenarioDialog';
import { audience, canReleaseNow, inCzech, inEnglish, term, type Translate } from './run-sheet';
import styles from './scenario.module.css';

type Modal = { kind: 'phase' | 'create' } | { kind: 'inspect' | 'preview' | 'edit' | 'override'; id: string };
type ApiResult = { ok: boolean; error?: string; data?: unknown };

export default function ScenarioControlPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { currentUser, isPlatformAdmin, viewAs } = useAuth();
  return <RunSheet key={[eventId, currentUser?.user.id, isPlatformAdmin, viewAs?.targetUserId].join('/')} eventId={eventId} />;
}

function RunSheet({ eventId }: { eventId: string }) {
  const { locale, timezone, formatTime } = usePreferences();
  const { currentUser, hasPermission, loading, viewAs } = useAuth();
  const { currentEvent } = useEvent();
  const readOnly = useServiceReadOnly('scenario');
  const tr = locale === 'cs' ? inCzech : inEnglish;
  const event = currentEvent?.id === eventId ? currentEvent : null;
  const closed = event?.status === 'CLOSED' || event?.status === 'ARCHIVED';
  const canRead = hasPermission('scenario.read', eventId);
  const writable = !closed && !viewAs && !readOnly;
  const canManage = writable && hasPermission('scenario.manage', eventId);
  const canRelease = writable && hasPermission('scenario.release', eventId);
  const canOverride = writable && hasPermission('scenario.override', eventId);
  const canOpenBriefings = hasPermission('briefing.read', eventId) && currentUser?.memberships.some(m => m.eventId === eventId && m.status === 'ACTIVE');
  const [sheet, setSheet] = useState<ScenarioControlRunSheet | null>(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [clockInput, setClockInput] = useState('');
  const [modal, setModal] = useState<Modal | null>(null);
  const [reason, setReason] = useState('');
  const request = useRef(0);
  const load = useCallback(async () => {
    const version = ++request.current;
    const result = await apiClient.getScenarioControlRunSheet(eventId);
    if (request.current !== version) return;
    if (result.ok && result.data) { setSheet(result.data); setLoadError(''); }
    else { setSheet(null); setModal(null); setLoadError(result.error || tr('Režijní plán se nepodařilo načíst.', 'Could not load the run sheet.')); }
  }, [eventId, tr]);
  useEffect(() => {
    if (!canRead) return;
    let polling = false;
    const refreshVisible = async () => {
      if (polling || document.hidden) return;
      polling = true;
      try { await load(); } finally { polling = false; }
    };
    void refreshVisible();
    const interval = window.setInterval(refreshVisible, 10000);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshVisible);
      request.current++;
    };
  }, [canRead, load]);

  const close = () => { if (!busy) { setModal(null); setActionError(''); } };
  const open = (dialog: Modal) => { setActionError(''); setReason(''); setModal(dialog); };
  const act = async (call: () => Promise<ApiResult>, success: string, dismiss = false) => {
    if (busy) return;
    setBusy(true); setActionError(''); setNotice('');
    try {
      const res = await call();
      if (!res.ok) { setActionError(res.error || tr('Změnu se nepodařilo provést.', 'Could not apply the change.')); return; }
      const count = res.data && typeof res.data === 'object' && 'deliveriesCount' in res.data ? res.data.deliveriesCount : undefined;
      setNotice(success + (typeof count === 'number' ? ' ' + tr('Počet doručení', 'Deliveries') + ' · ' + count : ''));
      if (dismiss) setModal(null);
      await load();
    } finally { setBusy(false); }
  };

  const changePhase = (phase: ScenarioPhaseResponse, status: 'ACTIVE' | 'COMPLETED') => {
    const label = phase.code + ' · ' + phase.title;
    const previous = sheet?.activePhase;
    const question = status === 'COMPLETED' ? tr('Ukončit fázi ', 'Complete phase ') + label + '?'
      : tr('Zahájit fázi ', 'Start phase ') + label + '?' + (previous ? ' ' + tr('Tím se ukončí fáze ', 'This completes phase ') + previous.code + '.' : '');
    if (window.confirm(question)) void act(() => apiClient.updateScenarioPhase(eventId, phase.id, {
      status, forceActive: status === 'ACTIVE' && Boolean(previous),
    }), label + ' · ' + term(status, tr));
  };
  const changeClock = (action: 'PAUSE' | 'RESUME' | 'ADVANCE' | 'SET_TIME') => {
    if (action === 'SET_TIME' && !clockInput) return;
    void act(() => apiClient.updateScenarioClock(eventId, { action,
      minutes: action === 'ADVANCE' ? 5 : undefined, scenarioTime: action === 'SET_TIME' ? new Date(clockInput).toISOString() : undefined,
    }), tr('Scénářové hodiny byly aktualizovány.', 'Scenario clock updated.'));
  };

  const selected = modal && 'id' in modal ? sheet?.injects.find(inject => inject.id === modal.id) : undefined;
  const injects = sheet?.injects ?? [];
  const ready = injects.filter(canReleaseNow);
  const manual = ready.find(i => i.releasePolicy !== 'AUTO_RELEASE' || i.triggerType === 'MANUAL' || i.triggerType === 'EXTERNAL');
  const upcoming = injects.filter(i => i.status === 'SCHEDULED' && !i.isDue);
  const waiting = injects.filter(i => i.status === 'BLOCKED');
  const released = injects.filter(i => i.status === 'RELEASED').sort((a, b) => (b.releasedAt ?? '').localeCompare(a.releasedAt ?? ''));
  const phaseToStart = sheet?.phases.find(p => p.status === 'PLANNED' || p.status === 'DRAFT');
  const groups = [
    { label: tr('Připravené k vydání', 'Ready for release'), rows: ready },
    { label: tr('Čekají na podmínky', 'Waiting on requirements'), rows: waiting },
    { label: tr('Naplánované na později', 'Scheduled for later'), rows: upcoming },
    { label: tr('Koncepty', 'Drafts'), rows: injects.filter(i => i.status === 'DRAFT') },
    { label: tr('Vydané', 'Released'), rows: released },
    { label: tr('Zrušené', 'Cancelled'), rows: injects.filter(i => i.status === 'CANCELLED') },
  ];

  let nextText = tr('Režie připravuje scénářové vstupy pro toto cvičení.', 'Exercise control prepares the injects for this exercise.');
  let nextAction: { label: string; run: () => void } | undefined;
  if (closed) nextText = tr('Cvičení je uzavřené. V režijním plánu si můžete projít průběh a vydané briefingy.', 'This exercise is closed. Review its phases and released briefings in the run sheet.');
  else if (sheet && !sheet.phases.length && !injects.length && canManage) {
    nextText = tr('Založte první fázi a pojmenujte část cvičení, kterou má režie řídit.', 'Create the first phase and name the part of the exercise it covers.');
    nextAction = { label: tr('Vytvořit fázi', 'Create phase'), run: () => open({ kind: 'phase' }) };
  } else if (!injects.length && canManage) {
    nextText = tr('Připravte první vstup. Zadejte zprávu, vyberte příjemce a zvolte způsob vydání.', 'Prepare the first inject. Write the briefing, choose its audience and select how to release it.');
    nextAction = { label: tr('Připravit vstup', 'Prepare inject'), run: () => open({ kind: 'create' }) };
  } else if (canManage && phaseToStart && !sheet?.activePhase) {
    nextText = tr('Pokud tato část cvičení začíná, označte ji jako aktivní.', 'If this part of the exercise is beginning, mark its phase active.');
    nextAction = { label: tr('Zahájit ', 'Start ') + phaseToStart.code + ' · ' + phaseToStart.title, run: () => changePhase(phaseToStart, 'ACTIVE') };
  } else if (manual) {
    nextText = manual.injectNumber + ' · ' + manual.title + '. ' + (canRelease
      ? tr('Zkontrolujte příjemce a znění briefingu. V náhledu potvrďte vydání.', 'Review recipients and briefing text. Confirm release in the preview.')
      : tr('Vstup čeká na potvrzení režie. Můžete si prohlédnout zprávu pro účastníky.', 'This inject is awaiting controller confirmation. You can preview the participant message.'));
    nextAction = { label: tr('Náhled briefingu', 'Preview briefing'), run: () => open({ kind: 'preview', id: manual.id }) };
  } else if (sheet?.clock.paused && (upcoming.length || ready.length) && canManage) {
    nextText = tr('Scénářové hodiny stojí. Až má čas znovu běžet a automatické vydávání pokračovat, spusťte hodiny.', 'The scenario clock is paused. Resume it when scenario time and automatic releases should continue.');
    nextAction = { label: tr('Pokračovat v čase', 'Resume clock'), run: () => changeClock('RESUME') };
  } else if (ready[0] || waiting[0] || upcoming[0]) {
    const item = ready[0] ?? waiting[0] ?? upcoming[0]!;
    nextText = item.injectNumber + ' · ' + item.title + '. ' + (item.status === 'BLOCKED'
      ? tr('V detailu zkontrolujte, které podmínky nebo předchozí vstupy dosud chybí.', 'Open the details to check outstanding conditions or prerequisite injects.')
      : item.status === 'SCHEDULED' ? tr('Plánovaný scénářový čas', 'Scheduled scenario time') + ' · ' + formatTime(item.scheduledAt)
      : tr('Vstup je připraven pro automatické vydání při dalším vyhodnocení.', 'The inject is ready for automatic release at the next eligible evaluation.'));
    nextAction = { label: tr('Otevřít detail', 'View details'), run: () => open({ kind: 'inspect', id: item.id }) };
  } else if (canManage && sheet?.activePhase && released.length) {
    const phase = sheet.activePhase;
    nextText = tr('Projděte vydané vstupy. Pokud je tato část cvičení hotová, ukončete aktivní fázi.', 'Review the released injects. If this part of the exercise is finished, complete its active phase.');
    nextAction = { label: tr('Ukončit ', 'Complete ') + phase.code, run: () => changePhase(phase, 'COMPLETED') };
  } else if (injects.length && canManage) {
    nextText = tr('Připravte další vstup, až budou účastníci potřebovat nové informace.', 'Prepare the next inject when participants need new information.');
    nextAction = { label: tr('Připravit vstup', 'Prepare inject'), run: () => open({ kind: 'create' }) };
  } else if (released[0]) {
    nextText = tr('Poslední vydaný vstup', 'Most recent release') + ' · ' + released[0].injectNumber;
    nextAction = { label: tr('Otevřít detail', 'View details'), run: () => open({ kind: 'inspect', id: released[0]!.id }) };
  }
  const errorMessage = actionError && <p className={styles.error} role="alert">{actionError}</p>;
  const title = tr('Řízení scénáře', 'Scenario Control');
  return <AppShell title={title} breadcrumbs={[{ label: tr('Přehled cvičení','Exercise overview'), href: '/events/' + eventId + '/overview' }, { label: title }]}>
    <div className={styles.sheet}>
      {loading ? <LoadingState /> : !canRead ? <ErrorState message={tr('K režijnímu plánu nemáte přístup.', 'You do not have access to the run sheet.')} /> : loadError ? <ErrorState message={loadError} onRetry={() => void load()} /> : !sheet ? <LoadingState /> : <>
        <div className={styles.heading}>
          <p className={styles.lead}>{tr('Režijní plán cvičení', 'Exercise director’s run sheet')}{event ? ' · ' + event.name : ''}</p>
          <nav className={styles.links} aria-label={tr('Související stránky', 'Related pages')}>
            {canOpenBriefings && <Link href={'/events/' + eventId + '/briefings'}>{tr('Moje briefingy', 'My briefings')}</Link>}
            {hasPermission('scenario.manage', eventId) && <Link href={'/events/' + eventId + '/excon'}>EXCON</Link>}
            {hasPermission('scenario.manage', eventId) && <Link href={'/events/' + eventId + '/scenario-data'}>{tr('Scénářová data', 'Scenario data')}</Link>}
            {hasPermission('registry.read', eventId) && <Link href={'/events/' + eventId + '/registry'}>{tr('Registr', 'Registry')}</Link>}
          </nav>
        </div>
        {notice && <p role="status" className={styles.message}>{notice}</p>}
        {!modal && errorMessage}
        <section className={styles.next}>
          <h2>{tr('Další krok režie', 'Next controller action')}</h2>
          <p className={styles.prose}>{nextText}</p>
          {nextAction && <div className={styles.controls}><button type="button" className="btn btn-primary" disabled={busy} onClick={nextAction.run}>{nextAction.label}</button></div>}
        </section>
        <details className={styles.details}><summary>{tr('Jak vést cvičení', 'How to run the exercise')}</summary>
          <ol><li>{tr('Fází označte část cvičení. Když zahájíte další fázi, dosud aktivní fáze se ukončí.', 'Use phases to mark the parts of the exercise. Starting a phase completes the previous active phase.')}</li>
            <li>{tr('Vstupem připravte zprávu a určete příjemce. Interní záměr a poznámky vidí režie.', 'Prepare the inject, write its briefing and select the recipients. The purpose and notes are for controllers.')}</li>
            <li>{tr('Scénářové hodiny a podmínky určují, kdy je možné vstup vydat. Ruční vydání potvrďte v náhledu. Automatické vydání provede systém.', 'The scenario clock and conditions determine eligibility. Confirm manual release in the preview. The system handles automatic releases.')}</li>
            <li>{tr('Po vydání najde každý oslovený účastník zprávu ve svých Briefinzích. Může označit přečtení a na vyžádání potvrdit přijetí.', 'After release, each addressed participant finds the message in Briefings. They can mark it read and acknowledge receipt when requested.')}</li></ol>
        </details>
        <div className={styles.columns}>
          <section className={styles.panel}><div className={styles.heading}><h2>{tr('Fáze cvičení', 'Exercise phases')}</h2>
            {canManage && <button type="button" className="btn btn-secondary" onClick={() => open({ kind: 'phase' })}>{tr('Nová fáze', 'New phase')}</button>}</div>
            <p className={styles.help}>{sheet.activePhase ? tr('Aktivní fáze', 'Active phase') + ' · ' + sheet.activePhase.title : tr('Žádná fáze právě neprobíhá.', 'There is no active phase.')}</p>
            {sheet.phases.map(p => <div className={styles.phase} key={p.id}><div className={styles.heading}><h3>{p.code} · {p.title}</h3><span className={styles.status}>{term(p.status,tr)}</span></div>
              {p.description && <p className={styles.help}>{p.description}</p>}
              {canManage && ['DRAFT','PLANNED','ACTIVE'].includes(p.status) && <div className={styles.controls}><button type="button" className="btn btn-secondary" disabled={busy}
                onClick={() => changePhase(p, p.status === 'ACTIVE' ? 'COMPLETED' : 'ACTIVE')}>{p.status === 'ACTIVE' ? tr('Ukončit fázi', 'Complete phase') : tr('Zahájit fázi', 'Start phase')}</button></div>}
            </div>)}
          </section>
          <section className={styles.panel}><h2>{tr('Scénářové hodiny', 'Scenario clock')}</h2>
            <div><div className={styles.clock}>{formatTime(sheet.clock.scenarioTime)}</div><div className={styles.data}>{timezone} · {sheet.clock.paused ? tr('Pozastaveno', 'Paused') : tr('Běží', 'Running')} · {sheet.clock.mode === 'REAL_TIME' ? tr('Reálný čas', 'Real time') : tr('Scénářový čas', 'Scenario time')}</div></div>
            <p className={styles.help}>{tr('Plánované vstupy se řídí tímto časem. Pauza zastaví automatické vydávání. Připravený briefing může režie stále vydat ručně.', 'Scheduled injects use this clock. Pausing holds automatic releases. A controller can still release an eligible briefing manually.')}</p>
            {canManage && <><div className={styles.controls}><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => changeClock(sheet.clock.paused ? 'RESUME' : 'PAUSE')}>{sheet.clock.paused ? tr('Pokračovat v čase','Resume clock') : tr('Pozastavit','Pause clock')}</button>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => changeClock('ADVANCE')}>+5 min</button></div>
              <form className={styles.clockControls} onSubmit={e => { e.preventDefault(); changeClock('SET_TIME'); }}>
                <label>{tr('Nový čas', 'New time')} ({Intl.DateTimeFormat().resolvedOptions().timeZone})<input required type="datetime-local" value={clockInput} onChange={e => setClockInput(e.target.value)} /></label>
                <button className="btn btn-secondary" disabled={busy || !clockInput}>{tr('Nastavit a spustit', 'Set and run')}</button>
              </form></>}
          </section>
        </div>
        <section className={styles.list}><div className={styles.heading}><h2>{tr('Scénářové vstupy', 'Scenario injects')} <span className={styles.data}>({injects.length})</span></h2>
          {canManage && <button className="btn btn-secondary" type="button" onClick={() => open({ kind: 'create' })}>{tr('Nový vstup', 'New inject')}</button>}</div>
          {!injects.length && <p className={styles.help}>{tr('Režijní plán tohoto cvičení zatím neobsahuje žádné vstupy.', 'This exercise has no injects yet.')}</p>}
          {groups.filter(g => g.rows.length).map(group => <section key={group.label} className={styles.group}><h3>{group.label} ({group.rows.length})</h3>
            {group.rows.map(i => <article key={i.id} className={styles.entry}><div className={styles.heading}>
              <strong>{i.injectNumber} · {i.title}</strong>
              <div className={styles.controls}><button type="button" className="btn btn-secondary" onClick={() => open({ kind: 'inspect', id: i.id })}>{tr('Detail vstupu','Inject details')}</button>
                {canReleaseNow(i) && <button type="button" className="btn btn-secondary" onClick={() => open({ kind: 'preview', id: i.id })}>{tr('Náhled briefingu','Preview briefing')}</button>}</div></div>
              <p className={styles.subtle}>{[i.phaseName, audience(i,tr), i.releasedAt ? tr('Vydáno','Released') + ' ' + formatTime(i.releasedAt) : i.scheduledAt ? tr('Scénářový čas','Scenario time') + ' ' + formatTime(i.scheduledAt) : term(i.triggerType,tr), i.status === 'RELEASED' ? null : term(i.releasePolicy,tr)].filter(Boolean).join(' · ')}</p>
            </article>)}</section>)}
        </section>
        {modal?.kind === 'phase' && canManage && <PhaseForm tr={tr} busy={busy} error={actionError} onClose={close} onSave={(code, name, description) =>
          void act(() => apiClient.createScenarioPhase(eventId, { code, title: name, description, sequence: Math.max(0, ...sheet.phases.map(p => p.sequence)) + 1, status: 'PLANNED' }), tr('Fáze byla přidána do plánu.', 'Phase added to the run sheet.'), true)} />}
        {(modal?.kind === 'create' || (modal?.kind === 'edit' && selected && !selected.designReadOnly)) && canManage &&
          <InjectDesigner eventId={eventId} tr={tr} sheet={sheet} inject={selected} onClose={close} onSaved={record => {
            setNotice(record.injectNumber + ' · ' + term(record.status,tr)); setModal({ kind: 'inspect', id: record.id }); void load();
          }} />}
        {modal?.kind === 'inspect' && selected && <ScenarioDialog title={selected.injectNumber + ' · ' + selected.title} closeLabel={tr('Zavřít','Close')} onClose={close}>
          <div className={styles.inspection}>
            <div className={styles.data}>{[term(selected.status,tr), selected.phaseName, tr('Priorita','Priority') + ' · ' + term(selected.priority,tr)].filter(Boolean).join(' / ')}</div>
            <section><h3>{tr('Interní záměr režie', 'Controller purpose')}</h3><p className={styles.prose}>{selected.controllerSummary}</p>
              {selected.controllerNotes && <p className={styles.prose}>{selected.controllerNotes}</p>}</section>
            <section><h3>{tr('Příjemci briefingu','Briefing audience')}</h3><p>{audience(selected,tr)}</p></section>
            <section><h3>{tr('Podmínky vydání','Release requirements')}</h3><p className={styles.help}>{term(selected.triggerType,tr)} · {term(selected.releasePolicy,tr)}{selected.scheduledAt && ' · ' + formatTime(selected.scheduledAt)}</p>
              {selected.designReadOnly && <p className={styles.help}>{tr('Nastavení tohoto vstupu je jen pro čtení.', 'This inject’s design is read-only.')}</p>}
              {selected.dependencies.length > 0 && <><p className={styles.help}>{tr('Nejdříve vydat', 'Release first')}</p><ul>{selected.dependencies.map(d => <li key={d.id}>{d.injectNumber} · {d.title} · {term(d.status,tr)}</li>)}</ul></>}
              {selected.conditions.length > 0 && <><p className={styles.help}>{tr('Podmínky', 'Conditions')} · {term(selected.conditionLogic,tr)}</p><ul>{selected.conditions.map(c => <li key={c.id}>
                {[term(c.conditionType,tr), c.targetIdentifier || c.activityType || c.targetResourceId, c.targetStatus && term(c.targetStatus,tr), c.isSatisfied ? tr('Splněno','Met') : tr('Čeká','Pending')].filter(Boolean).join(' · ')}</li>)}</ul></>}
            </section>
            {selected.actions.length > 0 && <section><h3>{tr('Akce při vydání','Actions on release')}</h3><ul>{selected.actions.map(a => <li key={a.id}>{[term(a.actionType,tr), a.resourceTitle || a.resourceIdentifier || a.resourceId, a.unitName || a.userName || term(a.targetType,tr), a.newVisibility].filter(Boolean).join(' · ')}</li>)}</ul></section>}
            {selected.releasedAt && <p className={styles.help}>{tr('Vydáno ve skutečném čase', 'Released at actual time')} · {formatTime(selected.releasedAt)} ({timezone})</p>}
            {errorMessage}
            <footer><button type="button" className="btn btn-primary" onClick={() => open({ kind:'preview',id:selected.id })}>{tr('Náhled briefingu','Preview briefing')}</button>
              {!['CANCELLED','RELEASED'].includes(selected.status) && !selected.designReadOnly && <>
                {canManage && <button type="button" className="btn btn-secondary" onClick={() => open({ kind:'edit', id:selected.id })}>{tr('Upravit vstup','Edit inject')}</button>}
                {canOverride && <button type="button" className="btn btn-secondary" onClick={() => open({ kind:'override',id:selected.id })}>{tr('Vydat výjimkou','Override release')}</button>}
                {canManage && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => {
                  if (window.confirm(tr('Zrušit tento vstup?','Cancel this inject?') + ' ' + selected.injectNumber)) void act(() => apiClient.cancelScenarioInject(eventId,selected.id), selected.injectNumber + ' · ' + term('CANCELLED',tr), true);
                }}>{tr('Zrušit vstup','Cancel inject')}</button>}
              </>}
            </footer>
          </div>
        </ScenarioDialog>}
        {modal?.kind === 'preview' && selected && <BriefingPreview key={selected.id + selected.updatedAt} eventId={eventId} inject={selected} tr={tr} onClose={close}
          onRelease={canRelease && canReleaseNow(selected) ? () => void act(() => apiClient.releaseScenarioInject(eventId,selected.id), selected.injectNumber + ' · ' + term('RELEASED',tr), true) : undefined}
          busy={busy} actionError={actionError} />}
        {modal?.kind === 'override' && selected && canOverride && !selected.designReadOnly && !['RELEASED','CANCELLED'].includes(selected.status) &&
          <ScenarioDialog title={tr('Vydat výjimkou', 'Override release')} closeLabel={tr('Zavřít','Close')} onClose={close}>
            <form className={styles.form} onSubmit={e => { e.preventDefault(); if (reason.trim().length >= 5) void act(() => apiClient.overrideReleaseScenarioInject(eventId, selected.id, reason.trim()), selected.injectNumber + ' · ' + term('RELEASED',tr), true); }}>
              <p className={styles.prose}>{selected.injectNumber} · {audience(selected,tr)}. {tr('Potvrzením vydáte briefing ihned i s nesplněnými podmínkami. Důvod se zapíše do auditu.', 'Confirming releases the briefing immediately, including when requirements are pending. The reason is recorded in the audit log.')}</p>
              <label>{tr('Důvod výjimky (alespoň 5 znaků)', 'Reason for override (at least 5 characters)')}<textarea required minLength={5} value={reason} onChange={e => setReason(e.target.value)} /></label>
              {errorMessage}<footer><button type="button" className="btn btn-secondary" onClick={close}>{tr('Zpět','Back')}</button><button type="submit" className="btn btn-primary" disabled={busy || reason.trim().length < 5}>{tr('Potvrdit vydání výjimkou','Confirm override release')}</button></footer>
            </form>
          </ScenarioDialog>}
      </>}
    </div>
  </AppShell>;
}

function PhaseForm({ tr, busy, error, onSave, onClose }: { tr: Translate; busy: boolean; error: string; onSave: (code: string, name: string, description: string) => void; onClose: () => void }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const code = String(form.get('code')).trim(), title = String(form.get('title')).trim();
    if (code && title) onSave(code, title, String(form.get('description')).trim());
  };
  return <ScenarioDialog title={tr('Nová fáze', 'New phase')} closeLabel={tr('Zavřít','Close')} onClose={onClose}><form className={styles.form} onSubmit={submit}>
    <p className={styles.help}>{tr('Novou fázi přidáte do plánu. Až začne, zvolte u ní Zahájit fázi.', 'The new phase is added to the plan. Choose Start phase when it begins.')}</p>
    <label>{tr('Kód fáze','Phase code')}<input required pattern=".*\S.*" name="code" maxLength={64} /></label>
    <label>{tr('Název fáze','Phase name')}<input required pattern=".*\S.*" name="title" maxLength={255} /></label>
    <label>{tr('Popis','Description')}<textarea name="description" /></label>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <footer><button type="button" className="btn btn-secondary" onClick={onClose}>{tr('Zrušit','Cancel')}</button><button className="btn btn-primary" disabled={busy}>{tr('Vytvořit fázi','Create phase')}</button></footer>
  </form></ScenarioDialog>;
}

function BriefingPreview({ eventId, inject, tr, onClose, onRelease, busy, actionError }: {
  eventId: string; inject: ScenarioInjectResponse; tr: Translate; onClose: () => void; onRelease?: () => void; busy: boolean; actionError: string;
}) {
  const [preview, setPreview] = useState<AudiencePreviewResponse | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    void apiClient.previewScenarioAudience(eventId, inject.id).then(res => {
      if (!active) return;
      if (res.ok && res.data) setPreview(res.data);
      else setError(res.error || tr('Náhled se nepodařilo načíst.', 'Could not load the preview.'));
    });
    return () => { active = false; };
  }, [eventId, inject.id, attempt, tr]);
  const targetText = preview?.targetAudienceDescription.replace('Entire Event (All verified participants)', term('EVENT',tr))
    .replace(/All participants/g, term('EVENT',tr)).replace(/Unit: /g, term('UNIT',tr) + ' · ').replace(/User: /g, term('USER',tr) + ' · ');
  return <ScenarioDialog title={tr('Náhled briefingu','Briefing preview') + ' · ' + inject.injectNumber} closeLabel={tr('Zavřít','Close')} onClose={onClose}>
    {error ? <ErrorState message={error} onRetry={() => setAttempt(n => n + 1)} /> : !preview ? <LoadingState /> : <div className={styles.inspection}>
      <section><h3>{tr('Příjemci','Recipients')}</h3><p>{targetText}</p></section>
      <section className={styles.briefing}><h3>{preview.participantTitle}</h3>
        {preview.participantContent && <p className={styles.prose}>{preview.participantContent}</p>}
        {preview.requiresAcknowledgement && <p className={styles.help}>{tr('Vyžaduje potvrzení přijetí.', 'Acknowledgement requested.')}</p>}
      </section>
      {inject.translations.length > 0 && <p className={styles.help}>{tr('K dispozici jsou také jazykové verze pro příjemce', 'Additional recipient language versions')} · {inject.translations.map(t => t.locale).join(', ')}</p>}
      {preview.disclosedResources.length > 0 && <section><h3>{tr('Zpřístupněné záznamy','Records disclosed on release')}</h3><ul>{preview.disclosedResources.map((r,i) => <li key={r.resourceId + i}>{r.title || r.identifier || r.resourceId} · {r.visibilityAction}</li>)}</ul></section>}
      {inject.actions.some(a => a.actionType === 'CREATE_INCIDENT') && <p className={styles.help}>{tr('Vydáním vznikne také incident viditelný pro celé cvičení.', 'Release also creates an incident visible to the whole exercise.')}</p>}
      {actionError && <p role="alert" className={styles.error}>{actionError}</p>}
      {onRelease && <p className={styles.help}>{tr('Potvrzením se uloží konečná verze a zpráva se zpřístupní vybraným příjemcům v jejich Briefinzích.', 'Confirming saves the final version and delivers the message to the selected recipients in Briefings.')}</p>}
      <footer><button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>{tr('Zavřít náhled','Close preview')}</button>
        {onRelease && <button type="button" className="btn btn-primary" disabled={busy} onClick={onRelease}>{tr('Potvrdit vydání','Confirm release')}</button>}</footer>
    </div>}
  </ScenarioDialog>;
}

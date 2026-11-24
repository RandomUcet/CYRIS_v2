'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  isServiceModule, serviceModuleLabels, type CreateDisruptionRequest, type DisruptionSnapshot,
  type MembershipResponse, type RestrictedServiceMode, type ServiceModule, type UnitResponse,
} from '@cyris/contracts';
import { apiClient } from '@/lib/api-client';
import { usePreferences } from '@/contexts/PreferencesContext';
import { LoadingState } from '@/components/common/StateViews';
import { RecoveryObjectives } from './RecoveryObjectives';
import styles from './ModuleAvailability.module.css';

function ruleState(row: DisruptionSnapshot) {
  if (row.restoredAt) return 'restored';
  if (row.active) return 'active';
  return new Date(row.startsAt).getTime() > Date.now() ? 'planned' : 'expired';
}

export function ModuleAvailabilityPanel({ eventId }: { eventId: string }) {
  const { locale, t, formatTime } = usePreferences();
  const cs = locale === 'cs';
  const tr = (cz: string, en: string) => cs ? cz : en;
  const moduleName = (id: string) => isServiceModule(id) ? serviceModuleLabels[id][cs ? 'cs' : 'en'] : id;
  const [rules, setRules] = useState<DisruptionSnapshot[] | null>(null);
  const [rulesError, setRulesError] = useState(false);
  const [units, setUnits] = useState<UnitResponse[]>([]);
  const [members, setMembers] = useState<MembershipResponse[]>([]);
  const [rosterError, setRosterError] = useState(false);
  const [version, setVersion] = useState(0);
  const [module, setModule] = useState<ServiceModule>('tasks');
  const [mode, setMode] = useState<RestrictedServiceMode>('READ_ONLY');
  const [scope, setScope] = useState<CreateDisruptionRequest['targetType']>('EVENT');
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [restoringId, setRestoringId] = useState('');
  const [restoreReason, setRestoreReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showObjectives, setShowObjectives] = useState(false);
  const refresh = () => setVersion(value => value + 1);

  useEffect(() => {
    let current = true;
    let pending = false;
    async function loadRules() {
      if (!current || pending) return;
      pending = true;
      try {
        const response = await apiClient.listDisruptions(eventId);
        if (!current) return;
        if (response.ok && response.data) { setRules(response.data); setRulesError(false); }
        else setRulesError(true);
      } catch { if (current) setRulesError(true); }
      finally { pending = false; }
    }
    void loadRules();
    const interval = window.setInterval(loadRules, 15000);
    window.addEventListener('focus', loadRules);
    return () => { current = false; window.clearInterval(interval); window.removeEventListener('focus', loadRules); };
  }, [eventId, version]);

  useEffect(() => {
    let current = true;
    void Promise.all([apiClient.getUnits(eventId), apiClient.getMemberships(eventId)]).then(([teams, people]) => {
      if (!current) return;
      if (teams.ok && teams.data) setUnits(teams.data);
      if (people.ok && people.data) setMembers(people.data);
      setRosterError(!teams.ok || !people.ok);
    }).catch(() => { if (current) setRosterError(true); });
    return () => { current = false; };
  }, [eventId, version]);

  async function start(event: FormEvent) {
    event.preventDefault();
    if (busy || reason.trim().length < 3 || (scope !== 'EVENT' && !target)) return;
    setError(''); setNotice('');
    const startTime = startsAt ? new Date(startsAt) : new Date();
    const endTime = expiresAt ? new Date(expiresAt) : null;
    if (Number.isNaN(startTime.getTime()) || (endTime && (Number.isNaN(endTime.getTime()) || endTime <= startTime))) {
      setError(tr('Konec musí následovat po začátku omezení.', 'The end must be later than the start.')); return;
    }
    setBusy(true);
    try {
      const result = await apiClient.startDisruption(eventId, { module, mode, targetType: scope,
        targetId: scope === 'EVENT' ? null : target, reason: reason.trim(),
        startsAt: startsAt ? startTime.toISOString() : undefined, expiresAt: endTime?.toISOString(),
      });
      if (!result.ok) throw new Error(result.error || tr('Uložení se nezdařilo.', 'Unable to save the change.'));
      setNotice(tr('Nastavení dostupnosti bylo uloženo.', 'Availability setting saved.'));
      setReason(''); setStartsAt(''); setExpiresAt(''); refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr('Uložení se nezdařilo.', 'Unable to save the change.')); }
    finally { setBusy(false); }
  }

  async function restore(event: FormEvent, row: DisruptionSnapshot) {
    event.preventDefault();
    if (busy || restoreReason.trim().length < 3) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await apiClient.restoreDisruption(eventId, row.id, { expectedRevision: row.revision, reason: restoreReason.trim() });
      if (!result.ok) throw new Error(result.error || tr('Změnu se nepodařilo uložit.', 'Unable to save the change.'));
      setRestoringId(''); setRestoreReason('');
      setNotice(tr('Omezení bylo ukončeno.', 'Restriction ended.'));
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr('Změnu se nepodařilo uložit.', 'Unable to save the change.')); }
    finally { setBusy(false); refresh(); }
  }

  const scopeNames = { EVENT: tr('Celá událost', 'Entire event'), UNIT: tr('Tým', 'Team'), USER: tr('Účastník', 'Participant') };
  const stateNames = { active: tr('Aktivní', 'Active'), planned: tr('Naplánováno', 'Scheduled'), expired: tr('Vypršelo', 'Expired'), restored: tr('Ukončeno', 'Ended') };
  function targetName(row: DisruptionSnapshot) {
    if (row.targetType === 'EVENT') return scopeNames.EVENT;
    const name = row.targetType === 'UNIT' ? units.find(unit => unit.id === row.targetId)?.name : members.find(member => member.userId === row.targetId)?.user?.displayName;
    return `${scopeNames[row.targetType]} · ${name ?? row.targetId}`;
  }
  function renderRule(row: DisruptionSnapshot) {
    const state = ruleState(row);
    const action = state === 'planned' ? tr('Zrušit plán', 'Cancel schedule') : tr('Obnovit dostupnost', 'Restore availability');
    return <article key={row.id} className={styles.rule}>
      <div><div className={styles.ruleTitle}><strong>{moduleName(row.module)}</strong><span>{stateNames[state]}</span></div>
        <p>{t('serviceStatus.impact.' + row.mode.toLowerCase())} · {targetName(row)}</p>
        <small>{formatTime(row.startsAt)} — {row.restoredAt || row.expiresAt ? formatTime(row.restoredAt ?? row.expiresAt) : tr('do ručního obnovení', 'until restored')}</small>
        <p className={styles.reason}>{row.reason}</p></div>
      {(state === 'active' || state === 'planned') && (restoringId === row.id ?
        <form className={styles.restore} onSubmit={event => void restore(event, row)}>
          <label>{tr('Důvod ukončení', 'Reason for ending')}<input autoFocus required minLength={3} maxLength={2000} value={restoreReason} onChange={event => setRestoreReason(event.target.value)} /></label>
          <div className={styles.buttons}><button className="btn btn-primary" disabled={busy || restoreReason.trim().length < 3}>{action}</button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setRestoringId('')}>{tr('Zpět', 'Back')}</button></div>
        </form> : <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setRestoringId(row.id); setRestoreReason(''); setError(''); setNotice(''); }}>{action}</button>)}
    </article>;
  }
  const currentRules = (rules ?? []).filter(row => ['active', 'planned'].includes(ruleState(row)));
  const history = (rules ?? []).filter(row => ['expired', 'restored'].includes(ruleState(row)));
  const activeRules = currentRules.filter(row => row.active && isServiceModule(row.module) && row.mode !== 'DEGRADED');
  return <>
    <form className={styles.panel} onSubmit={event => void start(event)}>
      <div className={styles.sectionLabel} data-kind="simulation">{tr('SIMULACE CVIČENÍ','EXERCISE SIMULATION')}</div>
      <h2>{tr('Simulovaný výpadek nebo omezení modulu', 'Simulated module outage or restriction')}</h2>
      <p className={styles.explanation}>{tr('Mění dostupnost vybraného modulu pro určené účastníky. Nepozastavuje celé cvičení ani skutečnou síť. Pro plánovaný odpočinek použijte provozní pauzu výše.','Changes access to a selected module for its audience; does not pause the whole exercise or real network. Use the operational pause above for a real break.')}</p>
      <fieldset disabled={busy} className={styles.formGrid}>
        <label>{tr('Modul', 'Module')}<select value={module} onChange={e => setModule(e.target.value as ServiceModule)}>
          {Object.entries(serviceModuleLabels).map(([key, label]) => <option key={key} value={key}>{label[cs ? 'cs' : 'en']}</option>)}
        </select></label>
        <label>{tr('Režim', 'Mode')}<select value={mode} onChange={e => setMode(e.target.value as RestrictedServiceMode)}>
          <option value="READ_ONLY">{t('serviceStatus.impact.read_only')}</option><option value="UNAVAILABLE">{t('serviceStatus.impact.unavailable')}</option>
        </select></label>
        <label>{tr('Rozsah', 'Scope')}<select value={scope} onChange={e => { setScope(e.target.value as CreateDisruptionRequest['targetType']); setTarget(''); }}>
          {Object.entries(scopeNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
        {scope !== 'EVENT' && <label>{scopeNames[scope]}<select required value={target} onChange={e => setTarget(e.target.value)}>
          <option value="">{scope === 'UNIT' ? tr('Vyberte tým', 'Select a team') : tr('Vyberte účastníka', 'Select a participant')}</option>
          {scope === 'UNIT' ? units.filter(unit => !unit.archivedAt).map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>) :
            members.filter(member => member.status === 'ACTIVE' && member.user?.status === 'ACTIVE').map(member => <option key={member.userId} value={member.userId}>{member.user?.displayName} · {member.user?.email}</option>)}
        </select></label>}
        <div className={styles.times}>
          <label>{tr('Začátek', 'Starts')}<input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} /><small>{tr('Bez vyplnění začne ihned.', 'Leave empty to start immediately.')}</small></label>
          <label>{tr('Konec', 'Ends')}<input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} /><small>{tr('Bez vyplnění trvá do ručního obnovení.', 'Leave empty to restore manually.')}</small></label>
          <small className={styles.full}>{tr('Časové pásmo formuláře', 'Scheduling time zone')} · {Intl.DateTimeFormat().resolvedOptions().timeZone}</small>
        </div>
        <label className={styles.full}>{tr('Interní důvod', 'Internal reason')}<textarea rows={2} required minLength={3} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label>
      </fieldset>
      <div className={styles.buttons}><button className="btn btn-primary" disabled={busy || reason.trim().length < 3 || (scope !== 'EVENT' && !target)}>{tr('Uložit omezení', 'Save restriction')}</button></div>
    </form>
    {error && <p className="error-text" role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
    {(rulesError || rosterError) && <p className={styles.warning} role="alert">{rulesError ? tr('Seznam omezení se nepodařilo načíst.', 'Unable to load restrictions.') : tr('Seznam týmů a účastníků se nepodařilo načíst.', 'Unable to load teams and participants.')} <button type="button" className="btn btn-secondary" onClick={refresh}>{tr('Zkusit znovu', 'Try again')}</button></p>}
    <section className={styles.panel}>
      <header className={styles.heading}><h2>{tr('Aktivní a plánovaná omezení', 'Active and scheduled restrictions')}</h2>
        <button type="button" className="btn btn-secondary" onClick={refresh}><RefreshCw size={14} />{t('action.refresh')}</button></header>
      {!rules && !rulesError ? <LoadingState /> : currentRules.length ? currentRules.map(renderRule) : rules && <p className={styles.muted}>{tr('Žádná aktivní ani plánovaná omezení.', 'No active or scheduled restrictions.')}</p>}
    </section>
    <details className={styles.panel}><summary>{tr('Historie změn', 'Availability history')}{history.length ? ` (${history.length})` : ''}</summary>
      {history.length ? history.map(renderRule) : <p className={styles.muted}>{tr('Žádné předchozí změny.', 'No previous changes.')}</p>}
    </details>
    <details className={styles.panel} onToggle={event => setShowObjectives(event.currentTarget.open)}><summary>{tr('Cíle obnovy', 'Recovery objectives')}</summary>
      {showObjectives && <RecoveryObjectives eventId={eventId} rules={activeRules} labelRule={row => `${moduleName(row.module)} · ${targetName(row)} · ${formatTime(row.startsAt)}`} onRestored={refresh} />}
    </details>
  </>;
}

'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';
import { serviceModuleLabels, type CreateOperationalHold, type OperationalHold, type MembershipResponse, type UnitResponse } from '@cyris/contracts';
import { apiClient } from '@/lib/api-client';
import { usePreferences } from '@/contexts/PreferencesContext';
import styles from './ModuleAvailability.module.css';

export function OperationalHoldsPanel({ eventId }: { eventId: string }) {
  const { locale, formatTime } = usePreferences();
  const cs = locale === 'cs';
  const tr = (cz: string, en: string) => cs ? cz : en;
  const [holds, setHolds] = useState<OperationalHold[]>([]);
  const [units, setUnits] = useState<UnitResponse[]>([]);
  const [members, setMembers] = useState<MembershipResponse[]>([]);
  const [targetType, setTargetType] = useState<CreateOperationalHold['targetType']>('EVENT');
  const [targetId, setTargetId] = useState('');
  const [module, setModule] = useState<CreateOperationalHold['module']>('ALL');
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [restoreReason, setRestoreReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const refresh = () => setRevision(v => v + 1);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [list, teams, people] = await Promise.all([
        apiClient.listOperationalHolds(eventId), apiClient.getUnits(eventId), apiClient.getMemberships(eventId),
      ]);
      if (!active) return;
      if (list.ok && list.data) { setHolds(list.data); setError(''); }
      else setError(list.error ?? tr('Nelze načíst provozní pauzy.', 'Unable to load holds.'));
      if (teams.ok && teams.data) setUnits(teams.data);
      if (people.ok && people.data) setMembers(people.data);
    };
    void load();
    const timer = window.setInterval(load, 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, [eventId, revision]);

  async function createHold(event: FormEvent) {
    event.preventDefault();
    if (busy || !confirmed || reason.trim().length < 5 || (targetType !== 'EVENT' && !targetId)) return;
    const end = expiresAt ? new Date(expiresAt) : null;
    if (end && (!Number.isFinite(end.getTime()) || end <= new Date())) {
      setError(tr('Konec musí být v budoucnosti.', 'End must be in the future.')); return;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await apiClient.createOperationalHold(eventId, {
        targetType, targetId: targetType === 'EVENT' ? null : targetId,
        module, reason: reason.trim(), expiresAt: end?.toISOString(),
      });
      if (!result.ok) throw new Error(result.error ?? 'Unable to create hold');
      setReason(''); setExpiresAt(''); setConfirmed(false);
      setNotice(tr('Provozní pauza byla aktivována.', 'Operational pause activated.'));
      refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Operation failed'); }
    finally { setBusy(false); }
  }

  async function resumeHold(hold: OperationalHold) {
    if (busy || restoreReason.trim().length < 5) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await apiClient.restoreOperationalHold(eventId, hold.id, { expectedRevision: hold.revision, reason: restoreReason.trim() });
      if (!result.ok) throw new Error(result.error ?? 'Unable to restore');
      setRestoring(null); setRestoreReason('');
      setNotice(tr('Pauza byla ukončena.', 'Hold ended.'));
      refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Operation failed'); }
    finally { setBusy(false); }
  }

  const relevant = holds.filter(h => !h.restoredAt && (!h.expiresAt || Date.parse(h.expiresAt) > Date.now()));
  const targetName = (hold: OperationalHold) => hold.targetType === 'EVENT'
    ? tr('Celé cvičení', 'Entire exercise')
    : hold.targetType === 'UNIT' ? units.find(u => u.id === hold.targetId)?.name ?? 'Team'
      : members.find(m => m.userId === hold.targetId)?.user?.displayName ?? 'Participant';

  return <section className={styles.panel} aria-labelledby="holds-title">
    <header className={styles.heading}><h2 id="holds-title"><ShieldAlert size={19} aria-hidden /> {tr('Provozní pauza – skutečné blokování zápisů', 'Operational pause – real write lock')}</h2>
      <button type="button" className="btn btn-secondary" onClick={refresh} disabled={busy}><RefreshCw size={14}/>{tr('Obnovit', 'Refresh')}</button></header>
    <p>{tr('Pro přestávku, oběd nebo bezpečnostní zásah. Není to simulovaný výpadek. Dotčení účastníci mohou číst, ale nemohou ukládat změny nebo nahrávat soubory. Administrace a support zůstávají dostupné.', 'For breaks, lunch or safety intervention. Not a simulated outage. Affected participants may read, but cannot save or upload. Administration and support remain available.')}</p>
    <form onSubmit={event => void createHold(event)}>
      <fieldset disabled={busy} className={styles.formGrid}>
        <label>{tr('Rozsah', 'Scope')}<select value={targetType} onChange={e => { setTargetType(e.target.value as CreateOperationalHold['targetType']); setTargetId(''); setConfirmed(false); }}>
          <option value="EVENT">{tr('Celé cvičení', 'Entire exercise')}</option><option value="UNIT">{tr('Tým', 'Team')}</option><option value="USER">{tr('Účastník', 'Participant')}</option>
        </select></label>
        {targetType !== 'EVENT' && <label>{tr('Cíl', 'Target')}<select required value={targetId} onChange={e => setTargetId(e.target.value)}>
          <option value="">{tr('Vyberte', 'Select')}</option>
          {targetType === 'UNIT'
            ? units.filter(u => !u.archivedAt).map(u => <option key={u.id} value={u.id}>{u.name}</option>)
            : members.filter(m => m.status === 'ACTIVE' && m.user?.status === 'ACTIVE').map(m => <option key={m.userId} value={m.userId}>{m.user?.displayName}</option>)}
        </select></label>}
        <label>{tr('Funkce', 'Feature')}<select value={module} onChange={e => setModule(e.target.value as CreateOperationalHold['module'])}>
          <option value="ALL">{tr('Všechny zápisy', 'All writes')}</option>
          {Object.entries(serviceModuleLabels).map(([id, labels]) => <option key={id} value={id}>{labels[cs ? 'cs' : 'en']}</option>)}
        </select></label>
        <label>{tr('Automatický konec (volitelné)', 'Automatic end (optional)')}<input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} /></label>
        <label className={styles.full}>{tr('Důvod viditelný účastníkům', 'Reason visible to participants')}<textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} minLength={5} maxLength={1000} required placeholder={tr('Pauza na oběd – pokračujeme ve 13:00.', 'Lunch break – back at 13:00.')} /></label>
        <label className={styles.full} style={{ display: 'flex', alignItems: 'center', gap: '.65rem' }}><input type="checkbox" style={{ width: 'auto', minHeight: 'auto' }} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} required />{tr('Potvrzuji, že jde o skutečné provozní omezení.', 'I confirm this is a real operational restriction.')}</label>
      </fieldset>
      <button className="btn btn-primary" type="submit" disabled={busy || !confirmed || reason.trim().length < 5 || (targetType !== 'EVENT' && !targetId)}>{tr('Aktivovat pauzu', 'Activate pause')}</button>
    </form>
    {error && <p role="alert" className={styles.warning}>{error}</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    <h3 style={{ marginTop: '1rem' }}>{tr('Aktivní omezení', 'Current holds')}</h3>
    {!relevant.length && <p className={styles.muted}>{tr('Žádné aktivní pauzy.', 'No active holds.')}</p>}
    {relevant.map(row => <article className={styles.rule} key={row.id}>
      <div><strong>{row.module === 'ALL' ? tr('Všechny funkce', 'All features') : serviceModuleLabels[row.module][cs ? 'cs' : 'en']}</strong>
        <p>{targetName(row)} · {row.active ? tr('Aktivní', 'Active') : tr('Naplánováno', 'Scheduled')}</p>
        <small>{formatTime(row.startsAt)} — {row.expiresAt ? formatTime(row.expiresAt) : tr('do ručního obnovení', 'until manually restored')}</small>
        <p className={styles.reason}>{row.reason}</p></div>
      {restoring === row.id ? <div className={styles.restore}>
        <label>{tr('Důvod obnovení', 'Reason to resume')}<input minLength={5} maxLength={1000} value={restoreReason} onChange={e => setRestoreReason(e.target.value)} /></label>
        <button type="button" className="btn btn-primary" disabled={busy || restoreReason.trim().length < 5} onClick={() => void resumeHold(row)}>{tr('Obnovit provoz', 'Resume')}</button>
        <button type="button" className="btn btn-secondary" onClick={() => setRestoring(null)} disabled={busy}>{tr('Zrušit', 'Cancel')}</button>
      </div> : <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setRestoring(row.id); setRestoreReason(''); }}>{tr('Ukončit pauzu', 'End pause')}</button>}
    </article>)}
    <p className={styles.muted}>{tr('Poznámka: blokování platí pro interaktivní API operace. Automatické injekce a externí integrace vyžadují další ověření.', 'Note: the lock controls interactive API operations. Automatic injects and external integrations require further verification.')}</p>
  </section>;
}

'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { DisruptionSnapshot, RecoveryArtifact, RecoveryObjective, RecoveryReport } from '@cyris/contracts';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { apiClient } from '@/lib/api-client';
import { LoadingState } from '@/components/common/StateViews';
import styles from './ModuleAvailability.module.css';

export function RecoveryObjectives({ eventId, rules, labelRule, onRestored }: {
  eventId: string; rules: DisruptionSnapshot[]; labelRule: (row: DisruptionSnapshot) => string; onRestored: () => void;
}) {
  const { locale } = usePreferences();
  const tr = (cz: string, en: string) => locale === 'cs' ? cz : en;
  const [objectives, setObjectives] = useState<RecoveryObjective[] | null>(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');
  const [ruleId, setRuleId] = useState('');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState('');
  const rule = rules.find(row => row.id === ruleId);
  const selectedObjective = objectives?.find(objective => objective.id === selected);

  useEffect(() => {
    let current = true;
    void apiClient.listRecoveryObjectives(eventId).then(result => {
      if (!current) return;
      if (result.ok && result.data) { setObjectives(result.data); setError(''); }
      else setError(result.error || tr('Cíle se nepodařilo načíst.', 'Unable to load recovery objectives.'));
    });
    return () => { current = false; };
  }, [eventId, version]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!rule || saving) return;
    setSaving(true); setError('');
    try {
      const result = await apiClient.createRecoveryObjective(eventId, { disruptionId: rule.id, audienceType: rule.targetType,
        audienceId: rule.targetId, title: title.trim(), instructions: instructions.trim() });
      if (!result.ok || !result.data) throw new Error(result.error || tr('Cíl se nepodařilo uložit.', 'Unable to save the objective.'));
      setSelected(result.data.id); setInstructions(''); setTitle(''); setVersion(value => value + 1);
    } catch (cause) { setError(String(cause instanceof Error ? cause.message : cause)); }
    finally { setSaving(false); }
  }
  return <div className={styles.recovery}>
    {error && <div className={styles.warning} role="alert">{error} <button type="button" className="btn btn-secondary" onClick={() => setVersion(v => v + 1)}>{tr('Obnovit seznam', 'Reload list')}</button></div>}
    {!objectives && !error ? <LoadingState /> : objectives && (objectives.length ? <label>{tr('Uložené cíle', 'Existing objectives')}
      <select value={selected} onChange={event => setSelected(event.target.value)}><option value="">{tr('Vyberte cíl', 'Select an objective')}</option>
        {objectives.map(objective => <option value={objective.id} key={objective.id}>{objective.title}</option>)}</select></label> : <p className={styles.muted}>{tr('Žádné uložené cíle obnovy.', 'No recovery objectives.')}</p>)}
    {selectedObjective && <RecoveryDetail key={selectedObjective.id} eventId={eventId} objective={selectedObjective}
      active={rules.some(row => row.id === selectedObjective.disruptionId)} onChange={() => setVersion(value => value + 1)} onRestored={onRestored} />}
    {rules.length > 0 && <form className={styles.recoveryForm} onSubmit={event => void create(event)}>
      <h3>{tr('Nový cíl obnovy', 'New recovery objective')}</h3>
      <label>{tr('Aktivní omezení', 'Active restriction')}<select required value={ruleId} onChange={event => setRuleId(event.target.value)}>
        <option value="">{tr('Vyberte omezení', 'Select a restriction')}</option>{rules.map(row => <option key={row.id} value={row.id}>{labelRule(row)}</option>)}
      </select></label>
      <label>{tr('Název cíle', 'Objective title')}<input required minLength={3} maxLength={200} value={title} onChange={event => setTitle(event.target.value)} /></label>
      <label>{tr('Pokyny', 'Instructions')}<textarea required rows={2} minLength={3} maxLength={4000} value={instructions} onChange={event => setInstructions(event.target.value)} /></label>
      <button className="btn btn-secondary" disabled={saving || !rule || title.trim().length < 3 || instructions.trim().length < 3}>{tr('Vytvořit cíl', 'Create objective')}</button>
    </form>}
  </div>;
}

function RecoveryDetail({ eventId, objective, active, onChange, onRestored }: {
  eventId: string; objective: RecoveryObjective; active: boolean; onChange: () => void; onRestored: () => void;
}) {
  const { locale, formatTime } = usePreferences();
  const { currentUser } = useAuth();
  const tr = (cz: string, en: string) => locale === 'cs' ? cz : en;
  const states = { DRAFT: tr('Koncept', 'Draft'), PUBLISHED: tr('Zveřejněno', 'Published'), APPROVED: tr('Schváleno', 'Approved'), REJECTED: tr('Zamítnuto', 'Rejected'), RESTORED: tr('Obnoveno', 'Restored') };
  const [reports, setReports] = useState<RecoveryReport[]>([]);
  const [artifacts, setArtifacts] = useState<RecoveryArtifact[]>([]);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState('');
  const [reason, setReason] = useState('');
  const [artifactTitle, setArtifactTitle] = useState('');
  const [body, setBody] = useState('');
  const { id, status, revision } = objective;
  useEffect(() => {
    let current = true;
    void Promise.all([apiClient.listRecoveryReports(eventId, id), apiClient.listRecoveryArtifacts(eventId, id)]).then(([r, a]) => {
      if (!current) return;
      if (r.ok && r.data) setReports(r.data);
      if (a.ok && a.data) setArtifacts(a.data);
      if (!r.ok || !a.ok) setError(r.error || a.error || tr('Podklady se nepodařilo načíst.', 'Unable to load the recovery records.'));
    });
    return () => { current = false; };
  }, [eventId, id, version]);

  async function apply(call: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await call();
      if (!result.ok) throw new Error(result.error || tr('Změna se nezdařila.', 'Unable to save the change.'));
      after?.();
    } catch (cause) { setError(String(cause instanceof Error ? cause.message : cause)); }
    finally { onChange(); setVersion(value => value + 1); setBusy(false); }
  }
  return <section className={styles.recoveryDetail}>
    <div className={styles.ruleTitle}><h3>{objective.title}</h3><span>{states[status]}</span></div>
    <p className={styles.reason}>{objective.instructions}</p>
    {error && <p className={styles.warning} role="alert">{error}</p>}
    {artifacts.map(item => <div className={styles.buttons} key={item.id}>
      {item.status === 'PUBLISHED' ? <a href={`/api/events/${eventId}/disruptions/recovery-objectives/${id}/artifacts/${item.id}/download`}>{item.title}</a> : <span>{item.title} · {states.DRAFT}</span>}
      {active && item.status === 'DRAFT' && status === 'PUBLISHED' && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void apply(() => apiClient.publishRecoveryArtifact(eventId, id, item.id, item.revision))}>{tr('Zveřejnit soubor', 'Publish file')}</button>}
    </div>)}
    {reports.map(item => <article className={styles.report} key={item.id}><small>{formatTime(item.createdAt)}</small><p>{item.body}</p></article>)}
    {active && status === 'DRAFT' && <>
      <form className={styles.recoveryForm} onSubmit={e => { e.preventDefault(); void apply(() => apiClient.createRecoveryArtifact(eventId, id, { title: artifactTitle.trim(), filename: `${id}.txt`, body }), () => { setBody(''); setArtifactTitle(''); }); }}>
        <label>{tr('Název textového podkladu', 'Text file title')}<input required value={artifactTitle} minLength={3} maxLength={200} onChange={e => setArtifactTitle(e.target.value)} /></label>
        <label>{tr('Obsah souboru', 'File contents')}<textarea required rows={2} maxLength={20000} value={body} onChange={e => setBody(e.target.value)} /></label>
        <button className="btn btn-secondary" disabled={busy || artifactTitle.trim().length < 3 || !body.trim()}>{tr('Přidat podklad', 'Add text file')}</button>
      </form>
      <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void apply(() => apiClient.publishRecoveryObjective(eventId, id, revision))}>{tr('Zveřejnit cíl', 'Publish objective')}</button>
    </>}
    {active && status === 'PUBLISHED' && <>
      {!reports.some(item => item.authorUserId === currentUser?.user.id) && <form className={styles.recoveryForm} onSubmit={e => { e.preventDefault(); void apply(() => apiClient.submitRecoveryReport(eventId, id, { body: report.trim() }), () => setReport('')); }}>
        <label>{tr('Zpráva o obnově', 'Recovery report')}<textarea required minLength={3} maxLength={4000} value={report} onChange={e => setReport(e.target.value)} /></label>
        <button className="btn btn-secondary" disabled={busy || report.trim().length < 3}>{tr('Uložit zprávu', 'Save report')}</button>
      </form>}
      <div className={styles.buttons}>
        <button type="button" className="btn btn-secondary" disabled={busy || !reports.length} onClick={() => void apply(() => apiClient.reviewRecoveryObjective(eventId, id, { expectedRevision: revision, decision: 'APPROVE' }))}>{tr('Schválit', 'Approve')}</button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void apply(() => apiClient.reviewRecoveryObjective(eventId, id, { expectedRevision: revision, decision: 'REJECT' }))}>{tr('Zamítnout', 'Reject')}</button>
      </div>
    </>}
    {active && status === 'APPROVED' && <form className={styles.recoveryForm} onSubmit={e => { e.preventDefault(); void apply(() => apiClient.restoreRecoveryObjective(eventId, id, { expectedRevision: revision, reason: reason.trim() }), onRestored); }}>
      <label>{tr('Důvod obnovení', 'Reason for restoring')}<input required minLength={3} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <button className="btn btn-secondary" disabled={busy || reason.trim().length < 3}>{tr('Obnovit dostupnost', 'Restore availability')}</button>
    </form>}
  </section>;
}

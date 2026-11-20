'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { MembershipResponse, OperationalTaskDetail, TaskAction } from '@cyris/contracts';
import { AppShell } from '@/components/layout/AppShell';
import { LoadingState, ErrorState } from '@/components/common/StateViews';
import { StatusBadge, PriorityBadge } from '@/components/common/Badges';
import { useServiceReadOnly } from '@/hooks/useServiceStatus';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { apiClient } from '@/lib/api-client';

const labels: Record<TaskAction, [string, string]> = {
  acknowledge: ['Potvrdit převzetí', 'Acknowledge'],
  start: ['Zahájit práci', 'Start work'],
  complete: ['Dokončit', 'Complete'],
  block: ['Označit překážku', 'Block'],
  cancel: ['Zrušit úkol', 'Cancel task'],
  reopen: ['Znovu otevřít', 'Reopen'],
  assign: ['Změnit přiřazení', 'Reassign'],
};

const resourceRoutes: Record<string, string> = {
  case: 'cases', incident: 'incidents', evidence: 'evidence', lab_analysis: 'lab',
  forensic_analysis: 'forensics', operational_task: 'tasks',
};

export default function TaskPage() {
  const { eventId, taskId } = useParams<{ eventId: string; taskId: string }>();
  return <TaskDetail key={eventId + taskId} eventId={eventId} taskId={taskId} />;
}

function TaskDetail({ eventId, taskId }: { eventId: string; taskId: string }) {
  const { viewAs, previewInvalid } = useAuth();
  const readOnly = useServiceReadOnly('tasks');
  const { locale, formatDate, formatTime } = usePreferences();
  const cs = locale === 'cs';
  const [task, setTask] = useState<OperationalTaskDetail | null>(null);
  const [error, setError] = useState('');
  const [revision, reload] = useState(0);
  const [action, setAction] = useState<TaskAction | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [unit, setUnit] = useState('');
  const [person, setPerson] = useState('');
  const [choices, setChoices] = useState<{ units: {id: string; name: string}[]; members: MembershipResponse[] } | null>(null);
  const root = '/events/' + eventId;
  const timestamp = (value: string) => formatDate(value) + ' · ' + formatTime(value);

  useEffect(() => {
    let current = true;
    setError('');
    void apiClient.getTask(eventId, taskId).then(res => {
      if (!current) return;
      if (res.ok && res.data) setTask(res.data);
      else { setTask(null); setError(res.error || 'Unable to load task'); }
    }).catch(err => { if (current) setError(String(err)); });
    return () => { current = false; };
  }, [eventId, taskId, revision]);

  useEffect(() => {
    if (action !== 'assign') return;
    let current = true;
    setChoices(null);
    void Promise.all([apiClient.getUnits(eventId), apiClient.getMemberships(eventId)]).then(([units, members]) => {
      if (!current) return;
      if (units.ok && units.data && members.ok && members.data) {
        setChoices({ units: units.data, members: members.data.filter(m => m.status === 'ACTIVE' && m.user?.status === 'ACTIVE') });
      } else setActionError(units.error || members.error || 'Unable to load team members');
    }).catch(err => { if (current) setActionError(String(err)); });
    return () => { current = false; };
  }, [action, eventId]);

  async function apply(selected: TaskAction) {
    if (!task?.availableActions.includes(selected) || readOnly || viewAs || previewInvalid || busy) return;
    setBusy(true);
    setActionError('');
    const reason = note.trim();
    try {
      const calls = {
        acknowledge: () => apiClient.acknowledgeTask(eventId, taskId),
        start: () => apiClient.startTask(eventId, taskId),
        complete: () => apiClient.completeTask(eventId, taskId, { completionNote: reason || undefined }),
        block: () => apiClient.blockTask(eventId, taskId, { reason }),
        cancel: () => apiClient.cancelTask(eventId, taskId, { reason }),
        reopen: () => apiClient.reopenTask(eventId, taskId, { reason, newStatus: 'OPEN' }),
        assign: () => apiClient.assignTask(eventId, taskId, { assignedUnitId: unit || null, assignedUserId: person || null }),
      };
      const res = await calls[selected]();
      if (!res.ok || !res.data) throw new Error(res.error || 'Unable to update task');
      setTask(res.data);
      setAction(null);
      setNote('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
      reload(value => value + 1);
    } finally { setBusy(false); }
  }

  const actionLabel = (key: TaskAction) => key === 'start' && task?.status === 'BLOCKED'
    ? (cs ? 'Pokračovat v práci' : 'Resume work') : labels[key][cs ? 0 : 1];
  function choose(key: TaskAction) {
    setActionError('');
    setNote('');
    if (key === 'start' || key === 'acknowledge') { void apply(key); return; }
    setUnit(task?.assignedUnitId || '');
    setPerson(task?.assignedUserId || '');
    setAction(key);
  }
  const allowed = readOnly || viewAs || previewInvalid ? [] : task?.availableActions ?? [];
  const source = task?.sourceResource;
  return <AppShell title={task?.taskNumber || (cs ? 'Úkol' : 'Task')} breadcrumbs={[{ label: cs ? 'Moje práce' : 'My work', href: root + '/my-work' }]}>
    <article className="task-record">
      <Link href={root + '/my-work'}>← {cs ? 'Moje práce' : 'My work'}</Link>
      {error ? <ErrorState message={error} onRetry={() => reload(n => n + 1)} /> : !task ? <LoadingState /> : <>
        <header><div className="task-badges"><StatusBadge status={task.status} /><PriorityBadge priority={task.priority} /></div><h1>{task.title}</h1></header>
        {task.description && <p className="task-note">{task.description}</p>}
        <dl><dt>{cs ? 'Řešitel' : 'Assignee'}</dt><dd>{task.assignedUserDisplayName || '—'}</dd>
          <dt>{cs ? 'Přidělený tým' : 'Assigned team'}</dt><dd>{task.assignedUnitName || '—'}</dd>
          {task.owningUnitName && <><dt>{cs ? 'Zadávající tým' : 'Owning unit'}</dt><dd>{task.owningUnitName}</dd></>}
          {task.dueAt && <><dt>{cs ? 'Termín' : 'Due'}</dt><dd>{timestamp(task.dueAt)}</dd></>}
          {source && resourceRoutes[source.resourceType] && <><dt>{cs ? 'Související záznam' : 'Source record'}</dt><dd><Link href={root + '/' + resourceRoutes[source.resourceType] + '/' + source.id}>{source.title || source.identifier || (cs ? 'Otevřít záznam' : 'Open record')}</Link></dd></>}
        </dl>
        {task.blockedReason && <section><strong>{task.status === 'CANCELLED' ? (cs ? 'Důvod zrušení' : 'Cancellation reason') : (cs ? 'Překážka' : 'Block reason')}</strong><p className="task-note">{task.blockedReason}</p></section>}
        {task.completionNote && <section><strong>{cs ? 'Výsledek' : 'Completion note'}</strong><p className="task-note">{task.completionNote}</p></section>}
        {actionError && <p role="alert" className="error-text">{actionError}</p>}
        {action && allowed.includes(action) ? <form onSubmit={e => { e.preventDefault(); void apply(action); }}>
          <strong>{actionLabel(action)}</strong>
          {action === 'assign' ? <>
            <label>{cs ? 'Tým' : 'Team'}<select disabled={!choices || busy} value={unit} onChange={e => { setUnit(e.target.value); setPerson(''); }}><option value="">—</option>{choices?.units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
            <label>{cs ? 'Řešitel' : 'Assignee'}<select disabled={!choices || busy} value={person} onChange={e => setPerson(e.target.value)}><option value="">—</option>{choices?.members.filter(m => !unit || m.units.some(u => u.id === unit)).map(m => <option key={m.id} value={m.userId}>{m.user?.displayName || m.user?.email}</option>)}</select></label>
          </> : <label>{action === 'complete' ? (cs ? 'Výsledek práce (nepovinné)' : 'Completion note (optional)') : (cs ? 'Důvod' : 'Reason')}<textarea required={action !== 'complete'} maxLength={action === 'complete' ? 5000 : 2000} value={note} onChange={e => setNote(e.target.value)} /></label>}
          <div className="task-controls"><button className="btn btn-primary" disabled={busy || (action === 'assign' ? !choices : action !== 'complete' && !note.trim())}>{cs ? 'Potvrdit' : 'Confirm'}</button><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setAction(null)}>{cs ? 'Zpět' : 'Back'}</button></div>
        </form> : <div className="task-controls">{allowed.map(key => <button key={key} disabled={busy} className="btn btn-secondary" onClick={() => choose(key)}>{actionLabel(key)}</button>)}</div>}
        <details><summary>{cs ? 'Průběh úkolu' : 'Task history'}</summary><dl>
          {([[cs ? 'Vytvořeno' : 'Created', task.createdAt], [cs ? 'Převzato' : 'Acknowledged', task.acknowledgedAt], [cs ? 'Zahájeno' : 'Started', task.startedAt], [cs ? 'Dokončeno' : 'Completed', task.completedAt]] as const).map(([label, date]) => date && <div className="task-time" key={label}><dt>{label}</dt><dd>{timestamp(date)}</dd></div>)}
        </dl></details>
      </>}
    </article>
  </AppShell>;
}

'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { CreateScenarioInjectInput, ScenarioControlRunSheet, ScenarioInjectResponse } from '@cyris/contracts';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api-client';
import { ScenarioDialog } from './ScenarioDialog';
import { audience, localInput, term, type Translate } from './run-sheet';
import styles from './scenario.module.css';

type Option = { id: string; name: string };
type DesignerProps = {
  eventId: string; sheet: ScenarioControlRunSheet; inject?: ScenarioInjectResponse; tr: Translate;
  onClose: () => void; onSaved: (record: ScenarioInjectResponse) => void;
};

export function InjectDesigner({ eventId, sheet, inject, tr, onClose, onSaved }: DesignerProps) {
  const { isPlatformAdmin, hasPermission } = useAuth();
  const target = inject?.targets[0];
  const condition = inject?.conditions[0];
  const canSetUnit = hasPermission('unit.read', eventId);
  const canSetUser = hasPermission('membership.read', eventId);
  const canSetTask = hasPermission('task.read', eventId);
  const [title, setTitle] = useState(inject?.title ?? '');
  const [summary, setSummary] = useState(inject?.controllerSummary ?? '');
  const [notes, setNotes] = useState(inject?.controllerNotes ?? '');
  const [phase, setPhase] = useState(inject ? inject.phaseId ?? '' : sheet.activePhase?.id ?? sheet.phases.find(p => p.status === 'PLANNED')?.id ?? '');
  const [priority, setPriority] = useState(inject?.priority ?? 'NORMAL');
  const [participantTitle, setParticipantTitle] = useState(inject?.participantTitle ?? '');
  const [body, setBody] = useState(inject?.participantContent ?? '');
  const [ack, setAck] = useState(inject?.requiresAcknowledgement ?? false);
  const [audienceType, setAudienceType] = useState(target?.targetType ?? (inject&&inject.status!=='DRAFT' ? 'EVENT' : ''));
  const [unit, setUnit] = useState(target?.targetUnitId ?? '');
  const [user, setUser] = useState(target?.targetUserId ?? '');
  const [trigger, setTrigger] = useState(inject?.triggerType ?? 'MANUAL');
  const [policy, setPolicy] = useState(inject?.releasePolicy ?? 'MANUAL_CONFIRMATION');
  const [scheduled, setScheduled] = useState(localInput(inject?.scheduledAt));
  const [conditionType, setConditionType] = useState(condition?.conditionType ?? '');
  const [reference, setReference] = useState(condition?.targetResourceId ?? '');
  const [status, setStatus] = useState(condition?.targetStatus ?? '');
  const [dependencyIds, setDependencyIds] = useState(inject?.dependencies.map(d => d.dependsOnInjectId) ?? []);
  const [effect, setEffect] = useState(inject?.actions.some(a => a.actionType === 'CREATE_INCIDENT') ?? false);
  const [units, setUnits] = useState<Option[]>([]);
  const [members, setMembers] = useState<Option[]>([]);
  const [tasks, setTasks] = useState<Option[]>([]);
  const [objectives, setObjectives] = useState<Option[]>([]);
  const [directoryError, setDirectoryError] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const multiTarget = (inject?.targets.length ?? 0) > 1;
  const complexCondition = Boolean(inject && (inject.conditions.length > 1 || condition &&
    (!['RECOVERY_OBJECTIVE_STATUS', 'TASK_STATUS'].includes(condition.conditionType) || !condition.targetResourceId || condition.targetIdentifier || condition.activityType || condition.expectedValue)));
  const customActions = Boolean(inject && (inject.actions.length > 1 || inject.actions.some(a =>
    a.actionType !== 'CREATE_INCIDENT' || a.resourceId || a.targetType !== 'EVENT' || Object.keys(a.parameters ?? {}).some(key => key !== 'priority'))));
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    let active = true;
    const failed = () => { if (active) setDirectoryError(true); };
    if (canSetUnit && !multiTarget && audienceType === 'UNIT') {
      void apiClient.getUnits(eventId).then(res => {
        if (active && res.ok && res.data) setUnits(res.data.filter(u => !u.archivedAt).map(u => ({ id: u.id, name: u.name })));
        else if (!res.ok) failed();
      });
    }
    if (canSetUser && !multiTarget && audienceType === 'USER') {
      void apiClient.getMemberships(eventId).then(res => {
        if (active && res.ok && res.data) setMembers(res.data.filter(m => m.status === 'ACTIVE' && m.user?.status === 'ACTIVE')
          .map(m => ({ id: m.userId, name: m.user!.displayName })));
        else if (!res.ok) failed();
      });
    }
    if (canSetTask && !complexCondition && conditionType === 'TASK_STATUS') {
      void (async () => {
        const options: Option[] = [];
        for (let page = 1; active; page++) {
          const res = await apiClient.listTasks(eventId, { page, limit: 100 });
          if (!res.ok || !res.data) { failed(); return; }
          options.push(...res.data.map(task => ({ id: task.id, name: task.taskNumber + ' · ' + task.title })));
          if (res.data.length < 100) break;
        }
        if (active) setTasks(options);
      })();
    }
    if (isPlatformAdmin && !complexCondition && conditionType === 'RECOVERY_OBJECTIVE_STATUS') {
      void apiClient.listRecoveryObjectives(eventId).then(res => {
        if (active && res.ok && res.data) setObjectives(res.data.map(item => ({ id: item.id, name: item.title })));
        else if (!res.ok) failed();
      });
    }
    return () => { active = false; };
  }, [eventId, canSetUnit, canSetUser, canSetTask, isPlatformAdmin, audienceType, conditionType, multiTarget, complexCondition]);

  const close = () => { if (!busy) onClose(); };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!title.trim() || !summary.trim()) {
      setError(tr('Vyplňte interní název a záměr vstupu.', 'Enter the internal title and purpose.')); return;
    }
    if(!multiTarget&&!audienceType){setError(tr('Vyberte příjemce briefingu.','Select the briefing audience.'));return;}
    if (trigger === 'CONDITION' && !complexCondition && !conditionType) {
      setError(tr('Pro tento způsob spuštění vyberte podmínku.', 'Select a condition for this trigger.')); return;
    }
    const asTrigger = trigger as CreateScenarioInjectInput['triggerType'];
    const asPolicy = policy as CreateScenarioInjectInput['releasePolicy'];
    const payload: CreateScenarioInjectInput = {
      title: title.trim(), controllerSummary: summary.trim(), controllerNotes: notes.trim() || null,
      phaseId: phase || null, priority: priority as CreateScenarioInjectInput['priority'],
      participantTitle: participantTitle.trim() || null, participantContent: body.trim() || null, requiresAcknowledgement: ack,
      triggerType: asTrigger, releasePolicy: asPolicy,
      scheduledAt: scheduled === localInput(inject?.scheduledAt) ? inject?.scheduledAt ?? null : scheduled ? new Date(scheduled).toISOString() : null,
      dependencies: dependencyIds,
    };
    if (!multiTarget) {
      payload.targets = audienceType === 'USER' ? [{ targetType: 'USER', targetUserId: user }]
        : audienceType === 'UNIT' ? [{ targetType: 'UNIT', targetUnitId: unit }] : [{ targetType: 'EVENT' }];
    }
    if (!complexCondition) {
      payload.conditions = conditionType ? [{ conditionType: conditionType as 'TASK_STATUS' | 'RECOVERY_OBJECTIVE_STATUS',
        targetResourceId: reference, targetStatus: status }] : [];
    }
    if (!customActions) {
      payload.actions = effect ? [{ actionType: 'CREATE_INCIDENT', targetType: 'EVENT',
        parameters: { priority: priority === 'NORMAL' ? 'MEDIUM' : priority } }] : [];
    }
    setError(''); setBusy(true);
    const res = inject ? await apiClient.updateScenarioInject(eventId, inject.id, payload) : await apiClient.createScenarioInject(eventId, payload);
    setBusy(false);
    if (res.ok && res.data) onSaved(res.data);
    else setError(res.error || tr('Vstup se nepodařilo uložit.', 'Could not save the inject.'));
  };
  const typeChoices = ['MANUAL', 'SCHEDULED_TIME', 'CONDITION'];
  if (trigger === 'EXTERNAL') typeChoices.push('EXTERNAL');
  const refOptions = conditionType === 'RECOVERY_OBJECTIVE_STATUS' ? objectives : tasks;
  const options = (values: Option[], current: string, fallback?: string | null) => <>
    <option value="">{tr('Vyberte…', 'Select…')}</option>
    {current && !values.some(item => item.id === current) && <option value={current}>{fallback || current}</option>}
    {values.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
  </>;

  return (
    <ScenarioDialog title={inject ? tr('Upravit vstup', 'Edit inject') + ' · ' + inject.injectNumber : tr('Nový scénářový vstup', 'New scenario inject')}
      onClose={close} closeLabel={tr('Zavřít', 'Close')}>
      <form className={styles.form} onSubmit={save}>
        <fieldset><legend>{tr('Plán pro režii', 'Controller plan')}</legend>
          <label>{tr('Interní název', 'Internal title')}<input required maxLength={255} value={title} onChange={e => setTitle(e.target.value)} /></label>
          <label>{tr('Záměr vstupu', 'Purpose of this inject')}<textarea required value={summary} onChange={e => setSummary(e.target.value)} /></label>
          <div className={styles.fields}>
            <label>{tr('Fáze', 'Phase')}<select value={phase} onChange={e => setPhase(e.target.value)}>
              <option value="">{tr('Bez fáze', 'No phase')}</option>
              {sheet.phases.map(p => <option key={p.id} value={p.id}>{p.code} · {p.title}</option>)}
            </select></label>
            <label>{tr('Priorita', 'Priority')}<select value={priority} onChange={e => setPriority(e.target.value)}>
              {['LOW','NORMAL','HIGH','CRITICAL'].map(p => <option key={p} value={p}>{term(p,tr)}</option>)}
            </select></label>
          </div>
          <label>{tr('Poznámky pro režii', 'Controller notes')}<textarea value={notes} onChange={e => setNotes(e.target.value)} /></label>
        </fieldset>
        <fieldset><legend>{tr('Briefing pro účastníky', 'Participant briefing')}</legend>
          <label>{tr('Titulek briefingu', 'Briefing title')}<input maxLength={255} value={participantTitle} onChange={e => setParticipantTitle(e.target.value)} /></label>
          <p className={styles.help}>{tr('Bez titulku účastníci uvidí „Briefing“ a číslo vstupu.', 'A blank title displays “Briefing” and the inject number.')}</p>
          <label>{tr('Zpráva pro příjemce', 'Message for recipients')}<textarea value={body} onChange={e => setBody(e.target.value)} /></label>
          {multiTarget ? <p>{tr('Stávající příjemci', 'Existing recipients')} · {audience(inject!, tr)}</p> : <div className={styles.fields}>
            <label>{tr('Komu zprávu doručit', 'Send the briefing to')}<select required value={audienceType} onChange={e => setAudienceType(e.target.value)}>
              <option value="">{tr('Vyberte příjemce…', 'Choose an audience…')}</option>
              {(canSetUnit || audienceType === 'UNIT') && <option value="UNIT">{term('UNIT', tr)}</option>}
              {(canSetUser || audienceType === 'USER') && <option value="USER">{term('USER', tr)}</option>}
              <option value="EVENT">{term('EVENT', tr)}</option>
            </select></label>
            {audienceType === 'UNIT' && <label>{term('UNIT', tr)}<select required value={unit} onChange={e => setUnit(e.target.value)}>{options(units, unit, target?.unitName)}</select></label>}
            {audienceType === 'USER' && <label>{term('USER', tr)}<select required value={user} onChange={e => setUser(e.target.value)}>{options(members, user, target?.userFullName)}</select></label>}
          </div>}
          <label className={styles.check}><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />{tr('Vyžádat potvrzení přijetí', 'Request acknowledgement')}</label>
        </fieldset>
        <fieldset><legend>{tr('Kdy vstup vydat', 'When to release')}</legend>
          <div className={styles.fields}>
            <label>{tr('Způsob spuštění', 'Trigger')}<select value={trigger} onChange={e => {
              setTrigger(e.target.value);
              if (e.target.value === 'MANUAL') setPolicy('MANUAL_CONFIRMATION');
              if (e.target.value !== 'SCHEDULED_TIME') setScheduled('');
            }}>{typeChoices.map(p => <option key={p} value={p}>{term(p, tr)}</option>)}</select></label>
            <label>{tr('Vydání', 'Release policy')}<select disabled={trigger === 'MANUAL' || trigger === 'EXTERNAL'} value={policy} onChange={e => setPolicy(e.target.value)}>
              {['MANUAL_CONFIRMATION','AUTO_RELEASE'].map(p => <option key={p} value={p}>{term(p,tr)}</option>)}
            </select></label>
          </div>
          {(trigger === 'SCHEDULED_TIME' || scheduled) && <label>{tr('Plánovaný scénářový čas', 'Scheduled scenario time')} ({browserZone})
            <input required={trigger === 'SCHEDULED_TIME'} type="datetime-local" value={scheduled} onChange={e => setScheduled(e.target.value)} /></label>}
          <p className={styles.help}>{policy === 'AUTO_RELEASE' && (trigger === 'CONDITION' || trigger === 'SCHEDULED_TIME')
            ? tr('V přípravě nebo v aktivním cvičení může systém vydat splněný vstup ihned po uložení, pokud scénářové hodiny běží.', 'In preparation or an active exercise, an eligible inject can be released as soon as you save while the scenario clock is running.')
            : tr('Po splnění podmínek vydání potvrdí oprávněný člen režie.', 'An authorized controller confirms release when requirements are met.')}</p>
          {complexCondition ? <p className={styles.help}>{tr('Tento vstup používá rozšířené podmínky. Uložením ostatních polí se jejich nastavení zachová.', 'This inject uses advanced conditions. Saving the other fields preserves them.')}</p> : <>
            <label>{tr('Podmínka', 'Condition')}<select required={trigger === 'CONDITION'} value={conditionType} onChange={e => { setConditionType(e.target.value); setReference(''); setStatus(''); }}>
              <option value="">{tr('Bez podmínky', 'No condition')}</option>
              {(canSetTask || conditionType === 'TASK_STATUS') && <option value="TASK_STATUS">{term('TASK_STATUS',tr)}</option>}
              {isPlatformAdmin && <option value="RECOVERY_OBJECTIVE_STATUS">{term('RECOVERY_OBJECTIVE_STATUS',tr)}</option>}
            </select></label>
            {conditionType && <div className={styles.fields}>
              <label>{tr('Sledovaný záznam', 'Record to check')}<select required value={reference} onChange={e => setReference(e.target.value)}>{options(refOptions, reference)}</select></label>
              <label>{tr('Požadovaný stav', 'Required status')}<select required value={status} onChange={e => setStatus(e.target.value)}>
                <option value="">{tr('Vyberte…','Select…')}</option>
                {(conditionType === 'TASK_STATUS' ? ['OPEN','ACKNOWLEDGED','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED'] : ['DRAFT','PUBLISHED','APPROVED','REJECTED','RESTORED']).map(s => <option key={s} value={s}>{term(s,tr)}</option>)}
              </select></label>
            </div>}
          </>}
          {sheet.injects.some(i => i.id !== inject?.id && i.status !== 'CANCELLED') || dependencyIds.length > 0 ? <label>{tr('Nejdříve vydat tyto vstupy', 'Release these injects first')}
            <select multiple value={dependencyIds} onChange={e => setDependencyIds(Array.from(e.target.selectedOptions, o => o.value))}>
              {sheet.injects.filter(i => i.id !== inject?.id && (i.status !== 'CANCELLED' || dependencyIds.includes(i.id))).map(i => <option key={i.id} value={i.id}>{i.injectNumber} · {i.title}</option>)}
            </select>
          </label> : null}
          {customActions ? <p className={styles.help}>{tr('Nastavené akce při vydání', 'Configured release actions')} · {inject!.actions.map(a => term(a.actionType,tr)).join(', ')}</p> :
            <label className={styles.check}><input type="checkbox" checked={effect} onChange={e => setEffect(e.target.checked)} />{tr('Při vydání vytvořit incident viditelný pro celé cvičení', 'On release, create an incident visible to the whole exercise')}</label>}
        </fieldset>
        {directoryError && <p role="status" className={styles.error}>{tr('Některé možnosti se nepodařilo načíst. Zavřete a znovu otevřete formulář pro další pokus.', 'Some choices could not be loaded. Close and reopen the form to retry.')}</p>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <footer><button type="button" className="btn btn-secondary" disabled={busy} onClick={close}>{tr('Zrušit', 'Cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? tr('Ukládám…', 'Saving…') : tr('Uložit vstup', 'Save inject')}</button></footer>
      </form>
    </ScenarioDialog>
  );
}

'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { FileSearch, Plus, RefreshCw } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { ResourcePicker } from '@/components/common/ResourcePicker';
import type { CourtRequestItem, CreateCourtRequest, UnitResponse } from '@cyris/contracts';
import styles from './CourtRequestsPanel.module.css';

const kinds: CreateCourtRequest['kind'][] = ['EVIDENCE','DOCUMENT','FORENSIC_REPORT',
  'LAB_REPORT','MEDICAL_REPORT','EXPERT_OPINION','OTHER'];

export function CourtRequestsPanel({ eventId, courtCaseId }: { eventId: string; courtCaseId: string }) {
  const { hasPermission, viewAs } = useAuth();
  const { locale, formatTime } = usePreferences();
  const cs = locale === 'cs';
  const tr = (cz: string, en: string) => cs ? cz : en;
  const mayCreate = !viewAs && hasPermission('court.request.create');
  const mayRespond = !viewAs && hasPermission('court.request.respond');
  const [requests, setRequests] = useState<CourtRequestItem[]>([]);
  const [units, setUnits] = useState<UnitResponse[]>([]);
  const [kind, setKind] = useState<CreateCourtRequest['kind']>('EVIDENCE');
  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');
  const [unitId, setUnitId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [activeReply, setActiveReply] = useState<string | null>(null);
  const [replyStatus, setReplyStatus] = useState<'IN_PROGRESS'|'FULFILLED'|'DECLINED'>('FULFILLED');
  const [replyText, setReplyText] = useState('');
  const [linkedId, setLinkedId] = useState('');
  const [linkedType, setLinkedType] = useState<'document'|'evidence'>('document');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([apiClient.listCourtRequests(eventId, courtCaseId), apiClient.getUnits(eventId)])
      .then(([items, teams]) => {
        if (!active) return;
        if (!items.ok) throw new Error(items.error || 'Could not load legal requests');
        setRequests(items.data ?? []);
        if (teams.ok && teams.data) setUnits(teams.data);
        setError('');
      }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Error'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [eventId, courtCaseId, refresh]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (busy || !mayCreate) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await apiClient.createCourtRequest(eventId, courtCaseId, {
        kind, subject: subject.trim(), details: details.trim(),
        requestedFromUnitId: unitId || undefined,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      });
      if (!result.ok) throw new Error(result.error || 'Request failed');
      setSubject(''); setDetails(''); setUnitId(''); setDueAt('');
      setNotice(tr('Žádost byla odeslána.','Request filed.'));
      setRefresh(x=>x+1);
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setBusy(false); }
  }
  async function respond(request: CourtRequestItem) {
    if (busy || !mayRespond) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await apiClient.replyCourtRequest(eventId, courtCaseId, request.id, {
        expectedRevision: request.revision, status: replyStatus, response: replyText.trim(),
        linkedResourceId: linkedId || undefined,
      });
      if (!result.ok) throw new Error(result.error || 'Reply failed');
      setActiveReply(null); setReplyText(''); setLinkedId('');
      setNotice(tr('Odpověď byla zaznamenána do spisu.','Response recorded in the legal matter.'));
      setRefresh(x=>x+1);
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setBusy(false); }
  }
  return <section className={styles.workspace} aria-label={tr('Žádosti o podklady pro soud', 'Court disclosure requests')}>
    <header className={styles.header}>
      <div><h2><FileSearch size={19} aria-hidden/> {tr('Žádosti o důkazy, zprávy a posudky','Evidence, reports and expert requests')}</h2>
        <p>{tr('Formální komunikace mezi státním zástupcem, soudem a odbornými týmy v rámci cvičení.',
          'Formal requests between prosecution, the court and specialist exercise teams.')}</p></div>
      <button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>setRefresh(n=>n+1)}>
        <RefreshCw size={15} aria-hidden/> {tr('Obnovit','Refresh')}</button>
    </header>
    {mayCreate && <form className={styles.form} onSubmit={e=>void create(e)}>
      <h3><Plus size={16} aria-hidden/> {tr('Nová žádost','New formal request')}</h3>
      <div className={styles.fields}>
        <label>{tr('Požadovaný podklad','Requested material')}<select value={kind}
          onChange={e=>setKind(e.target.value as CreateCourtRequest['kind'])}>
          {kinds.map(value=><option value={value} key={value}>{value.replaceAll('_',' ')}</option>)}
        </select></label>
        <label>{tr('Adresovaný tým','Receiving team')}<select value={unitId} onChange={e=>setUnitId(e.target.value)}>
          <option value="">{tr('Všechny oprávněné týmy','All eligible teams')}</option>
          {units.filter(x=>!x.archivedAt).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
        </select></label>
        <label className={styles.wide}>{tr('Předmět','Subject')}<input required minLength={4} maxLength={255}
          value={subject} onChange={e=>setSubject(e.target.value)}
          placeholder={tr('Např. Žádost o znalecký posudek k zajištěnému zařízení','e.g. Expert opinion on seized device')}/></label>
        <label className={styles.wide}>{tr('Zadání a požadovaný rozsah','Instructions and scope')}<textarea
          required minLength={10} maxLength={5000} rows={3} value={details} onChange={e=>setDetails(e.target.value)}/></label>
        <label>{tr('Termín (volitelně)','Deadline (optional)')}<input type="datetime-local" value={dueAt}
          onChange={e=>setDueAt(e.target.value)}/></label>
      </div>
      <button className="btn btn-primary" disabled={busy || subject.trim().length<4 || details.trim().length<10}>
        {busy?tr('Odesílám…','Sending…'):tr('Odeslat žádost','File request')}</button>
    </form>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.note} role="status">{notice}</p>}
    {loading ? <p>{tr('Načítám žádosti…','Loading requests…')}</p> : requests.length===0
      ? <p className={styles.note}>{tr('Zatím zde nejsou žádné žádosti.','No requests in this matter yet.')}</p>
      : <div className={styles.requests}>{requests.map(req=><article className={styles.request} key={req.id}>
        <div className={styles.row}><div><strong>{req.subject}</strong>
          <p className={styles.sub}>{req.kind.replaceAll('_',' ')} · {formatTime(req.createdAt)}</p></div>
          <span className={styles.status}>{req.status}</span></div>
        <p className={styles.description}>{req.details}</p>
        {req.dueAt&&<p className={styles.sub}>{tr('Termín','Due')}: {formatTime(req.dueAt)}</p>}
        {req.response&&<div className={styles.response}><strong>{tr('Odpověď','Response')}</strong>
          <p>{req.response}</p>
          {req.linkedResourceId&&<small>{tr('Připojený záznam','Linked record')}: {req.linkedResourceId}</small>}
        </div>}
        {req.history.length > 0 && <details className={styles.response}>
          <summary style={{cursor:'pointer',fontWeight:650}}>
            {tr('Historie vyjádření','Response history')} ({req.history.length})
          </summary>
          <ol style={{listStyle:'decimal',paddingLeft:20,display:'grid',gap:12,marginTop:10}}>
            {req.history.map(update=><li key={update.id} style={{overflowWrap:'anywhere'}}>
              <strong>{update.status.replaceAll('_',' ')} · {formatTime(update.createdAt)}</strong>
              <p style={{whiteSpace:'pre-wrap'}}>{update.response}</p>
              {update.linkedResourceId&&<small>
                {tr('Připojený záznam','Linked record')}: {update.linkedResourceId}
              </small>}
            </li>)}
          </ol>
        </details>}
        {mayRespond&&['OPEN','IN_PROGRESS'].includes(req.status) && (activeReply===req.id
          ? <form className={styles.form} onSubmit={e=>{e.preventDefault();void respond(req)}}>
            <label>{tr('Vyřízení','Disposition')}<select value={replyStatus} onChange={e=>setReplyStatus(e.target.value as typeof replyStatus)}>
              <option value="IN_PROGRESS">{tr('Pracuji na tom','In progress')}</option>
              <option value="FULFILLED">{tr('Podklady dodány','Fulfilled')}</option>
              <option value="DECLINED">{tr('Odmítnuto s odůvodněním','Declined with reason')}</option>
            </select></label>
            <label>{tr('Odpověď / posudek','Response / expert statement')}<textarea required minLength={5}
              rows={4} maxLength={8000} value={replyText} onChange={e=>setReplyText(e.target.value)}/></label>
            <label>{tr('Druh přílohy (volitelně)','Record type (optional)')}
              <select value={linkedType} onChange={e=>{setLinkedType(e.target.value as typeof linkedType);setLinkedId('')}}>
                <option value="document">{tr('Dokument / zpráva','Document / report')}</option>
                <option value="evidence">{tr('Důkaz','Evidence')}</option>
              </select>
            </label>
            <ResourcePicker eventId={eventId} value={linkedId} onChange={setLinkedId}
              label={tr('Připojit již existující záznam','Attach an existing record')} types={linkedType}/>
            <div className={styles.actions}>
              <button type="button" className="btn btn-secondary" onClick={()=>setActiveReply(null)}>{tr('Zrušit','Cancel')}</button>
              <button className="btn btn-primary" disabled={busy || replyText.trim().length<5}>{tr('Zapsat odpověď','Submit response')}</button>
            </div>
          </form>
          : <button type="button" className="btn btn-secondary" onClick={()=>{
              setActiveReply(req.id);setReplyText('');setLinkedId('');setReplyStatus('FULFILLED');
            }}>{tr('Vyřídit žádost','Respond')}</button>)}
      </article>)}</div>}
  </section>;
}

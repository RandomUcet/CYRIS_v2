'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { apiClient } from '@/lib/api-client';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useAuth } from '@/contexts/AuthContext';
import { FileText, RefreshCw } from 'lucide-react';
import { legalRequestQueue,legalRequestCounts,requestOverdue } from '@/lib/legal-request-queue';
import type { CourtRequestItem } from '@cyris/contracts';

export default function LegalRequestInboxPage() {
  const params=useParams(),eventId=params.eventId as string;
  const {currentUser,viewAs}=useAuth();
  return <LegalRequestInbox key={[eventId,currentUser?.user.id??'',viewAs?.id??''].join(':')} eventId={eventId}/>;
}
function LegalRequestInbox({eventId}:{eventId:string}) {
  const {locale,formatTime,formatDate}=usePreferences();
  const cs=locale==='cs', tr=(c:string,e:string)=>cs?c:e;
  const labels:Record<string,[string,string]>={"ALL":["Všechny","All"],"PENDING":["Nevyřízené","Pending"],"OPEN":["Otevřeno","Open"],"IN_PROGRESS":["V řešení","In progress"],"FULFILLED":["Vyřízeno","Fulfilled"],"DECLINED":["Odmítnuto","Declined"],"CANCELLED":["Zrušeno","Cancelled"],"EVIDENCE":["Důkaz","Evidence"],"DOCUMENT":["Dokument","Document"],"FORENSIC_REPORT":["Forenzní zpráva","Forensic report"],"LAB_REPORT":["Laboratorní zpráva","Lab report"],"MEDICAL_REPORT":["Lékařská zpráva","Medical report"],"EXPERT_OPINION":["Znalecký posudek","Expert opinion"],"OTHER":["Ostatní","Other"]};
  const display=(value:string)=>labels[value]?.[cs?0:1]??value;
  const [requests,setRequests]=useState<CourtRequestItem[]>([]);
  const [loading,setLoading]=useState(true),[error,setError]=useState('');
  const [status,setStatus]=useState('ALL'),[query,setQuery]=useState('');
  const [refresh,setRefresh]=useState(0);
  const [kind,setKind]=useState('ALL'),[deadline,setDeadline]=useState('ALL');
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),60000);return()=>window.clearInterval(timer);},[]);
  useEffect(()=>{
    let active=true;
    const controller=new AbortController();
    setLoading(true);setError('');
    void apiClient.listLegalRequests(eventId,controller.signal).then(res=>{
      if(!active)return;
      if(!res.ok)throw new Error(res.error||'Unable to load legal requests');
      setRequests((res.data??[]).filter(row=>row.eventId===eventId));setError('');setNow(Date.now());
    }).catch(e=>{if(active&&!controller.signal.aborted){setRequests([]);setError(e instanceof Error?e.message:'Error');}})
      .finally(()=>{if(active)setLoading(false)});
    return ()=>{active=false;controller.abort();};
  },[eventId,refresh]);
  const visible=useMemo(()=>legalRequestQueue(requests,{status,kind,query,deadline},now),[requests,status,kind,query,deadline,now]);
  const counts=legalRequestCounts(requests,now);
  return <AppShell title={tr('Právní spolupráce','Legal collaboration')} breadcrumbs={[{label:tr('Cvičení','Exercise'),href:'/events/'+eventId+'/overview'},
    {label:tr('Právní spolupráce','Legal collaboration')}]}>
    <div className="legal-inbox-workspace">
      <header style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap',justifyContent:'space-between'}}>
        <div>
          <h1 style={{display:'flex',gap:9,alignItems:'center'}}><FileText size={22}/>
            {tr('Žádosti státního zástupce a soudu','Prosecution and court requests')}</h1>
          <p>{tr('Důkazy, posudky, zprávy a dokumenty napříč soudními spisy.',
          'Evidence, expert opinions, reports and documents across judicial cases.')}</p>
        </div>
        <button type="button" className="btn btn-secondary" disabled={loading}
          onClick={()=>setRefresh(x=>x+1)}><RefreshCw size={15}/> {tr('Obnovit','Refresh')}</button>
      </header>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'16px 0'}}>
        {[[tr('Všechny','All'),counts.total,'ALL'],[tr('Nevyřízené','Pending'),counts.pending,'PENDING'],[tr('Po termínu','Overdue'),counts.overdue,'OVERDUE'],[tr('Vyřízené','Fulfilled'),counts.fulfilled,'FULFILLED']].map(([label,count,key])=><button type="button" key={key} className="btn btn-secondary" aria-pressed={key==='OVERDUE'?deadline==='OVERDUE':status===key&&deadline==='ALL'} onClick={()=>{setStatus(key==='OVERDUE'?'PENDING':String(key));setDeadline(key==='OVERDUE'?'OVERDUE':'ALL');}}>{label} · {count}</button>)}
      </div>
      <div style={{display:'flex',gap:12,flexWrap:'wrap',margin:'16px 0'}}>
        <label style={{display:'grid',flex:'1 1 220px',gap:5}}>
          {tr('Hledat','Search')}
          <input style={{width:'100%',padding:9,background:'var(--bg-panel)',color:'var(--text-primary)',
            border:'1px solid var(--border-default)',borderRadius:6}} value={query} type="search"
            onChange={e=>setQuery(e.target.value)}
            placeholder={tr('Předmět nebo typ žádosti…','Request subject or type…')}/>
        </label>
        <label style={{display:'grid',gap:5,minWidth:160}}>
          {tr('Stav','Status')}
          <select style={{padding:9,background:'var(--bg-panel)',color:'var(--text-primary)',
            border:'1px solid var(--border-default)',borderRadius:6}} value={status} onChange={e=>setStatus(e.target.value)}>
            {['ALL','PENDING','OPEN','IN_PROGRESS','FULFILLED','DECLINED','CANCELLED'].map(value=>
              <option key={value} value={value}>{display(value)}</option>)}
          </select>
        </label>
        <label style={{display:'grid',gap:5,minWidth:160}}>{tr('Typ podkladu','Material type')}<select className="field-input" value={kind} onChange={e=>setKind(e.target.value)}>{['ALL','EVIDENCE','DOCUMENT','FORENSIC_REPORT','LAB_REPORT','MEDICAL_REPORT','EXPERT_OPINION','OTHER'].map(value=><option key={value} value={value}>{display(value)}</option>)}</select></label>
        <label style={{display:'grid',gap:5,minWidth:140}}>{tr('Termín','Deadline')}<select className="field-input" value={deadline} onChange={e=>setDeadline(e.target.value)}><option value="ALL">{tr('Všechny','All')}</option><option value="OVERDUE">{tr('Po termínu','Overdue')}</option></select></label>
        <button type="button" className="btn btn-secondary" onClick={()=>{setStatus('ALL');setKind('ALL');setDeadline('ALL');setQuery('');}}>{tr('Vymazat filtry','Clear filters')}</button>
      </div>
      {!loading&&!error&&<p role="status">{visible.length} / {counts.total} {tr('žádostí','requests')}</p>}
      {error&&<div role="alert" className="legal-inbox-empty"><strong>{tr('Žádosti se nepodařilo načíst','Unable to load requests')}</strong><p>{error}</p><button type="button" className="btn btn-secondary" onClick={()=>setRefresh(x=>x+1)}>{tr('Zkusit znovu','Try again')}</button></div>}
      {loading?<p role="status">{tr('Načítám…','Loading…')}</p>:error?null:visible.length===0
        ?<div className="legal-inbox-empty"><FileText size={28}/><strong>{tr('Žádné odpovídající žádosti','No matching requests')}</strong><p>{counts.total?tr('Změňte nastavení filtrů.','Adjust your filters.'):tr('Žádosti se zde zobrazí po vytvoření v soudním spisu.','Requests appear here after creation in a judicial case.')}</p></div>
        :<div style={{display:'grid',gap:12}}>{visible.map(req=><article key={req.id}
          style={{padding:15,background:'var(--bg-panel)',border:'1px solid var(--border-default)',
            borderRadius:8,display:'grid',gap:9}}>
          <div style={{display:'flex',gap:12,justifyContent:'space-between',flexWrap:'wrap'}}>
            <strong>{req.subject}</strong>
            <span>{display(req.status)}</span>
          </div>
          <small>{display(req.kind)} · {formatTime(req.createdAt)} · {tr('Revize','Revision')} {req.revision} · {tr('Vyjádření','Replies')}: {req.history.length}</small>
          {req.dueAt&&<p style={{color:requestOverdue(req,now)?'var(--status-danger)':'var(--text-secondary)'}}>{tr('Termín','Due')}: {formatDate(req.dueAt)} · {formatTime(req.dueAt)}{requestOverdue(req,now)?' · '+tr('Po termínu','Overdue'):''}</p>}
          <p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{req.details}</p>
          {req.response&&<p style={{padding:8,borderLeft:'3px solid var(--border-focus)'}}>
            <strong>{tr('Odpověď','Response')}:</strong> {req.response}</p>}
          <Link className="btn btn-secondary" style={{justifySelf:'start'}}
            href={'/events/'+eventId+'/court/'+req.courtCaseId+'?tab=requests'}>
            {tr('Otevřít žádost v soudním spisu','Open in judicial case')}
          </Link>
        </article>)}</div>}
    </div>
  </AppShell>;
}

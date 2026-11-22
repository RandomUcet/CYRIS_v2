'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { apiClient } from '@/lib/api-client';
import { usePreferences } from '@/contexts/PreferencesContext';
import { FileText, RefreshCw } from 'lucide-react';
import type { CourtRequestItem } from '@cyris/contracts';

export default function LegalRequestInboxPage() {
  const params=useParams(),eventId=params.eventId as string;
  const {locale,formatTime}=usePreferences();
  const cs=locale==='cs', tr=(c:string,e:string)=>cs?c:e;
  const [requests,setRequests]=useState<CourtRequestItem[]>([]);
  const [loading,setLoading]=useState(true),[error,setError]=useState('');
  const [status,setStatus]=useState('ALL'),[query,setQuery]=useState('');
  const [refresh,setRefresh]=useState(0);
  useEffect(()=>{
    let active=true;
    setLoading(true);
    void apiClient.listLegalRequests(eventId).then(res=>{
      if(!active)return;
      if(!res.ok)throw new Error(res.error||'Unable to load legal requests');
      setRequests(res.data??[]);setError('');
    }).catch(e=>{if(active)setError(e instanceof Error?e.message:'Error');})
      .finally(()=>{if(active)setLoading(false)});
    return ()=>{active=false};
  },[eventId,refresh]);
  const visible=useMemo(()=>requests.filter(req=>{
    if(status!=='ALL'&&req.status!==status)return false;
    const needle=query.trim().toLocaleLowerCase();
    return !needle||[req.subject,req.details,req.kind,req.response||'']
      .join(' ').toLocaleLowerCase().includes(needle);
  }),[requests,status,query]);
  return <AppShell breadcrumbs={[{label:tr('Cvičení','Exercise'),href:'/events/'+eventId+'/overview'},
    {label:tr('Právní spolupráce','Legal collaboration')}]}>
    <div className="workspace-container" style={{maxWidth:1120,margin:'auto'}}>
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
            {['ALL','OPEN','IN_PROGRESS','FULFILLED','DECLINED','CANCELLED'].map(value=>
              <option key={value} value={value}>{value==='ALL'?tr('Všechny','All'):value.replaceAll('_',' ')}</option>)}
          </select>
        </label>
      </div>
      {error&&<p role="alert">{error}</p>}
      {loading?<p>{tr('Načítám…','Loading…')}</p>:visible.length===0
        ?<p>{tr('Žádné odpovídající žádosti.','No matching requests.')}</p>
        :<div style={{display:'grid',gap:12}}>{visible.map(req=><article key={req.id}
          style={{padding:15,background:'var(--bg-panel)',border:'1px solid var(--border-default)',
            borderRadius:8,display:'grid',gap:9}}>
          <div style={{display:'flex',gap:12,justifyContent:'space-between',flexWrap:'wrap'}}>
            <strong>{req.subject}</strong>
            <span>{req.status.replaceAll('_',' ')}</span>
          </div>
          <small>{req.kind.replaceAll('_',' ')} · {formatTime(req.createdAt)} · {tr('Revize','Revision')} {req.revision}</small>
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

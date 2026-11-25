'use client';
import {useEffect,useState,useRef} from 'react';
import Link from 'next/link';
import type {LabAnalysisResponse} from '@cyris/contracts';
import {apiClient} from '@/lib/api-client';
import {StatusBadge} from '@/components/common/Badges';
export function EvidenceLabRequests({eventId,evidenceId,cs,canRequest}:{eventId:string;evidenceId:string;cs:boolean;canRequest:boolean}){
 const [rows,setRows]=useState<LabAnalysisResponse[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const request=useRef<AbortController|null>(null);
 const tr=(c:string,e:string)=>cs?c:e;
 async function load(){request.current?.abort();const controller=new AbortController();request.current=controller;try{const r=await apiClient.getLabAnalyses(eventId,evidenceId,controller.signal);if(controller.signal.aborted)return;if(!r.ok||!r.data){setRows([]);setError(r.error||tr('Rozbory nedostupné','Requests unavailable'));return;}setRows(r.data);setError('');}catch{if(!controller.signal.aborted){setRows([]);setError(tr('Rozbory nedostupné','Requests unavailable'));}}finally{if(!controller.signal.aborted)setLoading(false);}}
 useEffect(()=>{void load();const timer=window.setInterval(()=>{if(!document.hidden)void load();},10000);return()=>{window.clearInterval(timer);request.current?.abort();};},[eventId,evidenceId]);
 return <section style={{display:'grid',gap:12}}>
 <div style={{display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:8}}><h2 style={{margin:0,fontSize:18}}>{tr('Laboratorní rozbory důkazu','Evidence laboratory requests')}</h2><div style={{display:'flex',gap:8}}><button className="btn btn-secondary" onClick={()=>void load()}>{tr('Obnovit','Refresh')}</button>{canRequest&&<Link className="btn btn-primary" href={`/events/${eventId}/lab?fromEvidence=${evidenceId}`}>{tr('Zadat rozbor','Request analysis')}</Link>}</div></div>
 {loading?<p role="status">{tr('Načítám…','Loading…')}</p>:error?<p role="alert">{error}</p>:!rows.length?<p>{tr('K důkazu zatím nemáte dostupný laboratorní požadavek.','No accessible laboratory request for this evidence yet.')}</p>:rows.map(row=><article key={row.id} style={{border:'1px solid var(--border-default)',padding:12,borderRadius:5,display:'grid',gap:8}}>
 <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}><strong>{row.analysisNumber} · {row.analysisType}</strong><StatusBadge status={row.status}/></div>
 <p style={{margin:0,color:'var(--text-secondary)'}}>{row.unitName??tr('Laboratoř','Laboratory')} · {row.requesterName??tr('Žadatel','Requester')}</p>
 {row.reportAvailable?<p style={{margin:0}}><strong>{tr('Schválený závěr','Approved conclusion')}</strong><br/>{row.conclusion}</p>:<p style={{margin:0,color:'var(--text-muted)'}}>{row.status==='COMPLETED'?tr('Čeká na schválení protokolu','Awaiting report approval'):['REJECTED','CANCELLED'].includes(row.status)?tr('Požadavek uzavřen bez výsledku','Closed without a report'):tr('Výsledek dosud nebyl vydán','Report not released yet')}</p>}
 <div style={{display:'flex',gap:8}}><Link className="btn btn-secondary" href={`/events/${eventId}/lab/${row.id}`}>{tr('Otevřít požadavek','Open request')}</Link>{row.reportAvailable&&<Link className="btn btn-secondary" href={`/events/${eventId}/lab/${row.id}/print`} target="_blank" rel="noopener noreferrer">{tr('Protokol / tisk','Report / print')}</Link>}</div></article>)}
 </section>;
}

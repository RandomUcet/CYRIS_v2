'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useParams} from 'next/navigation';
import {AppShell} from '@/components/layout/AppShell';
import {useAuth} from '@/contexts/AuthContext';
import {usePreferences} from '@/contexts/PreferencesContext';
import {apiClient} from '@/lib/api-client';
import type {ExerciseIntelligenceOverview} from '@cyris/contracts';

export default function PresentationPage(){
 const {eventId}=useParams<{eventId:string}>(),{currentUser,viewAs,hasPermission,loading}=useAuth();
 if(loading)return <AppShell title="CYRIS Intelligence"><p role="status">…</p></AppShell>;
 if(viewAs||!hasPermission('scenario.manage',eventId))return <AppShell title="CYRIS Intelligence"><p role="alert">EXCON only / Pouze organizátoři</p></AppShell>;
 return <Presentation key={JSON.stringify([eventId,currentUser?.user.id])} eventId={eventId}/>;
}
function Presentation({eventId}:{eventId:string}){
 const {locale}=usePreferences(),cs=locale==='cs',tr=(c:string,e:string)=>cs?c:e;
 const [data,setData]=useState<ExerciseIntelligenceOverview|null>(null),[error,setError]=useState(false),[now,setNow]=useState(Date.now),[full,setFull]=useState(false),[fullscreenError,setFullscreenError]=useState(false);
 const root=useRef<HTMLElement|null>(null);
 useEffect(()=>{
  const controller=new AbortController();let inFlight=false;
  async function refresh(){if(inFlight||document.hidden)return;inFlight=true;
   try{const r=await apiClient.getExerciseIntelligence(eventId,controller.signal);
    if(controller.signal.aborted)return;
    if(r.ok&&r.data?.eventId===eventId){setData(r.data);setError(false);}else{setData(null);setError(true);}
   }catch{if(!controller.signal.aborted){setData(null);setError(true);}}finally{inFlight=false;}
  }
  void refresh();const timer=window.setInterval(()=>void refresh(),15000);
  const clock=window.setInterval(()=>setNow(Date.now()),5000);
  const visibility=()=>{if(!document.hidden)void refresh();};document.addEventListener('visibilitychange',visibility);
  const changed=()=>setFull(document.fullscreenElement===root.current);document.addEventListener('fullscreenchange',changed);
  return()=>{controller.abort();window.clearInterval(timer);window.clearInterval(clock);document.removeEventListener('visibilitychange',visibility);document.removeEventListener('fullscreenchange',changed);};
 },[eventId]);
 const stale=!data||!Number.isFinite(Date.parse(data.asOf))||now-Date.parse(data.asOf)>45000||Date.parse(data.asOf)-now>15000;
 const value=data&&!stale?data:null;
 const seconds=(ms:number|null|undefined)=>ms==null?'—':(ms/1000).toLocaleString(cs?'cs-CZ':'en-GB',{maximumFractionDigits:1})+' s';
 const number=(n:number|undefined)=>n===undefined?'—':n.toLocaleString(cs?'cs-CZ':'en-GB');
 const cards=[
  [tr('AI pokusy · 24 h','AI attempts · 24 h'),number(value?.usage.total),tr('Záznamy ukončených pokusů','Recorded completed attempts')],
  [tr('Úspěšné AI pokusy','Successful AI attempts'),number(value?.usage.successful),tr('Za posledních 24 h','Last 24 h')],
  [tr('Inference sloty','Inference slots'),value?.admission?value.admission.active+' / '+value.admission.limit:'—',tr('Kapacita celé platformy','Platform-wide admission')],
  [tr('Čekající požadavky','Waiting requests'),value?.admission?value.admission.waiting+' / '+value.admission.maxPending:'—',tr('Nejde o vytížení GPU','Not GPU utilization')],
  [tr('Doba volání modelu','Provider call duration'),seconds(value?.usage.providerAverageMs),tr('Průměr včetně sítě','Mean including network')],
  [tr('Doba přijetí','Admission duration'),seconds(value?.usage.admissionAverageMs),tr('Průměr včetně čekání','Mean including waiting')],
  [tr('Aktivní členství','Active memberships'),number(value?.participation.activeUsers),tr('Nejde o online přítomnost','Not online presence')],
  [tr('Dokončené fáze','Completed phases'),value?value.phases.completed+' / '+value.phases.total:'—',tr('Průběh scénáře','Scenario progression')]
 ];
 const operations=(value?.usage.byOperation??[]).slice(0,8),max=Math.max(1,...operations.map(o=>o.count));
 async function toggle(){setFullscreenError(false);try{if(document.fullscreenElement)await document.exitFullscreen();else if(root.current?.requestFullscreen)await root.current.requestFullscreen();else setFullscreenError(true);}catch{setFullscreenError(true);}}
 return <AppShell title="CYRIS Intelligence"><main className="excon-optimized mx-auto max-w-[1600px] p-4 md:p-8">
 <section className="intel-presentation" ref={root}>
 <header className="intel-present-top"><div><p>CYRIS / CzechCybertron · CYLAB</p><h1>Intelligence &amp; Operations</h1><p>NVIDIA DGX Spark · {tr('provozní přehled','operational overview')}</p></div><div className="intel-actions"><button type="button" onClick={()=>void toggle()}>{full?tr('Ukončit celou obrazovku','Exit fullscreen'):tr('Celá obrazovka','Fullscreen')}</button><Link href={'/events/'+eventId+'/excon/intelligence'}>{tr('Zpět','Back')}</Link></div></header>
 {fullscreenError&&<p role="status">{tr('Celá obrazovka není dostupná.','Fullscreen unavailable.')}</p>}
 <p role="status">{error?tr('Data nedostupná','Data unavailable'):stale?tr('Čeká na aktuální snímek','Waiting for current snapshot'):tr('Aktuální snímek · obnovování po 15 s','Current snapshot · refreshed every 15s')}</p>
 <div className="intel-present-grid">{cards.map(([label,v,note])=><article className="intel-present-stat" key={label}><h2>{label}</h2><strong>{v}</strong><small>{note}</small></article>)}</div>
 <section className="intel-present-stat"><h2>{tr('AI operace podle využití','AI operations by usage')}</h2>
 <div className="intel-present-bars">{operations.map(o=><div key={o.operation}><p>{o.operation} · {number(o.count)}</p><progress max={max} value={o.count} aria-label={o.operation}/></div>)}</div>
 {!operations.length&&<p>{tr('Žádné dostupné záznamy.','No available records.')}</p>}</section>
 <footer className="intel-present-footer"><span>{tr('Interní prezentační režim · pouze agregované údaje','Internal presentation · aggregate data only')}</span><span>{value?new Date(value.asOf).toLocaleString(cs?'cs-CZ':'en-GB'):'—'}</span></footer>
 </section></main></AppShell>;
}

'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useParams} from 'next/navigation';
import {AppShell} from '@/components/layout/AppShell';
import {useAuth} from '@/contexts/AuthContext';
import {usePreferences} from '@/contexts/PreferencesContext';
import {apiClient} from '@/lib/api-client';
import {CyrisWordmark} from '@/components/layout/Brand';
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
 <header className="intel-present-top"><div className="wall-title"><CyrisWordmark/><div><h1>{tr('Průběh cvičení','Exercise operations')}</h1><p>CzechCybertron / CYLAB</p></div></div><div className="intel-actions"><button type="button" onClick={()=>void toggle()}>{full?tr('Ukončit celou obrazovku','Exit fullscreen'):tr('Celá obrazovka','Fullscreen')}</button><Link href={'/events/'+eventId+'/excon/intelligence'}>{tr('Zpět','Back')}</Link></div></header>
 {fullscreenError&&<p role="status">{tr('Celá obrazovka není dostupná.','Fullscreen unavailable.')}</p>}
 <p role="status">{error?tr('Data nedostupná','Data unavailable'):stale?tr('Čeká na aktuální snímek','Waiting for current snapshot'):tr('Aktuální snímek · obnovování po 15 s','Current snapshot · refreshed every 15s')}</p>
 <div className="wall-summary"><div><h2>{tr('Průběh scénáře','Scenario progression')}</h2><strong>{value?value.phases.completed+' / '+value.phases.total:'—'}</strong><progress aria-label={tr('Dokončené fáze','Completed phases')} max={Math.max(1,value?.phases.total??0)} value={value?.phases.completed??0}/></div><div><h2>{tr('Členství a týmy','Memberships and teams')}</h2><strong>{number(value?.participation.activeUsers)} <span>/ {number(value?.participation.activeTeams)}</span></strong><small>{tr('Aktivní členství / týmy, nikoli online uživatelé','Active memberships / teams, not online users')}</small></div><div><h2>NVIDIA DGX Spark</h2><strong className="wall-provider">{!value?'—':!value.provider.enabled?tr('Vypnuto','Disabled'):value.provider.status}</strong><small>{tr('Stav integrace podle CYRIS','Integration status reported by CYRIS')}</small></div></div>
 <div className="wall-details"><section><h2>{tr('AI provoz za posledních 24 h','AI operations in last 24h')}</h2><table className="wall-table"><tbody>{cards.slice(0,6).map(([label,v,note])=><tr key={label}><th scope="row">{label}<small>{note}</small></th><td>{v}</td></tr>)}</tbody></table></section>
 <section><h2>{tr('Využití podle operací','Usage by operation')}</h2>
 <div className="intel-present-bars">{operations.map(o=><div key={o.operation}><p>{o.operation} · {number(o.count)}</p><progress max={max} value={o.count} aria-label={o.operation}/></div>)}</div>
 {!operations.length&&<p>{tr('Žádné dostupné záznamy.','No available records.')}</p>}</section></div>
 <footer className="intel-present-footer"><span>{tr('Interní prezentační režim · pouze agregované údaje','Internal presentation · aggregate data only')}</span><span>{value?new Date(value.asOf).toLocaleString(cs?'cs-CZ':'en-GB'):'—'}</span></footer>
 </section></main></AppShell>;
}

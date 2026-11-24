'use client';
import {useEffect,useState} from 'react';
import {observerChange,type ExerciseObserverHistory} from '@cyris/contracts';
import {apiClient} from '@/lib/api-client';
export function ExerciseObserverHistoryPanel({eventId,cs}:{eventId:string;cs:boolean}){
 const tr=(c:string,e:string)=>cs?c:e;
 const [data,setData]=useState<ExerciseObserverHistory|null>(null),[error,setError]=useState(''),[reload,setReload]=useState(0),[all,setAll]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();let flight=false;
  async function refresh(){if(flight||document.hidden)return;flight=true;
   try{const r=await apiClient.getExerciseObserverHistory(eventId,controller.signal);if(controller.signal.aborted)return;
    if(r.ok&&r.data?.eventId===eventId&&r.data.samples.every(s=>s.eventId===eventId)){setData(r.data);setError('');}
    else{setData(null);setError(r.error||tr('Historie není dostupná','History unavailable'));}
   }catch{if(!controller.signal.aborted){setData(null);setError(tr('Historie není dostupná','History unavailable'));}}finally{flight=false;}
  }
  void refresh();const timer=window.setInterval(()=>void refresh(),60000);
  const visible=()=>{if(!document.hidden)void refresh();};document.addEventListener('visibilitychange',visible);
  return()=>{controller.abort();window.clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
 },[eventId,cs,reload]);
 const samples=data?.samples??[],latest=samples.at(-1),previous=samples.at(-2),change=latest&&previous?observerChange(previous,latest):null;
 const signed=(n:number)=>n>0?'+'+n:String(n);
 const rows=all?samples:samples.slice(-12);
 return <section className="intel-card"><h2>{tr('Vývoj cvičení · Observer','Exercise trends · Observer')}</h2>
 <p className="intel-muted">{tr('Posledních 72 hodin, nejvýše jeden skutečný vzorek za 15 minut. Pozastavení a výpadky vytvářejí mezery. Počty nejsou hodnocením výkonu účastníků.','Last 72 hours, at most one actual sample every 15 minutes. Pauses and outages create gaps. Counts are not participant performance scores.')}</p>
 <div className="intel-actions"><button type="button" onClick={()=>setReload(n=>n+1)}>{tr('Obnovit historii','Refresh history')}</button>{samples.length>12&&<button type="button" onClick={()=>setAll(v=>!v)}>{all?tr('Posledních 12 vzorků','Last 12 samples'):tr('Zobrazit všechny vzorky','Show all samples')}</button>}</div>
 {error&&<p role="alert">{error}</p>}
 {!data&&!error&&<p role="status">{tr('Načítám…','Loading…')}</p>}
 {data&&!samples.length&&<p>{tr('Zatím nejsou uložená pozorování.','No stored observations yet.')}</p>}
 {latest&&<><p className="intel-muted">{tr('Poslední historický vzorek','Latest historical sample')}: {new Date(latest.observedAt).toLocaleString(cs?'cs-CZ':'en-GB')}</p>
 {change?<p>{tr('Změna mezi posledními srovnatelnými vzorky','Change between last comparable samples')}: {tr('otevřené','pending')} {signed(change.pending)} · {tr('beze změny','unchanged')} {signed(change.unchanged)} · {tr('blokované','blocked')} {signed(change.blocked)}</p>:<p>{tr('Srovnání není dostupné: málo vzorků, mezera nebo změna kontrolního intervalu.','Comparison unavailable: insufficient samples, a gap, or changed review threshold.')}</p>}
 <div className="intel-observer-table"><table><thead><tr><th>{tr('Čas','Time')}</th><th>{tr('Otevřené','Pending')}</th><th>{tr('Beze změny','Unchanged')}</th><th>{tr('Blokované','Blocked')}</th><th>{tr('Interval (h)','Threshold (h)')}</th><th>{tr('Návaznost','Continuity')}</th></tr></thead><tbody>
 {rows.map((s,i)=>{const prev=i?rows[i-1]:undefined,gap=!!prev&&!observerChange(prev,s);return <tr key={s.observedAt} data-gap={gap}><td>{new Date(s.observedAt).toLocaleString(cs?'cs-CZ':'en-GB')}</td><td>{s.pending}</td><td>{s.unchanged}</td><td>{s.blocked}</td><td>{s.reviewAfterHours}</td><td>{gap?tr('Mezera / změna intervalu','Gap / threshold change'):'—'}</td></tr>;})}
 </tbody></table></div></>}
 </section>;
}

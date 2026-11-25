'use client';
import {useEffect,useRef,useState} from 'react';
import type {ExerciseJob} from '@cyris/contracts';
import {apiClient} from '@/lib/api-client';

export function ExerciseJobPanel({eventId,cs,refreshKey,onComplete}:{eventId:string;cs:boolean;refreshKey:number;onComplete:()=>void}){
 const tr=(c:string,e:string)=>cs?c:e;
 const [jobs,setJobs]=useState<ExerciseJob[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState<string|null>(null),[refresh,setRefresh]=useState(0);
 const completed=useRef(new Set<string>()),lock=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{
  const controller=new AbortController();let flight=false;
  async function poll(){if(flight||document.hidden)return;flight=true;
   try{const res=await apiClient.listExerciseJobs(eventId,controller.signal);if(controller.signal.aborted)return;
    if(res.ok&&Array.isArray(res.data)&&res.data.every(r=>r.eventId===eventId)){
     const rows=res.data;setJobs(rows);setError('');
     let changed=false;for(const r of rows)if(r.status==='SUCCEEDED'&&!completed.current.has(r.id)){completed.current.add(r.id);changed=true;}
     if(changed)onComplete();
    }else{setJobs([]);setError(res.error||tr('Úlohy nejsou dostupné','Jobs unavailable'));}
   }catch{if(!controller.signal.aborted){setJobs([]);setError(tr('Úlohy nejsou dostupné','Jobs unavailable'));}}
   finally{flight=false;if(!controller.signal.aborted)setLoading(false);}
  }
  void poll();const timer=window.setInterval(()=>void poll(),5000);
  const visible=()=>{if(!document.hidden)void poll();};document.addEventListener('visibilitychange',visible);
  return()=>{controller.abort();window.clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
 },[eventId,cs,refreshKey,refresh,onComplete]);
 async function cancel(id:string){if(lock.current)return;lock.current=true;setBusy(id);setError('');
  try{const r=await apiClient.cancelExerciseJob(eventId,id);if(!alive.current)return;if(!r.ok)setError(r.error||tr('Úlohu nelze zrušit','Unable to cancel job'));}
  catch{if(alive.current)setError(tr('Úlohu nelze zrušit','Unable to cancel job'));}
  finally{lock.current=false;if(alive.current){setBusy(null);setRefresh(n=>n+1);}}
 }
 const status:Record<ExerciseJob['status'],string>={QUEUED:tr('Čeká','Queued'),RUNNING:tr('Zpracovává se','Running'),SUCCEEDED:tr('Dokončeno','Succeeded'),FAILED:tr('Neúspěšné','Failed'),CANCELLED:tr('Zrušeno','Cancelled'),INTERRUPTED:tr('Přerušeno','Interrupted')};
 const errors:Record<string,string>={CAPACITY:tr('Kapacita AI','AI capacity'),ACCESS_REVOKED:tr('Přístup odebrán','Access revoked'),CONTEXT_CHANGED:tr('Kontext se změnil','Context changed'),SPARK_UNAVAILABLE:tr('Spark nedostupný','Spark unavailable'),GENERATION_FAILED:tr('Generování selhalo','Generation failed'),TIMEOUT:tr('Spark překročil časový limit inference. Zkuste stručnější zadání.','Spark inference timed out. Try a shorter brief.'),TRUNCATED:tr('Odpověď dosáhla limitu tokenů. Zkuste menší návrh.','Output reached its token limit. Try a smaller plan.'),EMPTY_OUTPUT:tr('Spark nevrátil použitelný text.','Spark returned no usable text.'),INVALID_OUTPUT:tr('Spark vrátil neplatnou strukturu návrhu.','Spark returned an invalid draft structure.'),AUTH_FAILED:tr('Spark odmítl přihlášení.','Spark rejected authentication.'),UNREACHABLE:tr('Endpoint Sparku není dostupný.','Spark endpoint unreachable.'),PROVIDER_ERROR:tr('Chyba runtime Sparku. Ověřte jeho stav.','Spark runtime error. Check its status.'),LEASE_EXPIRED:tr('Přerušení zpracování','Processing interrupted'),QUEUE_EXPIRED:tr('Vypršel čas ve frontě','Queue expired')};
 return <section className="intel-card"><h2>{tr('AI úlohy na pozadí','Background AI jobs')}</h2>
 <p className="intel-muted">{tr('Úlohy zůstávají uložené po zavření stránky. Nejvýše jedna běží na pozadí v celé platformě, při nedostatku kapacity se omezeně opakuje. Přerušená inference se automaticky neopakuje. Výsledek najdete v historii doporučení.','Jobs persist after closing this page. At most one background job runs platform-wide, with limited capacity retries. Interrupted inference is not replayed automatically. Results appear in advice history.')}</p>
 <button type="button" className="btn btn-secondary" onClick={()=>setRefresh(n=>n+1)}>{tr('Obnovit','Refresh')}</button>
 {error&&<p role="alert">{error}</p>}{loading&&<p role="status">{tr('Načítám…','Loading…')}</p>}
 {!loading&&!error&&!jobs.length&&<p>{tr('Zatím žádné úlohy.','No jobs yet.')}</p>}
 <ul className="intel-list">{jobs.map(job=><li key={job.id} className="intel-job-row" data-status={job.status}>
 <strong>{job.mode==='ARCHITECT'?tr('Návrh cvičení','Exercise architect'):tr('Návrh intervence','Intervention advisor')} · {status[job.status]}</strong>
 <small>{new Date(job.createdAt).toLocaleString(cs?'cs-CZ':'en-GB')} · {tr('Pokus','Attempt')} {job.attempts}/3 · {job.blueprintRevision===null?tr('Bez blueprintu','No blueprint'):'Blueprint r'+job.blueprintRevision}</small>
 {job.errorCode&&<p className="intel-muted">{errors[job.errorCode]??tr('Úloha nedokončena','Job incomplete')}</p>}
 {job.resultRunId&&<small>{tr('Výsledek uložen do historie','Result saved to history')}</small>}
 {job.status==='QUEUED'&&<button type="button" className="btn btn-secondary" disabled={busy!==null} onClick={()=>void cancel(job.id)}>{tr('Zrušit čekající úlohu','Cancel queued job')}</button>}
 </li>)}</ul>
 </section>;
}

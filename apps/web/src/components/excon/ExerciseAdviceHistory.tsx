'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {apiClient} from '@/lib/api-client';
import type {StoredExerciseAdvice,ExerciseAdviceDecision} from '@cyris/contracts';

export function ExerciseAdviceHistory({eventId,cs,refreshKey,blueprintRevision}:{eventId:string;cs:boolean;refreshKey:number;blueprintRevision:number|null}){
 const tr=(c:string,e:string)=>cs?c:e;
 const [rows,setRows]=useState<StoredExerciseAdvice[]>([]),[selected,setSelected]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[reload,setReload]=useState(0);
 const [notes,setNotes]=useState<Record<string,string>>({});
 const lock=useRef(false),alive=useRef(true),sequence=useRef(0);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{
  const controller=new AbortController();const seq=++sequence.current;setLoading(true);setError('');
  void (async()=>{try{
   const r=await apiClient.getExerciseAdviceHistory(eventId,controller.signal);
   if(controller.signal.aborted||seq!==sequence.current)return;
   if(r.ok&&Array.isArray(r.data)&&r.data.every(row=>row.eventId===eventId)){
    const data=r.data;setRows(data);setSelected(s=>data.some(row=>row.runId===s)?s:data[0]?.runId??'');
   }else{setRows([]);setSelected('');setError(r.error||tr('Historie není dostupná','History unavailable'));}
  }catch{if(!controller.signal.aborted&&seq===sequence.current){setRows([]);setError(tr('Historie není dostupná','History unavailable'));}}
  finally{if(!controller.signal.aborted&&seq===sequence.current)setLoading(false);}})();
  return()=>controller.abort();
 },[eventId,refreshKey,reload,cs]);
 const draft=rows.find(r=>r.runId===selected);
 async function decide(actionIndex:number,decision:ExerciseAdviceDecision['decision']){
  if(!draft||lock.current||loading)return;
  const runId=draft.runId,key=runId+':'+actionIndex;
  lock.current=true;setBusy(true);setError('');
  // Invalidate any overlapping list request before writing the reviewed version.
  sequence.current++;
  try{
   const r=await apiClient.reviewExerciseAdvice(eventId,runId,{actionIndex,expectedRevision:draft.revision,decision,note:notes[key]??draft.reviews.find(v=>v.actionIndex===actionIndex)?.note??''});
   if(!alive.current)return;
   if(r.ok&&r.data?.eventId===eventId&&r.data.runId===runId){const row=r.data;setRows(old=>old.map(v=>v.runId===runId?row:v));setNotes(old=>{const copy={...old};delete copy[key];return copy;});}
   else{setError(r.error||tr('Rozhodnutí se nepodařilo uložit. Obnovte historii.','Review failed. Refresh history.'));}
  }catch{if(alive.current)setError(tr('Rozhodnutí se nepodařilo uložit','Review failed'));}
  finally{lock.current=false;if(alive.current){setBusy(false);setLoading(false);}}
 }
 const stale=draft?.blueprintRevision!=null&&blueprintRevision!=null&&draft.blueprintRevision!==blueprintRevision;
 return <section className="intel-card"><h2>{tr('Historie a kontrola AI návrhů','AI advice history & review')}</h2>
 <p className="intel-muted">{tr('Posledních 20 návrhů. Přijetí znamená pouze interní rozhodnutí organizátora; nic se automaticky neprovádí ani neposílá.','Latest 20 drafts. Acceptance records an internal organizer decision only; nothing is executed or sent.')}</p>
 <div className="intel-history-select"><button className="btn btn-secondary" type="button" disabled={busy||loading} onClick={()=>setReload(v=>v+1)}>{tr('Obnovit historii','Refresh history')}</button>
 {!!rows.length&&<select aria-label={tr('Vybrat návrh','Select draft')} disabled={busy||loading} value={selected} onChange={e=>setSelected(e.target.value)}>{rows.map(r=><option key={r.runId} value={r.runId}>{new Date(r.generatedAt).toLocaleString(cs?'cs-CZ':'en-GB')} · {r.mode} · {r.actions.length} {tr('návrhů','actions')}</option>)}</select>}</div>
 {error&&<p role="alert">{error}</p>}{loading&&<p role="status">{tr('Načítám historii…','Loading history…')}</p>}
 {!loading&&!error&&!rows.length&&<p>{tr('Zatím nebyl uložen žádný návrh.','No stored drafts yet.')}</p>}
 {!loading&&draft&&<>
 <p className="intel-muted">{draft.model} · {draft.runId} · {draft.blueprintRevision===null?tr('Bez blueprintu','No blueprint'):'Blueprint r'+draft.blueprintRevision} · {tr('Revize rozhodnutí','Review revision')} {draft.revision}</p>
 {stale&&<p role="status">{tr('Návrh vychází ze starší revize blueprintu. Před využitím jej znovu posuďte.','Draft uses an older blueprint revision. Reassess before use.')}</p>}
 <p>{draft.summary}</p>
 <details><summary>{tr('Původní pozorování','Original observations')} · {new Date(draft.observedAt).toLocaleString()}</summary><ul className="intel-list">{draft.signals.map(s=><li key={s.id}>{s.count} · {cs?s.labelCs:s.label}<p className="intel-muted">{s.source}</p><Link href={'/events/'+eventId+s.href}>{tr('Otevřít agendu','Open workspace')}</Link></li>)}</ul></details>
 <div className="intel-review-grid">{draft.actions.map((action,i)=>{
  const review=draft.reviews.find(r=>r.actionIndex===i),key=draft.runId+':'+i;
  const labels={ACCEPTED:tr('Přijato k dalšímu zpracování','Accepted for further work'),REJECTED:tr('Zamítnuto','Rejected'),PENDING:tr('Čeká na posouzení','Pending review')};
  return <article key={key} className="intel-review-item" data-decision={review?.decision??'PENDING'}><h4>{action.module} · {action.title}</h4><p>{action.proposal}</p><p className="intel-muted">{action.reason}</p>
  {!!action.signalIds.length&&<ul>{action.signalIds.map((id,j)=>{const s=draft.signals.find(v=>v.id===id);return <li key={id+j}>{s?s.count+' · '+(cs?s.labelCs:s.label):id}</li>;})}</ul>}
  <p><strong>{labels[review?.decision??'PENDING']}</strong>{review&&' · '+new Date(review.reviewedAt).toLocaleString()}</p>
  <label>{tr('Poznámka organizátora','Organizer note')}<textarea maxLength={1000} disabled={busy} value={notes[key]??review?.note??''} onChange={e=>setNotes(old=>({...old,[key]:e.target.value}))}/></label>
  <div className="intel-actions"><button type="button" className="btn btn-primary" disabled={busy||stale} onClick={()=>void decide(i,'ACCEPTED')}>{tr('Přijmout','Accept')}</button><button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>void decide(i,'REJECTED')}>{tr('Zamítnout','Reject')}</button><button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>void decide(i,'PENDING')}>{tr('Vrátit k posouzení','Return to review')}</button></div>
  </article>;
 })}</div>
 {draft.reviewNotes.map((note,i)=><p className="intel-muted" key={i}>{note}</p>)}
 </>}
 </section>;
}

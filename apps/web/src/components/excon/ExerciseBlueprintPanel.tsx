'use client';
import {useEffect,useRef,useState} from 'react';
import type {ExerciseBlueprint,ExerciseBlueprintInput,ExerciseBlueprintOverview} from '@cyris/contracts';
import {apiClient} from '@/lib/api-client';
const empty:ExerciseBlueprintInput={expectedRevision:0,title:'',brief:'',objectives:'',constraints:'',durationHours:48,reviewAfterHours:12};
function toInput(row:ExerciseBlueprint|null):ExerciseBlueprintInput{
 if(!row)return {...empty};
 const {title,brief,objectives,constraints,durationHours,reviewAfterHours,revision}=row;
 return {title,brief,objectives,constraints,durationHours,reviewAfterHours,expectedRevision:revision};
}
export function ExerciseBlueprintPanel({eventId,cs,disabled,onCurrent}:{eventId:string;cs:boolean;disabled:boolean;onCurrent:(row:ExerciseBlueprint|null)=>void}){
 const tr=(c:string,e:string)=>cs?c:e;
 const [data,setData]=useState<ExerciseBlueprintOverview|null>(null),[form,setForm]=useState<ExerciseBlueprintInput>(empty),[error,setError]=useState(''),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[reload,setReload]=useState(0);
 const alive=useRef(true),lock=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{
  let active=true;const controller=new AbortController();setData(null);onCurrent(null);setError('');
  void (async()=>{try{const r=await apiClient.getExerciseBlueprint(eventId,controller.signal);if(!active)return;if(r.ok&&r.data){setData(r.data);setForm(toInput(r.data.current));onCurrent(r.data.current);setDirty(false);}else setError(r.error||tr('Blueprint není dostupný','Blueprint unavailable'));}catch{if(active)setError(tr('Blueprint není dostupný','Blueprint unavailable'));}})();
  return()=>{active=false;controller.abort();};
 },[eventId,reload,cs,onCurrent]);
 function change<K extends keyof ExerciseBlueprintInput>(key:K,value:ExerciseBlueprintInput[K]){setForm(f=>({...f,[key]:value}));setDirty(true);}
 async function save(){
  if(disabled||lock.current||!data||!dirty)return;
  lock.current=true;setBusy(true);setError('');
  try{const res=await apiClient.saveExerciseBlueprint(eventId,form);if(!alive.current)return;
   if(res.ok&&res.data?.eventId===eventId){const row=res.data;setData(d=>({current:row,history:[{revision:row.revision,title:row.title,updatedAt:row.updatedAt,updatedBy:row.updatedBy},...(d?.history??[])].slice(0,20)}));setForm(toInput(row));onCurrent(row);setDirty(false);}
   else setError(res.error||tr('Uložení selhalo. Zkontrolujte aktuální revizi.','Save failed. Check the current revision.'));
  }catch{if(alive.current)setError(tr('Uložení selhalo','Save failed'));}finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 const locked=disabled||busy||!data;
 return <section className="intel-card">
 <h2>Master Blueprint</h2><p className="intel-muted">{tr('Privátní zadání cvičení pro organizátory. Uložení vytváří novou revizi; nemění žádné účastnické záznamy.','Private organizer exercise context. Saving creates a revision; it does not change participant records.')}</p>
 <div className="intel-actions"><strong>{data?.current?'r'+data.current.revision:tr('Bez uložené revize','No saved revision')}</strong>{dirty&&<span>{tr('Neuložené změny','Unsaved changes')}</span>}<button type="button" disabled={busy||disabled} onClick={()=>{if(!dirty||window.confirm(tr('Zahodit neuložené změny?','Discard unsaved changes?')))setReload(n=>n+1);}}>{tr('Načíst aktuální revizi','Reload current revision')}</button></div>
 {error&&<p role="alert">{error}</p>}
 {!data&&!error&&<p role="status">{tr('Načítám blueprint…','Loading blueprint…')}</p>}
 <form className="intel-form" onSubmit={e=>{e.preventDefault();void save();}}>
 <label>{tr('Název scénáře','Scenario title')}<input disabled={locked} required minLength={3} maxLength={160} value={form.title} onChange={e=>change('title',e.target.value)}/></label>
 <label>{tr('Námět a průběh cvičení','Exercise premise and progression')}<textarea disabled={locked} required minLength={10} maxLength={12000} value={form.brief} onChange={e=>change('brief',e.target.value)}/></label>
 <label>{tr('Vzdělávací cíle','Learning objectives')}<textarea className="intel-short" disabled={locked} maxLength={6000} value={form.objectives} onChange={e=>change('objectives',e.target.value)}/></label>
 <label>{tr('Pravidla, omezení a hranice nápovědy','Rules, constraints and hint boundaries')}<textarea className="intel-short" disabled={locked} maxLength={4000} value={form.constraints} onChange={e=>change('constraints',e.target.value)}/></label>
 <div className="intel-blueprint-fields"><label>{tr('Délka cvičení (h)','Exercise duration (h)')}<input type="number" required min={1} max={168} step={1} disabled={locked} value={form.durationHours} onChange={e=>change('durationHours',Number(e.target.value))}/></label><label>{tr('Navržený interval kontroly (h)','Suggested review window (h)')}<input type="number" required min={1} max={72} step={1} disabled={locked} value={form.reviewAfterHours} onChange={e=>change('reviewAfterHours',Number(e.target.value))}/></label></div>
 <p className="intel-muted">{tr('Interval je zatím plánovací parametr, nikoli automatický časovač zásahu.','The review window is a planning parameter, not an automatic intervention timer yet.')}</p>
 <button type="submit" disabled={locked||!dirty}>{busy?tr('Ukládám…','Saving…'):tr('Uložit novou revizi','Save new revision')}</button>
 </form>
 {!!data?.history.length&&<details><summary>{tr('Historie revizí','Revision history')}</summary><ol className="intel-history">{data.history.map(r=><li key={r.revision}>r{r.revision} · {r.title} · {new Date(r.updatedAt).toLocaleString(cs?'cs-CZ':'en-GB')}</li>)}</ol></details>}
 </section>;
}

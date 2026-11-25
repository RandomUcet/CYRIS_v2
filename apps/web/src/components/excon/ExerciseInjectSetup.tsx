'use client';
import {useEffect,useRef,useState} from 'react';
import {ExerciseInjectSetupInputSchema,type StoredExerciseAdvice} from '@cyris/contracts';
import {apiClient} from '@/lib/api-client';
export function ExerciseInjectSetup({eventId,runId,revision,actionIndex,plan,cs,disabled,onSaved}:{eventId:string;runId:string;revision:number;actionIndex:number;plan:{title:string;purpose:string}[];cs:boolean;disabled:boolean;onSaved:(row:StoredExerciseAdvice)=>void}){
 const tr=(c:string,e:string)=>cs?c:e;
 const [injects,setInjects]=useState(()=>plan.map(({title,purpose})=>({title,controllerSummary:purpose}))),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const alive=useRef(true),lock=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const input=ExerciseInjectSetupInputSchema.safeParse({actionIndex,expectedRevision:revision,injects,confirmedSafe:true});
 function change(i:number,key:'title'|'controllerSummary',value:string){setInjects(old=>old.map((v,j)=>j===i?{...v,[key]:value}:v));setConfirmed(false);}
 async function apply(){if(disabled||lock.current||!confirmed||!input.success)return;lock.current=true;setBusy(true);setError('');
  try{const r=await apiClient.setupExerciseInjects(eventId,runId,input.data);if(!alive.current)return;if(r.ok&&r.data?.eventId===eventId&&r.data.runId===runId)onSaved(r.data);else setError(r.error||tr('Založení injectů selhalo','Inject creation failed'));}
  catch{if(alive.current)setError(tr('Založení injectů selhalo','Inject creation failed'));}finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 return <details className="intel-handoff"><summary>{tr('Plán scénářových vstupů (injectů)','Scenario inject plan')} · {plan.length}</summary>
 <p className="intel-muted">{tr('Pouze soukromé koncepty pro organizátory. Bez účastnického textu, adresátů, času a podmínek. Nic se automaticky neuvolní.','Private controller drafts only. No participant text, audience, time or conditions. Nothing is released automatically.')}</p>
 <form className="intel-form" onSubmit={e=>{e.preventDefault();void apply();}}>
 {injects.map((v,i)=><div key={i}><label>{tr('Neutrální název','Neutral title')} {i+1}<input required minLength={3} maxLength={160} disabled={busy||disabled} value={v.title} onChange={e=>change(i,'title',e.target.value)}/></label><label>{tr('Soukromý popis pro EXCON','Private controller summary')}<textarea required minLength={3} maxLength={600} disabled={busy||disabled} value={v.controllerSummary} onChange={e=>change(i,'controllerSummary',e.target.value)}/></label></div>)}
 <label className="intel-check"><input type="checkbox" checked={confirmed} disabled={busy||disabled} onChange={e=>setConfirmed(e.target.checked)}/>{tr('Zkontroloval jsem názvy a soukromé popisy; názvy neprozrazují řešení.','I reviewed titles and private summaries; titles do not reveal solutions.')}</label>
 {!input.success&&<p className="intel-muted">{tr('Zkontrolujte délku a jedinečnost názvů.','Check length and unique titles.')}</p>}
 <button type="submit" className="btn btn-primary" disabled={busy||disabled||!confirmed||!input.success}>{busy?tr('Zakládám…','Creating…'):tr('Založit koncepty injectů','Create inject drafts')}</button>{error&&<p role="alert">{error}</p>}
 </form></details>;
}

'use client';
import {useState,useRef,useEffect} from 'react';
import type {StoredExerciseAdvice} from '@cyris/contracts';
import {apiClient} from '@/lib/api-client';
export function ExercisePhaseSetup({eventId,runId,revision,actionIndex,plan,cs,disabled,onSaved}:{eventId:string;runId:string;revision:number;actionIndex:number;plan:{title:string;purpose:string}[];cs:boolean;disabled:boolean;onSaved:(row:StoredExerciseAdvice)=>void}){
 const tr=(c:string,e:string)=>cs?c:e;
 const [titles,setTitles]=useState(()=>plan.map(p=>p.title)),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const alive=useRef(true),lock=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const valid=titles.every(t=>t.trim().length>=3&&t.trim().length<=120)&&new Set(titles.map(t=>t.trim().toLowerCase())).size===titles.length;
 async function apply(){if(disabled||lock.current||!valid||!confirmed)return;lock.current=true;setBusy(true);setError('');
  try{const r=await apiClient.setupExercisePhases(eventId,runId,{actionIndex,expectedRevision:revision,titles,confirmedSafe:true});if(!alive.current)return;if(r.ok&&r.data?.eventId===eventId&&r.data.runId===runId)onSaved(r.data);else setError(r.error||tr('Založení fází selhalo','Phase creation failed'));}
  catch{if(alive.current)setError(tr('Založení fází selhalo','Phase creation failed'));}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 return <details className="intel-handoff"><summary>{tr('Strukturovaný plán fází','Structured phase plan')} · {plan.length}</summary>
 <p className="intel-muted">{tr('Po přijetí návrhu zkontrolujte názvy. Založí se pouze neaktivní koncepty v přípravě cvičení, bez časů a bez soukromého účelu.','After accepting the action, review the titles. Only inactive drafts in preparation-stage exercises are created, without dates or private purposes.')}</p>
 <form className="intel-form" onSubmit={e=>{e.preventDefault();void apply();}}>
 {plan.map((p,i)=><div key={i}><label>{tr('Fáze','Phase')} {i+1}<input required minLength={3} maxLength={120} disabled={busy||disabled} value={titles[i]??''} onChange={e=>{const value=e.target.value;setTitles(old=>old.map((t,j)=>j===i?value:t));setConfirmed(false);}}/></label><p className="intel-muted">{p.purpose}</p></div>)}
 <label className="intel-check"><input type="checkbox" checked={confirmed} disabled={busy||disabled} onChange={e=>setConfirmed(e.target.checked)}/>{tr('Názvy neobsahují tajné informace ani řešení cvičení.','Titles contain no secret information or exercise answers.')}</label>
 <button type="submit" className="btn btn-primary" disabled={busy||disabled||!confirmed||!valid}>{busy?tr('Zakládám…','Creating…'):tr('Založit koncepty fází','Create draft phases')}</button>
 {error&&<p role="alert">{error}</p>}
 </form></details>;
}

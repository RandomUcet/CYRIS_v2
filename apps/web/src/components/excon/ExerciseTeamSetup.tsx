'use client';
import {useEffect,useRef,useState} from 'react';
import {ExerciseTeamSetupInputSchema,type StoredExerciseAdvice} from '@cyris/contracts';
import {apiClient} from '@/lib/api-client';
export function ExerciseTeamSetup({eventId,runId,revision,actionIndex,plan,cs,disabled,onSaved}:{eventId:string;runId:string;revision:number;actionIndex:number;plan:{name:string;slug:string;purpose:string}[];cs:boolean;disabled:boolean;onSaved:(row:StoredExerciseAdvice)=>void}){
 const tr=(c:string,e:string)=>cs?c:e;
 const [teams,setTeams]=useState(()=>plan.map(({name,slug})=>({name,slug}))),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const alive=useRef(true),lock=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const input=ExerciseTeamSetupInputSchema.safeParse({actionIndex,expectedRevision:revision,teams,confirmedSafe:true});
 function change(i:number,key:'name'|'slug',value:string){setTeams(old=>old.map((t,j)=>j===i?{...t,[key]:value}:t));setConfirmed(false);}
 async function apply(){if(disabled||lock.current||!confirmed||!input.success)return;lock.current=true;setBusy(true);setError('');
  try{const r=await apiClient.setupExerciseTeams(eventId,runId,input.data);if(!alive.current)return;if(r.ok&&r.data?.eventId===eventId&&r.data.runId===runId)onSaved(r.data);else setError(r.error||tr('Založení týmů selhalo','Team creation failed'));}
  catch{if(alive.current)setError(tr('Založení týmů selhalo','Team creation failed'));}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 return <details className="intel-handoff"><summary>{tr('Strukturovaný plán týmů','Structured team plan')} · {plan.length}</summary>
 <p className="intel-muted">{tr('Vzniknou pouze prázdné týmy bez členů, rolí a schopností. Vyžaduje přijetí návrhu, správu týmů a přípravný stav cvičení.','Creates empty teams only, without members, roles or capabilities. Requires accepted advice, unit management permission and preparation-stage event.')}</p>
 <form className="intel-form" onSubmit={e=>{e.preventDefault();void apply();}}>
 {plan.map((p,i)=><div key={i}><div className="intel-blueprint-fields"><label>{tr('Název týmu','Team name')} {i+1}<input required minLength={3} maxLength={120} disabled={busy||disabled} value={teams[i]?.name??''} onChange={e=>change(i,'name',e.target.value)}/></label><label>Slug<input required maxLength={64} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" disabled={busy||disabled} value={teams[i]?.slug??''} onChange={e=>change(i,'slug',e.target.value)}/></label></div><p className="intel-muted">{p.purpose}</p></div>)}
 <label className="intel-check"><input type="checkbox" checked={confirmed} disabled={busy||disabled} onChange={e=>setConfirmed(e.target.checked)}/>{tr('Názvy ani identifikátory neobsahují neveřejné informace.','Names and identifiers contain no confidential information.')}</label>
 {!input.success&&<p className="intel-muted">{tr('Zkontrolujte jedinečnost názvů a slugů.','Check unique names and valid slugs.')}</p>}
 <button type="submit" className="btn btn-primary" disabled={busy||disabled||!confirmed||!input.success}>{busy?tr('Zakládám…','Creating…'):tr('Založit prázdné týmy','Create empty teams')}</button>{error&&<p role="alert">{error}</p>}
 </form></details>;
}

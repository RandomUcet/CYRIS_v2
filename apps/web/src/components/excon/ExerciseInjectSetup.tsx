'use client';
import {useEffect,useRef,useState} from 'react';
import {ExerciseInjectSetupInputSchema,type StoredExerciseAdvice,type ScenarioPhaseResponse} from '@cyris/contracts';
import {apiClient} from '@/lib/api-client';
export function ExerciseInjectSetup({eventId,runId,revision,actionIndex,plan,cs,disabled,onSaved}:{eventId:string;runId:string;revision:number;actionIndex:number;plan:{title:string;purpose:string;phaseTitle?:string;dependsOn?:number[]}[];cs:boolean;disabled:boolean;onSaved:(row:StoredExerciseAdvice)=>void}){
 const tr=(c:string,e:string)=>cs?c:e;
 const [injects,setInjects]=useState(()=>plan.map(({title,purpose,dependsOn})=>({title,controllerSummary:purpose,phaseId:null as string|null,dependsOn:dependsOn??[]}))),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [phases,setPhases]=useState<ScenarioPhaseResponse[]>([]),[phaseError,setPhaseError]=useState(''),[phaseLoading,setPhaseLoading]=useState(true);
 const alive=useRef(true),lock=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{let active=true;setPhaseLoading(true);void (async()=>{try{const r=await apiClient.listScenarioPhases(eventId);if(!active)return;if(!r.ok||!r.data)throw Error(r.error);const available=r.data.filter(p=>p.eventId===eventId&&!['COMPLETED','CANCELLED'].includes(p.status));setPhases(available);setPhaseError('');}catch{if(active)setPhaseError(tr('Fáze se nepodařilo načíst. Lze vytvořit vstupy bez fáze.','Phases unavailable. Injects can be created without a phase.'));}finally{if(active)setPhaseLoading(false);}})();return()=>{active=false;};},[eventId,revision]);
 const input=ExerciseInjectSetupInputSchema.safeParse({actionIndex,expectedRevision:revision,injects,confirmedSafe:true});
 function change(i:number,key:'title'|'controllerSummary'|'phaseId',value:string|null){setInjects(old=>old.map((v,j)=>j===i?{...v,[key]:value}:v));setConfirmed(false);}
 function dependency(i:number,j:number,on:boolean){setInjects(old=>old.map((v,k)=>k===i?{...v,dependsOn:on?[...new Set([...v.dependsOn,j])].sort((a,b)=>a-b):v.dependsOn.filter(n=>n!==j)}:v));setConfirmed(false);}
 async function apply(){if(disabled||lock.current||!confirmed||!input.success)return;lock.current=true;setBusy(true);setError('');
  try{const r=await apiClient.setupExerciseInjects(eventId,runId,input.data);if(!alive.current)return;if(r.ok&&r.data?.eventId===eventId&&r.data.runId===runId)onSaved(r.data);else setError(r.error||tr('Založení injectů selhalo','Inject creation failed'));}
  catch{if(alive.current)setError(tr('Založení injectů selhalo','Inject creation failed'));}finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 return <details className="intel-handoff"><summary>{tr('Plán scénářových vstupů (injectů)','Scenario inject plan')} · {plan.length}</summary>
 <p className="intel-muted">{tr('Pouze soukromé koncepty pro organizátory. Fáze a návaznosti můžete upravit. Bez účastnického textu, adresátů a času. Nic se automaticky neuvolní.','Private controller drafts only. Review phase assignments and prerequisites. No participant text, audience or time. Nothing is released automatically.')}</p>
 {phaseError&&<p role="status">{phaseError}</p>}
 <form className="intel-form" onSubmit={e=>{e.preventDefault();void apply();}}>
 {injects.map((v,i)=><div key={i}><label>{tr('Neutrální název','Neutral title')} {i+1}<input required minLength={3} maxLength={160} disabled={busy||disabled} value={v.title} onChange={e=>change(i,'title',e.target.value)}/></label><label>{tr('Soukromý popis pro EXCON','Private controller summary')}<textarea required minLength={3} maxLength={600} disabled={busy||disabled} value={v.controllerSummary} onChange={e=>change(i,'controllerSummary',e.target.value)}/></label>
 <label>{tr('Fáze','Phase')}{plan[i]?.phaseTitle&&<small>{tr('Návrh Sparku: ','Spark suggestion: ')}{plan[i]?.phaseTitle}</small>}<select disabled={busy||disabled||phaseLoading} value={v.phaseId??''} onChange={e=>change(i,'phaseId',e.target.value||null)}><option value="">{tr('Bez přiřazení','Unassigned')}</option>{phases.map(p=><option key={p.id} value={p.id}>{p.code} · {p.title}</option>)}</select></label>
 {i>0&&<fieldset><legend>{tr('Vyžaduje předchozí vydání','Requires earlier release')}</legend>{injects.slice(0,i).map((prev,j)=><label key={j} className="intel-check"><input type="checkbox" checked={v.dependsOn.includes(j)} disabled={busy||disabled} onChange={e=>dependency(i,j,e.target.checked)}/>{j+1} · {prev.title}</label>)}</fieldset>}
 </div>)}
 <label className="intel-check"><input type="checkbox" checked={confirmed} disabled={busy||disabled} onChange={e=>setConfirmed(e.target.checked)}/>{tr('Zkontroloval jsem názvy, popisy, fáze a návaznosti; názvy neprozrazují řešení.','I reviewed titles, private summaries, phases and dependencies; titles do not reveal solutions.')}</label>
 {!input.success&&<p className="intel-muted">{tr('Zkontrolujte délku a jedinečnost názvů.','Check length and unique titles.')}</p>}
 <button type="submit" className="btn btn-primary" disabled={busy||disabled||!confirmed||!input.success}>{busy?tr('Zakládám…','Creating…'):tr('Založit koncepty injectů','Create inject drafts')}</button>{error&&<p role="alert">{error}</p>}
 </form></details>;
}

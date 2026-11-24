'use client';
import {useState,useEffect,useRef} from 'react';
import {apiClient} from '@/lib/api-client';
import type {StoredExerciseAdvice} from '@cyris/contracts';

type Props={eventId:string;runId:string;revision:number;actionIndex:number;cs:boolean;disabled:boolean;onSaved:(row:StoredExerciseAdvice)=>void};
export function ExerciseHintHandoff({eventId,runId,revision,actionIndex,cs,disabled,onSaved}:Props){
 const tr=(c:string,e:string)=>cs?c:e;
 const [open,setOpen]=useState(false),[teams,setTeams]=useState<Array<{id:string;name:string}>>([]),[unitId,setUnitId]=useState(''),[title,setTitle]=useState(''),[message,setMessage]=useState(''),[safe,setSafe]=useState(false),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const lock=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{
  if(!open)return;
  let active=true;setLoading(true);setError('');
  void (async()=>{try{const r=await apiClient.getExerciseBroadcastTeams(eventId);if(!active)return;if(r.ok&&Array.isArray(r.data)){setTeams(r.data);setUnitId(id=>r.data!.some(t=>t.id===id)?id:'');}else{setTeams([]);setError(r.error||tr('Týmy nejsou dostupné','Teams unavailable'));}}
  catch{if(active){setTeams([]);setError(tr('Týmy nejsou dostupné','Teams unavailable'));}}finally{if(active)setLoading(false);}})();
  return()=>{active=false;};
 },[open,eventId,cs]);
 const valid=Boolean(unitId&&teams.some(t=>t.id===unitId)&&title.trim().length>=3&&message.trim().length>=3&&safe);
 async function submit(){
  if(disabled||busy||lock.current||loading||!valid)return;
  lock.current=true;setBusy(true);setError('');
  try{const r=await apiClient.handoffExerciseAdvice(eventId,runId,{actionIndex,expectedRevision:revision,unitId,title,message,confirmedSafe:true});if(!alive.current)return;
   if(r.ok&&r.data?.eventId===eventId&&r.data.runId===runId)onSaved(r.data);
   else setError(r.error||tr('Koncept se nepodařilo vytvořit. Obnovte historii.','Unable to create draft. Refresh history.'));
  }catch{if(alive.current)setError(tr('Koncept se nepodařilo vytvořit','Unable to create draft'));}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 return <details className="intel-handoff" open={open} onToggle={e=>setOpen(e.currentTarget.open)}>
 <summary>{tr('Připravit nápovědu pro tým','Prepare team hint')}</summary>
 {open&&<form className="intel-form" onSubmit={e=>{e.preventDefault();void submit();}}>
 <p className="intel-muted">{tr('Napište vlastní neutrální nápovědu. Obsah privátního návrhu se nepřenáší. Vytvoří se pouze koncept v komunikačním centru, nikoli doručená zpráva.','Write a neutral hint yourself. Private advice is not copied. This creates only a communication draft, not a delivered message.')}</p>
 <label>{tr('Cílový tým','Receiving team')}<select required disabled={loading||busy||disabled} value={unitId} onChange={e=>{setUnitId(e.target.value);setSafe(false);}}><option value="">{loading?tr('Načítám…','Loading…'):tr('Vyberte tým','Select a team')}</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
 <label>{tr('Nadpis pro účastníky','Participant-facing title')}<input required minLength={3} maxLength={120} disabled={busy||disabled} value={title} onChange={e=>{setTitle(e.target.value);setSafe(false);}}/></label>
 <label>{tr('Text nápovědy','Hint text')}<textarea required minLength={3} maxLength={900} disabled={busy||disabled} value={message} onChange={e=>{setMessage(e.target.value);setSafe(false);}}/></label>
 <label className="intel-check"><input type="checkbox" required checked={safe} disabled={busy||disabled} onChange={e=>setSafe(e.target.checked)}/>{tr('Zkontroloval jsem příjemce i text. Neobsahuje řešení ani neveřejné informace.','I checked the audience and text. It contains no answers or confidential information.')}</label>
 <button type="submit" className="btn btn-primary" disabled={!valid||busy||loading||disabled}>{busy?tr('Vytvářím…','Creating…'):tr('Vytvořit neodeslaný koncept','Create unsent draft')}</button>
 {error&&<p role="alert">{error}</p>}
 </form>}
 </details>;
}

'use client';
import {useEffect,useRef,useState} from 'react';
import {useParams} from 'next/navigation';
import Link from 'next/link';
import {AppShell} from '@/components/layout/AppShell';
import {useAuth} from '@/contexts/AuthContext';
import {usePreferences} from '@/contexts/PreferencesContext';
import {apiClient} from '@/lib/api-client';
import type {LegalSourceInput,LegalSearchResult,LegalResearchResult} from '@cyris/contracts';

export default function LegalLibraryPage(){
 const {eventId}=useParams<{eventId:string}>(),{currentUser,viewAs,hasPermission,loading}=useAuth();
 const canManage=hasPermission('scenario.manage',eventId);
 if(loading)return <AppShell title="Legal Intelligence"><p role="status">…</p></AppShell>;
 if(viewAs||!(canManage||hasPermission('court.read',eventId)||hasPermission('court.request.read',eventId)))return <AppShell title="Legal Intelligence"><p role="alert">Přístup není povolen / Access denied</p></AppShell>;
 return <Workspace key={JSON.stringify([eventId,currentUser?.user.id,canManage])} eventId={eventId} canManage={canManage}/>;
}
function Workspace({eventId,canManage}:{eventId:string;canManage:boolean}){
 const {locale}=usePreferences(),cs=locale==='cs',tr=(c:string,e:string)=>cs?c:e;
 const [date,setDate]=useState(''),[query,setQuery]=useState(''),[results,setResults]=useState<LegalSearchResult|null>(null),[selected,setSelected]=useState<string[]>([]);
 const [loading,setLoading]=useState(false),[error,setError]=useState(''),[question,setQuestion]=useState(''),[answer,setAnswer]=useState<LegalResearchResult|null>(null),[busy,setBusy]=useState(false),[aiError,setAiError]=useState('');
 const request=useRef<AbortController|null>(null),alive=useRef(true),lock=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;request.current?.abort();};},[]);
 function reset(){request.current?.abort();setResults(null);setSelected([]);setAnswer(null);setError('');setAiError('');setLoading(false);}
 async function search(){
  if(!date||busy)return;request.current?.abort();const controller=new AbortController();request.current=controller;
  setLoading(true);setError('');setResults(null);setSelected([]);setAnswer(null);
  try{const r=await apiClient.searchLegalLibrary(eventId,query,date,controller.signal);if(controller.signal.aborted)return;
   if(r.ok&&r.data?.asOf===date&&r.data.items.every(s=>s.eventId===eventId))setResults(r.data);
   else setError(r.error||tr('Vyhledávání selhalo','Search failed'));
  }catch{if(!controller.signal.aborted)setError(tr('Vyhledávání selhalo','Search failed'));}
  finally{if(!controller.signal.aborted)setLoading(false);}
 }
 async function research(){
  if(lock.current||!results||!selected.length||question.trim().length<10)return;
  lock.current=true;setBusy(true);setAnswer(null);setAiError('');
  try{const r=await apiClient.researchLegalLibrary(eventId,{question,asOf:results.asOf,sourceIds:selected,locale:cs?'cs':'en'});if(!alive.current)return;
   if(r.ok&&r.data?.asOf===results.asOf&&r.data.sources.every(s=>s.eventId===eventId&&selected.includes(s.id)))setAnswer(r.data);
   else setAiError(r.error||tr('Právní analýza selhala','Legal research failed'));
  }catch{if(alive.current)setAiError(tr('Právní analýza selhala','Legal research failed'));}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 return <AppShell title="Legal Intelligence"><main className="excon-optimized mx-auto max-w-[1440px] p-4 md:p-8"><div className="intel-shell">
 <header><h1>Legal Intelligence</h1><p className="intel-muted">{tr('Právní rešerše pro simulované cvičení · NVIDIA DGX Spark','Legal research for a simulated exercise · NVIDIA DGX Spark')}</p><div className="intel-actions"><Link href={'/events/'+eventId+'/court'}>{tr('Soudní agenda','Court workspace')}</Link><a href="https://e-sbirka.gov.cz/" target="_blank" rel="noreferrer">e-Sbírka ↗</a></div></header>
 <section className="intel-card"><p>{tr('Knihovna obsahuje výhradně podklady vložené organizátory. Nejde o úplný ani automaticky ověřený soubor právních předpisů. Před použitím ověřte přesné znění v e-Sbírce.','This library contains only organizer-curated excerpts. It is not a complete or automatically verified statute collection. Check exact wording in e-Sbírka before relying on it.')}</p></section>
 <div className="legal-library-grid">
 <section className="intel-card"><h2>{tr('Vyhledávání ustanovení','Find provisions')}</h2>
 <form className="intel-form" onSubmit={e=>{e.preventDefault();void search();}}>
 <label>{tr('Rozhodné datum právního znění','Relevant legal date')}<input required type="date" min="1900-01-01" value={date} disabled={busy} onChange={e=>{reset();setDate(e.target.value);}}/></label>
 <label>{tr('Číslo předpisu, paragraf nebo výraz','Act number, provision or keyword')}<input type="search" maxLength={160} value={query} disabled={busy} onChange={e=>{reset();setQuery(e.target.value);}} placeholder="40/2009"/></label>
 <button type="submit" className="btn btn-primary" disabled={!date||busy||loading}>{loading?tr('Hledám…','Searching…'):tr('Vyhledat','Search')}</button></form>
 {error&&<p role="alert">{error}</p>}
 {results&&<><p className="intel-muted">{results.items.length} {tr('výsledků','results')} · {results.asOf} · {tr('Vybráno','Selected')}: {selected.length}/5</p>
 {results.hasMore&&<p>{tr('Další výsledky existují. Upřesněte dotaz.','More results exist. Refine the query.')}</p>}
 {!results.items.length&&<p>{tr('Žádný odpovídající vložený podklad. Neznamená to, že ustanovení neexistuje.','No matching curated source. This does not mean the provision does not exist.')}</p>}
 {results.items.map(s=><article key={s.id} className="legal-source-row"><label><input type="checkbox" checked={selected.includes(s.id)} disabled={busy||(!selected.includes(s.id)&&selected.length>=5)} onChange={e=>{setSelected(old=>e.target.checked?[...old,s.id]:old.filter(id=>id!==s.id));setAnswer(null);}}/><strong>{s.act} Sb. · {s.provision} · {s.heading}</strong></label><small>{s.effectiveFrom} – {s.effectiveTo??tr('bez uvedeného konce','no end supplied')} {tr('(konec výlučně)','(end exclusive)')}</small><details><summary>{tr('Znění a původ','Text and provenance')}</summary><p className="legal-source-text">{s.text}</p><a href={s.sourceUrl} target="_blank" rel="noreferrer">{tr('Ověřit oficiální zdroj','Check official source')}</a><p className="intel-muted">SHA-256: {s.sha256}</p></details></article>)}</>}
 </section>
 <section className="intel-card"><h2>{tr('AI právní rešerše','AI legal research')}</h2><p className="intel-muted">{tr('Spark pracuje jen s vybranými podklady a vaším dotazem. Nevidí soukromý blueprint ani spisy. Nezadávejte skutečné osobní údaje.','Spark uses only selected excerpts and your question. It cannot see the private blueprint or case files. Do not enter real personal data.')}</p>
 <form className="intel-form" onSubmit={e=>{e.preventDefault();void research();}}><label>{tr('Právní otázka a fiktivní skutkové okolnosti','Legal question and fictional facts')}<textarea value={question} minLength={10} maxLength={3000} required disabled={busy} onChange={e=>{setQuestion(e.target.value);setAnswer(null);}} placeholder={tr('Jaké znaky musí být prokázány a co ještě potřebujeme zjistit?','Which elements must be established and what facts remain missing?')}/></label>
 <button type="submit" className="btn btn-primary" disabled={busy||!results||!selected.length||question.trim().length<10}>{busy?tr('Spark analyzuje…','Spark is analyzing…'):tr('Analyzovat vybrané podklady','Analyze selected sources')}</button></form>
 {aiError&&<p role="alert">{aiError}</p>}
 {answer&&<div><p className="intel-muted">{answer.model} · {answer.asOf} · {(answer.durationMs/1000).toFixed(1)} s</p><h3>{tr('Návrh analýzy – k ověření','Draft analysis – verify')}</h3>{answer.points.map((p,i)=><article key={i} className="legal-source-row"><p>{p.analysis}</p>{p.sourceIds.map((id,j)=>{const s=answer.sources.find(x=>x.id===id);return s?<details key={id+j}><summary>{s.act} Sb. · {s.provision}</summary><p className="legal-source-text">{s.text}</p><a href={s.sourceUrl} target="_blank" rel="noreferrer">e-Sbírka ↗</a></details>:null;})}</article>)}<h3>{tr('Chybějící skutečnosti','Missing facts')}</h3><ul>{answer.missingFacts.map((x,i)=><li key={i}>{x}</li>)}</ul><h3>{tr('Omezení rešerše','Research limitations')}</h3><ul>{answer.limitations.map((x,i)=><li key={i}>{x}</li>)}</ul></div>}
 </section></div>
 {canManage&&<SourceEditor eventId={eventId} cs={cs} disabled={busy} onSaved={()=>reset()}/>}
 </div></main></AppShell>;
}
function SourceEditor({eventId,cs,disabled,onSaved}:{eventId:string;cs:boolean;disabled:boolean;onSaved:()=>void}){
 const tr=(c:string,e:string)=>cs?c:e;
 const empty={act:'',provision:'',heading:'',text:'',effectiveFrom:'',effectiveTo:'',sourceUrl:''};
 const [form,setForm]=useState(empty),[checked,setChecked]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState('');
 const lock=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 function change(k:keyof typeof empty,v:string){setForm(f=>({...f,[k]:v}));setChecked(false);}
 async function save(){if(lock.current||disabled||!checked)return;lock.current=true;setBusy(true);setStatus('');
  const input:LegalSourceInput={...form,effectiveTo:form.effectiveTo||null,confirmedSource:true};
  try{const r=await apiClient.addLegalSource(eventId,input);if(!alive.current)return;if(r.ok&&r.data?.eventId===eventId){setForm(empty);setChecked(false);setStatus(tr('Podklad uložen. Spusťte vyhledávání znovu.','Source saved. Run search again.'));onSaved();}else setStatus(r.error||tr('Uložení selhalo','Save failed'));}
  catch{if(alive.current)setStatus(tr('Uložení selhalo','Save failed'));}finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 return <section className="intel-card"><details><summary>{tr('Správa knihovny · vložit ověřený podklad','Library administration · add checked excerpt')}</summary><p className="intel-muted">{tr('Vložte přesné znění a odkaz na jeho časovou verzi. Konec účinnosti je první den, kdy znění již neplatí. Překryvy verzí nejsou povoleny; automatická aktualizace zatím není k dispozici.','Enter the exact wording and version URL. The end date is the first day the wording is no longer effective. Overlapping versions are rejected; automatic synchronization is not available yet.')}</p>
 <form className="intel-form" onSubmit={e=>{e.preventDefault();void save();}}><div className="intel-blueprint-fields"><label>{tr('Číslo předpisu','Act number')}<input required pattern="[0-9]{1,5}/[0-9]{4}" value={form.act} disabled={busy||disabled} onChange={e=>change('act',e.target.value)}/></label><label>{tr('Ustanovení','Provision')}<input required maxLength={100} value={form.provision} disabled={busy||disabled} onChange={e=>change('provision',e.target.value)}/></label><label>{tr('Účinnost od','Effective from')}<input required type="date" value={form.effectiveFrom} disabled={busy||disabled} onChange={e=>change('effectiveFrom',e.target.value)}/></label><label>{tr('Konec účinnosti (výlučně)','Effective to (exclusive)')}<input type="date" value={form.effectiveTo} disabled={busy||disabled} onChange={e=>change('effectiveTo',e.target.value)}/></label></div>
 <label>{tr('Nadpis','Heading')}<input required maxLength={250} value={form.heading} disabled={busy||disabled} onChange={e=>change('heading',e.target.value)}/></label><label>{tr('Přesné znění','Exact wording')}<textarea required minLength={20} maxLength={12000} value={form.text} disabled={busy||disabled} onChange={e=>change('text',e.target.value)}/></label><label>{tr('Oficiální URL','Official URL')}<input required type="url" maxLength={1000} value={form.sourceUrl} disabled={busy||disabled} onChange={e=>change('sourceUrl',e.target.value)} placeholder="https://e-sbirka.gov.cz/…"/></label><label className="intel-check"><input type="checkbox" required checked={checked} disabled={busy||disabled} onChange={e=>setChecked(e.target.checked)}/>{tr('Ověřil jsem znění, datum účinnosti a zdroj v e-Sbírce.','I checked the wording, effective date and source in e-Sbírka.')}</label><button type="submit" className="btn btn-primary" disabled={busy||disabled||!checked}>{tr('Uložit podklad','Save source')}</button>{status&&<p role="status">{status}</p>}</form></details></section>;
}

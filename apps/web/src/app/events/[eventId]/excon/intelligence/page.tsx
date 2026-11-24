'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useParams} from 'next/navigation';
import {AppShell} from '@/components/layout/AppShell';
import {useAuth} from '@/contexts/AuthContext';
import {usePreferences} from '@/contexts/PreferencesContext';
import {apiClient} from '@/lib/api-client';
import {ExerciseAdviceHistory} from '@/components/excon/ExerciseAdviceHistory';
import {ExerciseBlueprintPanel} from '@/components/excon/ExerciseBlueprintPanel';
import {ExerciseObserverHistoryPanel} from '@/components/excon/ExerciseObserverHistoryPanel';
import {ExerciseJobPanel} from '@/components/excon/ExerciseJobPanel';
import type {ExerciseBlueprint,ExerciseAdviceInput,ExerciseIntelligenceOverview} from '@cyris/contracts';

export default function IntelligencePage(){
 const {eventId}=useParams<{eventId:string}>(),{currentUser,viewAs,hasPermission,loading}=useAuth();
 if(loading)return <AppShell title="Intelligence Center"><p role="status">…</p></AppShell>;
 if(viewAs||!hasPermission('scenario.manage',eventId))return <AppShell title="Intelligence Center"><p role="alert">EXCON only / Pouze organizátoři</p></AppShell>;
 return <Workspace key={JSON.stringify([eventId,currentUser?.user.id])} eventId={eventId}/>;
}
function Workspace({eventId}:{eventId:string}){
 const {locale}=usePreferences(),cs=locale==='cs',tr=(c:string,e:string)=>cs?c:e;
 const [overview,setOverview]=useState<ExerciseIntelligenceOverview|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 const [mode,setMode]=useState<'ARCHITECT'|'INTERVENTION'>('ARCHITECT'),[brief,setBrief]=useState(''),[busy,setBusy]=useState(false),[adviceError,setAdviceError]=useState('');
 const [blueprint,setBlueprint]=useState<ExerciseBlueprint|null>(null),[useBlueprint,setUseBlueprint]=useState(true);
 const lock=useRef(false),alive=useRef(true),pendingRequest=useRef<{key:string;id:string}|null>(null);
 const [jobRefresh,setJobRefresh]=useState(0),[jobNotice,setJobNotice]=useState('');
 const onJobComplete=useCallback(()=>setRevision(n=>n+1),[]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{const controller=new AbortController();let active=true,flight=false;
 const refresh=async()=>{if(flight)return;flight=true;try{const res=await apiClient.getExerciseIntelligence(eventId,controller.signal);if(!active)return;if(res.ok&&res.data?.eventId===eventId){setOverview(res.data);setError('');}else{setOverview(null);if(res.status===401||res.status===403||res.status===404){setBlueprint(null);setBrief('');}setError(res.error||tr('Přehled není dostupný','Overview unavailable'));}}catch{if(active){setOverview(null);setError(tr('Přehled není dostupný','Overview unavailable'));}}finally{flight=false;}};
 void refresh();const timer=window.setInterval(()=>{if(!document.hidden)void refresh();},30000);
 return()=>{active=false;controller.abort();window.clearInterval(timer);};
 },[eventId,revision,cs]);
 async function generate(){if(lock.current||brief.trim().length<10||!overview?.provider.enabled)return;lock.current=true;setBusy(true);setAdviceError('');setJobNotice('');
 const input:ExerciseAdviceInput={mode,brief,locale:cs?'cs':'en',...(useBlueprint&&blueprint?{blueprintRevision:blueprint.revision}:{})};
 try{const key=JSON.stringify(input);if(pendingRequest.current?.key!==key)pendingRequest.current={key,id:crypto.randomUUID()};
 const res=await apiClient.submitExerciseJob(eventId,{requestId:pendingRequest.current.id,input});if(!alive.current)return;
 if(res.ok&&res.data?.eventId===eventId){pendingRequest.current=null;setJobNotice(tr('Úloha uložena. Můžete zavřít stránku.','Job saved. You may close this page.'));setJobRefresh(n=>n+1);}
 else setAdviceError(res.error||tr('Úlohu se nepodařilo uložit','Job submission failed'));}
 catch{if(alive.current)setAdviceError(tr('Úlohu se nepodařilo uložit','Job submission failed'));}
 finally{lock.current=false;if(alive.current)setBusy(false);}}
 const base='/events/'+eventId;
 return <AppShell title="Intelligence Center" breadcrumbs={[{label:'EXCON',href:base+'/excon'},{label:'Intelligence Center'}]}>
 <main className="excon-optimized mx-auto max-w-[1440px] p-4 md:p-8"><div className="intel-shell">
 <header><h1>{tr('Intelligence Center','Intelligence Center')}</h1><p className="intel-muted">{tr('Privátní operační prostředí EXCONu · NVIDIA DGX Spark','Private EXCON operational workspace · NVIDIA DGX Spark')}</p></header>
 <div className="intel-actions"><Link className="btn btn-secondary" href={base+'/excon/intelligence/presentation'}>{tr('Prezentační režim','Presentation mode')}</Link><Link href={base+'/excon'}>{tr('Zpět na EXCON','Back to EXCON')}</Link><button type="button" onClick={()=>setRevision(n=>n+1)}>{tr('Obnovit přehled','Refresh overview')}</button></div>
 {error&&<p role="alert">{error}</p>}
 {!overview&&!error&&<p role="status">{tr('Načítám přehled…','Loading overview…')}</p>}
 {overview&&<>
 <section className="intel-card"><h2>{overview.event.name}</h2><p className="intel-muted">{overview.event.status} · {overview.event.timezone} · {overview.activePhase?.title??tr('Bez aktivní fáze','No active phase')}</p><div className="intel-grid"><div><small>DEFCON</small><div className="intel-kpi">{overview.defcon.level??'—'}</div></div><div><small>{tr('Aktivní členství','Active memberships')}</small><div className="intel-kpi">{overview.participation.activeUsers}</div></div><div><small>{tr('Týmy','Teams')}</small><div className="intel-kpi">{overview.participation.activeTeams}</div></div><div><small>{tr('Dokončené fáze','Completed phases')}</small><div className="intel-kpi">{overview.phases.completed} / {overview.phases.total}</div></div></div><p className="intel-muted">{tr('Členství není údaj o počtu právě připojených uživatelů.','Membership is not concurrent online presence.')}</p></section>
 <section className="intel-grid">
 <article className="intel-card"><h2>DGX Spark</h2><div className="intel-kpi">{overview.provider.enabled?tr('Povoleno','Enabled'):tr('Vypnuto','Disabled')}</div><p className="intel-muted">{overview.provider.chatModel??'—'} · {overview.provider.status}</p><p className="intel-muted">{tr('Konfigurační stav, nikoli živý GPU monitoring.','Configuration status, not live GPU telemetry.')}</p></article>
 <article className="intel-card"><h2>{tr('AI pokusy · 24 h','AI attempts · 24 h')}</h2><div className="intel-kpi">{overview.usage.total}</div><p>{overview.usage.successful} {tr('úspěšných','successful')} · {overview.usage.failed} {tr('neúspěšných','unsuccessful')}</p></article>
 <article className="intel-card"><h2>{tr('Průměrná doba','Average duration')}</h2><div className="intel-kpi">{overview.usage.averageMs===null?'—':(overview.usage.averageMs/1000).toFixed(1)+' s'}</div><p className="intel-muted">{tr('Ukončené pokusy tohoto cvičení','Completed attempts in this exercise')}</p></article>
 </section>
 <section className="intel-grid"><article className="intel-card"><h2>{tr('Kapacita AI · celá platforma','AI admission · platform-wide')}</h2><div className="intel-kpi">{overview.admission?overview.admission.active+' / '+overview.admission.limit:'—'}</div><p className="intel-muted">{tr('Aktivní inference sloty, nikoli vytížení GPU. Kapacita je sdílená všemi uživateli.','Active admission leases, not GPU utilization. Capacity is shared across users.')}</p>{overview.admission&&<><p>{tr('Čekající požadavky','Waiting requests')}: <strong>{overview.admission.waiting} / {overview.admission.maxPending}</strong> · {tr('prioritní podpora','priority support')}: {overview.admission.waitingSupport}</p><p className="intel-muted">{tr('Maximální doba čekání','Maximum wait')}: {overview.admission.maxWaitMs/1000} s</p></>}</article><article className="intel-card"><h2>{tr('Pozorovatel cvičení','Exercise observer')}</h2><div className="intel-kpi">{overview.observer?overview.observer.unchanged:'—'}</div><p>{tr('Úkoly viditelné ve cvičení beze změny','Event-visible tasks unchanged')} · {overview.observer?.reviewAfterHours??'—'} h</p><p className="intel-muted">{overview.observer?new Date(overview.observer.observedAt).toLocaleString()+' · '+overview.observer.pending+' '+tr('otevřených','pending'):tr('Nedostupné, neaktivní nebo pozastavené cvičení.','Unavailable, inactive or paused exercise.')}</p><p className="intel-muted">{tr('Pouze čas od poslední změny záznamu. Neznamená nečinnost týmu.','Record age only; not proof of team inactivity.')}</p></article></section>
 <section className="intel-card"><h2>{tr('Co vyžaduje pozornost','Operational signals')}</h2><p className="intel-muted">{tr('Pozorování z databáze, nikoli vysvětlení příčin.','Database observations, not causal conclusions.')}</p><ul className="intel-list">{overview.signals.map(s=><li key={s.id} data-level={s.level}><strong>{s.count} · {cs?s.labelCs:s.label}</strong><p className="intel-muted">{s.source}</p><Link href={base+s.href}>{tr('Otevřít agendu','Open workspace')}</Link></li>)}</ul>{!overview.signals.length&&<p>{tr('Žádný sledovaný signál není aktivní.','No monitored signal is active.')}</p>}<p className="intel-muted">{new Date(overview.asOf).toLocaleString()}</p></section>
 <section className="intel-card"><h2>{tr('Výkon Sparku · posledních 24 h','Spark performance · last 24 h')}</h2><div className="intel-grid"><div><small>{tr('Průměrný čas přijetí požadavku','Average admission time')}</small><div className="intel-kpi">{overview.usage.admissionAverageMs===null?'—':(overview.usage.admissionAverageMs/1000).toFixed(2)+' s'}</div></div><div><small>{tr('Průměrný čas volání modelu','Average provider time')}</small><div className="intel-kpi">{overview.usage.providerAverageMs===null?'—':(overview.usage.providerAverageMs/1000).toFixed(2)+' s'}</div></div><div><small>{tr('Odmítnuté kvůli kapacitě','Capacity rejections')}</small><div className="intel-kpi">{overview.usage.capacityRejected}</div></div><div><small>{tr('Časové limity','Timeouts')}</small><div className="intel-kpi">{overview.usage.timeouts}</div></div></div><p className="intel-muted">{overview.usage.timedSamples} {tr('pokusů s novým časováním. Čas volání zahrnuje síť a zpracování poskytovatelem, nikoli jen GPU.','attempts with new timing. Provider time includes network and provider processing, not GPU time alone.')}</p><h3>{tr('Využití podle funkce','Usage by operation')}</h3><ul className="intel-list">{overview.usage.byOperation.map(r=><li key={r.operation}><strong>{r.operation} · {r.count}</strong><p className="intel-muted">{tr('Průměr','Mean')}: {r.averageMs===null?'—':(r.averageMs/1000).toFixed(1)+' s'} · P95: {r.p95Ms===null?'—':(r.p95Ms/1000).toFixed(1)+' s'} · {tr('odmítnuto','rejected')}: {r.capacityRejected}</p></li>)}</ul>{!overview.usage.byOperation.length&&<p>{tr('Zatím bez evidovaných pokusů za 24 hodin.','No recorded attempts in the last 24 hours.')}</p>}</section>
 </>}
 {overview&&<ExerciseObserverHistoryPanel eventId={eventId} cs={cs}/>}
 {overview&&<ExerciseBlueprintPanel eventId={eventId} cs={cs} disabled={busy} onCurrent={setBlueprint}/>}
 <section className="intel-card"><h2>{tr('AI operační asistent','AI operations assistant')}</h2><form className="intel-form" onSubmit={e=>{e.preventDefault();void generate();}}>
 <label>{tr('Režim','Mode')}<select disabled={busy} value={mode} onChange={e=>{setMode(e.target.value as typeof mode);}}><option value="ARCHITECT">{tr('Návrh celého cvičení','Exercise architect')}</option><option value="INTERVENTION">{tr('Návrh intervence a nápovědy','Intervention advisor')}</option></select></label>
 <label>{tr('Záměr a kontext organizátora','Organizer intent and context')}<textarea disabled={busy} value={brief} maxLength={12000} minLength={10} required onChange={e=>{setBrief(e.target.value);}} placeholder={tr('Popište letošní scénář, cíle nebo problém týmu. Nezadávejte skutečné osobní údaje.','Describe the exercise, goals or team difficulty. Do not enter real personal data.')}/></label>
 {blueprint&&<label className="intel-check"><input type="checkbox" checked={useBlueprint} disabled={busy} onChange={e=>{setUseBlueprint(e.target.checked);}}/>{tr('Použít uložený blueprint','Use saved blueprint')} · r{blueprint.revision}</label>}
 <p className="intel-muted">{tr('Pouze návrh pro organizátora. Nic se automaticky nezaloží ani neodešle.','Organizer draft only. Nothing is automatically created or sent.')}</p>
 <button type="submit" disabled={busy||brief.trim().length<10||!overview?.provider.enabled}>{busy?tr('Ukládám úlohu…','Saving job…'):tr('Spustit úlohu na pozadí','Start background job')}</button></form>
 {adviceError&&<p role="alert">{adviceError}</p>}
 {jobNotice&&overview&&<p role="status">{jobNotice}</p>}
 </section>
 {overview&&<ExerciseJobPanel eventId={eventId} cs={cs} refreshKey={jobRefresh} onComplete={onJobComplete}/>}
 {overview&&<ExerciseAdviceHistory eventId={eventId} cs={cs} refreshKey={revision} blueprintRevision={blueprint?.revision??null}/>}
 </div></main></AppShell>;
}

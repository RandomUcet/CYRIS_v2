'use client';
import Link from 'next/link';
import type {ExconDashboardResponse} from '@cyris/contracts';
type Props={snapshot:ExconDashboardResponse;locale:string;freshness:'fresh'|'stale'|'paused';href:string};
export function ExconScenarioTimeline({snapshot,locale,freshness,href}:Props){
 const cs=locale==='cs',tr=(c:string,e:string)=>cs?c:e;
 const clock=snapshot.scenarioClock;
 const format=(value:string|null)=>{if(!value)return '—';const date=new Date(value);if(!Number.isFinite(date.getTime()))return '—';try{return new Intl.DateTimeFormat(cs?'cs-CZ':'en-GB',{dateStyle:'short',timeStyle:'medium',timeZone:snapshot.event.timezone}).format(date);}catch{return date.toISOString();}};
 const statuses:Record<string,[string,string]>={DRAFT:['Koncept','Draft'],PLANNED:['Plánováno','Planned'],ACTIVE:['Aktivní','Active'],COMPLETED:['Dokončeno','Completed'],CANCELLED:['Zrušeno','Cancelled']};
 return <section className="excon-timeline" aria-label={tr('Scénářové hodiny a fáze','Scenario clock and phases')}>
  <header><h2>{tr('Čas a průběh scénáře','Scenario time and progression')}</h2><Link className="btn btn-secondary" href={href}>{tr('Otevřít režii','Open run sheet')}</Link></header>
  <div className="excon-clock-grid">
   <div><small>{tr('Scénářový čas při načtení','Scenario time at snapshot')}</small><strong>{format(clock?.scenarioTime??null)}</strong><small>{clock?clock.paused?tr('Pozastaveno','Paused'):clock.mode==='REAL_TIME'?tr('Reálný čas','Real time'):tr('Scénářový režim','Scenario mode'):'—'}{clock&&!clock.paused&&clock.mode==='SCENARIO_TIME'?' · '+clock.speedMultiplier+'×':''}</small></div>
   <div><small>{tr('Skutečný čas snímku','Real snapshot time')}</small><strong>{format(snapshot.asOf)}</strong><small>{snapshot.event.timezone} · {freshness==='fresh'?tr('Aktuální snímek','Current snapshot'):tr('Nejde o živý čas','Not a live clock')}</small></div>
  </div>
  <p className="excon-timeline-note">{tr('Časy jsou zobrazeny v časovém pásmu cvičení. Stav hodin není potvrzením, že automatické vydávání vstupů právě probíhá.','Times use the exercise timezone. Clock state does not confirm that automatic inject release is running.')}</p>
  {snapshot.phaseTimeline?.length?<ol className="excon-phase-list">{snapshot.phaseTimeline.map(phase=><li key={phase.id} data-active={phase.status==='ACTIVE'} aria-current={phase.status==='ACTIVE'?'step':undefined}><span>{phase.sequence}</span><div><strong>{phase.code} · {phase.title}</strong>{(phase.plannedStartAt||phase.plannedEndAt)&&<small>{tr('Plán','Plan')}: {format(phase.plannedStartAt)} – {format(phase.plannedEndAt)}</small>}</div><span>{statuses[phase.status]?.[cs?0:1]??phase.status}</span></li>)}</ol>:<p>{tr('Fáze scénáře dosud nejsou vytvořené.','No scenario phases have been created yet.')}</p>}
 </section>;
}

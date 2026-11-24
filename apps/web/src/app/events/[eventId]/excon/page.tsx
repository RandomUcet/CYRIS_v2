'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Activity, AlertTriangle, ArrowRight, BellRing, Clock3, ClipboardList,
  FileBarChart2, Gauge, RefreshCw, Radio, ShieldAlert, Sparkles, Users,
} from 'lucide-react';
import type { ExconDashboardResponse } from '@cyris/contracts';
import { AppShell } from '@/components/layout/AppShell';
import { exconAttention, snapshotFreshness } from '@/lib/excon-workspace';
import { ExconScenarioTimeline } from '@/components/excon/ExconScenarioTimeline';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { apiClient } from '@/lib/api-client';

type Dashboard = ExconDashboardResponse;

const actionLinks = [
  {suffix:'/excon/intelligence',cs:'Intelligence Center · Spark',en:'Intelligence Center · Spark',icon:Sparkles,permission:'scenario.manage'},
  {suffix:'/scenario/control',cs:'Režie scénáře',en:'Scenario run sheet',icon:ClipboardList,permission:'scenario.read'},
  {suffix:'/broadcast',cs:'Zprávy účastníkům',en:'Exercise broadcasts',icon:BellRing,permission:'scenario.manage'},
  {suffix:'/command',cs:'Krizové řízení',en:'Command & DEFCON',icon:Gauge,permission:'command.read'},
  {suffix:'/scenario-data',cs:'Spark a scénářová data',en:'Spark & scenario data',icon:Sparkles,permission:'scenario.manage'},
  {suffix:'/support',cs:'Podpora týmů',en:'Team support',icon:Users,permission:null},
  {suffix:'/evaluation/after-action',cs:'Vyhodnocení akce',en:'After-action review',icon:FileBarChart2,permission:'evaluation.read'},
] as const;

function percentage(n:number,total:number) {
  return total>0?Math.max(0,Math.min(100,Math.round(100*n/total))):0;
}

function Progress({value,total,label}:{value:number;total:number;label:string}) {
  const pct=percentage(value,total);
  return <div aria-label={label+' '+pct+'%'} className="space-y-1">
    <div className="flex justify-between gap-2 text-xs text-slate-400">
      <span>{label}</span><span className="tabular-nums">{value} / {total} · {pct}%</span>
    </div>
    <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
      <div className="h-full rounded-full bg-sky-500" style={{width:pct+'%'}}/>
    </div>
  </div>;
}

function DashboardPage({eventId}:{eventId:string}) {
  const {hasPermission,viewAs,loading:authLoading} = useAuth();
  const {locale} = usePreferences();
  const cs=locale==='cs';
  const tr=(cz:string,en:string)=>cs?cz:en;
  const allowed=!viewAs && hasPermission('scenario.manage',eventId);
  const [snapshot,setSnapshot]=useState<Dashboard|null>(null);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [error,setError]=useState('');
  const [autoRefresh,setAutoRefresh]=useState(true);
  const [now,setNow]=useState(()=>Date.now());
  const controllerRef=useRef<AbortController|null>(null);
  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),10000);return()=>window.clearInterval(timer);},[]);
  const generation=useRef(0);
  const inFlight=useRef<number|null>(null);
  const format=(value:string|null|undefined)=>value
    ? new Date(value).toLocaleString(cs?'cs-CZ':'en-GB',{dateStyle:'short',timeStyle:'short'})
    : '—';

  const refresh=useCallback(async ()=>{
    if(authLoading||!allowed||inFlight.current!==null)return;
    const request=++generation.current;
    inFlight.current=request;
    const controller=new AbortController();controllerRef.current=controller;
    setRefreshing(true);
    try {
      const result=await apiClient.getExconDashboard(eventId,controller.signal);
      if(generation.current!==request)return;
      if(result.ok&&result.data?.event.id===eventId){setSnapshot(result.data);setNow(Date.now());setError('');}
      else {
        if(result.status===401||result.status===403||result.status===404||result.ok)setSnapshot(null);
        setError(result.error||tr('Přehled EXCON není dostupný','Unable to load EXCON overview'));
      }
    }catch(err){
      if(!controller.signal.aborted&&generation.current===request)setError(err instanceof Error?err.message:tr('Připojení není dostupné','Connection unavailable'));
    }finally{
      if(controllerRef.current===controller)controllerRef.current=null;
      if(inFlight.current===request)inFlight.current=null;
      if(generation.current===request){setLoading(false);setRefreshing(false);}
    }
  },[eventId,authLoading,allowed,cs]);

  useEffect(()=>{
    setSnapshot(null);setError('');setLoading(true);setRefreshing(false);
    if(!authLoading&&allowed)void refresh();
    return ()=>{generation.current++;inFlight.current=null;controllerRef.current?.abort();controllerRef.current=null;};
  },[refresh,authLoading,allowed]);
  useEffect(()=>{
    if(authLoading||!allowed||!autoRefresh)return;
    const poll=()=>{if(!document.hidden)void refresh();};
    const timer=window.setInterval(poll,20000);
    document.addEventListener('visibilitychange',poll);
    return ()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',poll);};
  },[refresh,authLoading,allowed,autoRefresh]);

  const base='/events/'+eventId;
  if(!authLoading&&!allowed) {
    return <AppShell breadcrumbs={[{label:'EXCON'}]}>
      <main className="excon-optimized mx-auto max-w-5xl p-6">
        <h1 className="text-xl font-bold text-slate-100">{tr('EXCON – řízení cvičení','EXCON – exercise control')}</h1>
        <p role="alert" className="mt-4 rounded border border-amber-800 bg-amber-950/30 p-4 text-slate-200">
          {tr('K souhrnu mají přístup pouze organizátoři s oprávněním spravovat scénář. Náhled účastníka zůstává oddělený.',
          'This overview requires exercise scenario management rights. Participant preview remains restricted.')}
        </p>
      </main>
    </AppShell>;
  }

  const attention=snapshot?exconAttention(snapshot).map(item=>({
    ...item,href:item.route?base+item.route:null,label:cs?item.cs:item.en,
  })):[];
  const freshness=snapshotFreshness(snapshot?.asOf,now,autoRefresh,Boolean(error));

  return <AppShell breadcrumbs={[
    {label:tr('Cvičení','Exercise'),href:base+'/overview'},
    {label:'EXCON'}
  ]}>
    <main className="excon-optimized mx-auto max-w-[1440px] space-y-6 p-4 pb-16 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.2em] text-sky-400">
            <Activity size={15}/> EXCON · CYRIS
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white md:text-3xl">
            {tr('Řídicí centrum cvičení','Exercise control center')}
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            {snapshot?snapshot.event.name:tr('Načítání cvičení…','Loading exercise…')}
            {snapshot?' · '+snapshot.event.status:''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={autoRefresh} onChange={e=>setAutoRefresh(e.target.checked)}/>{tr('Živá aktualizace','Live refresh')}</label>
          <div className="text-right text-xs text-slate-400">
            <span className="block">{tr('Poslední aktualizace','Updated')}</span>
            <span className="tabular-nums text-slate-200">{snapshot?format(snapshot.asOf):'—'}</span>
          </div>
          <button type="button" disabled={refreshing||authLoading} onClick={()=>void refresh()}
            aria-label={tr('Obnovit informace','Refresh information')}
            className="flex items-center gap-2 rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800 disabled:opacity-40">
            <RefreshCw size={15} className={refreshing?'animate-spin':''}/>{tr('Obnovit','Refresh')}
          </button>
        </div>
      </header>

      {snapshot&&<div className="excon-freshness" data-state={freshness} role="status"><span>{freshness==='fresh'?tr('Aktuální snímek','Current snapshot'):freshness==='paused'?tr('Automatická aktualizace pozastavena','Automatic refresh paused'):tr('Zobrazený stav nemusí být aktuální','Snapshot may be stale')}</span><span>{tr('Aktivní účty označují členství, nikoli právě připojené uživatele.','Active accounts indicate membership, not currently connected users.')}</span></div>}
      {!autoRefresh&&<p role="status" className="text-sm text-amber-300">{tr('Automatická aktualizace je vypnutá. Zobrazené údaje mohou být zastaralé.','Automatic refresh is paused. Displayed data may be stale.')}</p>}
      {error&&<p role="alert" className="rounded border border-amber-800 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
        {error} {snapshot?tr('Zobrazuji poslední dostupný stav.','Showing the last available snapshot.'):''}
      </p>}

      {authLoading||loading&&!snapshot?<div role="status" className="rounded-xl border border-slate-700 bg-slate-900 p-8 text-slate-300">
        {tr('Načítám stav scénáře, zpráv a zapojení týmů…','Loading scenario, messaging and team engagement…')}
      </div>:snapshot?<>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label={tr('Stav cvičení','Exercise status')}>
          {[
            {label:tr('DEFCON','DEFCON'),value:snapshot.defcon.level?'DEFCON '+snapshot.defcon.level:tr('Nenastaven','Not set'),hint:snapshot.defcon.updatedAt?format(snapshot.defcon.updatedAt):tr('Zatím bez změny','No change yet'),icon:ShieldAlert},
            {label:tr('Aktivní účty','Active members'),value:snapshot.participation.activeUsers,hint:tr('V tomto cvičení','In this exercise'),icon:Users},
            {label:tr('Aktivní týmy','Active teams'),value:snapshot.participation.activeTeams,hint:tr('Bez archivovaných','Non-archived'),icon:Radio},
            {label:tr('Fáze scénáře','Scenario phases'),value:snapshot.phases.completed+' / '+snapshot.phases.total,hint:snapshot.activePhase?snapshot.activePhase.code+' · '+snapshot.activePhase.title:tr('Žádná aktivní fáze','No active phase'),icon:Clock3},
          ].map(item=><article key={item.label} className="min-w-0 rounded-xl border border-slate-700 bg-slate-900 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400"><item.icon size={15}/>{item.label}</div>
            <p className="mt-3 break-words text-2xl font-bold tabular-nums text-white">{item.value}</p>
            <p className="mt-1 line-clamp-2 text-xs text-slate-400">{item.hint}</p>
          </article>)}
        </section>

        <section className="rounded-xl border border-slate-700 bg-slate-900 p-4 md:p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-white"><AlertTriangle size={17}/>{tr('Vyžaduje pozornost','Needs attention')}</h2>
          {attention.length?<div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {attention.map(item=>{
              const content=<><div><p className="text-2xl font-bold tabular-nums text-amber-200">{item.count}</p><p className="mt-1 text-xs text-slate-300">{item.label}</p></div>{item.href&&<ArrowRight size={16} className="text-amber-300"/>}</>;
              const style="flex items-center justify-between rounded-lg border border-amber-900 bg-amber-950/20 p-3";
              return item.href?<Link key={item.key} href={item.href} className={style}>{content}</Link>:<div key={item.key} className={style}>{content}</div>;
            })}
          </div>:<p className="mt-3 text-sm text-slate-400">{tr('V těchto sledovaných oblastech nejsou žádné otevřené položky.','No outstanding items in these monitored categories.')}</p>}
        </section>

        <ExconScenarioTimeline snapshot={snapshot} locale={locale} freshness={freshness} href={base+'/scenario/control'}/>

        <section className="rounded-xl border border-slate-700 bg-slate-900 p-4 md:p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-100"><ArrowRight size={17}/>{tr('Rychlé ovládání','Quick actions')}</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {actionLinks.filter(item=>!item.permission||hasPermission(item.permission,eventId)).map(item=><Link
              key={item.suffix} href={base+item.suffix}
              className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm font-medium text-slate-200 transition-colors hover:border-sky-700 hover:bg-slate-800">
              <span className="flex items-center gap-2"><item.icon size={17} className="text-sky-400"/>{cs?item.cs:item.en}</span><ArrowRight size={15} className="text-slate-500"/>
            </Link>)}
          </div>
        </section>

        {snapshot.holds.active>0&&<section role="status" className="rounded-xl border border-amber-700 bg-amber-950/30 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-200"><ShieldAlert size={17}/>
            {tr('Aktivní provozní blokace cvičení','Active exercise-wide operational holds')} · {snapshot.holds.active}</div>
          <p className="mt-1 text-sm text-amber-100/90">
            {tr('Dotčené oblasti: ','Affected modules: ')}{snapshot.holds.modules.join(', ')}
            {' · '}{tr('Automatické odesílání se řídí pravidly blokací.','Automatic deliveries respect the active holds.')}
          </p>
        </section>}

        <section className="grid gap-4 xl:grid-cols-2">
          <article className="rounded-xl border border-slate-700 bg-slate-900 p-4 md:p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">{tr('Scénář a injecty','Scenario injects')}</h2>
              <Link className="text-xs font-medium text-sky-400 hover:underline" href={base+'/scenario/control'}>{tr('Otevřít režii','Open run sheet')}</Link>
            </div>
            <div className="excon-metrics mt-4 grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
              {[
                [tr('Celkem','Total'),snapshot.injects.total],
                [tr('Připravené','Ready'),snapshot.injects.ready],
                [tr('Blokované','Blocked'),snapshot.injects.blocked],
                [tr('Plánované','Scheduled'),snapshot.injects.scheduled],
                [tr('Vydané','Released'),snapshot.injects.released],
                [tr('Koncepty','Drafts'),snapshot.injects.draft],
              ].map(([name,value])=><div key={name} className="rounded-lg bg-slate-950 p-2"><p className="text-xl font-bold tabular-nums text-white">{value}</p><p className="text-[11px] text-slate-400">{name}</p></div>)}
            </div>
            <div className="mt-5">
              <Progress value={snapshot.injects.released} total={snapshot.injects.total} label={tr('Vydané vstupy','Released injects')}/>
            </div>
          </article>
          <article className="rounded-xl border border-slate-700 bg-slate-900 p-4 md:p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">{tr('Notifikace a zapojení','Messaging & engagement')}</h2>
              <Link className="text-xs font-medium text-sky-400 hover:underline" href={base+'/broadcast'}>{tr('Spravovat zprávy','Manage notices')}</Link>
            </div>
            <div className="excon-metrics mt-4 grid grid-cols-4 gap-2 text-center">
              {[
                [tr('Koncepty','Drafts'),snapshot.broadcasts.draft],
                [tr('Čekající','Scheduled'),snapshot.broadcasts.scheduled],
                [tr('Odeslané','Sent'),snapshot.broadcasts.sent],
                [tr('Chyby','Failed'),snapshot.broadcasts.failed],
              ].map(([name,value])=><div key={name} className="rounded-lg bg-slate-950 p-2"><p className="text-xl font-bold tabular-nums text-white">{value}</p><p className="text-[11px] text-slate-400">{name}</p></div>)}
            </div>
            <div className="mt-4 space-y-3">
              <Progress label={tr('Přečtení zpráv EXCON','EXCON notices read')}
                value={snapshot.participation.broadcastsRead} total={snapshot.participation.broadcastReceipts}/>
              <Progress label={tr('Přečtení briefingů','Briefing receipts read')}
                value={snapshot.participation.briefingsRead} total={snapshot.participation.briefingReceipts}/>
              <Progress label={tr('Potvrzení briefingů','Briefings acknowledged')}
                value={snapshot.participation.briefingsAcknowledged} total={snapshot.participation.briefingReceipts}/>
            </div>
          </article>
        </section>



        <section className="grid gap-4 xl:grid-cols-2">
          <article className="rounded-xl border border-slate-700 bg-slate-900 p-4 md:p-5">
            <h2 className="text-base font-semibold text-white">{tr('Nejbližší scénářové vstupy','Next scenario injects')}</h2>
            <p className="mt-1 text-xs text-slate-400">{tr('Plánovaný čas injectu se řídí scénářovými hodinami.','Inject schedules use scenario time, not real-world notification time.')}</p>
            {snapshot.upcomingInjects.length?<div className="mt-3 space-y-2">
              {snapshot.upcomingInjects.map(item=><Link key={item.id} href={base+'/scenario/control'}
                className="block rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 hover:border-sky-700">
                <div className="flex justify-between gap-3">
                  <div className="min-w-0"><p className="text-xs font-medium text-sky-400">{item.number} · {item.priority}</p>
                    <p className="mt-1 truncate text-sm font-semibold text-slate-100">{item.title}</p></div>
                  <span className="shrink-0 text-xs font-medium text-slate-400">{item.status}</span>
                </div>
                {item.scheduledAt&&<p className="mt-1 text-xs text-slate-400">{format(item.scheduledAt)}</p>}
              </Link>)}
            </div>:<p className="mt-3 text-sm text-slate-400">{tr('Žádné čekající injecty.','No pending injects.')}</p>}
          </article>
          <article className="rounded-xl border border-slate-700 bg-slate-900 p-4 md:p-5">
            <h2 className="text-base font-semibold text-white">{tr('Naplánované zprávy EXCON','Scheduled EXCON messages')}</h2>
            <p className="mt-1 text-xs text-slate-400">{tr('Skutečný čas automatického odeslání.','Real-world automatic delivery time.')}</p>
            {snapshot.upcomingBroadcasts.length?<div className="mt-3 space-y-2">
              {snapshot.upcomingBroadcasts.map(item=><Link key={item.id} href={base+'/broadcast'}
                className="block rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 hover:border-sky-700">
                <div className="flex justify-between gap-3">
                  <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-100">{item.title}</p>
                    <p className="mt-1 text-xs text-slate-400">{item.kind} · {item.audience==='ALL'?tr('Všichni','All'):item.unitName??tr('Tým','Team')}</p></div>
                  <span className="shrink-0 text-xs text-sky-300">{format(item.scheduledAt)}</span>
                </div>
              </Link>)}
            </div>:<p className="mt-3 text-sm text-slate-400">{tr('Žádné naplánované zprávy.','No scheduled messages.')}</p>}
          </article>
        </section>

        <section className="rounded-xl border border-slate-700 bg-slate-900 p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-white">{tr('Poslední odeslaná oznámení','Recent EXCON broadcasts')}</h2>
            <span className="text-xs text-slate-400">{tr('Souhrn bez osobních údajů příjemců','Aggregate receipts; no participant identities')}</span>
          </div>
          {snapshot.recentBroadcasts.length?<div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {snapshot.recentBroadcasts.map((item,index)=><div key={item.id||index} className="rounded border border-slate-700 bg-slate-950 p-3">
              <p className="truncate text-sm font-semibold text-slate-100">{item.title}</p>
              <p className="mt-1 text-xs text-slate-400">{item.kind} · {format(item.sentAt)}</p>
              <div className="mt-3"><Progress label={tr('Přečteno','Read')} value={item.read} total={item.delivered}/></div>
            </div>)}
          </div>:<p className="mt-3 text-sm text-slate-400">{tr('Zatím nebyla odeslána žádná zpráva.','No participant announcements have been sent yet.')}</p>}
        </section>
        <footer className="text-xs text-slate-500">{tr(
          'Údaje pocházejí z databáze CYRIS, obnovují se při otevřené stránce přibližně každých 20 sekund. Nejde o potvrzení skutečného fyzického splnění úkolů.',
          'Metrics come from CYRIS records and refresh about every 20 seconds while the page is visible. They do not independently verify real-world task completion.'
        )}</footer>
      </>:null}
    </main>
  </AppShell>;
}

export default function ExconPage() {
  const params=useParams<{eventId:string}>();
  const {currentUser,viewAs}=useAuth();
  return <DashboardPage key={JSON.stringify([params.eventId,currentUser?.user.id,viewAs?.id])} eventId={params.eventId}/>;
}

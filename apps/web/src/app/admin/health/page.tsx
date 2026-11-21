'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {Activity,AlertTriangle,CheckCircle2,Clock3,RefreshCw,Server,Shield} from 'lucide-react';
import type {HealthResponse,ReadinessResponse} from '@cyris/contracts';
import {AppShell} from '@/components/layout/AppShell';
import {LoadingState,ErrorState} from '@/components/common/StateViews';
import {useAuth} from '@/contexts/AuthContext';
import {usePreferences} from '@/contexts/PreferencesContext';
import {apiClient} from '@/lib/api-client';
import styles from './system-health.module.css';

type Snapshot={health:HealthResponse|null;readiness:ReadinessResponse|null;checkedAt:Date;problem:string|null};
type Key='postgres'|'redis'|'typesense'|'storage'|'mail';
const keys:Key[]=['postgres','redis','typesense','storage','mail'];
const names:Record<Key,string>={postgres:'PostgreSQL',redis:'Redis',typesense:'Typesense',storage:'Object storage (S3)',mail:'SMTP / e-mail'};

function duration(seconds:number){
  const minutes=Math.floor(seconds/60);
  const hours=Math.floor(minutes/60);
  return hours>0?`${hours}h ${minutes%60}m`:`${minutes}m`;
}
function isFresh(snapshot:Snapshot|null):boolean{
  return Boolean(snapshot&&Date.now()-snapshot.checkedAt.getTime()<=60_000);
}

export default function SystemHealthPage(){
  const {isPlatformAdmin,loading:sessionLoading,viewAs}=useAuth();
  const {locale,formatDate,formatTime}=usePreferences();
  const cs=locale==='cs',tr=(cz:string,en:string)=>cs?cz:en;
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const request=useRef(0);
  useEffect(()=>{
    if(sessionLoading||!isPlatformAdmin||viewAs)return;
    let live=true,waiting=false;
    async function refresh(){
      if(waiting)return;
      waiting=true;setBusy(true);
      const ticket=++request.current;
      try{
        const [health,readiness]=await Promise.all([apiClient.getHealth(),apiClient.getReadiness()]);
        if(!live||ticket!==request.current)return;
        const problem=!health.ok&&!readiness.data?tr('Provozní diagnostika není dostupná.','Operational health check is unavailable.'):null;
        setSnapshot({health:health.data??null,readiness:readiness.data??null,problem,checkedAt:new Date()});
      }catch{
        if(live&&ticket===request.current)setSnapshot(old=>({health:old?.health??null,readiness:old?.readiness??null,problem:tr('Nepodařilo se spojit se serverem.','Cannot reach the server.'),checkedAt:old?.checkedAt??new Date(0)}));
      }finally{waiting=false;if(live){setBusy(false);setLoading(false);}}
    }
    void refresh();
    const interval=window.setInterval(refresh,30000);
    const onFocus=()=>{void refresh();};
    window.addEventListener('focus',onFocus);
    return ()=>{live=false;window.clearInterval(interval);window.removeEventListener('focus',onFocus);};
  },[isPlatformAdmin,sessionLoading,viewAs,locale]);
  const blocked=!sessionLoading&&(!isPlatformAdmin||Boolean(viewAs));
  const stale=snapshot&&!isFresh(snapshot);
  const ready=snapshot?.readiness;
  const dep=ready?.dependencies;
  const states=keys.map(key=>({key,status:dep?.[key]?.status,latency:dep?.[key]?.latencyMs}));
  const healthy=Boolean(snapshot&&!stale&&!snapshot.problem&&snapshot.health?.status==='ok'&&ready?.status==='ok');
  const partial=Boolean(snapshot&&!stale&&!snapshot.problem&&snapshot.health?.status==='ok'&&ready?.status==='down');

  return <AppShell title={tr('Zdraví systému','System health')} breadcrumbs={[{label:'Administration',href:'/admin'},{label:'System health'}]}>
    <div className={styles.page}>
      <header className={styles.intro}><Server size={25}/>
        <div><h2>{tr('Provozní diagnostika CYRIS','CYRIS operational diagnostics')}</h2>
          <p>{tr('Skutečné kontroly API, databáze a podpůrných služeb. Tyto údaje nevyjadřují stupeň DEFCON ani simulované odstávky v jednotlivých cvičeních.','Real API, database and service checks. These results are separate from exercise DEFCON and simulated service disruptions.')}</p>
        </div>
      </header>
      {blocked?<div className={styles.notice} role="alert"><Shield size={18}/>{tr('Tato obrazovka je dostupná pouze správci platformy.','This view is restricted to platform administrators.')}</div>:
        sessionLoading||loading?<LoadingState message={tr('Načítám diagnostiku…','Loading diagnostics…')}/>:
        <>
          <section className={styles.status} data-kind={healthy?'healthy':partial?'degraded':'down'} aria-live="polite">
            {healthy?<CheckCircle2 size={27}/>:<AlertTriangle size={27}/>}
            <div><h2>{healthy?tr('Systém připraven','System ready'):partial?tr('Omezená dostupnost','Reduced availability'):tr('Dostupnost se nepodařilo potvrdit','Availability not confirmed')}</h2>
              <p>{snapshot?.problem??(stale?tr('Poslední kontrola je zastaralá.','The last check is stale.'):tr('Výsledek poslední nezávislé kontroly infrastruktury.','Result of the last infrastructure readiness check.'))}</p>
            </div>
            {busy&&<span className={styles.checking}>{tr('Kontroluji…','Checking…')}</span>}
          </section>
          {snapshot?.problem&&<ErrorState message={snapshot.problem}/>}
          <div className={styles.stats}>
            <article><span>API</span><strong>{snapshot?.health?.status==='ok'?'UP':tr('Neznámé','Unknown')}</strong>
              <small>{tr('Verze','Version')} {snapshot?.health?.version??'—'}</small></article>
            <article><span>{tr('Uptime API','API uptime')}</span><strong>{snapshot?.health?duration(snapshot.health.uptime):'—'}</strong>
              <small>{tr('Od startu procesu','Since process start')}</small></article>
            <article><span>{tr('Poslední kontrola','Last check')}</span><strong>{snapshot?formatTime(snapshot.checkedAt.toISOString()):'—'}</strong>
              <small>{snapshot?formatDate(snapshot.checkedAt.toISOString()):'—'}</small></article>
          </div>
          <section className={styles.services}>
            <div className={styles.sectionTitle}><h3>{tr('Závislosti infrastruktury','Infrastructure dependencies')}</h3>
              <span><Clock3 size={14}/>{tr('Kontrola každých 30 s','Checked every 30 s')}</span></div>
            <div className={styles.tableWrap}><table>
              <thead><tr><th>{tr('Služba','Service')}</th><th>{tr('Stav','Status')}</th><th>{tr('Odezva','Latency')}</th><th>{tr('Důležitost','Importance')}</th></tr></thead>
              <tbody>{states.map(({key,status,latency})=><tr key={key}>
                <td><strong>{names[key]}</strong></td>
                <td><span className={styles.badge} data-state={stale?'stale':status??'unknown'}>{stale?tr('Neověřeno','Unverified'):status==='up'?tr('Dostupná','Online'):status==='down'?tr('Nedostupná','Down'):tr('Neznámý','Unknown')}</span></td>
                <td>{!stale&&typeof latency==='number'?`${latency.toFixed(0)} ms`:'—'}</td>
                <td>{key==='mail'?tr('Volitelná','Optional'):tr('Kritická','Critical')}</td>
              </tr>)}</tbody>
            </table></div>
            <p>{tr('Pokud některá služba neodpovídá, zkontrolujte serverové logy a stav nasazených kontejnerů. Z této obrazovky se neprovádějí žádné změny.','If a service is down, inspect the server logs and containers. This screen does not perform any changes.')}</p>
          </section>
          <div className={styles.links}><Link href="/admin/audit">{tr('Otevřít audit','Open audit')}</Link>
            <Link href="/admin/settings/integrations/ai">{tr('Integrace a AI','Integrations & AI')}</Link>
          </div>
        </>}
    </div>
  </AppShell>;
}

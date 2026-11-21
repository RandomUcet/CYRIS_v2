'use client';
import {useEffect,useState} from 'react';
import {useParams} from 'next/navigation';
import {Activity,AlertTriangle,Database,RefreshCw,Search,ShieldCheck} from 'lucide-react';
import {AppShell} from '@/components/layout/AppShell';
import {LoadingState,EmptyState,ErrorState} from '@/components/common/StateViews';
import {apiClient} from '@/lib/api-client';
import {usePreferences} from '@/contexts/PreferencesContext';
import {useAuth} from '@/contexts/AuthContext';
import type {JsocCategory,JsocSeverity,JsocLog,JsocLogPage,JsocLogQuery} from '@cyris/contracts';
import styles from './jsoc.module.css';

const categories:JsocCategory[]=['AUTH','NETWORK','DNS','ENDPOINT','APPLICATION'];
const severities:JsocSeverity[]=['INFO','LOW','MEDIUM','HIGH','CRITICAL'];
const catNames:Record<JsocCategory,[string,string]>={
  AUTH:['Autentizace','Authentication'],NETWORK:['Síť','Network'],
  DNS:['DNS','DNS'],ENDPOINT:['Koncová stanice','Endpoint'],
  APPLICATION:['Aplikace','Application'],
};
const sevNames:Record<JsocSeverity,[string,string]>={
  INFO:['Informace','Info'],LOW:['Nízká','Low'],
  MEDIUM:['Střední','Medium'],HIGH:['Vysoká','High'],CRITICAL:['Kritická','Critical'],
};

export default function JsocTelemetryPage(){
  const {eventId}=useParams<{eventId:string}>();
  const {locale,formatTime,formatDate}=usePreferences();
  const {viewAs}=useAuth();
  const cs=locale==='cs',tr=(cz:string,en:string)=>cs?cz:en;
  const [category,setCategory]=useState<JsocCategory|''>('');
  const [severity,setSeverity]=useState<JsocSeverity|''>('');
  const [search,setSearch]=useState('');
  const [submitted,setSubmitted]=useState('');
  const [page,setPage]=useState(1);
  const [version,setVersion]=useState(0);
  const [data,setData]=useState<JsocLogPage|null>(null);
  const [loadedEvent,setLoadedEvent]=useState('');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [selected,setSelected]=useState<JsocLog|null>(null);
  const [generating,setGenerating]=useState(false);
  const [generateError,setGenerateError]=useState('');
  const [notice,setNotice]=useState('');
  const [count,setCount]=useState(30);
  const [seed,setSeed]=useState(2047);
  const [scenario,setScenario]=useState('');
  const [showGenerator,setShowGenerator]=useState(false);
  useEffect(()=>{setCategory('');setSeverity('');setSearch('');setSubmitted('');setSelected(null);setPage(1);},[eventId]);
  useEffect(()=>{
    let active=true;
    setData(null);setLoadedEvent('');setLoading(true);setError('');setSelected(null);
    const query:JsocLogQuery={page,limit:25,...(category&&{category}),...(severity&&{severity}),...(submitted&&{search:submitted})};
    void apiClient.listJsocLogs(eventId,query).then(result=>{
      if(!active)return;
      if(result.ok&&result.data?.simulation===true){setData(result.data);setLoadedEvent(eventId);}
      else setError(result.error||'Unable to load synthetic logs');
    }).catch(e=>{if(active)setError(e instanceof Error?e.message:String(e))})
      .finally(()=>{if(active)setLoading(false)});
    return ()=>{active=false};
  },[eventId,category,severity,submitted,page,version]);
  const current=loadedEvent===eventId?data:null;
  const entries=current?.items??[];
  const allowed=Boolean(current?.canGenerate&&!viewAs);
  const labelCategory=(key:JsocCategory)=>catNames[key][cs?0:1];
  const labelSeverity=(key:JsocSeverity)=>sevNames[key][cs?0:1];
  async function generate(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(!allowed||generating||!Number.isInteger(seed)||count<10||count>100||scenario.trim().length<3)return;
    if(!window.confirm(tr('Vytvořit nové FIKTIVNÍ technické události ve vybraném cvičení?','Create new SYNTHETIC technical events in this exercise?')))return;
    setGenerating(true);setGenerateError('');setNotice('');
    try{
      const result=await apiClient.generateJsocLogs(eventId,{seed,count,scenario:scenario.trim()});
      if(!result.ok||!result.data?.simulation)throw new Error(result.error||'Generation failed');
      setNotice(tr(`Přidáno ${result.data.created} simulovaných událostí.`,`Created ${result.data.created} simulated events.`));
      setShowGenerator(false);setPage(1);setVersion(v=>v+1);
    }catch(e){setGenerateError(e instanceof Error?e.message:String(e))}
    finally{setGenerating(false)}
  }
  function clear(){
    setSearch('');setSubmitted('');setCategory('');setSeverity('');setPage(1);
  }
  return <AppShell title={tr('JSOC · simulovaná telemetrie','JSOC · simulated telemetry')}
    breadcrumbs={[{label:'Technical Simulation'},{label:'JSOC simulated logs'}]}
    actions={<button type="button" className="btn btn-secondary" disabled={loading} onClick={()=>setVersion(v=>v+1)}>
      <RefreshCw size={15}/>{tr('Obnovit','Refresh')}
    </button>}>
    <div className={styles.page}>
      <div className={styles.banner} role="status">
        <span className={styles.simulation}><ShieldCheck size={18}/>{tr('SIMULACE · CVIČENÍ','SIMULATION · EXERCISE')}</span>
        <p>{tr('Tato obrazovka obsahuje výhradně uměle vytvořené bezpečnostní události. Není propojena se skutečnými zařízeními, sítěmi ani zdravím serveru CYRIS. Krizový štáb používá oddělený stav služeb.','This page contains fictional technical events only. It does not ingest data from real devices, networks or CYRIS infrastructure. Command uses a separate exercise service-status view.')}</p>
      </div>
      <header className={styles.heading}>
        <div><h2><Activity size={18}/>{tr('Technické události cvičení','Exercise security events')}</h2>
          <p>{tr('Vyhledávejte anomálie, filtrujte závažnosti a analyzujte souvislosti ve fiktivním prostředí.','Investigate anomalies and filter severities within an entirely simulated environment.')}</p>
        </div>
        {allowed&&<button type="button" className="btn btn-primary" aria-expanded={showGenerator} onClick={()=>setShowGenerator(v=>!v)}>
          <Database size={15}/>{tr('Generovat simulované logy','Generate simulated logs')}
        </button>}
      </header>
      {allowed&&showGenerator&&<form className={styles.generator} onSubmit={e=>void generate(e)}>
        <h3>{tr('Nová sada tréninkových logů · EXCON','New training log batch · EXCON')}</h3>
        <p>{tr('Vygeneruje pouze smyšlené logy s dokumentačními IP adresami. Nepřipojuje se k žádné síti.','Generates fictional log entries with documentation-only IP addresses. No network integration is used.')}</p>
        <div className={styles.generatorFields}>
          <label>{tr('Popis scénáře','Scenario description')}
            <input required minLength={3} maxLength={160} value={scenario} onChange={e=>setScenario(e.target.value)}
              placeholder={tr('Například: Výpadky přihlášení v simulovaném dispečinku','E.g. authentication anomalies in a simulated operations center')}/></label>
          <label>{tr('Počet záznamů','Record count')}<input type="number" min={10} max={100} value={count}
            onChange={e=>setCount(Number(e.target.value))} required/></label>
          <label>{tr('Seed (opakovatelná data)','Seed (reproducible data)')}<input type="number" min={-2147483648} max={2147483647} step={1}
            value={seed} onChange={e=>setSeed(Number(e.target.value))} required/></label>
        </div>
        {generateError&&<p className={styles.error} role="alert">{generateError}</p>}
        <div className={styles.buttons}>
          <button type="button" className="btn btn-secondary" disabled={generating} onClick={()=>setShowGenerator(false)}>{tr('Zrušit','Cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={generating||!scenario.trim()||count<10||count>100||!Number.isInteger(seed)}>{generating?tr('Vytvářím…','Generating…'):tr('Přidat do cvičení','Add to exercise')}</button>
        </div>
      </form>}
      {notice&&<p className={styles.notice} role="status">{notice}</p>}
      <form className={styles.filters} onSubmit={e=>{e.preventDefault();setPage(1);setSubmitted(search.trim());}}>
        <label><span>{tr('Kategorie','Category')}</span><select value={category} onChange={e=>{setCategory(e.target.value as JsocCategory|'');setPage(1);}}>
          <option value="">{tr('Všechny kategorie','All categories')}</option>
          {categories.map(key=><option key={key} value={key}>{labelCategory(key)}</option>)}
        </select></label>
        <label><span>{tr('Závažnost','Severity')}</span><select value={severity} onChange={e=>{setSeverity(e.target.value as JsocSeverity|'');setPage(1);}}>
          <option value="">{tr('Všechny stupně','All severities')}</option>
          {severities.map(key=><option key={key} value={key}>{labelSeverity(key)}</option>)}
        </select></label>
        <label className={styles.search}><span>{tr('Hledat zdroj nebo text','Search source or text')}</span><div>
          <Search size={15}/><input maxLength={100} value={search} onChange={e=>setSearch(e.target.value)}/>
        </div></label>
        <button className="btn btn-secondary" type="submit">{tr('Použít','Apply')}</button>
        <button className="btn btn-ghost" type="button" onClick={clear}>{tr('Vymazat','Clear')}</button>
      </form>
      {loading?<LoadingState message={tr('Načítám simulované události…','Loading simulated events…')}/>:
        error?<ErrorState message={error} onRetry={()=>setVersion(v=>v+1)}/>:
        current&&<div className={styles.content}>
          <p className={styles.count}>{tr('Nalezené události','Matching events')}: <strong>{current.total}</strong> · {tr('strana','page')} {current.page}</p>
          {entries.length===0?<EmptyState title={tr('Žádné simulované události','No simulated events')} description={tr('EXCON může vytvořit tréninkovou sadu, případně upravte filtry.','EXCON can create a training dataset, or adjust the filters.')}/>:
            <div className={styles.tableWrap}><table className={styles.table}>
              <thead><tr><th>{tr('Čas','Time')}</th><th>{tr('Závažnost','Severity')}</th><th>{tr('Kategorie','Category')}</th><th>{tr('Zdroj','Source')}</th><th>{tr('Událost','Event')}</th></tr></thead>
              <tbody>{entries.map(entry=><tr key={entry.id} data-selected={selected?.id===entry.id}>
                <td><time dateTime={entry.observedAt}>{formatDate(entry.observedAt)} · {formatTime(entry.observedAt)}</time></td>
                <td><span className={styles.severity} data-severity={entry.severity}>{labelSeverity(entry.severity)}</span></td>
                <td>{labelCategory(entry.category)}</td><td><code>{entry.source}</code></td>
                <td><button type="button" onClick={()=>setSelected(entry)} aria-label={tr('Zobrazit detail záznamu','Inspect log entry')}>{entry.message}</button></td>
              </tr>)}</tbody>
            </table></div>}
          <nav className={styles.pagination} aria-label={tr('Stránkování','Pagination')}>
            <button className="btn btn-secondary" disabled={page===1||loading} onClick={()=>setPage(n=>Math.max(1,n-1))}>{tr('Předchozí','Previous')}</button>
            <span>{page} / {Math.max(1,Math.ceil(current.total/current.limit))}</span>
            <button className="btn btn-secondary" disabled={page*current.limit>=current.total||loading} onClick={()=>setPage(n=>n+1)}>{tr('Další','Next')}</button>
          </nav>
          {selected&&entries.some(e=>e.id===selected.id)&&<section className={styles.detail} aria-label={tr('Detail události','Event detail')}>
            <header><h3>{tr('Detail simulovaného záznamu','Simulated record detail')}</h3><button type="button" onClick={()=>setSelected(null)}>{tr('Zavřít','Close')}</button></header>
            <dl>
              <div><dt>ID</dt><dd><code>{selected.id}</code></dd></div>
              <div><dt>{tr('Scénář','Scenario')}</dt><dd>{selected.scenario}</dd></div>
              <div><dt>{tr('Zdrojová IP (testovací)','Source IP (documentation)')}</dt><dd>{selected.sourceAddress??'—'}</dd></div>
              <div><dt>{tr('Cílová IP (testovací)','Destination IP (documentation)')}</dt><dd>{selected.destinationAddress??'—'}</dd></div>
              <div><dt>{tr('Událost','Event')}</dt><dd>{selected.message}</dd></div>
            </dl>
          </section>}
        </div>}
    </div>
  </AppShell>;
}

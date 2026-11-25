'use client';
import {useState,useEffect,useRef} from 'react';
import {useAuth} from '@/contexts/AuthContext';
import {apiClient} from '@/lib/api-client';
type Action='API_STATUS'|'DEPENDENCY_CHECK'|'SPARK_INFERENCE';
export function MaintenanceConsole({cs}:{cs:boolean}){const {isPlatformAdmin,viewAs,currentUser}=useAuth();if(!isPlatformAdmin||viewAs)return null;return <Console key={currentUser?.user.id??''} cs={cs}/>;}
function Console({cs}:{cs:boolean}){
 const tr=(c:string,e:string)=>cs?c:e;
 const [action,setAction]=useState<Action>('DEPENDENCY_CHECK'),[busy,setBusy]=useState(false),[output,setOutput]=useState(''),[error,setError]=useState('');
 const alive=useRef(true),lock=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function run(){if(lock.current)return;lock.current=true;setBusy(true);setOutput('');setError('');
 try{const r=action==='SPARK_INFERENCE'?await apiClient.testSparkInference():await apiClient.runMaintenanceCheck(action);
 if(!alive.current)return;if(r.ok&&r.data)setOutput(JSON.stringify(r.data,null,2));else setError(tr('Kontrola se nezdařila.','Check failed.'));}
 catch{if(alive.current)setError(tr('Kontrola se nezdařila.','Check failed.'));}finally{lock.current=false;if(alive.current)setBusy(false);}}
 return <section style={{padding:16,border:'1px solid var(--border-default)',borderRadius:6,background:'var(--bg-panel)',display:'grid',gap:12}}>
 <h3 style={{margin:0}}>{tr('Servisní konzole','Maintenance console')}</h3>
 <p>{tr('Pouze předem definované kontroly, s auditním záznamem. Není to systémový shell.','Only predefined checks, with an audit record. This is not a host shell.')}</p>
 <form onSubmit={e=>{e.preventDefault();void run();}} style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'end'}}><label>{tr('Kontrola','Check')}<select className="input-field" style={{display:'block'}} value={action} disabled={busy} onChange={e=>setAction(e.target.value as Action)}><option value="DEPENDENCY_CHECK">{tr('Databáze a služby','Database and services')}</option><option value="API_STATUS">{tr('Stav API','API status')}</option><option value="SPARK_INFERENCE">{tr('Test inference Sparku','Spark inference test')}</option></select></label><button className="btn btn-primary" disabled={busy}>{busy?tr('Probíhá…','Running…'):tr('Spustit kontrolu','Run check')}</button></form>
 {error&&<p role="alert">{error}</p>}{output&&<pre aria-label={tr('Výsledek','Result')} style={{maxHeight:360,overflow:'auto',whiteSpace:'pre-wrap',overflowWrap:'anywhere',padding:12,background:'var(--bg-inset)'}}>{output}</pre>}
 </section>;
}

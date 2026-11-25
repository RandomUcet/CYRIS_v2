'use client';
import {useEffect,useRef,useState} from 'react';
import {useParams} from 'next/navigation';
import Link from 'next/link';
import {Archive,ArrowLeft,Database,Download,RefreshCw,ShieldCheck,Terminal,AlertTriangle} from 'lucide-react';
import {AppShell} from '@/components/layout/AppShell';
import {LoadingState,ErrorState} from '@/components/common/StateViews';
import {StatusBadge} from '@/components/common/Badges';
import {apiClient} from '@/lib/api-client';
import {useAuth} from '@/contexts/AuthContext';
import {usePreferences} from '@/contexts/PreferencesContext';
import type {EventPurgePreview} from '@cyris/contracts';
import styles from './data.module.css';

type Scope='read-notifications'|'terminal-tasks';
const labels:Record<string,[string,string]>={
  resources:['Záznamy','Records'],relationships:['Vazby','Relationships'],assignments:['Přidělení','Assignments'],
  accessGrants:['Přístupová pravidla','Access grants'],notifications:['Oznámení','Notifications'],
  activity:['Operační historie','Activity history'],audit:['Auditní stopa','Audit trail'],memberships:['Členství','Memberships'],
  units:['Týmy','Teams'],roles:['Role','Roles'],
  documentObjects:['Odkazy dokumentů','Document references'],documentVersions:['Verze souborů','Document versions'],
  registryMedia:['Média registrů','Registry media'],draftMedia:['Média scénáře','Scenario media'],
  forensicStorageReferences:['Forenzní úložiště','Forensic storage references'],exerciseJobs:['Úlohy na pozadí','Background jobs'],aiRuns:['AI běhy','AI runs'],
  operational_task:['Operační úkoly','Operational tasks'],
  person:['Osoby','People'],organisation:['Organizace','Organizations'],location:['Místa','Locations'],vehicle:['Vozidla','Vehicles'],
  weapon:['Zbraně','Weapons'],licence:['Oprávnění','Licences'],device:['Zařízení','Devices'],evidence:['Důkazy','Evidence'],
  case:['Případy','Cases'],incident:['Incidenty','Incidents'],lab_analysis:['Laboratoř','Laboratory'],
  forensic_analysis:['Digitální forenzika','Digital forensics'],medical_encounter:['Zdravotnické případy','Medical encounters'],
  court_case:['Soudní spisy','Court cases'],document:['Dokumenty','Documents'],
};
export default function DataAdministration(){
  const {eventId}=useParams<{eventId:string}>();
  const {loading,currentUser,isPlatformAdmin,viewAs}=useAuth();
  if(loading)return <AppShell><LoadingState/></AppShell>;
  if(!isPlatformAdmin||viewAs)return <AppShell><ErrorState message="Platform administrator access required."/></AppShell>;
  return <DataWorkspace key={JSON.stringify([eventId,currentUser?.user.id,currentUser?.platformPermissions])} id={eventId}/>;
}
function DataWorkspace({id}:{id:string}){
  const {locale,formatTime}=usePreferences();
  const cs=locale==='cs',tr=(c:string,e:string)=>cs?c:e,display=(k:string)=>labels[k]?.[cs?0:1]??k.replaceAll('_',' ');
  const [base,setBase]=useState<EventPurgePreview|null>(null),[preview,setPreview]=useState<EventPurgePreview|null>(null);
  const [mode,setMode]=useState<'all'|'selected'>('all'),[selected,setSelected]=useState<string[]>([]);
  const [loading,setLoading]=useState(true),[working,setWorking]=useState(false),[error,setError]=useState(''),[scope,setScope]=useState<Scope>('terminal-tasks');
  const [refresh,setRefresh]=useState(0),[copied,setCopied]=useState(false);
  const requestSequence=useRef(0);
  const selectionKey=JSON.stringify([mode,[...selected].sort()]);
  const selectionKeyRef=useRef(selectionKey);
  selectionKeyRef.current=selectionKey;
  useEffect(()=>{
    const sequence=++requestSequence.current;
    setLoading(true);setError('');setBase(null);setPreview(null);setWorking(false);setSelected([]);
    void apiClient.getEventPurgePreview(id).then(res=>{
      if(sequence!==requestSequence.current)return;
      if(!res.ok||!res.data)throw new Error(res.error||'Inventory unavailable');
      setBase(res.data);
    }).catch(err=>{if(sequence===requestSequence.current)setError(String(err instanceof Error?err.message:err));})
      .finally(()=>{if(sequence===requestSequence.current)setLoading(false)});
    return()=>{requestSequence.current++};
  },[id,refresh]);
  function changeSelection(nextMode:'all'|'selected',next:string[]){
    requestSequence.current++;setMode(nextMode);setSelected(next);setPreview(null);setWorking(false);setError('');
  }
  async function inspect(){
    if(!base||working||(mode==='selected'&&!selected.length))return;
    const sequence=++requestSequence.current,expected=selectionKey;
    setWorking(true);setError('');setPreview(null);
    try{
      const res=await apiClient.getEventPurgePreview(id,mode==='selected'?selected:undefined);
      if(sequence!==requestSequence.current||expected!==selectionKeyRef.current)return;
      if(!res.ok||!res.data)throw new Error(res.error||'Preview unavailable');
      setPreview(res.data);
    }catch(err){if(sequence===requestSequence.current)setError(String(err instanceof Error?err.message:err));}
    finally{if(sequence===requestSequence.current)setWorking(false);}
  }
  function download(){
    if(!preview)return;
    const url=URL.createObjectURL(new Blob([JSON.stringify(preview,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='cyris-data-inventory-'+id+'.json';a.click();URL.revokeObjectURL(url);
  }
  const hostCommand='sudo cyrisctl cleanup --event '+id+' --scope '+scope;
  async function copyCommand(){
    setCopied(false);
    try{await navigator.clipboard.writeText(hostCommand);setCopied(true);}catch{setError(tr('Příkaz zkopírujte ručně.','Copy the command manually.'));}
  }
  const valid=base?.retention?.execution==='HOST_ONLY';
  return <AppShell title={tr('Správa dat cvičení','Exercise data administration')} breadcrumbs={[{label:tr('Cvičení','Exercises'),href:'/admin/events'},{label:tr('Správa dat','Data administration')}]}>
    <div className={styles.workspace}>
      <header className={styles.header}>
        <div><Link href="/admin/events" className={styles.back}><ArrowLeft size={15}/>{tr('Cvičení','Exercises')}</Link>
          <h1><Database size={23}/>{tr('Správa dat','Data administration')}</h1>
          <p>{base?.eventName??tr('Inventář a retence cvičení','Exercise inventory and retention')} {base&&<StatusBadge status={base.status}/>}</p></div>
        <div className={styles.actions}><Link className="btn btn-secondary" href={'/admin/events/'+id+'/report'}>{tr('Závěrečný report','After-action report')}</Link>
          <button className="btn btn-secondary" type="button" disabled={loading||working} onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={15}/>{tr('Obnovit inventář','Refresh inventory')}</button></div>
      </header>
      {error&&<div role="alert" className={styles.warning}>{error}</div>}
      {loading&&<LoadingState/>}
      {!loading&&!base&&<button className="btn btn-secondary" onClick={()=>setRefresh(n=>n+1)}>{tr('Zkusit znovu','Retry')}</button>}
      {base&&<>
        <section className={styles.panel}>
          <div className={styles.sectionHead}><div><h2>{tr('Inventář cvičení','Exercise inventory')}</h2><p>{tr('Databázové počty. Nejde o kompletní inventář souborů a externích indexů.','Database counts, not a complete file or external index inventory.')}</p></div><small>{formatTime(base.generatedAt)}</small></div>
          <div className={styles.metrics}>{Object.entries(base.retention?.inventory??{}).filter(([key])=>!['documentObjects','documentVersions','registryMedia','draftMedia','forensicStorageReferences','exerciseJobs','aiRuns'].includes(key)).map(([key,count])=><div key={key}><span>{display(key)}</span><strong>{count.toLocaleString(locale)}</strong></div>)}</div>
          <div className={styles.sectionHead}><div><h3>{tr('Soubory a externí zpracování','Files and external processing')}</h3><p>{tr('Počty databázových odkazů, nikoli ověřených fyzických objektů. Jeden soubor může mít více odkazů.','Database reference counts, not verified physical objects. A file can have multiple references.')}</p></div></div>
          <div className={styles.metrics}>{Object.entries(base.retention?.inventory??{}).filter(([key])=>['documentObjects','documentVersions','registryMedia','draftMedia','forensicStorageReferences','exerciseJobs','aiRuns'].includes(key)).map(([key,count])=><div key={key}><span>{display(key)}</span><strong>{count.toLocaleString(locale)}</strong></div>)}</div>
        </section>
        <div className={styles.columns}>
          <section className={styles.panel}>
            <h2>{tr('1 · Náhled výběru','1 · Selection preview')}</h2>
            <p>{tr('Vyberte rozsah inventáře. Tento krok nikdy nic nemaže.','Choose the inventory scope. This step never deletes anything.')}</p>
            <fieldset className={styles.fieldset}>
              <legend>{tr('Rozsah','Scope')}</legend>
              <label><input type="radio" name="scope" checked={mode==='all'} onChange={()=>changeSelection('all',[])}/>{tr('Celé cvičení','Entire exercise')}</label>
              <label><input type="radio" name="scope" checked={mode==='selected'} onChange={()=>changeSelection('selected',selected)}/>{tr('Vybrané kategorie','Selected categories')}</label>
            </fieldset>
            {mode==='selected'&&<div className={styles.categories}>
              {Object.entries(base.profiles.exerciseDataOnly.counts).sort((a,b)=>display(a[0]).localeCompare(display(b[0]))).map(([type,count])=><label key={type}><input type="checkbox" checked={selected.includes(type)} onChange={e=>changeSelection('selected',e.target.checked?[...selected,type]:selected.filter(t=>t!==type))}/><span>{display(type)}</span><strong>{count}</strong></label>)}
              {!Object.keys(base.profiles.exerciseDataOnly.counts).length&&<p>{tr('Žádné evidované kategorie.','No recorded categories.')}</p>}
              <button className="btn btn-secondary" type="button" onClick={()=>changeSelection('selected',[])}>{tr('Zrušit výběr','Clear selection')}</button>
            </div>}
            <button className="btn btn-primary" type="button" onClick={()=>void inspect()} disabled={working||(mode==='selected'&&!selected.length)}>{working?tr('Počítám…','Calculating…'):tr('Vypočítat náhled','Calculate preview')}</button>
            {preview&&<div className={styles.result} role="status"><strong>{preview.selection.matchingResources} {tr('záznamů ve výběru','selected records')}</strong><span>{preview.selection.unselectedResources} {tr('mimo výběr','outside selection')}</span><small>{tr('Přímé databázové počty, nikoli závazný mazací plán.','Direct database counts, not an executable deletion plan.')}</small><div className={styles.breakdown}>{Object.entries(preview.profiles.exerciseDataOnly.counts).map(([key,count])=><div key={key}><span>{display(key)}</span><strong>{count}</strong></div>)}</div>
              <button className="btn btn-secondary" type="button" onClick={download}><Download size={14}/>{tr('Export náhledu','Export preview')}</button></div>}
          </section>
          <section className={styles.panel}>
            <h2><Terminal size={18}/>{tr('2 · Částečné čištění','2 · Bounded cleanup')}</h2>
            <p>{tr('Dostupné režimy správy serveru. Počty jsou kandidáti před kontrolou všech závislostí.','Available host maintenance modes. Counts are candidates before dependency checks.')}</p>
            {!valid?<div role="status" className={styles.warning}>{tr('Server zatím nepodporuje tento postup.','The server does not yet support this workflow.')}</div>:<>
              <div className={styles.choices}>
                <label><input type="radio" name="cleanup" checked={scope==='terminal-tasks'} onChange={()=>{setScope('terminal-tasks');setCopied(false)}}/><span><strong>{tr('Ukončené samostatné úkoly','Terminal standalone tasks')}</strong><small>{tr('Pouze manuální, bez vazeb na další případy.','Manual tasks without record links only.')}</small></span><strong>{base.retention.terminalManualTasks}</strong></label>
                <label><input type="radio" name="cleanup" checked={scope==='read-notifications'} onChange={()=>{setScope('read-notifications');setCopied(false)}}/><span><strong>{tr('Přečtená oznámení','Read notifications')}</strong><small>{tr('Přečtená nebo odložená, nikoli nové položky.','Read or dismissed, not new notices.')}</small></span><strong>{base.retention.notificationHistory}</strong></label>
              </div>
              {base.status!=='ARCHIVED'&&<div className={styles.warning}><Archive size={18}/><span>{tr('Provedení vyžaduje archivované cvičení. Náhled je možný kdykoli.','Execution requires an archived exercise. Preview is always possible.')}</span></div>}
              <div className={styles.command}><small>{tr('Nedestruktivní náhled na serveru','Non-destructive host preview')}</small><code>{hostCommand}</code><button type="button" className="btn btn-secondary" onClick={()=>void copyCommand()}>{copied?tr('Zkopírováno','Copied'):tr('Kopírovat příkaz','Copy command')}</button></div>
              <ol className={styles.steps}><li>{tr('Zkontrolovat skutečný plán a blokace na serveru.','Review the exact plan and blockers on the host.')}</li><li>{tr('Při potvrzení vytvořit a ověřit šifrovanou zálohu včetně oddělené kopie.','Create and verify an encrypted backup and separate copy on confirmation.')}</li><li>{tr('Spustit pouze s přesným slugem a digestem plánu.','Apply only with the exact slug and plan digest.')}</li></ol>
              <p className={styles.muted}>{tr('Webový prohlížeč nespouští příkazy ani mazání. Skutečnou operaci provádí oprávněný správce na serveru.','The browser does not execute commands or deletion. An authorized administrator runs the operation on the host.')}</p>
            </>}
          </section>
        </div>
        <section className={styles.panel}>
          <h2><ShieldCheck size={19}/>{tr('3 · Co zůstává zachováno','3 · What is retained')}</h2>
          <p>{tr('Uživatelé, role, členství, auditní stopa a operační historie. Samotné cvičení zůstává archivované.','Users, roles, memberships, audit and operational history. The exercise itself remains archived.')}</p>
          <div className={styles.warning}><AlertTriangle size={19}/><div><strong>{tr('Úplné odstranění cvičení zatím není k dispozici','Complete exercise deletion is not yet available')}</strong><p>{tr('Důkazy, zprávy, soubory, externí integrace a závislosti musí projít samostatnou akceptací. Náhled neznamená oprávnění odstranit všechna data.','Evidence, reports, files, external integrations and dependencies require separate acceptance. Preview is not permission to delete all data.')}</p></div></div>
        </section>
      </>}
    </div>
  </AppShell>;
}

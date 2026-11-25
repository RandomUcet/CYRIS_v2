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
import {EventRetentionPlanSchema,RetentionInventoryReportSchema,type EventRetentionPlan,type EventPurgePreview,type RetentionInventoryReport} from '@cyris/contracts';
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
  const [hostInventory,setHostInventory]=useState<RetentionInventoryReport|null>(null),[importError,setImportError]=useState('');
  const importSequence=useRef(0);
  const [plan,setPlan]=useState<EventRetentionPlan|null>(null),[planError,setPlanError]=useState(''),[planBusy,setPlanBusy]=useState(false);
  const [profile,setProfile]=useState<'reset'|'remove'>('reset'),[showEmpty,setShowEmpty]=useState(false);
  const planSequence=useRef(0),planAbort=useRef<AbortController|null>(null);
  function clearPlan(){
    planSequence.current++;planAbort.current?.abort();planAbort.current=null;
    setPlan(null);setPlanError('');setPlanBusy(false);
  }
  async function loadPlan(){
    const sequence=++planSequence.current;planAbort.current?.abort();
    const controller=new AbortController();planAbort.current=controller;
    setPlan(null);setPlanError('');setPlanBusy(true);
    try{
      const res=await apiClient.getEventRetentionPlan(id,controller.signal);
      if(sequence!==planSequence.current)return;
      if(!res.ok||!res.data)throw new Error(res.error||tr('Plán se nepodařilo načíst.','Plan unavailable.'));
      const parsed=EventRetentionPlanSchema.parse(res.data);
      if(parsed.eventId!==id)throw new Error(tr('Plán patří jinému cvičení.','Plan belongs to another exercise.'));
      setPlan(parsed);
    }catch(e){if(sequence===planSequence.current)setPlanError(e instanceof Error?e.message:String(e));}
    finally{if(sequence===planSequence.current){setPlanBusy(false);planAbort.current=null;}}
  }
  const requestSequence=useRef(0);
  const selectionKey=JSON.stringify([mode,[...selected].sort()]);
  const selectionKeyRef=useRef(selectionKey);
  selectionKeyRef.current=selectionKey;
  useEffect(()=>{
    const sequence=++requestSequence.current;
    importSequence.current++;setHostInventory(null);setImportError('');clearPlan();
    setLoading(true);setError('');setBase(null);setPreview(null);setWorking(false);setSelected([]);
    void apiClient.getEventPurgePreview(id).then(res=>{
      if(sequence!==requestSequence.current)return;
      if(!res.ok||!res.data)throw new Error(res.error||'Inventory unavailable');
      setBase(res.data);
    }).catch(err=>{if(sequence===requestSequence.current)setError(String(err instanceof Error?err.message:err));})
      .finally(()=>{if(sequence===requestSequence.current)setLoading(false)});
    return()=>{requestSequence.current++;importSequence.current++;planSequence.current++;planAbort.current?.abort();};
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
  const inventoryCommand='sudo cyrisctl cleanup-inventory --event '+id;
  async function importInventory(file:File|undefined){
    const sequence=++importSequence.current;setImportError('');setHostInventory(null);
    if(!file)return;
    try{
      if(file.size>128*1024)throw new Error(tr('Soubor je příliš velký.','File is too large.'));
      const parsed=RetentionInventoryReportSchema.safeParse(JSON.parse(await file.text()));
      if(!parsed.success||parsed.data.eventId!==id)throw new Error(tr('Neplatný inventář nebo jiné cvičení.','Invalid inventory or different exercise.'));
      if(sequence===importSequence.current)setHostInventory(parsed.data);
    }catch(err){if(sequence===importSequence.current)setImportError(err instanceof Error?err.message:tr('Neplatný soubor.','Invalid file.'));}
  }
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
          <h2><Database size={19}/>{tr('3 · Plán vyčištění cvičení','3 · Exercise cleanup plan')}</h2>
          <p>{tr('Prověřte vlastnictví databázových tabulek a vazby. Tento náhled je nedestruktivní a nezahrnuje fyzické soubory ani fronty.','Inspect database table ownership and relationships. This preview is non-destructive and excludes physical files and queues.')}</p>
          <div className={styles.actions}><button type="button" className="btn btn-primary" disabled={planBusy} onClick={()=>void loadPlan()}>{planBusy?tr('Prověřuji…','Inspecting…'):tr('Vypočítat databázový plán','Calculate database plan')}</button>
            {plan&&<button type="button" className="btn btn-secondary" onClick={()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(plan,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='cyris-relational-plan-'+id+'.json';a.click();URL.revokeObjectURL(url);}}><Download size={14}/>{tr('Export plánu','Export plan')}</button>}</div>
          {planError&&<p role="alert">{planError}</p>}
          {plan&&<div className={styles.result}>
            <small>{tr('Databázový snímek','Database snapshot')} · {formatTime(plan.generatedAt)} · {plan.status}</small>
            <fieldset className={styles.fieldset}><legend>{tr('Režim','Profile')}</legend>
              <label><input type="radio" name="relational-profile" checked={profile==='reset'} onChange={()=>setProfile('reset')}/>{tr('Vyčistit obsah, zachovat týmy, role a členství','Reset content; retain teams, roles and memberships')}</label>
              <label><input type="radio" name="relational-profile" checked={profile==='remove'} onChange={()=>setProfile('remove')}/>{tr('Odstranit celé cvičení včetně týmů a rolí','Remove exercise including teams and roles')}</label>
            </fieldset>
            <div className={styles.metrics}><div><span>{tr('Řádky navržené k odstranění','Rows proposed for deletion')}</span><strong>{profile==='reset'?plan.relational.resetRows:plan.relational.removeRows}</strong></div>
              <div><span>{tr('Auditní záznamy k zachování','Audit records retained')}</span><strong>{plan.relational.auditRows}</strong></div>
              <div><span>{tr('Prověřené cizí klíče','Foreign keys checked')}</span><strong>{plan.relational.checkedForeignKeys}</strong></div></div>
            <label><input type="checkbox" checked={showEmpty} onChange={e=>setShowEmpty(e.target.checked)}/> {tr('Zobrazit i prázdné tabulky','Show empty tables')}</label>
            <div className={styles.planTable}><table><thead><tr><th scope="col">{tr('Tabulka','Table')}</th><th scope="col">{tr('Počet','Count')}</th><th scope="col">{tr('Navržená operace','Proposed action')}</th></tr></thead>
              <tbody>{plan.relational.tables.filter(t=>showEmpty||t.count>0).map(t=><tr key={t.table}><td>{display(t.table)}</td><td>{t.count}</td><td>{t[profile]==='DELETE'?tr('Odstranit','Delete'):t[profile]==='DETACH_AUDIT'?tr('Zachovat audit, odpojit vazbu','Retain audit, detach reference'):tr('Zachovat','Keep')}</td></tr>)}</tbody></table></div>
            {([ ...plan.relational.unknownTables,...plan.relational.missingTables,...plan.relational.unsupportedTables].length>0)&&<div className={styles.warning} role="alert">{tr('Neúplné pokrytí schématu: ','Incomplete schema coverage: ')}{[...plan.relational.unknownTables,...plan.relational.missingTables,...plan.relational.unsupportedTables].join(', ')}</div>}
            {plan.relational.conflicts.length>0&&<div className={styles.warning} role="alert"><div><strong>{tr('Nalezené vazby mimo cvičení','References outside exercise scope')}</strong><ul>{plan.relational.conflicts.map(c=><li key={c.child+':'+c.constraint}>{c.child} → {c.parent} ({c.count})</li>)}</ul></div></div>}
            <div className={styles.warning}><AlertTriangle size={17}/>{tr('Nejde o povolení k mazání. Úplné provedení je zatím blokováno.','This is not deletion authorization. Full execution is still blocked.')}</div>
          </div>}
        </section>
        <section className={styles.panel}>
          <h2><Database size={19}/>{tr('4 · Ověření úložiště a front','4 · Storage and queue inspection')}</h2>
          <p>{tr('Serverový inventář porovná známé odkazy se skutečnými objekty a vyhledávacím indexem. Nikdy nemaže.','Host inventory compares known references with actual objects and the search index. It never deletes.')}</p>
          <div className={styles.command}><code>{inventoryCommand}</code><small>{tr('Výstup uložte jako JSON a načtěte níže.','Save the output as JSON and load it below.')}</small></div>
          <label>{tr('Načíst JSON ze serveru','Load host JSON')} <input type="file" accept=".json,application/json" onChange={e=>{const f=e.target.files?.[0];e.target.value='';void importInventory(f)}}/></label>
          {importError&&<p role="alert">{importError}</p>}
          {hostInventory&&<div className={styles.result}>
            <strong>{tr('Importovaný snímek (nikoli živé ověření)','Imported snapshot (not live verification)')} · {formatTime(hostInventory.generatedAt)}</strong>
            <p>{hostInventory.listingComplete?tr('Omezený průchod jmennými prostory dokončen.','Bounded namespace scan completed.'):tr('Průchod úložištěm neúplný.','Object listing incomplete.')}</p>
            <div className={styles.metrics}>{[
              [tr('Unikátní objekty','Unique objects'),hostInventory.storage.uniqueObjects],
              [tr('Existující','Present'),hostInventory.storage.presentObjects],
              [tr('Chybějící','Missing'),hostInventory.storage.missingObjects],
              [tr('Neověřené','Unverified'),hostInventory.storage.unverifiedObjects],
              [tr('Sdílené','Shared'),hostInventory.storage.sharedObjects],
              [tr('Mimo namespace','Outside namespace'),hostInventory.storage.outsideNamespace],
              [tr('Chráněné buckety','Protected buckets'),hostInventory.storage.protectedBucket],
              [tr('Bez známého odkazu','Unreferenced'),hostInventory.storage.unreferencedNamespaceObjects],
              [tr('Odkazy jiných cvičení','Foreign references'),hostInventory.storage.foreignOwnedNamespaceObjects],
              [tr('Indexované záznamy','Indexed records'),hostInventory.indexedDocuments??'—'],
              [tr('Úlohy cvičení','Exercise jobs'),hostInventory.background.exerciseJobs],
              [tr('Generování scénáře','Scenario generation'),hostInventory.background.scenarioBatches],
              [tr('Neuzavřený outbox cvičení','Event outbox'),hostInventory.background.eventOutbox],
              [tr('Nezařazený outbox','Unclassified outbox'),hostInventory.background.unclassifiedOutbox],
              [tr('Forenzní externí odkazy','External forensic refs'),hostInventory.background.forensicReferences]
            ].map(([label,count])=><div key={String(label)}><span>{label}</span><strong>{count}</strong></div>)}</div>
            <div className={styles.warning}><AlertTriangle size={17}/><div><strong>{tr('Blokace úplného mazání','Full deletion blockers')}</strong><ul>{hostInventory.blockers.map(key=><li key={key}>{key.replaceAll('_',' ')}</li>)}</ul></div></div>
            <p>{tr('Import není potvrzením oprávnění k mazání. Redis, externí forenzní úložiště a obnova stále vyžadují samostatnou kontrolu.','Import is not deletion authorization. Redis, external forensic storage and recovery require separate checks.')}</p>
          </div>}
        </section>
        <section className={styles.panel}>
          <h2><ShieldCheck size={19}/>{tr('5 · Co zůstává zachováno','5 · What is retained')}</h2>
          <Link className="btn btn-secondary" href={'/admin/audit?eventId='+encodeURIComponent(id)}>{tr('Audit tohoto cvičení','Audit for this exercise')}</Link>
          <p>{tr('Uživatelé, role, členství, auditní stopa a operační historie. Samotné cvičení zůstává archivované.','Users, roles, memberships, audit and operational history. The exercise itself remains archived.')}</p>
          <div className={styles.warning}><AlertTriangle size={19}/><div><strong>{tr('Úplné odstranění cvičení zatím není k dispozici','Complete exercise deletion is not yet available')}</strong><p>{tr('Důkazy, zprávy, soubory, externí integrace a závislosti musí projít samostatnou akceptací. Náhled neznamená oprávnění odstranit všechna data.','Evidence, reports, files, external integrations and dependencies require separate acceptance. Preview is not permission to delete all data.')}</p></div></div>
        </section>
      </>}
    </div>
  </AppShell>;
}

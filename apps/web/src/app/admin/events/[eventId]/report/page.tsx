'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { apiClient } from '@/lib/api-client';
import { PrintField, PrintSection, PrintSheet } from '@/components/print/PrintSheet';
import type { EventAfterActionReport, EventPurgePreview } from '@cyris/contracts';

function ActivityChart({data}: {data: EventAfterActionReport['dailyActivity']}) {
  const recent = data.slice(-28);
  const max = Math.max(1,...recent.map(day=>day.auditEvents+day.operationalEvents));
  if (!recent.length) return <p>Dosud nebyla zaznamenána žádná aktivita.</p>;
  return <div style={{display:'grid',gap:10}}>
    <div style={{display:'flex',gap:3,alignItems:'end',height:148,padding:'8px 4px',
      borderBottom:'1px solid var(--border-default)'}} aria-label="Počty operačních a auditních událostí podle dní">
      {recent.map(day=><div key={day.day} title={day.day+' · operace '+day.operationalEvents+
        ' · audit '+day.auditEvents+' · zamítnutí '+day.denied}
        style={{flex:'1 1 0',minWidth:3,display:'flex',alignItems:'end',gap:2,height:'100%'}}>
        <div style={{width:'50%',height:Math.max(1,day.operationalEvents/max*100)+'%',
          background:'#4777a2'}}/>
        <div style={{width:'50%',height:Math.max(1,day.auditEvents/max*100)+'%',
          background:'#a3aab5'}}/>
      </div>)}
    </div>
    <p style={{fontSize:12,margin:0}}>Posledních {recent.length} zaznamenaných dní (UTC) ·
      <span style={{color:'#4777a2'}}> ■</span> Operační aktivita ·
      <span style={{color:'#a3aab5'}}> ■</span> Audit</p>
    <div style={{overflowX:'auto'}}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
        <thead><tr><th style={{textAlign:'left'}}>Den (UTC)</th><th>Operace</th><th>Audit</th><th>Zamítnuto</th><th>Chyby</th></tr></thead>
        <tbody>{recent.map(day=><tr key={day.day}>
          <td>{day.day}</td><td style={{textAlign:'center'}}>{day.operationalEvents}</td>
          <td style={{textAlign:'center'}}>{day.auditEvents}</td>
          <td style={{textAlign:'center'}}>{day.denied}</td>
          <td style={{textAlign:'center'}}>{day.failures}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}

function CountTable({ counts }: { counts: Record<string,number> }) {
  const rows = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  if(!rows.length)return <p>Žádné záznamy / No records</p>;
  return <div role="table" aria-label="Counts">
    {rows.map(([label,number])=><PrintField key={label} label={label.replaceAll('_',' ')} value={String(number)}/>)}
  </div>;
}
export default function AdminAfterActionReportPage(){
  const id=useParams().eventId as string;
  const [report,setReport]=useState<EventAfterActionReport|null>(null);
  const [preview,setPreview]=useState<EventPurgePreview|null>(null);
  const [error,setError]=useState('');
  const [preflightError,setPreflightError]=useState('');
  const [working,setWorking]=useState(false);
  const [selectedResourceTypes,setSelectedResourceTypes]=useState<string[]>([]);
  useEffect(()=>{
    let active=true;
    void apiClient.getEventAfterActionReport(id).then(result=>{
      if(!active)return;
      if(!result.ok||!result.data)throw new Error(result.error||'Access to report denied');
      setReport(result.data);
    }).catch(e=>{if(active)setError(e instanceof Error?e.message:'Report unavailable')});
    return()=>{active=false};
  },[id]);
  async function inspectPurge(){
    setWorking(true);setPreflightError('');
    const result=await apiClient.getEventPurgePreview(id,selectedResourceTypes);
    if(result.ok&&result.data)setPreview(result.data);
    else setPreflightError(result.error||'Could not retrieve cleanup impact');
    setWorking(false);
  }
  function downloadData(filename: string, data: string, mime: string) {
    const raw=new Blob([data],{type:mime});
    const url=URL.createObjectURL(raw),a=document.createElement('a');
    a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
  }
  function downloadActivityCsv() {
    if(!report)return;
    // Deliberately numeric-only cells and canonical ISO dates: no user text / CSV formula injection.
    const rows=['day_utc,operational_events,audit_events,denied,failures',
      ...report.dailyActivity.map(row=>[row.day,row.operationalEvents,row.auditEvents,
        row.denied,row.failures].join(','))];
    downloadData('cyris-after-action-'+id+'-daily.csv','\uFEFF'+rows.join('\r\n'),'text/csv;charset=utf-8');
  }
  const downloadJson=()=>{
    if(!report)return;
    downloadData('cyris-after-action-'+id+'.json',JSON.stringify(report,null,2),'application/json');
  };
  return <AppShell breadcrumbs={[{label:'Správa cvičení',href:'/admin/events'},
    {label:'After-action report'}]}>
    <div style={{maxWidth:1080,margin:'0 auto',padding:'14px 18px'}}>
      <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center',justifyContent:'space-between'}}>
        <div><h1 style={{fontSize:'1.35rem'}}>After-action / Statistika cvičení</h1>
          <p>Agregované statistiky cvičení pro organizátory; bez osobních zdravotních údajů.</p></div>
        <div style={{display:'flex',gap:8}}>
          <Link className="btn btn-secondary" href="/admin/events">Zpět na cvičení</Link>
          <button className="btn btn-secondary" disabled={!report} onClick={downloadJson}>Export JSON</button>
          <button className="btn btn-secondary" disabled={!report} onClick={downloadActivityCsv}>Denní statistiky CSV</button>
        </div>
      </div>
      {error&&<p role="alert">{error}</p>}
      {!error&&!report&&<p>Načítám statistiky…</p>}
      {report&&<PrintSheet title={'Závěrečný report – '+report.eventName}
        identifier={report.eventId} subtitle={report.status}>
        <PrintSection title="Přehled cvičení">
          <PrintField label="Název" value={report.eventName}/>
          <PrintField label="Stav" value={report.status}/>
          <PrintField label="Začátek" value={report.startsAt?new Date(report.startsAt).toLocaleString('cs-CZ'):'—'}/>
          <PrintField label="Konec" value={report.endsAt?new Date(report.endsAt).toLocaleString('cs-CZ'):'—'}/>
          <PrintField label="Účastníci / membership" value={String(report.membershipCount)}/>
          <PrintField label="Auditní události" value={String(report.auditEvents)}/>
          <PrintField label="Operační události" value={String(report.operationalEvents)}/>
          <PrintField label="Aktivní auditovaní operátoři" value={String(report.activeAuditOperators)}/>
          <PrintField label="Odmítnuté operace" value={String(report.auditOutcomes.DENIED??0)}/>
          <PrintField label="Zaznamenaná selhání" value={String(report.auditOutcomes.FAILURE??0)}/>
        </PrintSection>
        <PrintSection title="Evidence a záznamy"><CountTable counts={report.resources}/></PrintSection>
        <PrintSection title="Soudní řízení"><CountTable counts={report.courtStatus}/></PrintSection>
        <PrintSection title="Právní žádosti"><CountTable counts={report.legalRequests}/></PrintSection>
        <PrintSection title="Zdravotnické případy"><CountTable counts={report.medicalStatus}/></PrintSection>
        <PrintSection title="Úkoly"><CountTable counts={report.taskStatus}/></PrintSection>
        <PrintSection title="Žádosti na support"><CountTable counts={report.supportStatus}/></PrintSection>
        <PrintSection title="Audit podle oblasti"><CountTable counts={report.auditCategories}/></PrintSection>
        <PrintSection title="Výsledky bezpečnostního auditu"><CountTable counts={report.auditOutcomes}/></PrintSection>
        <PrintSection title="Vývoj aktivity během cvičení"><ActivityChart data={report.dailyActivity}/></PrintSection>
        <PrintSection title="Metodická poznámka">
          <p>Údaje představují okamžitý stav databáze CYRIS. Neobsahují automatické odborné hodnocení,
          anonymizované osobní výstupy ani archiv všech dokumentů. Detailní záznamy lze
          vytisknout jednotlivě podle přidělených oprávnění.</p>
        </PrintSection>
      </PrintSheet>}
      <section style={{margin:'1.5rem 0',padding:18,border:'1px solid var(--border-strong)',borderRadius:10}}>
        <h2 style={{fontSize:'1.12rem'}}>Správa retence a bezpečné vyčištění</h2>
        <p>Nejdřív zobrazit přesný dopad. Tato verze pouze analyzuje, nic nemaže.
          Mazání musí mít ověřenou šifrovanou zálohu, zachování auditní stopy a oddělené potvrzení.</p>
        <fieldset style={{border:'1px solid var(--border-default)',borderRadius:8,padding:12,margin:'12px 0'}}>
          <legend style={{fontWeight:650}}>Kategorie pro částečný náhled</legend>
          <p style={{fontSize:13,marginTop:0}}>
            Bez výběru se zobrazí všechny typy. Výběr pouze upřesní počty v bezpečnostním náhledu.
          </p>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(175px,1fr))',gap:8}}>
            {Object.entries(report?.resources??{}).sort((a,b)=>a[0].localeCompare(b[0])).map(([type,count])=>
              <label key={type} style={{display:'flex',gap:6,alignItems:'center',overflowWrap:'anywhere'}}>
                <input type="checkbox" checked={selectedResourceTypes.includes(type)}
                  onChange={event=>{
                    setPreview(null);
                    setSelectedResourceTypes(previous=>event.target.checked?
                      [...previous,type]:previous.filter(value=>value!==type));
                  }}/>
                {type.replaceAll('_',' ')} ({count})
              </label>)}
          </div>
          <button type="button" className="btn btn-secondary" style={{marginTop:8}}
            onClick={()=>{setSelectedResourceTypes([]);setPreview(null);}}>Zrušit výběr kategorií</button>
        </fieldset>
        <button type="button" className="btn btn-secondary" disabled={working||!report} onClick={()=>void inspectPurge()}>
          {working?'Počítám…':'Zkontrolovat dopad částečného / úplného promazání'}
        </button>
        {preflightError&&<p role="alert">{preflightError}</p>}
        {preview&&<div style={{display:'grid',gap:12,marginTop:14}}>
          <p role="status"><strong>Nejde o seznam skutečně odstranitelných dat.</strong>
            Výpočet pokrývá pouze přímo evidované databázové resources,
            nikoli vazby, soubory, fronty a externí indexy.</p>
          <PrintField label="Vybráno záznamů" value={preview.selection.matchingResources}/>
          <PrintField label="Mimo výběr" value={preview.selection.unselectedResources}/>
          <button type="button" className="btn btn-secondary" style={{justifySelf:'start'}}
            onClick={()=>downloadData('cyris-purge-preview-'+id+'.json',
              JSON.stringify(preview,null,2),'application/json')}>Uložit bezpečnostní náhled JSON</button>
          <div><h3>Částečné odstranění dat cvičení</h3>
            <p>{preview.profiles.exerciseDataOnly.description}</p>
            <CountTable counts={preview.profiles.exerciseDataOnly.counts}/></div>
          <div><h3>Úplné odstranění eventu</h3>
            <p>{preview.profiles.wholeEvent.description}</p>
            <CountTable counts={preview.profiles.wholeEvent.counts}/></div>
          <div><h3>Bezpečnostní blokace</h3>
            <ul>{preview.blockers.map(x=><li key={x}>{x}</li>)}</ul>
          </div>
          <p role="status"><strong>Operace mazání jsou z bezpečnostních důvodů zatím uzamčené.</strong></p>
        </div>}
      </section>
    </div>
  </AppShell>;
}

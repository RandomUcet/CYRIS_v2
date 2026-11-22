'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { apiClient } from '@/lib/api-client';
import { PrintField, PrintSection, PrintSheet } from '@/components/print/PrintSheet';
import type { EventAfterActionReport, EventPurgePreview } from '@cyris/contracts';

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
    const result=await apiClient.getEventPurgePreview(id);
    if(result.ok&&result.data)setPreview(result.data);
    else setPreflightError(result.error||'Could not retrieve cleanup impact');
    setWorking(false);
  }
  const downloadJson=()=>{
    if(!report)return;
    const raw=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(raw);
    const a=document.createElement('a');
    a.href=url;a.download='cyris-after-action-'+id+'.json';
    a.click();URL.revokeObjectURL(url);
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
        </PrintSection>
        <PrintSection title="Evidence a záznamy"><CountTable counts={report.resources}/></PrintSection>
        <PrintSection title="Soudní řízení"><CountTable counts={report.courtStatus}/></PrintSection>
        <PrintSection title="Právní žádosti"><CountTable counts={report.legalRequests}/></PrintSection>
        <PrintSection title="Zdravotnické případy"><CountTable counts={report.medicalStatus}/></PrintSection>
        <PrintSection title="Úkoly"><CountTable counts={report.taskStatus}/></PrintSection>
        <PrintSection title="Žádosti na support"><CountTable counts={report.supportStatus}/></PrintSection>
        <PrintSection title="Audit podle oblasti"><CountTable counts={report.auditCategories}/></PrintSection>
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
        <button type="button" className="btn btn-secondary" disabled={working||!report} onClick={()=>void inspectPurge()}>
          {working?'Počítám…':'Zkontrolovat dopad částečného / úplného promazání'}
        </button>
        {preflightError&&<p role="alert">{preflightError}</p>}
        {preview&&<div style={{display:'grid',gap:12,marginTop:14}}>
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

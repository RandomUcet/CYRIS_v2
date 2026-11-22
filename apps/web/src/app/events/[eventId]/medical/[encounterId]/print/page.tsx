'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { MedicalEncounterDetail } from '@cyris/contracts';
import { apiClient } from '@/lib/api-client';
import { PrintField, PrintSection, PrintSheet } from '@/components/print/PrintSheet';
const at=(date:string|null|undefined)=>date?new Date(date).toLocaleString('cs-CZ'):'—';
export default function PrintableMedicalReport(){
  const p=useParams(),eventId=p.eventId as string,id=p.encounterId as string;
  const [record,setRecord]=useState<MedicalEncounterDetail|null>(null),[error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    void apiClient.getMedicalEncounter(eventId,id).then(res=>{
      if(!active)return;
      if(!res.ok||!res.data)throw new Error(res.error||'Zdravotnický záznam není přístupný');
      setRecord(res.data);
    }).catch(err=>{if(active)setError(err instanceof Error?err.message:'Chyba načítání')});
    return()=>{active=false};
  },[eventId,id]);
  if(error)return <p role="alert">Nelze otevřít zdravotnický tiskový náhled: {error}</p>;
  if(!record)return <p>Načítám zdravotnickou zprávu…</p>;
  return <PrintSheet title="Zdravotnická zpráva / Medical record" identifier={record.medicalNumber}
    subtitle={record.personDisplayName}>
    <PrintSection title="Identifikace a ošetření">
      <PrintField label="Osoba" value={record.personDisplayName??record.personId}/>
      <PrintField label="Stav" value={record.status}/>
      <PrintField label="Triage" value={record.triageCategory}/>
      <PrintField label="Založeno" value={at(record.openedAt)}/>
      <PrintField label="Zasahující tým" value={record.assignedUnitName??record.assignedUnitId}/>
      <PrintField label="Lokalita" value={record.locationName??record.locationId}/>
      <PrintField label="Hlavní potíže" value={record.chiefComplaint}/>
      <PrintField label="Mechanismus zranění" value={record.mechanismOfInjury}/>
      <PrintField label="Zhodnocení" value={record.assessmentSummary}/>
      <PrintField label="Předání a výsledek" value={record.disposition}/>
    </PrintSection>
    <PrintSection title={'Vitální funkce / pozorování ('+record.observations.length+')'}>
      {record.observations.map(o=><PrintField key={o.id}
        label={o.observationType+' · '+at(o.observedAt)}
        value={[o.value,o.unit,o.note].filter(Boolean).join(' ')}/>)}
    </PrintSection>
    <PrintSection title={'Zákroky ('+record.interventions.length+')'}>
      {record.interventions.map(o=><PrintField key={o.id}
        label={o.interventionType+' · '+at(o.performedAt)}
        value={[o.description,o.outcome].filter(Boolean).join('\n')}/>)}
    </PrintSection>
    <PrintSection title={'Připojené dokumenty ('+record.documents.length+')'}>
      {record.documents.map(d=><PrintField key={d.id}
        label={d.documentType} value={[d.documentNumber,d.title].filter(Boolean).join(' · ')}/>)}
    </PrintSection>
    <PrintSection title={'Průběh péče ('+record.timeline.length+')'}>
      {record.timeline.map(e=><PrintField key={e.id} label={at(e.occurredAt)+' · '+e.activityType}
        value={[e.title,e.summary].filter(Boolean).join('\n')}/>)}
    </PrintSection>
  </PrintSheet>;
}

'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { LabAnalysisDetail } from '@cyris/contracts';
import { apiClient } from '@/lib/api-client';
import { PrintField, PrintSection, PrintSheet } from '@/components/print/PrintSheet';
const at=(value:string|null|undefined)=>value?new Date(value).toLocaleString('cs-CZ'):'—';
export default function PrintableLabReport() {
  const p=useParams(),eventId=p.eventId as string,id=p.analysisId as string;
  const [data,setData]=useState<LabAnalysisDetail|null>(null),[error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    void apiClient.getLabAnalysis(eventId,id).then(res=>{
      if(!active)return;
      if(!res.ok||!res.data)throw new Error(res.error||'Access denied');
      setData(res.data);
    }).catch(e=>{if(active)setError(e instanceof Error?e.message:'Error')});
    return()=>{active=false};
  },[eventId,id]);
  if(error)return <p role="alert">{error}</p>;
  if(!data)return <p>Načítám laboratorní zprávu…</p>;
  return <PrintSheet title="Laboratorní zpráva / Laboratory report" identifier={data.analysisNumber}>
    <PrintSection title="Identifikace">
      <PrintField label="Stav" value={data.status}/>
      <PrintField label="Typ analýzy" value={data.analysisType}/>
      <PrintField label="Požadováno" value={at(data.requestedAt)}/>
      <PrintField label="Zpracovatel" value={data.analystName}/>
      <PrintField label="Jednotka" value={data.unitName}/>
      <PrintField label="Účel" value={data.purpose}/>
      <PrintField label="Použitá metoda" value={data.method}/>
      <PrintField label="Zjištění" value={data.findings}/>
      <PrintField label="Závěr" value={data.conclusion}/>
    </PrintSection>
    <PrintSection title={'Důkazy a vzorky ('+data.evidenceItems.length+')'}>
      {data.evidenceItems.map(x=><PrintField key={x.id} label={x.evidenceNumber+' · '+x.status}
        value={x.title}/>)}
    </PrintSection>
  </PrintSheet>;
}

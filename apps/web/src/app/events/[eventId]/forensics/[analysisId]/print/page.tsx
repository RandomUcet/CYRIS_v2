'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { ForensicAnalysisDetail } from '@cyris/contracts';
import { apiClient } from '@/lib/api-client';
import { PrintField, PrintSection, PrintSheet } from '@/components/print/PrintSheet';
const at=(value:string|null|undefined)=>value?new Date(value).toLocaleString('cs-CZ'):'—';
export default function PrintableForensicReport() {
  const p=useParams(),eventId=p.eventId as string,id=p.analysisId as string;
  const [data,setData]=useState<ForensicAnalysisDetail|null>(null),[error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    void apiClient.getForensicAnalysis(eventId,id).then(res=>{
      if(!active)return;
      if(!res.ok||!res.data)throw new Error(res.error||'Access denied');
      setData(res.data);
    }).catch(e=>{if(active)setError(e instanceof Error?e.message:'Error')});
    return()=>{active=false};
  },[eventId,id]);
  if(error)return <p role="alert">{error}</p>;
  if(!data)return <p>Načítám forenzní zprávu…</p>;
  return <PrintSheet title="Forenzní zpráva / Forensic report" identifier={data.analysisNumber}>
    <PrintSection title="Přehled">
      <PrintField label="Stav" value={data.status}/>
      <PrintField label="Typ analýzy" value={data.analysisType}/>
      <PrintField label="Priorita" value={data.priority}/>
      <PrintField label="Požadováno" value={at(data.requestedAt)}/>
      <PrintField label="Účel" value={data.purpose}/>
      <PrintField label="Metodika" value={data.methodology}/>
      <PrintField label="Zjištění" value={data.findings}/>
      <PrintField label="Závěr" value={data.conclusion}/>
    </PrintSection>
    <PrintSection title={'Jednotlivá zjištění ('+data.findingsList.length+')'}>
      {data.findingsList.map(x=><PrintField key={x.id} label={x.title+' · '+x.confidence}
        value={[x.findingType,x.description].filter(Boolean).join('\n')}/>)}
    </PrintSection>
    <PrintSection title={'Forenzní kopie ('+data.acquisitions.length+')'}>
      {data.acquisitions.map(x=><PrintField key={x.id} label={x.acquisitionType+' · '+at(x.startedAt)}
        value={['Nástroj: '+(x.toolName||'—'),'Hash zdroje: '+(x.sourceHash||'—'),
          'Hash kopie: '+(x.imageHash||'—'),x.notes].filter(Boolean).join('\n')}/>)}
    </PrintSection>
    <PrintSection title={'Související důkazy ('+data.evidenceLinks.length+')'}>
      {data.evidenceLinks.map(x=><PrintField key={x.id} label={x.evidenceNumber}
        value={x.description+' · '+x.status}/>)}
    </PrintSection>
    <PrintSection title={'Technika ('+data.deviceLinks.length+')'}>
      {data.deviceLinks.map(x=><PrintField key={x.id} label={x.name} value={x.deviceType}/>)}
    </PrintSection>
  </PrintSheet>;
}

'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { PrintField, PrintSection, PrintSheet } from '@/components/print/PrintSheet';
import type { CourtCaseDetail, CourtRequestItem } from '@cyris/contracts';

const at = (date: string | null | undefined) => date ? new Date(date).toLocaleString('cs-CZ') : '—';
export default function PrintableCourtMatter() {
  const p = useParams(); const eventId = p.eventId as string; const id = p.courtCaseId as string;
  const [caseFile,setCaseFile] = useState<CourtCaseDetail|null>(null);
  const [requests,setRequests] = useState<CourtRequestItem[]>([]);
  const [error,setError] = useState('');
  useEffect(()=>{
    let active = true;
    void Promise.all([apiClient.getCourtCase(eventId,id), apiClient.listCourtRequests(eventId,id)])
      .then(([matter, requested])=>{
        if(!active)return;
        if(!matter.ok || !matter.data)throw new Error(matter.error || 'Nedostatečné oprávnění ke spisu');
        setCaseFile(matter.data);
        if(requested.ok && requested.data) setRequests(requested.data);
      }).catch(e=>{if(active)setError(e instanceof Error?e.message:'Chyba načítání')});
    return ()=>{active=false};
  },[eventId,id]);
  if(error)return <p role="alert">Nelze zobrazit tiskový náhled: {error}</p>;
  if(!caseFile)return <p>Načítám soudní spis…</p>;
  return <PrintSheet title="Soudní spis / Judicial case file" identifier={caseFile.courtCaseNumber}
    subtitle={caseFile.title}>
    <PrintSection title="Základní údaje">
      <PrintField label="Stav" value={caseFile.status}/>
      <PrintField label="Založeno" value={at(caseFile.openedAt)}/>
      <PrintField label="Uzavřeno" value={at(caseFile.closedAt)}/>
      <PrintField label="Shrnutí" value={caseFile.summary}/>
      <PrintField label="Zdrojový případ" value={caseFile.originatingCaseNumber ?? caseFile.originatingCaseId}/>
    </PrintSection>
    <PrintSection title={'Účastníci ('+caseFile.parties.length+')'}>
      {caseFile.parties.map(x=><PrintField key={x.id} label={x.partyRole} value={x.partyName || x.partyResourceId}/>)}
    </PrintSection>
    <PrintSection title={'Obvinění ('+caseFile.charges.length+')'}>
      {caseFile.charges.map(x=><PrintField key={x.id} label={x.title+' · '+x.status}
        value={[x.code,x.description].filter(Boolean).join('\n')}/>)}
    </PrintSection>
    <PrintSection title={'Důkazní přílohy ('+caseFile.exhibits.length+')'}>
      {caseFile.exhibits.map(x=><PrintField key={x.id} label={x.exhibitNumber+' · '+x.status}
        value={[x.evidenceNumber,x.evidenceDescription,x.documentTitle,x.decisionReason].filter(Boolean).join('\n')}/>)}
    </PrintSection>
    <PrintSection title={'Jednání ('+caseFile.hearings.length+')'}>
      {caseFile.hearings.map(x=><PrintField key={x.id} label={x.title+' · '+x.status}
        value={at(x.scheduledAt)+'\n'+(x.notes||'')}/>)}
    </PrintSection>
    <PrintSection title={'Podání ('+caseFile.filings.length+')'}>
      {caseFile.filings.map(x=><PrintField key={x.id} label={x.filingType}
        value={[x.documentTitle,x.documentNumber,at(x.filedAt),x.notes].filter(Boolean).join('\n')}/>)}
    </PrintSection>
    <PrintSection title={'Rozhodnutí ('+caseFile.decisions.length+')'}>
      {caseFile.decisions.map(x=><PrintField key={x.id} label={x.decisionType+' · '+at(x.decidedAt)}
        value={[x.summary,x.reasoning].filter(Boolean).join('\n')}/>)}
    </PrintSection>
    {requests.length>0&&<PrintSection title={'Žádosti a odpovědi ('+requests.length+')'}>
      {requests.map(x=><PrintField key={x.id} label={x.kind+' · '+x.status}
        value={[x.subject,x.details,x.response].filter(Boolean).join('\n\n')}/>)}
    </PrintSection>}
  </PrintSheet>;
}

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { PrintField, PrintSection, PrintSheet } from '@/components/print/PrintSheet';
import type { ParticipantBriefing, ParticipantBriefingsListResponse } from '@cyris/contracts';

const at = (date: string | null | undefined) => date ? new Date(date).toLocaleString('cs-CZ') : '—';

export default function PrintableBriefings() {
  const params = useParams();
  const eventId = params.eventId as string;
  const [data, setData] = useState<ParticipantBriefingsListResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void apiClient.getParticipantBriefings(eventId).then(result => {
      if (!active) return;
      if (!result.ok || !result.data) throw new Error(result.error || 'Briefingy nejsou přístupné');
      setData(result.data);
    }).catch(err => {
      if (active) setError(err instanceof Error ? err.message : 'Chyba načítání');
    });
    return () => { active = false; };
  }, [eventId]);

  if (error) return <p role="alert">Nelze vytvořit tiskový náhled briefingů: {error}</p>;
  if (!data) return <p>Načítám briefingy…</p>;

  // Render only participant-safe content returned by the authenticated briefing endpoint.
  // Controller notes and unreleased injects never enter this print view.
  const items = [...data.newBriefings, ...data.earlierBriefings]
    .sort((a, b) => b.deliveredAt.localeCompare(a.deliveredAt));
  return <PrintSheet title="Provozní briefingy / Operational briefings"
    identifier={`Cvičení ${eventId.slice(0, 8)}`}
    subtitle={`Přijaté: ${items.length} · Nepřečtené: ${data.unreadCount} · Čeká potvrzení: ${data.pendingAcknowledgementCount}`}>
    <PrintSection title={`Doručené briefingy (${items.length})`}>
      {items.length === 0
        ? <p>V tomto cvičení nejsou dostupné žádné doručené briefingy.</p>
        : items.map((item: ParticipantBriefing) =>
          <PrintField key={item.deliveryId}
            label={`${item.injectNumber} · ${at(item.deliveredAt)}`}
            value={<div style={{ whiteSpace: 'pre-wrap' }}>
              <strong>{item.title}</strong>
              {item.content ? <p>{item.content}</p> : null}
              <p>Jazyk: {item.locale} · Přečteno: {at(item.readAt)} ·
                {item.requiresAcknowledgement ? ` Potvrzeno: ${at(item.acknowledgedAt)}` : ' Potvrzení není vyžadováno'}
              </p>
              {item.disclosedResources.length > 0 &&
                <p>Zpřístupněné zdroje: {item.disclosedResources.map(x => x.identifier || x.resourceId).join(', ')}</p>}
            </div>}
          />
        )}
    </PrintSection>
  </PrintSheet>;
}

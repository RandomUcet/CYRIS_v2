'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { LoadingState, ErrorState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import type { ParticipantDisruptionStatus } from '@cyris/contracts';

export default function TaskDisruptionPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const [status, setStatus] = useState<ParticipantDisruptionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiClient.getDisruptionStatus(eventId).then((response) => {
      if (!active) return;
      if (response.ok && response.data) setStatus(response.data);
      else setError(response.error || 'Stav simulace není dostupný');
    }).catch(() => {
      if (active) setError('Stav simulace není dostupný');
    });
    return () => { active = false; };
  }, [eventId]);

  return (
    <AppShell breadcrumbs={[{ label: 'Tasks', href: `/events/${eventId}/tasks` }, { label: 'Stav simulace' }]}>
      {!status && !error && <LoadingState />}
      {error && <ErrorState message={error} onRetry={() => window.location.reload()} />}
      {status && (
        <section className="max-w-2xl rounded-lg border border-slate-800 bg-slate-900 p-6 text-slate-200">
          <h1 className="text-lg font-semibold">Stav taskového modulu</h1>
          <p className="mt-3 text-sm text-slate-400">
            {status.active ? `Aktivní simulovaný stav: ${status.mode === 'UNAVAILABLE' ? 'dočasně nedostupné' : 'omezený režim'}.` : 'Není aktivní žádné simulované omezení.'}
          </p>
          <p className="mt-2 text-xs text-slate-500">Poslední potvrzená revize: {status.revision ?? 'zatím není k dispozici'}</p>
          <p className="mt-4 text-sm text-slate-300">Pokud potřebujete pomoc, obraťte se na velitele cvičení nebo EXCON.</p>
          <a className="mt-5 inline-block rounded bg-blue-600 px-3 py-2 text-sm text-white" href={`/events/${eventId}/tasks`}>Zpět k taskům</a>
        </section>
      )}
    </AppShell>
  );
}

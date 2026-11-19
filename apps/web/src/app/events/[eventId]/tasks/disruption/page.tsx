'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { LoadingState, ErrorState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import type { ParticipantDisruptionStatus, RecoveryObjective, RecoveryArtifact } from '@cyris/contracts';

export default function TaskDisruptionPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const [status, setStatus] = useState<ParticipantDisruptionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [objectives, setObjectives] = useState<RecoveryObjective[]>([]);
  const [report, setReport] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<Record<string, RecoveryArtifact[]>>({});

  const refresh = async () => {
    setError(null);
    const [statusResponse, objectivesResponse] = await Promise.all([
      apiClient.getDisruptionStatus(eventId),
      apiClient.listRecoveryObjectives(eventId),
    ]);
    if (statusResponse.ok && statusResponse.data) setStatus(statusResponse.data);
    else setError(statusResponse.error || 'Stav simulace není dostupný');
    if (objectivesResponse.ok && objectivesResponse.data) setObjectives(objectivesResponse.data);
    if (objectivesResponse.ok && objectivesResponse.data) {
      const artifactEntries = await Promise.all(objectivesResponse.data.map(async (objective) => [objective.id, await apiClient.listRecoveryArtifacts(eventId, objective.id)] as const));
      setArtifacts(Object.fromEntries(artifactEntries.filter(([, response]) => response.ok).map(([id, response]) => [id, response.data ?? []])));
    }
  };

  useEffect(() => {
    let active = true;
    void Promise.all([apiClient.getDisruptionStatus(eventId), apiClient.listRecoveryObjectives(eventId)]).then(([statusResponse, objectivesResponse]) => {
      if (!active) return;
      if (statusResponse.ok && statusResponse.data) setStatus(statusResponse.data);
      else setError(statusResponse.error || 'Stav simulace není dostupný');
      if (objectivesResponse.ok && objectivesResponse.data) setObjectives(objectivesResponse.data);
      if (objectivesResponse.ok && objectivesResponse.data) {
        const artifactEntries = await Promise.all(objectivesResponse.data.map(async (objective) => [objective.id, await apiClient.listRecoveryArtifacts(eventId, objective.id)] as const));
        if (active) setArtifacts(Object.fromEntries(artifactEntries.filter(([, response]) => response.ok).map(([id, response]) => [id, response.data ?? []])));
      }
    }).catch(() => { if (active) setError('Stav simulace není dostupný'); });
    return () => { active = false; };
  }, [eventId]);

  return (
    <AppShell breadcrumbs={[{ label: 'Tasks', href: `/events/${eventId}/tasks` }, { label: 'Stav simulace' }]}>
      {!status && !error && <LoadingState />}
      {error && <ErrorState message={error} onRetry={refresh} />}
      {status && (
        <section className="max-w-2xl rounded-lg border border-slate-800 bg-slate-900 p-6 text-slate-200">
          <h1 className="text-lg font-semibold">Stav taskového modulu</h1>
          <p className="mt-3 text-sm text-slate-400">
            {status.active ? `Aktivní simulovaný stav: ${status.mode === 'UNAVAILABLE' ? 'dočasně nedostupné' : 'omezený režim'}.` : 'Není aktivní žádné simulované omezení.'}
          </p>
          <p className="mt-2 text-xs text-slate-500">Poslední potvrzená revize: {status.revision ?? 'zatím není k dispozici'}</p>
          <button type="button" className="mt-3 rounded border border-slate-700 px-3 py-1 text-xs" onClick={refresh}>Obnovit stav</button>
          <p className="mt-4 text-sm text-slate-300">Pokud potřebujete pomoc, obraťte se na velitele cvičení nebo EXCON.</p>
          {status.active && objectives.length > 0 && (
            <div className="mt-6 space-y-3">
              <h2 className="text-sm font-semibold">Pokyny k návratu k práci</h2>
              {objectives.map((objective) => (
                <article key={objective.id} className="rounded border border-slate-700 bg-slate-950 p-4">
                  <h3 className="font-medium">{objective.title}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{objective.instructions}</p>
                  {(artifacts[objective.id] ?? []).map((artifact) => (
                    <a key={artifact.id} className="mt-2 block text-sm text-blue-300 underline" href={`/api/events/${eventId}/disruptions/recovery-objectives/${objective.id}/artifacts/${artifact.id}/download`}>
                      Stáhnout: {artifact.title}
                    </a>
                  ))}
                  <textarea
                    value={report[objective.id] ?? ''}
                    onChange={(event) => setReport((current) => ({ ...current, [objective.id]: event.target.value }))}
                    className="mt-3 min-h-24 w-full rounded border border-slate-700 bg-slate-900 p-2 text-sm"
                    placeholder="Stručně popište provedený krok obnovy"
                    maxLength={4000}
                  />
                  <button type="button" className="mt-2 text-xs text-slate-400 underline" onClick={async () => {
                    const result = await apiClient.listRecoveryReports(eventId, objective.id);
                    if (result.ok && result.data?.length) setSubmitted((current) => ({ ...current, [objective.id]: true }));
                  }}>Ověřit stav reportu</button>
                  <button
                    type="button"
                    disabled={submitting === objective.id || (report[objective.id] ?? '').trim().length < 3}
                    onClick={async () => {
                      setSubmitting(objective.id);
                      const result = await apiClient.submitRecoveryReport(eventId, objective.id, { body: report[objective.id]!.trim() });
                      if (!result.ok) setError(result.error || 'Zprávu se nepodařilo odeslat');
                      else {
                        setReport((current) => ({ ...current, [objective.id]: '' }));
                        setSubmitted((current) => ({ ...current, [objective.id]: true }));
                      }
                      setSubmitting(null);
                    }}
                    className="mt-2 rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                  >
                    {submitting === objective.id ? 'Odesílám…' : 'Odeslat report'}
                  </button>
                  {submitted[objective.id] && <p className="mt-2 text-xs text-emerald-300">Report byl odeslán a čeká na posouzení EXCON.</p>}
                </article>
              ))}
            </div>
          )}
          <a className="mt-5 inline-block rounded bg-blue-600 px-3 py-2 text-sm text-white" href={`/events/${eventId}/tasks`}>Zpět k taskům</a>
        </section>
      )}
    </AppShell>
  );
}

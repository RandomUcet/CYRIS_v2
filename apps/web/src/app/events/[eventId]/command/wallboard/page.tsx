'use client';

import { useParams } from 'next/navigation';
import { Activity, AlertTriangle, Clock3, Radio } from 'lucide-react';
import { useEvent } from '@/contexts/EventContext';
import { useDefconReadiness } from '@/hooks/useDefconReadiness';

const LEVELS = {
  1: { label: 'KATASTROFA', color: '#d62d2d' },
  2: { label: 'KRIZE', color: '#ff7a18' },
  3: { label: 'POHOTOVOST', color: '#f3c53b' },
  4: { label: 'ZVÝŠENÁ BDĚLOST', color: '#3b82f6' },
  5: { label: 'KLID / MÍR', color: '#29c76f' },
} as const;

export default function CommandWallboardPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const { selectedEvent } = useEvent();
  const { snapshot, stale, error } = useDefconReadiness(eventId);
  const level = snapshot?.level ? LEVELS[snapshot.level] : null;
  const disconnected = Boolean(error || stale);

  return (
    <main className="command-wallboard" aria-label="Read-only command readiness wallboard">
      <header className="command-wallboard__header">
        <div>
          <p className="command-wallboard__eyebrow"><Radio size={16} /> EVENT READINESS</p>
          <h1>{selectedEvent?.name ?? 'Exercise event'}</h1>
          <p className="command-wallboard__identity">Event {eventId}</p>
        </div>
        <div className={`command-wallboard__connection ${disconnected ? 'is-stale' : 'is-live'}`}>
          {disconnected ? <AlertTriangle size={18} /> : <Activity size={18} />}
          {disconnected ? 'STALE / DISCONNECTED' : 'LIVE POLLING · 10s'}
        </div>
      </header>

      <section className="command-wallboard__status" style={{ borderColor: level?.color ?? 'var(--border-strong)' }}>
        <div className="command-wallboard__status-label">
          <span>AUTHORITATIVE DEFCON</span>
          <span className="command-wallboard__revision">
            Revision {snapshot?.revision ?? '—'} · <Clock3 size={14} /> {snapshot?.updatedAt ? new Date(snapshot.updatedAt).toLocaleString() : 'No confirmed update'}
          </span>
        </div>
        <div className="command-wallboard__level" style={{ color: level?.color ?? 'var(--text-muted)' }}>
          <strong>{snapshot?.initialized && level ? `DEFCON ${snapshot.level}` : 'UNKNOWN'}</strong>
          <span>{snapshot?.initialized && level ? level.label : 'NOT INITIALIZED'}</span>
        </div>
        {disconnected && <p className="command-wallboard__warning">The last confirmed state is shown only as stale. No default level is inferred.</p>}
      </section>

      <footer className="command-wallboard__footer">
        <span>Read-only display · authenticated event access</span>
        <span>{selectedEvent ? selectedEvent.status : 'Event context unavailable'}</span>
      </footer>
    </main>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, Shield } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import type { CommandDefconLevel, CommandDefconSnapshot } from '@cyris/contracts';

const LEVELS: Array<{ value: CommandDefconLevel; label: string; color: string }> = [
  { value: 5, label: 'Klid/Mír', color: '#29c76f' },
  { value: 4, label: 'Zvýšená bdělost', color: '#3b82f6' },
  { value: 3, label: 'Pohotovost', color: '#f3c53b' },
  { value: 2, label: 'Krize', color: '#ff7a18' },
  { value: 1, label: 'Katastrofa', color: '#d62d2d' },
];

export function DefconPanel({ eventId }: { eventId: string }) {
  const { hasPermission } = useAuth();
  const canChange = hasPermission('command.defcon.change');
  const [snapshot, setSnapshot] = useState<CommandDefconSnapshot | null>(null);
  const [level, setLevel] = useState<CommandDefconLevel>(5);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const result = await apiClient.getDefcon(eventId);
    if (result.ok && result.data) {
      setSnapshot(result.data);
      if (result.data.level) setLevel(result.data.level);
    } else {
      setError(result.error || 'DEFCON stav není dostupný');
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, [eventId]);

  const submit = async () => {
    if (!snapshot || reason.trim().length < 3) return;
    if (!window.confirm(`Potvrdit změnu na DEFCON ${level}?`)) return;
    setSaving(true);
    setError(null);
    const result = await apiClient.changeDefcon(eventId, {
      level,
      expectedRevision: snapshot.revision,
      reason: reason.trim(),
    });
    if (result.ok && result.data) {
      setSnapshot(result.data);
      setReason('');
    } else {
      setError(result.error || 'Změna DEFCON selhala; stav mohl být mezitím změněn.');
      await load();
    }
    setSaving(false);
  };

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-lg p-4">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Shield size={17} className="text-amber-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Exercise readiness / DEFCON</h3>
        </div>
        <button onClick={() => void load()} disabled={loading} className="text-slate-400 hover:text-slate-200" aria-label="Obnovit DEFCON">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      {error && <div className="mb-3 flex items-center gap-2 text-xs text-red-300"><AlertTriangle size={14} />{error}</div>}
      {loading ? <p className="text-xs text-slate-500">Načítám autoritativní stav…</p> : snapshot ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {LEVELS.map((item) => (
              <button key={item.value} disabled={!canChange} onClick={() => setLevel(item.value)}
                className={`px-3 py-2 rounded border text-xs font-mono ${level === item.value ? 'border-white' : 'border-slate-700'}`}
                style={{ color: item.color }}>
                {item.value} — {item.label}
              </button>
            ))}
          </div>
          <div className="text-xs text-slate-400">
            Aktuální: <strong className="text-slate-200">{snapshot.level ? `DEFCON ${snapshot.level}` : 'NEZNÁMÝ / NEINICIALIZOVANÝ'}</strong>
            <span className="ml-3">Revize {snapshot.revision}</span>
          </div>
          {canChange && <div className="flex gap-2">
            <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Důvod změny (povinný)"
              className="flex-1 rounded bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-200" />
            <button onClick={() => void submit()} disabled={saving || reason.trim().length < 3}
              className="px-3 py-2 rounded bg-amber-600 text-xs font-semibold text-white disabled:opacity-50">
              {saving ? 'Ukládám…' : 'Potvrdit'}
            </button>
          </div>}
          {snapshot.history.length > 0 && <p className="text-[11px] text-slate-500">Historie změn: {snapshot.history.length} (audit)</p>}
        </div>
      ) : null}
    </section>
  );
}

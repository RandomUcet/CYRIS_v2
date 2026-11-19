'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RotateCcw, ShieldAlert } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import type { DisruptionMode, DisruptionSnapshot } from '@cyris/contracts';

const MODES: Array<{ value: DisruptionMode; label: string }> = [
  { value: 'UNAVAILABLE', label: 'Nedostupné' },
  { value: 'READ_ONLY', label: 'Pouze čtení' },
  { value: 'DEGRADED', label: 'Degradované' },
];

export function DisruptionPanel({ eventId }: { eventId: string }) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('scenario.manage', eventId);
  const canRestore = hasPermission('scenario.override', eventId);
  const [rows, setRows] = useState<DisruptionSnapshot[]>([]);
  const [mode, setMode] = useState<DisruptionMode>('READ_ONLY');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await apiClient.listDisruptions(eventId);
    if (result.ok && result.data) setRows(result.data);
    else setError(result.error || 'Disruption stav není dostupný');
    setLoading(false);
  }, [eventId]);

  useEffect(() => { void load(); }, [load]);

  const start = async () => {
    if (reason.trim().length < 3 || saving) return;
    setSaving(true);
    setError(null);
    const result = await apiClient.startDisruption(eventId, {
      targetType: 'EVENT',
      targetId: null,
      module: 'tasks',
      mode,
      reason: reason.trim(),
    });
    if (result.ok) {
      setReason('');
      await load();
    } else setError(result.error || 'Disruption se nepodařilo spustit');
    setSaving(false);
  };

  const restore = async (row: DisruptionSnapshot) => {
    if (!window.confirm(`Obnovit modul tasks? Revize ${row.revision}`)) return;
    setSaving(true);
    setError(null);
    const result = await apiClient.restoreDisruption(eventId, row.id, {
      expectedRevision: row.revision,
      reason: 'Obnovení operátorem',
    });
    if (result.ok) await load();
    else setError(result.error || 'Obnovení se nepodařilo');
    setSaving(false);
  };

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <ShieldAlert size={16} className="text-orange-400" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Simulované omezení modulu tasks</h3>
      </div>
      {error && <p className="mb-3 flex items-center gap-2 text-xs text-red-300"><AlertTriangle size={14} />{error}</p>}
      {canManage && (
        <div className="flex flex-wrap gap-2 mb-4">
          <select value={mode} onChange={(event) => setMode(event.target.value as DisruptionMode)}
            className="rounded bg-slate-950 border border-slate-700 px-2 py-2 text-xs text-slate-200">
            {MODES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Důvod (povinný)"
            className="min-w-52 flex-1 rounded bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-200" />
          <button onClick={() => void start()} disabled={saving || reason.trim().length < 3}
            className="rounded bg-orange-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Spustit</button>
        </div>
      )}
      {loading ? <p className="text-xs text-slate-500">Načítám disruption záznamy…</p> : rows.length === 0 ? (
        <p className="text-xs text-slate-500">Žádné disruption záznamy.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 px-3 py-2 text-xs">
              <div>
                <strong className="text-slate-200">{row.mode}</strong>
                <span className="ml-2 text-slate-400">{row.reason}</span>
                <span className="ml-2 text-slate-500">revize {row.revision}</span>
              </div>
              {canRestore && row.active && <button onClick={() => void restore(row)} disabled={saving}
                className="flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-slate-300 disabled:opacity-50">
                <RotateCcw size={12} /> Obnovit
              </button>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

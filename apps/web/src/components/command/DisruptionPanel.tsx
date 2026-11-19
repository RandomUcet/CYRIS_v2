'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, RotateCcw, ShieldAlert } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import type { DisruptionMode, DisruptionSnapshot, RecoveryObjective, RecoveryReport, RecoveryArtifact } from '@cyris/contracts';

const MODES: Array<{ value: DisruptionMode; label: string }> = [
  { value: 'UNAVAILABLE', label: 'Nedostupné' },
  { value: 'READ_ONLY', label: 'Pouze čtení' },
];

export function DisruptionPanel({ eventId }: { eventId: string }) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('scenario.manage', eventId);
  const canRestore = hasPermission('scenario.override', eventId);
  const [rows, setRows] = useState<DisruptionSnapshot[]>([]);
  const [mode, setMode] = useState<DisruptionMode>('READ_ONLY');
  const [reason, setReason] = useState('');
  const [targetType, setTargetType] = useState<'EVENT' | 'UNIT'>('EVENT');
  const [targetId, setTargetId] = useState('');
  const [units, setUnits] = useState<Array<{ id: string; name: string }>>([]);
  const [startsAt, setStartsAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [objectives, setObjectives] = useState<RecoveryObjective[]>([]);
  const [reports, setReports] = useState<Record<string, RecoveryReport[]>>({});
  const [artifacts, setArtifacts] = useState<Record<string, RecoveryArtifact[]>>({});
  const [artifactTitle, setArtifactTitle] = useState('');
  const [artifactBody, setArtifactBody] = useState('');
  const [objectiveTitle, setObjectiveTitle] = useState('');
  const [objectiveInstructions, setObjectiveInstructions] = useState('');
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError(null);
    const result = await apiClient.listDisruptions(eventId);
    if (sequence !== requestSequence.current) return;
    if (result.ok && result.data) setRows(result.data);
    else setError(result.error || 'Disruption stav není dostupný');
    setLoading(false);
    const objectiveResult = await apiClient.listRecoveryObjectives(eventId);
    if (objectiveResult.ok && objectiveResult.data) setObjectives(objectiveResult.data);
  }, [eventId]);

  useEffect(() => {
    setRows([]);
    void load();
    let active = true;
    apiClient.getUnits(eventId).then((result) => {
      if (active && result.ok && result.data) setUnits(result.data.map((unit: { id: string; name: string }) => ({ id: unit.id, name: unit.name })));
    });
    return () => { active = false; };
  }, [eventId, load]);

  const start = async () => {
    if (reason.trim().length < 3 || saving) return;
    setSaving(true);
    setError(null);
    const result = await apiClient.startDisruption(eventId, {
      targetType,
      targetId: targetType === 'UNIT' ? targetId : null,
      module: 'tasks',
      mode,
      reason: reason.trim(),
      startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
    });
    if (result.ok) {
      setReason('');
      setTargetId('');
      setStartsAt('');
      setExpiresAt('');
      await load();
    } else setError(result.error || 'Disruption se nepodařilo spustit');
    setSaving(false);
  };

  const createObjective = async (disruptionId: string) => {
    if (!objectiveTitle.trim() || objectiveInstructions.trim().length < 3 || saving) return;
    setSaving(true);
    const result = await apiClient.createRecoveryObjective(eventId, {
      disruptionId, audienceType: 'EVENT', audienceId: null,
      title: objectiveTitle.trim(), instructions: objectiveInstructions.trim(),
    });
    if (result.ok && result.data) {
      setObjectives((current) => [result.data!, ...current]);
      setObjectiveTitle('');
      setObjectiveInstructions('');
    } else setError(result.error || 'Cíl obnovy se nepodařilo vytvořit');
    setSaving(false);
  };

  const restore = async (row: DisruptionSnapshot) => {
    if (!window.confirm(`Obnovit modul tasks? Revize ${row.revision}`)) return;
    const reason = window.prompt('Důvod obnovení', 'Obnovení operátorem');
    if (!reason?.trim()) return;
    setSaving(true);
    setError(null);
    const result = await apiClient.restoreDisruption(eventId, row.id, {
      expectedRevision: row.revision,
      reason: reason.trim(),
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
          <select value={targetType} onChange={(event) => setTargetType(event.target.value as 'EVENT' | 'UNIT')}
            className="rounded bg-slate-950 border border-slate-700 px-2 py-2 text-xs text-slate-200">
            <option value="EVENT">Celá událost</option>
            <option value="UNIT">Jednotka</option>
          </select>
          {targetType === 'UNIT' && <select value={targetId} onChange={(event) => setTargetId(event.target.value)}
            className="rounded bg-slate-950 border border-slate-700 px-2 py-2 text-xs text-slate-200">
            <option value="">Vyberte jednotku</option>
            {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
          </select>}
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Důvod (povinný)"
            className="min-w-52 flex-1 rounded bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-200" />
          <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} aria-label="Začátek" />
          <input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} aria-label="Konec" />
          <button onClick={() => void start()} disabled={saving || reason.trim().length < 3 || (targetType === 'UNIT' && !targetId)}
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
      {canManage && (
        <div className="mt-5 space-y-2 border-t border-slate-800 pt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Cíle obnovy</h4>
          <input value={objectiveTitle} onChange={(event) => setObjectiveTitle(event.target.value)} placeholder="Název cíle" className="w-full rounded bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-200" />
          <textarea value={objectiveInstructions} onChange={(event) => setObjectiveInstructions(event.target.value)} placeholder="Bezpečné instrukce pro účastníky" className="min-h-20 w-full rounded bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-200" />
          {rows.filter((row) => row.active).map((row) => (
            <button key={row.id} type="button" disabled={saving || objectiveTitle.trim().length < 3 || objectiveInstructions.trim().length < 3} onClick={() => void createObjective(row.id)} className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 disabled:opacity-50">
              Vytvořit cíl pro revizi {row.revision}
            </button>
          ))}
          {objectives.map((objective) => (
            <div key={objective.id} className="rounded border border-slate-800 px-3 py-2 text-xs">
              <strong className="text-slate-200">{objective.title}</strong>
              <span className="ml-2 text-slate-500">{objective.status} · revize {objective.revision}</span>
              {objective.status === 'DRAFT' && <button type="button" className="ml-3 underline" onClick={() => void apiClient.publishRecoveryObjective(eventId, objective.id, objective.revision).then((result) => { if (result.ok && result.data) setObjectives((current) => current.map((item) => item.id === objective.id ? result.data! : item)); })}>Publikovat</button>}
              {objective.status === 'PUBLISHED' && <button type="button" className="ml-3 underline" onClick={() => void apiClient.reviewRecoveryObjective(eventId, objective.id, { expectedRevision: objective.revision, decision: 'APPROVE' }).then((result) => { if (result.ok && result.data) setObjectives((current) => current.map((item) => item.id === objective.id ? result.data! : item)); })}>Schválit</button>}
              {objective.status === 'PUBLISHED' && <button type="button" className="ml-3 underline" onClick={() => void apiClient.reviewRecoveryObjective(eventId, objective.id, { expectedRevision: objective.revision, decision: 'REJECT' }).then((result) => { if (result.ok && result.data) setObjectives((current) => current.map((item) => item.id === objective.id ? result.data! : item)); })}>Zamítnout</button>}
              <button type="button" className="ml-3 underline" onClick={() => void apiClient.listRecoveryReports(eventId, objective.id).then((result) => { if (result.ok && result.data) setReports((current) => ({ ...current, [objective.id]: result.data! })); })}>Reporty</button>
              <button type="button" className="ml-3 underline" onClick={() => void apiClient.listRecoveryArtifacts(eventId, objective.id).then((result) => { if (result.ok && result.data) setArtifacts((current) => ({ ...current, [objective.id]: result.data! })); })}>Artefakty</button>
              {objective.status === 'APPROVED' && <button type="button" className="ml-3 underline" onClick={() => { const reason = window.prompt('Důvod obnovení'); if (reason?.trim()) void apiClient.restoreRecoveryObjective(eventId, objective.id, { expectedRevision: objective.revision, reason: reason.trim() }).then((result) => { if (result.ok && result.data) setObjectives((current) => current.map((item) => item.id === objective.id ? result.data! : item)); }); }}>Obnovit</button>}
              {reports[objective.id]?.map((item) => <p key={item.id} className="mt-1 text-slate-400">{item.body}</p>)}
              {objective.status === 'DRAFT' && (
                <div className="mt-2 space-y-1">
                  <input value={artifactTitle} onChange={(event) => setArtifactTitle(event.target.value)} placeholder="Název textového artefaktu" className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-xs" />
                  <textarea value={artifactBody} onChange={(event) => setArtifactBody(event.target.value)} placeholder="Synthetic log/config/instructions" className="min-h-16 w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-xs" />
                  <button type="button" disabled={!artifactTitle.trim() || !artifactBody.trim()} className="rounded border border-slate-700 px-2 py-1 text-xs disabled:opacity-50" onClick={() => void apiClient.createRecoveryArtifact(eventId, objective.id, { title: artifactTitle.trim(), filename: `${objective.id}.txt`, body: artifactBody }).then((result) => { if (result.ok && result.data) { setArtifacts((current) => ({ ...current, [objective.id]: [...(current[objective.id] ?? []), result.data!] })); setArtifactTitle(''); setArtifactBody(''); } })}>Přidat textový artefakt</button>
                </div>
              )}
              {artifacts[objective.id]?.map((artifact) => <div key={artifact.id} className="mt-1 text-slate-400">{artifact.title} · {artifact.status}{artifact.status === 'DRAFT' && objective.status === 'PUBLISHED' && <button type="button" className="ml-2 underline" onClick={() => void apiClient.publishRecoveryArtifact(eventId, objective.id, artifact.id, artifact.revision).then((result) => { if (result.ok && result.data) setArtifacts((current) => ({ ...current, [objective.id]: current[objective.id]!.map((item) => item.id === artifact.id ? result.data! : item) })); })}>Publikovat</button>}</div>)}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

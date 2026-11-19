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
    <section className="command-disruption-panel">
      <div className="command-disruption-heading">
        <ShieldAlert size={16} />
        <h3>Simulované omezení modulu tasks</h3>
      </div>
      {error && <p className="command-disruption-error"><AlertTriangle size={14} />{error}</p>}
      {canManage && (
        <div className="command-disruption-controls">
          <select value={mode} onChange={(event) => setMode(event.target.value as DisruptionMode)}
            className="command-disruption-input">
            {MODES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select value={targetType} onChange={(event) => setTargetType(event.target.value as 'EVENT' | 'UNIT')}
            className="command-disruption-input">
            <option value="EVENT">Celá událost</option>
            <option value="UNIT">Jednotka</option>
          </select>
          {targetType === 'UNIT' && <select value={targetId} onChange={(event) => setTargetId(event.target.value)}
            className="command-disruption-input">
            <option value="">Vyberte jednotku</option>
            {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
          </select>}
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Důvod (povinný)"
            className="command-disruption-input command-disruption-reason" />
          <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} aria-label="Začátek" />
          <input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} aria-label="Konec" />
          <button onClick={() => void start()} disabled={saving || reason.trim().length < 3 || (targetType === 'UNIT' && !targetId)}
            className="command-disruption-primary">Spustit</button>
        </div>
      )}
      {loading ? <p className="command-disruption-muted">Načítám disruption záznamy…</p> : rows.length === 0 ? (
        <p className="command-disruption-muted">Žádné disruption záznamy.</p>
      ) : (
        <div className="command-disruption-list">
          {rows.map((row) => (
            <div key={row.id} className="command-disruption-row">
              <div>
                <strong>{row.mode}</strong>
                <span>{row.reason}</span>
                <span>revize {row.revision}</span>
              </div>
              {canRestore && row.active && <button onClick={() => void restore(row)} disabled={saving}
                className="command-disruption-secondary">
                <RotateCcw size={12} /> Obnovit
              </button>}
            </div>
          ))}
        </div>
      )}
      {canManage && (
        <div className="command-disruption-recovery">
          <h4>Cíle obnovy</h4>
          <input value={objectiveTitle} onChange={(event) => setObjectiveTitle(event.target.value)} placeholder="Název cíle" className="command-disruption-input" />
          <textarea value={objectiveInstructions} onChange={(event) => setObjectiveInstructions(event.target.value)} placeholder="Bezpečné instrukce pro účastníky" className="command-disruption-input" />
          {rows.filter((row) => row.active).map((row) => (
            <button key={row.id} type="button" disabled={saving || objectiveTitle.trim().length < 3 || objectiveInstructions.trim().length < 3} onClick={() => void createObjective(row.id)} className="command-disruption-secondary">
              Vytvořit cíl pro revizi {row.revision}
            </button>
          ))}
          {objectives.map((objective) => (
            <div key={objective.id} className="command-disruption-objective">
              <strong>{objective.title}</strong>
              <span>{objective.status} · revize {objective.revision}</span>
              {objective.status === 'DRAFT' && <button type="button" className="command-disruption-link" onClick={() => void apiClient.publishRecoveryObjective(eventId, objective.id, objective.revision).then((result) => { if (result.ok && result.data) setObjectives((current) => current.map((item) => item.id === objective.id ? result.data! : item)); else setError(result.error || 'Cíl obnovy se nepodařilo publikovat'); })}>Publikovat</button>}
              {objective.status === 'PUBLISHED' && <button type="button" className="command-disruption-link" onClick={() => void apiClient.reviewRecoveryObjective(eventId, objective.id, { expectedRevision: objective.revision, decision: 'APPROVE' }).then((result) => { if (result.ok && result.data) setObjectives((current) => current.map((item) => item.id === objective.id ? result.data! : item)); else setError(result.error || 'Cíl obnovy se nepodařilo schválit'); })}>Schválit</button>}
              {objective.status === 'PUBLISHED' && <button type="button" className="command-disruption-link" onClick={() => void apiClient.reviewRecoveryObjective(eventId, objective.id, { expectedRevision: objective.revision, decision: 'REJECT' }).then((result) => { if (result.ok && result.data) setObjectives((current) => current.map((item) => item.id === objective.id ? result.data! : item)); else setError(result.error || 'Cíl obnovy se nepodařilo zamítnout'); })}>Zamítnout</button>}
              <button type="button" className="command-disruption-link" onClick={() => void apiClient.listRecoveryReports(eventId, objective.id).then((result) => { if (result.ok && result.data) setReports((current) => ({ ...current, [objective.id]: result.data! })); })}>Reporty</button>
              <button type="button" className="command-disruption-link" onClick={() => void apiClient.listRecoveryArtifacts(eventId, objective.id).then((result) => { if (result.ok && result.data) setArtifacts((current) => ({ ...current, [objective.id]: result.data! })); })}>Artefakty</button>
              {objective.status === 'APPROVED' && <button type="button" className="command-disruption-link" onClick={() => { const reason = window.prompt('Důvod obnovení'); if (reason?.trim()) void apiClient.restoreRecoveryObjective(eventId, objective.id, { expectedRevision: objective.revision, reason: reason.trim() }).then((result) => { if (result.ok && result.data) setObjectives((current) => current.map((item) => item.id === objective.id ? result.data! : item)); else setError(result.error || 'Cíl obnovy se nepodařilo obnovit'); }); }}>Obnovit</button>}
              {reports[objective.id]?.map((item) => <p key={item.id} className="command-disruption-report">{item.body}</p>)}
              {objective.status === 'DRAFT' && (
                <div className="command-disruption-artifact-form">
                  <input value={artifactTitle} onChange={(event) => setArtifactTitle(event.target.value)} placeholder="Název textového artefaktu" className="command-disruption-input" />
                  <textarea value={artifactBody} onChange={(event) => setArtifactBody(event.target.value)} placeholder="Synthetic log/config/instructions" className="command-disruption-input" />
                  <button type="button" disabled={!artifactTitle.trim() || !artifactBody.trim()} className="command-disruption-secondary" onClick={() => void apiClient.createRecoveryArtifact(eventId, objective.id, { title: artifactTitle.trim(), filename: `${objective.id}.txt`, body: artifactBody }).then((result) => { if (result.ok && result.data) { setArtifacts((current) => ({ ...current, [objective.id]: [...(current[objective.id] ?? []), result.data!] })); setArtifactTitle(''); setArtifactBody(''); } else setError(result.error || 'Artefakt se nepodařilo vytvořit'); })}>Přidat textový artefakt</button>
                </div>
              )}
              {artifacts[objective.id]?.map((artifact) => <div key={artifact.id} className="command-disruption-artifact">{artifact.title} · {artifact.status}{artifact.status === 'DRAFT' && objective.status === 'PUBLISHED' && <button type="button" className="command-disruption-link" onClick={() => void apiClient.publishRecoveryArtifact(eventId, objective.id, artifact.id, artifact.revision).then((result) => { if (result.ok && result.data) setArtifacts((current) => ({ ...current, [objective.id]: current[objective.id]!.map((item) => item.id === artifact.id ? result.data! : item) })); else setError(result.error || 'Artefakt se nepodařilo publikovat'); })}>Publikovat</button>}</div>)}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw, Shield } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import type { CommandDefconLevel, CommandDefconSnapshot } from '@cyris/contracts';
import { acceptDefconSnapshot } from './defcon-live';

const LEVELS: Array<{ value: CommandDefconLevel; label: string; color: string }> = [
  { value: 5, label: 'Klid/Mír', color: '#29c76f' },
  { value: 4, label: 'Zvýšená bdělost', color: '#3b82f6' },
  { value: 3, label: 'Pohotovost', color: '#f3c53b' },
  { value: 2, label: 'Krize', color: '#ff7a18' },
  { value: 1, label: 'Katastrofa', color: '#d62d2d' },
];

export function DefconPanel({ eventId }: { eventId: string }) {
  const { hasPermission } = useAuth();
  const canChange = hasPermission('command.defcon.change', eventId);
  const [snapshot, setSnapshot] = useState<CommandDefconSnapshot | null>(null);
  const [level, setLevel] = useState<CommandDefconLevel | null>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [lastConfirmedAt, setLastConfirmedAt] = useState<string | null>(null);
  const [, setDraftDirty] = useState(false);
  const draftDirtyRef = useRef(false);
  const requestId = useRef(0);

  const acceptSnapshot = useCallback((next: CommandDefconSnapshot, id: number) => {
    if (id !== requestId.current || next.eventId !== eventId) return false;
    setSnapshot((previous) => {
      const accepted = acceptDefconSnapshot(previous, next, eventId);
      if (!accepted) return previous;
      const supersededDraft = previous !== null && next.revision > previous.revision;
      if (next.level !== null && (!draftDirtyRef.current || supersededDraft)) setLevel(next.level);
      if (supersededDraft) {
        setReason('');
        setDraftDirty(false);
        draftDirtyRef.current = false;
      }
      setLastConfirmedAt(next.updatedAt ?? new Date().toISOString());
      return accepted;
    });
    setStale(false);
    return true;
  }, [eventId]);

  const load = useCallback(async (showError = true) => {
    const id = ++requestId.current;
    setLoading(true);
    if (showError) setError(null);
    try {
      const result = await apiClient.getDefcon(eventId);
      if (result.ok && result.data && acceptSnapshot(result.data, id)) {
        if (!result.data.initialized) setLevel(null);
      } else if (showError && id === requestId.current) {
        setError(result.error || 'DEFCON stav není dostupný');
        setStale(true);
      }
    } catch (cause) {
      if (id === requestId.current && showError) {
        setError(cause instanceof Error ? cause.message : 'DEFCON stav není dostupný');
        setStale(true);
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [acceptSnapshot, eventId]);

  useEffect(() => {
    requestId.current += 1;
    setSnapshot(null);
    setLevel(null);
    setDraftDirty(false);
    draftDirtyRef.current = false;
    setStale(false);
    void load();
    const interval = window.setInterval(() => void load(false), 10000);
    const onFocus = () => void load(false);
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      requestId.current += 1;
    };
  }, [eventId, load]);

  const submit = async () => {
    const initializing = snapshot && !snapshot.initialized;
    if (!canChange) {
      setError('Nemáte oprávnění měnit DEFCON v tomto cvičení.');
      return;
    }
    if (!snapshot || (!initializing && (snapshot.level === null || stale)) || level === null || reason.trim().length < 3 || saving) return;
    if (!window.confirm(`${initializing ? 'Inicializovat' : 'Potvrdit změnu'} na DEFCON ${level}?`)) return;
    setSaving(true);
    setError(null);
    try {
      const result = await apiClient.changeDefcon(eventId, {
        level,
        expectedRevision: snapshot.revision,
        reason: reason.trim(),
      });
      if (result.ok && result.data) {
        acceptSnapshot(result.data, requestId.current);
        setReason('');
        setDraftDirty(false);
        draftDirtyRef.current = false;
      } else {
        await load(false);
        setError(result.error || 'Změna DEFCON selhala; stav mohl být mezitím změněn.');
        setStale(true);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Změna DEFCON selhala');
      setStale(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="command-defcon-panel">
      <div className="command-defcon-header">
        <div className="command-defcon-title">
          <Shield size={17} className="command-defcon-icon" />
          <h3 className="command-defcon-heading">Exercise readiness / DEFCON</h3>
        </div>
        <button onClick={() => void load()} disabled={loading} className="command-defcon-refresh" aria-label="Obnovit DEFCON">
          <RefreshCw size={14} className={loading ? 'command-defcon-spin' : ''} />
        </button>
      </div>
      {error && <div className="command-defcon-error"><AlertTriangle size={14} />{error}</div>}
      {loading ? <p className="command-defcon-loading">Načítám autoritativní stav…</p> : snapshot ? (
        <div className="command-defcon-content">
          <div className="command-defcon-levels">
            {LEVELS.map((item) => (
              <button key={item.value} disabled={!canChange || saving || loading || stale} onClick={() => { setLevel(item.value); setDraftDirty(true); draftDirtyRef.current = true; }}
                className={`command-defcon-level ${level === item.value ? 'command-defcon-level-selected' : ''}`}
                style={{ color: item.color }}>
                {item.value} — {item.label}
              </button>
            ))}
          </div>
          <div className="command-defcon-meta">
            Aktuální: <strong>{snapshot.level ? `DEFCON ${snapshot.level}` : 'NEZNÁMÝ / NEINICIALIZOVANÝ'}</strong>
            <span>Revize {snapshot.revision}</span>
            {stale && <span className="command-defcon-stale">STALE — potvrďte obnovení</span>}
            {lastConfirmedAt && <span>Poslední potvrzení {new Date(lastConfirmedAt).toLocaleTimeString()}</span>}
          </div>
          {!snapshot.initialized && <p className="command-defcon-warning">Stav nebyl inicializován. Nejprve proveďte explicitní inicializaci.</p>}
          {canChange && ((snapshot.initialized && !stale) || !snapshot.initialized) && <div className="command-defcon-mutation">
            <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Důvod změny (povinný)"
              className="command-defcon-reason" />
            <button onClick={() => void submit()} disabled={saving || loading || stale || level === null || reason.trim().length < 3}
              className="command-defcon-submit">
              {saving ? 'Ukládám…' : snapshot.initialized ? 'Potvrdit' : 'Inicializovat'}
            </button>
          </div>}
          {snapshot.history.length > 0 && (
            <details className="command-defcon-history">
              <summary>
                Historie změn ({snapshot.history.length})
              </summary>
              <div className="command-defcon-history-list">
                {snapshot.history.map((entry) => (
                  <div key={entry.id} className="command-defcon-history-row">
                    <span className="command-defcon-history-level">DEFCON {entry.level}</span>
                    <span className="command-defcon-history-reason">{entry.reason}</span>
                    <time dateTime={entry.occurredAt}>
                      {new Date(entry.occurredAt).toLocaleString()}
                    </time>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      ) : null}
    </section>
  );
}

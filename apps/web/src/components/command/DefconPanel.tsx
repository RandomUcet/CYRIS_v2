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
  const { hasPermission, currentUser } = useAuth();
  const canChange = !currentUser?.viewAs && hasPermission('command.defcon.change', eventId);
  const [snapshot, setSnapshot] = useState<CommandDefconSnapshot | null>(null);
  const [level, setLevel] = useState<CommandDefconLevel | null>(null);
  const [message, setMessage] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [lastConfirmedAt, setLastConfirmedAt] = useState<string | null>(null);
  const [, setDraftDirty] = useState(false);
  const draftDirtyRef = useRef(false);
  const requestId = useRef(0);
  const snapshotRef = useRef<CommandDefconSnapshot | null>(null);
  const savingRef = useRef(false);

  const acceptSnapshot = useCallback((next: CommandDefconSnapshot, id: number) => {
    if (id !== requestId.current || next.eventId !== eventId) return false;
    const previous = snapshotRef.current;
    const accepted = acceptDefconSnapshot(previous, next, eventId);
    if (!accepted || accepted !== next) return false;
    const supersededDraft = previous !== null && next.revision > previous.revision;
    snapshotRef.current = accepted;
    setSnapshot(accepted);
    if (!draftDirtyRef.current || supersededDraft) {
      setLevel(next.level);
      setMessage(next.publicMessage ?? '');
    }
    if (supersededDraft) {
      setReason('');
      setDraftDirty(false);
      draftDirtyRef.current = false;
    }
    setLastConfirmedAt(new Date().toISOString());
    setStale(false);
    return true;
  }, [eventId]);

  const load = useCallback(async (showError = true) => {
    if (savingRef.current) return;
    const id = ++requestId.current;
    if (!snapshotRef.current) setLoading(true);
    if (showError) setError(null);
    try {
      const result = await apiClient.getDefcon(eventId);
      if (result.ok && result.data && acceptSnapshot(result.data, id)) {
        setError(null);
      } else if (id === requestId.current) {
        setError(result.error || 'DEFCON stav není dostupný');
        setStale(true);
      }
    } catch (cause) {
      if (id === requestId.current) {
        setError(cause instanceof Error ? cause.message : 'DEFCON stav není dostupný');
        setStale(true);
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [acceptSnapshot, eventId]);

  useEffect(() => {
    requestId.current += 1;
    snapshotRef.current = null;
    savingRef.current = false;
    setSnapshot(null);
    setLevel(null);
    setReason('');
    setSaving(false);
    setLastConfirmedAt(null);
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
    if (!snapshot || stale || (!initializing && snapshot.level === null) || level === null || reason.trim().length < 3 || saving) return;
    if (!window.confirm(`${initializing ? 'Inicializovat' : 'Potvrdit změnu'} na DEFCON ${level}?`)) return;
    savingRef.current = true;
    const id = ++requestId.current;
    setSaving(true);
    setError(null);
    try {
      const result = await apiClient.changeDefcon(eventId, {
        level,
        expectedRevision: snapshot.revision,
        publicMessage: message.trim(),
        reason: reason.trim(),
      });
      if (id !== requestId.current) return;
      if (result.ok && result.data) {
        acceptSnapshot(result.data, id);
        window.dispatchEvent(new Event('cyris:defcon-updated'));
        setReason('');
        setDraftDirty(false);
        draftDirtyRef.current = false;
      } else {
        setError(result.error || 'Změna DEFCON selhala; stav mohl být mezitím změněn.');
        setStale(true);
      }
    } catch (cause) {
      if (id !== requestId.current) return;
      setError(cause instanceof Error ? cause.message : 'Změna DEFCON selhala');
      setStale(true);
    } finally {
      if (id === requestId.current) {
        savingRef.current = false;
        setSaving(false);
      }
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
            <label>Pokyn pro všechny týmy
              <input className="command-defcon-reason" maxLength={400} value={message}
                onChange={e => { draftDirtyRef.current = true; setMessage(e.target.value); }} placeholder="Volitelné sdělení na týmové obrazovky" />
            </label>
            <input aria-label="Interní důvod změny" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Interní důvod změny (povinný)"
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

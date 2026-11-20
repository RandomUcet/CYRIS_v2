'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw, Shield } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import type { CommandDefconLevel, CommandDefconSnapshot } from '@cyris/contracts';
import { acceptDefconSnapshot } from './defcon-live';

import { usePreferences } from '@/contexts/PreferencesContext';
import { levels } from './team-displays';
import styles from './DefconPanel.module.css';

const descendingLevels = [5, 4, 3, 2, 1] as const;

export function DefconPanel({ eventId }: { eventId: string }) {
  const { locale, formatTime } = usePreferences();
  const cs = locale === 'cs';
  const tr = (czech: string, english: string) => cs ? czech : english;
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
    if (!window.confirm(tr(`Zveřejnit DEFCON ${level} pro všechny týmy?`, `Publish DEFCON ${level} for every team?`))) return;
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
        draftDirtyRef.current = false;
      } else {
        setError(result.error || tr('Změna se neuložila. Obnovte aktuální stav.', 'The change was not saved. Refresh the current level.'));
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
          <h3 className="command-defcon-heading">{tr('Připravenost cvičení', 'Exercise readiness')} / DEFCON</h3>
        </div>
        <button onClick={() => void load()} disabled={loading} className="command-defcon-refresh" aria-label={tr('Obnovit DEFCON','Refresh DEFCON')}>
          <RefreshCw size={14} className={loading ? 'command-defcon-spin' : ''} />
        </button>
      </div>
      {error && <div className="command-defcon-error"><AlertTriangle size={14} />{error}</div>}
      {loading ? <p className="command-defcon-loading">{tr('Načítám stupeň připravenosti…', 'Loading readiness…')}</p> : snapshot ? (
        <div className="command-defcon-content">
          <section className={styles.signal} aria-label={tr('Aktuální DEFCON', 'Current DEFCON')}>
            <div className={styles.liveNumber} style={{ color: snapshot.level ? levels[snapshot.level].color : undefined }}>{snapshot.level ?? '—'}</div>
            <div className={styles.signalText}>
              <span>Current DEFCON</span>
              <strong>{snapshot.level ? levels[snapshot.level][cs ? 'cs' : 'en'] : tr('Stupeň neurčen', 'Level not set')}</strong>
              {snapshot.publicMessage && <p>{snapshot.publicMessage}</p>}
            </div>
            <div className={styles.scale} aria-hidden>{descendingLevels.map(n => <i key={n} style={{ borderColor: levels[n].color }} data-active={snapshot.level === n}>{n}</i>)}</div>
          </section>
          <div className="command-defcon-meta">
            {stale && <span className="command-defcon-stale">{tr('Spojení přerušeno. Zobrazuji poslední potvrzený stav.', 'Disconnected. Showing the last confirmed state.')}</span>}
            {lastConfirmedAt && <span>{tr('Naposledy ověřeno', 'Last checked')} {formatTime(lastConfirmedAt)}</span>}
          </div>
          {canChange && <div role="group" aria-label={tr('Stupeň ke zveřejnění', 'Level to publish')} className={styles.picker}>
            {descendingLevels.map(n => <button type="button" key={n} disabled={saving || loading || stale}
              aria-pressed={level === n} onClick={() => { setLevel(n); draftDirtyRef.current = true; }}>
              <i style={{ background: levels[n].color }} aria-hidden/>{n} · {levels[n][cs ? 'cs' : 'en']}
            </button>)}
          </div>}
          {canChange && ((snapshot.initialized && !stale) || !snapshot.initialized) && <div className="command-defcon-mutation">
            <label>{tr('Pokyn pro všechny týmy','Message for every team')}
              <input className="command-defcon-reason" maxLength={400} value={message}
                onChange={e => { draftDirtyRef.current = true; setMessage(e.target.value); }} placeholder={tr('Volitelné sdělení na týmové obrazovky','Optional message for team displays')} />
            </label>
            <input aria-label={tr('Interní důvod změny','Internal reason for the change')} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={tr('Interní důvod změny (povinný)','Internal reason (required)')}
              className="command-defcon-reason" />
            <button onClick={() => void submit()} disabled={saving || loading || stale || level === null || reason.trim().length < 3}
              className="command-defcon-submit">
              {saving ? tr('Ukládám…','Saving…') : tr('Zveřejnit DEFCON','Publish DEFCON')}
            </button>
          </div>}
          {snapshot.history.length > 0 && (
            <details className="command-defcon-history">
              <summary>
                {tr('Historie změn','History')} ({snapshot.history.length})
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

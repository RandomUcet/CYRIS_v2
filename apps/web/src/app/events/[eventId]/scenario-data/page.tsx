'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ScenarioDataRequest, ScenarioDataPreview, ScenarioDataCounts, ScenarioDataBatchResponse } from '@cyris/contracts';
import { AppShell } from '@/components/layout/AppShell';
import { apiClient } from '@/lib/api-client';
import styles from './scenario-data.module.css';
import { ScenarioBatchMediaManager } from './ScenarioBatchMediaManager';

const presets = {
  SMALL: { persons: 40, organisations: 6, locations: 12, vehicles: 20, devices: 25, weapons: 5 },
  STANDARD: { persons: 250, organisations: 35, locations: 60, vehicles: 120, devices: 180, weapons: 40 },
  LARGE: { persons: 800, organisations: 100, locations: 150, vehicles: 350, devices: 500, weapons: 100 },
};
const keys = Object.keys(presets.SMALL) as (keyof ScenarioDataCounts)[];
const total = (counts: ScenarioDataCounts) => keys.reduce((n, k) => n + counts[k], 0);
const freshSeed = () => crypto.getRandomValues(new Int32Array(1))[0]!;
type Batch = ScenarioDataBatchResponse;

export default function ScenarioDataPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [mode, setMode] = useState<'LOCAL' | 'SPARK'>('LOCAL');
  const [brief, setBrief] = useState('');
  const [preset, setPreset] = useState<ScenarioDataRequest['preset']>('SMALL');
  const [counts, setCounts] = useState<ScenarioDataCounts>(presets.SMALL);
  const [seed, setSeed] = useState<number | null>(null);
  const [preview, setPreview] = useState<ScenarioDataPreview | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [draft, setDraft] = useState<Batch | null>(null);
  const [detail, setDetail] = useState<Batch | null>(null);
  const [mediaBatch, setMediaBatch] = useState<Batch | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const paused = useRef(false);
  const scope = useRef(eventId);
  const load = async () => {
    const r = await apiClient.getScenarioDataBatches(eventId);
    if (scope.current !== eventId) return;
    if (r.ok && r.data) setBatches(r.data); else setMessage(r.error ?? 'History unavailable');
  };
  useEffect(() => {
    scope.current = eventId;
    setSeed(freshSeed());
    setDetail(null);
    setMediaBatch(null);
    setDraft(null);
    setPreview(null);
    setBatches([]);
    setBusy(false);
    setMessage('');
    void load();
    return () => {
      paused.current = true;
      scope.current = '';
    };
  }, [eventId]);
  function configure() {
    setPreview(null);
    setDraft(null);
    setMessage('');
  }
  async function action(fn: () => Promise<void>) {
    setMessage('');
    setBusy(true);
    try { await fn(); } catch (e) { if (scope.current === eventId) setMessage(e instanceof Error ? e.message : 'Request failed'); }
    finally {
      if (scope.current === eventId) {
        setBusy(false);
        await load();
      }
    }
  }
  const payload: ScenarioDataRequest = { preset, seed: seed ?? 0, ...(preset === 'CUSTOM' && { counts }) };
  async function prepare(current: Batch) {
    paused.current = false;
    while (scope.current === eventId && !paused.current && current.status === 'DRAFT' && (current.prepared ?? 0) < total(current.configuration)) {
      setDraft(current);
      const r = await apiClient.advanceScenarioDraft(eventId, current.id, current.prepared ?? 0);
      if (!r.ok || !r.data) throw Error(r.error ?? 'Spark could not complete this page. Resume to retry.');
      current = r.data;
    }
    if (scope.current === eventId) setDraft(current);
  }
  async function runPreview() {
    if (mode === 'SPARK') {
      const r = await apiClient.startScenarioDraft(eventId, { ...payload, brief });
      if (!r.ok || !r.data) throw Error(r.error ?? 'Spark unavailable');
      await prepare(r.data);
    } else {
      const r = await apiClient.previewScenarioData(eventId, payload);
      if (!r.ok || !r.data) throw Error(r.error ?? 'Preview failed');
      if(scope.current===eventId) setPreview(r.data);
    }
  }
  async function publish() {
    if (!window.confirm('Add this dataset to the event registry?')) return;
    const r = draft ? await apiClient.publishScenarioDraft(eventId, draft.id) : await apiClient.generateScenarioData(eventId, { ...payload, previewToken: preview?.previewToken });
    if (!r.ok || !r.data) throw Error(r.error ?? 'Generation failed');
    if(scope.current!==eventId) return;
    setMessage(`${r.data.identifier} added to the registry. You can now assign images to individual records below.`);
    setMediaBatch(r.data);
    setPreview(null);
    setDraft(null);
    setSeed(freshSeed());
  }
  const view = draft ?? preview;
  const complete = draft?.status === 'DRAFT' && draft.prepared === total(draft.configuration);
  return <AppShell breadcrumbs={[{ label: 'Operations', href: `/events/${eventId}/overview` }, { label: 'Scenario data' }]}>
    <main className={styles.page}>
      <nav aria-label="Exercise tools" className={styles.navigation}>
        <Link href={`/events/${eventId}/scenario/control`}>Scenario control</Link>
        <Link href={`/events/${eventId}/registry`}>Open registry</Link>
      </nav>
      <h1>Scenario data generator</h1>
      <p>Prepare the people, places and assets for this exercise. Review the draft before adding it to the registry.</p>
      <div className={styles.columns}>
        <section><h2>Dataset</h2>
          <fieldset disabled={busy}>
            <label>Generator<select value={mode} onChange={e => {
              configure();
              setMode(e.target.value as typeof mode);
            }}>
              <option value="LOCAL">Local generator</option><option value="SPARK">Spark · scenario brief</option>
            </select></label>
            {mode === 'SPARK' && <label>Scenario brief<textarea value={brief} maxLength={1200} rows={4} placeholder="A rail depot in Pardubice during a shift change. Include contractors, dispatchers and their equipment." onChange={e => {
              configure();
              setBrief(e.target.value);
            }} /></label>}
            <label>Dataset size<select value={preset} onChange={e => {
              configure();
              const p = e.target.value as typeof preset;
              setPreset(p);
              if (p !== 'CUSTOM') setCounts(presets[p]);
            }}>
              <option value="SMALL">Small · 108 records</option><option value="STANDARD">Standard · 685 records</option><option value="LARGE">Large · 2,000 records</option><option value="CUSTOM">Custom counts</option>
            </select></label>
            {preset === 'CUSTOM' && <div className={styles.counts}>{keys.map(k => <label key={k}>{k}<input type="number" min={0} value={counts[k]} onChange={e => {
              configure();
              setCounts({ ...counts, [k]: Number(e.target.value) });
            }} /></label>)}</div>}
            <details><summary>Generation seed</summary><label>Seed<input type="number" value={seed ?? ''} onChange={e => {
              configure();
              setSeed(Number(e.target.value));
            }} /></label><button onClick={() => {
              configure();
              setSeed(freshSeed());
            }}>New seed</button></details>
            <button className={styles.primary} disabled={seed === null || total(counts) < 1 || (mode === 'SPARK' && !brief.trim())} onClick={() => void action(runPreview)}>{mode === 'LOCAL' ? 'Preview dataset' : 'Prepare with Spark'}</button>
          </fieldset>
        </section>
        <section aria-live="polite"><h2>Preview</h2>
          {draft && <><strong>{draft.identifier} · {draft.prepared ?? 0} / {total(draft.configuration)} records</strong><progress max={total(draft.configuration)} value={draft.prepared ?? 0} /></>}
          {!view && <p>Choose a dataset to see sample registry records here.</p>}
          {view?.personDetails?.map(p => <article key={p.name}><strong>{p.name}</strong><small>Born {p.dateOfBirth}</small><p>{p.description}</p></article>)}
          {view?.samples && keys.filter(k => k !== 'persons' && view.samples?.[k]?.length).map(k => <p key={k}><b>{k}</b> · {view.samples?.[k]?.join(' · ')}</p>)}
          {preview && !draft && <small>{total(preview.counts)} records · {preview.estimatedRelationships} relationships</small>}
          {busy && draft?.status === 'DRAFT' && !complete && <button onClick={() => {
            paused.current = true;
            setMessage('Pausing after this page.');
          }}>Pause after this page</button>}
          {!busy && draft?.status === 'DRAFT' && !complete && <button onClick={() => void action(() => prepare(draft))}>Resume draft</button>}
          {(complete || (preview && !draft)) && <button disabled={busy} className={styles.primary} onClick={() => void action(publish)}>Add to registry</button>}
        </section>
      </div>
      <p role="status">{message || (busy ? 'Working…' : '')}</p>
      <section><h2>Generation history</h2>
        {batches.length === 0 && <p>No datasets yet.</p>}
        {batches.map(b => <div className={styles.batch} key={b.id}>
          <span><button type="button" onClick={() => setDetail(detail?.id === b.id ? null : b)}>{b.identifier}</button> · {b.source === 'SPARK' ? 'Spark' : 'Local'} · {b.status.toLowerCase()}<small>{total(b.configuration)} records · seed {b.seed}{b.brief && ` · ${b.brief}`}</small></span>
          {b.status === 'COMPLETED' && <button type="button" disabled={busy} aria-expanded={mediaBatch?.id===b.id} onClick={() => {
            setMediaBatch(current=>current?.id===b.id?null:b);
          }}>{mediaBatch?.id === b.id ? 'Close image manager' : 'Manage record images'}</button>}
          {b.status === 'DRAFT' && <button disabled={busy} onClick={() => void action(async () => {
            const r = await apiClient.getScenarioDataBatch(eventId, b.id);
            if (!r.ok || !r.data) throw Error(r.error ?? 'Draft unavailable');
            setPreview(null);
            setMode('SPARK');
            setBrief(r.data.brief ?? '');
            setPreset(r.data.preset);
            setCounts(r.data.configuration);
            setSeed(r.data.seed);
            setDraft(r.data);
          })}>Open draft</button>}
          {['DRAFT', 'COMPLETED'].includes(b.status) && <button disabled={busy} onClick={() => void action(async () => {
            if (!confirm(`Remove ${b.identifier} from this event?`)) return;
            const r = await apiClient.cleanupScenarioData(eventId, b.id);
            if (!r.ok) throw Error(r.error ?? 'Removal failed');
            if (draft?.id === b.id) setDraft(null);
          })}>{b.status === 'DRAFT' ? 'Discard' : 'Clean up'}</button>}
        </div>)}
        {mediaBatch && mediaBatch.eventId===eventId && mediaBatch.status==='COMPLETED' && <ScenarioBatchMediaManager eventId={eventId} batch={mediaBatch} />}
        {detail && <aside><h3>{detail.identifier}</h3><p>{detail.preset} · generator v{detail.generatorVersion} · {detail.relationshipCount} relationships · {new Date(detail.createdAt).toLocaleString()}</p><p>{keys.map(k => `${detail.configuration[k]} ${k}`).join(' · ')}</p></aside>}
      </section>
    </main>
  </AppShell>;
}

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { apiClient } from '@/lib/api-client';

type Counts = { persons: number; organisations: number; locations: number; vehicles: number; devices: number; weapons: number };
const presets: Record<string, Counts> = {
  SMALL: { persons: 40, organisations: 6, locations: 12, vehicles: 20, devices: 25, weapons: 5 },
  STANDARD: { persons: 250, organisations: 35, locations: 60, vehicles: 120, devices: 180, weapons: 40 },
  LARGE: { persons: 800, organisations: 100, locations: 150, vehicles: 350, devices: 500, weapons: 100 },
};

export default function ScenarioDataPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [preset, setPreset] = useState('SMALL');
  const [seed, setSeed] = useState(2027);
  const [counts, setCounts] = useState<Counts>(presets.SMALL);
  const [preview, setPreview] = useState<any>(null);
  const [batches, setBatches] = useState<any[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = async () => {
    const result = await apiClient.getScenarioDataBatches(eventId);
    if (result.ok && result.data) setBatches(result.data);
    else setMessage(result.error ?? 'Unable to load generation history');
  };
  useEffect(() => { if (eventId) void load(); }, [eventId]);

  const payload = { preset, seed, counts: preset === 'CUSTOM' ? counts : undefined } as any;
  const runPreview = async () => {
    setBusy(true); setMessage('');
    const result = await apiClient.previewScenarioData(eventId, payload);
    setBusy(false);
    if (result.ok) setPreview(result.data); else setMessage(result.error ?? 'Preview failed');
  };
  const generate = async () => {
    if (!window.confirm('Generate this synthetic Registry dataset?')) return;
    setBusy(true); setMessage('');
    const result = await apiClient.generateScenarioData(eventId, payload);
    setBusy(false);
    if (result.ok) { setMessage('Synthetic dataset generated.'); setPreview(null); await load(); }
    else setMessage(result.error ?? 'Generation failed');
  };
  const cleanup = async (id: string) => {
    if (!window.confirm('Clean up this exact synthetic batch?')) return;
    setBusy(true);
    const result = await apiClient.cleanupScenarioData(eventId, id);
    setBusy(false);
    if (result.ok) { setMessage('Synthetic dataset cleaned.'); await load(); }
    else setMessage(result.error ?? 'Cleanup failed');
  };
  const showBatchDetail = async (id: string) => {
    const result = await apiClient.getScenarioDataBatch(eventId, id);
    if (result.ok) setSelectedBatch(result.data);
    else setMessage(result.error ?? 'Unable to load batch detail');
  };
  const setCount = (key: keyof Counts, value: string) => setCounts((current) => ({ ...current, [key]: Math.max(0, Number(value) || 0) }));

  return (
    <AppShell breadcrumbs={[{ label: 'Operations', href: `/events/${eventId}/overview` }, { label: 'Scenario Data' }]}>
      <main style={{ maxWidth: 1120, margin: '0 auto', padding: '32px' }}>
        <header style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 18, marginBottom: 28 }}>
          <nav aria-label="Scenario navigation" style={{ display: 'flex', gap: 12, marginBottom: 14, fontSize: 11 }}>
            <Link href={`/events/${eventId}/overview`} style={{ color: 'var(--accent-active)' }}>Event Overview</Link>
            <Link href={`/events/${eventId}/scenario/control`} style={{ color: 'var(--accent-active)' }}>Scenario Control</Link>
            <Link href={`/events/${eventId}/registry`} style={{ color: 'var(--accent-active)' }}>Registry</Link>
          </nav>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: 0 }}>SCENARIO ADMINISTRATION</p>
          <h1 style={{ margin: '8px 0 4px', fontSize: 28 }}>Scenario Data</h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Generate a deterministic synthetic Registry world without creating operational records.</p>
        </header>
        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 28 }}>
          <div>
            <h2 style={{ fontSize: 17, margin: '0 0 16px' }}>Generation configuration</h2>
            <label style={{ display: 'block', marginBottom: 14 }}>Preset
              <select value={preset} onChange={(e) => { setPreset(e.target.value); if (e.target.value !== 'CUSTOM') setCounts(presets[e.target.value]!); }} style={{ display: 'block', width: '100%', marginTop: 6, padding: 9 }}>
                <option value="SMALL">Small</option><option value="STANDARD">Standard Cybertron</option><option value="LARGE">Large</option><option value="CUSTOM">Custom</option>
              </select>
            </label>
            <label style={{ display: 'block', marginBottom: 18 }}>Seed
              <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} style={{ display: 'block', width: '100%', marginTop: 6, padding: 9 }} />
            </label>
            {preset === 'CUSTOM' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {(Object.keys(counts) as (keyof Counts)[]).map((key) => <label key={key} style={{ fontSize: 13 }}>{key}
                <input type="number" min="0" value={counts[key]} onChange={(e) => setCount(key, e.target.value)} style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }} />
              </label>)}
            </div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
              <button type="button" onClick={() => void runPreview()} disabled={busy}>Preview</button>
              <button type="button" onClick={() => void generate()} disabled={busy}>Generate dataset</button>
            </div>
            {message && <p style={{ color: 'var(--text-secondary)', marginTop: 16 }}>{message}</p>}
          </div>
          <div>
            <h2 style={{ fontSize: 17, margin: '0 0 16px' }}>Preview</h2>
            {preview ? <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <p>{Object.entries(preview.counts).map(([key, value]) => `${key}: ${value}`).join(' · ')}</p>
              <p style={{ color: 'var(--text-secondary)' }}>Estimated relationships: {preview.estimatedRelationships}</p>
              {Object.entries(preview.samples).map(([key, values]) => <div key={key} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}><strong>{key}</strong>: {(values as string[]).join(', ')}</div>)}
            </div> : <p style={{ color: 'var(--text-muted)' }}>Preview uses the same deterministic configuration and does not write data.</p>}
          </div>
        </section>
        <section style={{ marginTop: 44 }}>
          <h2 style={{ fontSize: 17, margin: '0 0 12px' }}>Generation history</h2>
          {batches.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No generation batches yet.</p> : <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
            {batches.map((batch) => <div key={batch.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '14px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <div><button type="button" onClick={() => void showBatchDetail(batch.id)} style={{ padding: 0, border: 0, background: 'none', color: 'var(--text-primary)', fontWeight: 700, cursor: 'pointer' }}>{batch.identifier}</button><span style={{ marginLeft: 14, color: 'var(--text-secondary)' }}>{batch.preset} · seed {batch.seed} · {batch.status}</span><div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>{batch.relationshipCount} relationships · {Object.values(batch.counts ?? {}).reduce((sum: number, value) => sum + Number(value), 0)} records</div></div>
              {batch.status === 'COMPLETED' && <button type="button" onClick={() => void cleanup(batch.id)} disabled={busy}>Clean up</button>}
            </div>)}
          </div>}
          {selectedBatch && <aside style={{ marginTop: 20, borderTop: '2px solid var(--border-subtle)', paddingTop: 16 }}>
            <h3 style={{ margin: '0 0 10px' }}>Batch detail: {selectedBatch.identifier}</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Status {selectedBatch.status} · preset {selectedBatch.preset} · seed {selectedBatch.seed} · generator v{selectedBatch.generatorVersion}</p>
            <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)' }}>Created {new Date(selectedBatch.createdAt).toLocaleString()} · relationships {selectedBatch.relationshipCount}</p>
            <p style={{ margin: '6px 0 0' }}>{Object.entries(selectedBatch.counts ?? {}).map(([key, value]) => `${key}: ${value}`).join(' · ')}</p>
          </aside>}
        </section>
      </main>
    </AppShell>
  );
}

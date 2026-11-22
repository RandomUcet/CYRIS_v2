'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ScenarioDataRequest, ScenarioDataPreview, ScenarioDataCounts, ScenarioDataBatchResponse } from '@cyris/contracts';
import { AppShell } from '@/components/layout/AppShell';
import { apiClient } from '@/lib/api-client';
import { usePreferences } from '@/contexts/PreferencesContext';
import styles from './scenario-data.module.css';
import { ScenarioBatchMediaManager } from './ScenarioBatchMediaManager';

const limitByKind:Record<keyof ScenarioDataCounts,number>={persons:5000,organisations:500,locations:1000,vehicles:2500,devices:5000,weapons:1000};
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
  const {locale}=usePreferences();
  const cs=locale==='cs';
  const tr=(cz:string,en:string)=>cs?cz:en;
  const kindName=(kind:keyof ScenarioDataCounts)=>({
    persons:tr('Osoby','Persons'),organisations:tr('Organizace','Organisations'),
    locations:tr('Místa','Locations'),vehicles:tr('Vozidla','Vehicles'),
    devices:tr('Zařízení','Devices'),weapons:tr('Rekvizity','Props'),
  })[kind];
  const statusName=(status:string)=>({
    DRAFT:tr('Koncept','Draft'),GENERATING:tr('Generování','Generating'),
    COMPLETED:tr('Publikováno','Published'),FAILED:tr('Chyba','Failed'),
    CLEANED:tr('Vyčištěno','Removed'),
  } as Record<string,string>)[status]??status;

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
    if (r.ok && r.data) setBatches(r.data); else setMessage(r.error ?? tr('Historie není dostupná','History unavailable'));
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
    try { await fn(); } catch (e) { if (scope.current === eventId) setMessage(e instanceof Error ? e.message : tr('Operace selhala','Request failed')); }
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
      if (!r.ok || !r.data) throw Error(r.error ?? tr('Spark nedokončil tuto část. Pokračujte v konceptu pro další pokus.','Spark could not complete this page. Resume to retry.'));
      current = r.data;
    }
    if (scope.current === eventId) setDraft(current);
  }
  async function runPreview() {
    if (mode === 'SPARK') {
      const r = await apiClient.startScenarioDraft(eventId, { ...payload, brief });
      if (!r.ok || !r.data) throw Error(r.error ?? tr('Spark není dostupný','Spark unavailable'));
      await prepare(r.data);
    } else {
      const r = await apiClient.previewScenarioData(eventId, payload);
      if (!r.ok || !r.data) throw Error(r.error ?? tr('Náhled se nepodařilo vytvořit','Preview failed'));
      if(scope.current===eventId) setPreview(r.data);
    }
  }
  async function publish() {
    if (!window.confirm(tr('Opravdu zveřejnit tuto sadu v registru cvičení?','Add this dataset to the event registry?'))) return;
    const r = draft ? await apiClient.publishScenarioDraft(eventId, draft.id) : await apiClient.generateScenarioData(eventId, { ...payload, previewToken: preview?.previewToken });
    if (!r.ok || !r.data) throw Error(r.error ?? tr('Vytvoření záznamů selhalo','Generation failed'));
    if(scope.current!==eventId) return;
    setMessage(tr(`${r.data.identifier} bylo přidáno do registru. Nyní lze jednotlivým záznamům přiřazovat obrázky níže.`,`${r.data.identifier} added to the registry. You can now assign images to individual records below.`));
    setMediaBatch(r.data);
    setPreview(null);
    setDraft(null);
    setSeed(freshSeed());
  }
  const view = draft ?? preview;
  const complete = draft?.status === 'DRAFT' && draft.prepared === total(draft.configuration);
  const countsValid=keys.every(k=>Number.isInteger(counts[k])&&counts[k]>=0&&counts[k]<=limitByKind[k])&&total(counts)<=12000&&total(counts)>0;
  const seedValid=seed!==null&&Number.isInteger(seed)&&seed>=-2147483648&&seed<=2147483647;
  return <AppShell breadcrumbs={[{ label: 'Operations', href: `/events/${eventId}/overview` }, { label: tr('Data scénáře','Scenario data') }]}>
    <main className={styles.page}>
      <nav aria-label="Exercise tools" className={styles.navigation}>
        <Link href={`/events/${eventId}/scenario/control`}>{tr('Řízení scénáře','Scenario control')}</Link>
        <Link href={`/events/${eventId}/registry`}>{tr('Otevřít registr','Open registry')}</Link>
      </nav>
      <h1>{tr('Generátor scénářových dat','Scenario data generator')}</h1>
      <p>{tr('Připravte fiktivní osoby, místa a techniku pro cvičení. Před zveřejněním vždy zkontrolujte náhled nebo koncept.','Prepare the people, places and assets for this exercise. Review the draft before adding it to the registry.')}</p>
      <div className={styles.columns}>
        <section><h2>{tr('Datová sada','Dataset')}</h2>
          <fieldset disabled={busy}>
            <div className={styles.generatorModes} role="group" aria-label={tr('Způsob generování dat','Dataset generation mode')}>
              <button type="button" aria-pressed={mode==='LOCAL'} className={mode==='LOCAL'?styles.selectedMode:styles.generatorMode} onClick={()=>{configure();setMode('LOCAL')}}>
                <strong>{tr('Lokální generátor','Local generator')}</strong>
                <small>{tr('Deterministická sada, bez AI a bez externí služby','Deterministic dataset without external AI service')}</small>
              </button>
              <button type="button" aria-pressed={mode==='SPARK'} className={mode==='SPARK'?styles.selectedMode:styles.generatorMode} onClick={()=>{configure();setMode('SPARK')}}>
                <strong>DGX Spark · AI</strong>
                <small>{tr('Generujte data podle popisu cvičení s kontrolou konceptu','Generate scenario-aware data from your briefing and review the draft')}</small>
              </button>
            </div>
            {mode==='SPARK' && <p className={styles.sparkHint} role="status">{tr('Spark připravuje záznamy po částech. Koncept nejprve zkontrolujete, pak jej zveřejníte. Obrázky lze nyní přiřadit po zveřejnění; nahrávání přímo do konceptu se ještě vyvíjí.','Spark prepares draft records in batches for review before publishing. Images can currently be assigned after publishing; draft image attachments are still in development.')}</p>}
            {mode === 'SPARK' && <label>{tr('Scénářové zadání','Scenario brief')}<textarea value={brief} maxLength={1200} rows={4} placeholder={tr('Železniční depo v Pardubicích během střídání směn. Zahrňte zaměstnance, dodavatele a jejich techniku.','A rail depot in Pardubice during a shift change. Include contractors, dispatchers and their equipment.')} onChange={e => {
              configure();
              setBrief(e.target.value);
            }} /></label>}
            <label>{tr('Velikost sady','Dataset size')}<select value={preset} onChange={e => {
              configure();
              const p = e.target.value as typeof preset;
              setPreset(p);
              if (p !== 'CUSTOM') setCounts(presets[p]);
            }}>
              <option value="SMALL">{tr('Malá · 108 záznamů','Small · 108 records')}</option><option value="STANDARD">{tr('Standardní · 685 záznamů','Standard · 685 records')}</option><option value="LARGE">{tr('Velká · 2 000 záznamů','Large · 2,000 records')}</option><option value="CUSTOM">{tr('Vlastní počty','Custom counts')}</option>
            </select></label>
            {preset === 'CUSTOM' && <div className={styles.counts}>{keys.map(k => <label key={k}>{kindName(k)}<input type="number" min={0} max={limitByKind[k]} value={counts[k]} onChange={e => {
              configure();
              setCounts({ ...counts, [k]: Number(e.target.value) });
            }} /></label>)}</div>}
            <details><summary>{tr('Generační seed (pokročilé)','Generation seed (advanced)')}</summary><label>Seed<input type="number" value={seed ?? ''} onChange={e => {
              configure();
              setSeed(Number(e.target.value));
            }} /></label><button onClick={() => {
              configure();
              setSeed(freshSeed());
            }}>{tr('Nový seed','New seed')}</button></details>
            {preset==='CUSTOM'&&!countsValid&&<p role="alert">{tr('Zkontrolujte počty záznamů (maximum 12 000 celkem).','Check record counts (maximum 12,000 total).')}</p>}
            {!seedValid&&<p role="alert">{tr('Seed musí být celé 32bitové číslo.','Seed must be a 32-bit integer.')}</p>}
            <button className={styles.primary} disabled={!seedValid || (preset === 'CUSTOM' && !countsValid) || (mode === 'SPARK' && !brief.trim())} onClick={() => void action(runPreview)}>{mode === 'LOCAL' ? tr('Zobrazit náhled','Preview dataset') : tr('Připravit se Sparkem','Prepare with Spark')}</button>
          </fieldset>
        </section>
        <section aria-live="polite"><h2>{tr('Náhled','Preview')}</h2>
          {draft && <><strong>{draft.identifier} · {draft.prepared ?? 0} / {total(draft.configuration)} {tr('záznamů','records')}</strong><progress max={total(draft.configuration)} value={draft.prepared ?? 0} /></>}
          {!view && <p>{tr('Vyberte datovou sadu a zde se zobrazí ukázkové záznamy.','Choose a dataset to see sample registry records here.')}</p>}
          {view?.personDetails?.map(p => <article key={p.name}><strong>{p.name}</strong><small>{tr('Narození','Born')} {p.dateOfBirth}</small><p>{p.description}</p></article>)}
          {view?.samples && keys.filter(k => k !== 'persons' && view.samples?.[k]?.length).map(k => <p key={k}><b>{kindName(k)}</b> · {view.samples?.[k]?.join(' · ')}</p>)}
          {preview && !draft && <small>{total(preview.counts)} {tr('záznamů','records')} · {preview.estimatedRelationships} {tr('vazeb','relationships')}</small>}
          {busy && draft?.status === 'DRAFT' && !complete && <button onClick={() => {
            paused.current = true;
            setMessage(tr('Pozastavení po dokončení aktuální části.','Pausing after this page.'));
          }}>{tr('Pozastavit po této části','Pause after this page')}</button>}
          {!busy && draft?.status === 'DRAFT' && !complete && <button onClick={() => void action(() => prepare(draft))}>{tr('Pokračovat v konceptu','Resume draft')}</button>}
          {(complete || (preview && !draft)) && <button disabled={busy} className={styles.primary} onClick={() => void action(publish)}>{tr('Zveřejnit v registru','Add to registry')}</button>}
        </section>
      </div>
      <p role="status">{message || (busy ? tr('Pracuji…','Working…') : '')}</p>
      <section><h2>{tr('Historie generování','Generation history')}</h2>
        {batches.length === 0 && <p>{tr('Zatím nebyla vytvořena žádná sada.','No datasets yet.')}</p>}
        {batches.map(b => <div className={styles.batch} key={b.id}>
          <span><button type="button" onClick={() => setDetail(detail?.id === b.id ? null : b)}>{b.identifier}</button> · {b.source === 'SPARK' ? 'Spark' : 'Local'} · {statusName(b.status)}<small>{total(b.configuration)} {tr('záznamů','records')} · seed {b.seed}{b.brief && ` · ${b.brief}`}</small></span>
          {b.status === 'COMPLETED' && <button type="button" disabled={busy} aria-expanded={mediaBatch?.id===b.id} onClick={() => {
            setMediaBatch(current=>current?.id===b.id?null:b);
          }}>{mediaBatch?.id === b.id ? tr('Zavřít obrázky','Close image manager') : tr('Spravovat obrázky','Manage record images')}</button>}
          {b.status === 'DRAFT' && <button disabled={busy} onClick={() => void action(async () => {
            const r = await apiClient.getScenarioDataBatch(eventId, b.id);
            if (!r.ok || !r.data) throw Error(r.error ?? tr('Koncept není dostupný','Draft unavailable'));
            setPreview(null);
            setMode('SPARK');
            setBrief(r.data.brief ?? '');
            setPreset(r.data.preset);
            setCounts(r.data.configuration);
            setSeed(r.data.seed);
            setDraft(r.data);
          })}>{tr('Otevřít koncept','Open draft')}</button>}
          {['DRAFT', 'COMPLETED'].includes(b.status) && <button disabled={busy} onClick={() => void action(async () => {
            if (!confirm(tr(`Opravdu odstranit ${b.identifier} z tohoto cvičení?`,`Remove ${b.identifier} from this event?`))) return;
            const r = await apiClient.cleanupScenarioData(eventId, b.id);
            if (!r.ok) throw Error(r.error ?? tr('Odstranění selhalo','Removal failed'));
            if (draft?.id === b.id) setDraft(null);
          })}>{b.status === 'DRAFT' ? tr('Zahodit koncept','Discard') : tr('Odstranit sadu','Clean up')}</button>}
        </div>)}
        {mediaBatch && mediaBatch.eventId===eventId && mediaBatch.status==='COMPLETED' && <ScenarioBatchMediaManager eventId={eventId} batch={mediaBatch} />}
        {detail && <aside><h3>{detail.identifier}</h3><p>{detail.preset} · {tr('generátor','generator')} v{detail.generatorVersion} · {detail.relationshipCount} {tr('vazeb','relationships')} · {new Date(detail.createdAt).toLocaleString()}</p><p>{keys.map(k => `${detail.configuration[k]} ${kindName(k)}`).join(' · ')}</p></aside>}
      </section>
    </main>
  </AppShell>;
}

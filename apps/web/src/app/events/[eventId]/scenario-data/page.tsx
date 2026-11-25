'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ScenarioDataRequest, ScenarioDataPreview, ScenarioDataCounts, ScenarioDataBatchResponse, ScenarioQualityReport } from '@cyris/contracts';
import { AppShell } from '@/components/layout/AppShell';
import { apiClient } from '@/lib/api-client';
import { draftProgress, formatElapsed, plannedInferenceCalls } from '@/lib/scenario-draft-progress';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import styles from './scenario-data.module.css';
import { ScenarioBatchMediaManager } from './ScenarioBatchMediaManager';
import { ScenarioDraftMediaManager } from './ScenarioDraftMediaManager';

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
  const {currentUser,viewAs,loading,hasPermission}=useAuth();
  if(loading)return <AppShell><p role="status">…</p></AppShell>;
  if(viewAs||!hasPermission('scenario.manage',eventId))return <AppShell><p role="alert">Scenario management required / Pouze organizátoři</p></AppShell>;
  return <ScenarioDataWorkspace key={eventId+':'+currentUser?.user.id} eventId={eventId} />;
}

function ScenarioDataWorkspace({ eventId }: { eventId: string }) {
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
  const [sparkStrategy, setSparkStrategy] = useState<'FAST' | 'DETAILED'>('FAST');
  const [brief, setBrief] = useState('');
  const [blueprintLoading,setBlueprintLoading]=useState(false);
  const [blueprintRevision,setBlueprintRevision]=useState<number|null>(null);
  const [preset, setPreset] = useState<ScenarioDataRequest['preset']>('SMALL');
  const [counts, setCounts] = useState<ScenarioDataCounts>(presets.SMALL);
  const [seed, setSeed] = useState<number | null>(null);
  const [preview, setPreview] = useState<ScenarioDataPreview | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [draft, setDraft] = useState<Batch | null>(null);
  const [detail, setDetail] = useState<Batch | null>(null);
  const [mediaBatch, setMediaBatch] = useState<Batch | null>(null);
  const [quality, setQuality] = useState<ScenarioQualityReport | null>(null);
  const [qualityBusy, setQualityBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyFilter, setHistoryFilter] = useState('ALL');
  const [historyQuery, setHistoryQuery] = useState('');
  const [generating, setGenerating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const operation = useRef(false);
  const historyRequest = useRef(0);
  const pendingSubmission=useRef<{key:string;id:string}|null>(null);
  const historyFlight=useRef(false);
  const startedAt = useRef(0);
  const alive = useRef(true);
  const scope = useRef(eventId);
  const load = async (silent=false) => {
    if(silent&&historyFlight.current)return;
    historyFlight.current=true;
    const request = ++historyRequest.current;
    if(!silent)setHistoryLoading(true);
    try {
      const r = await apiClient.getScenarioDataBatches(eventId);
      if (!alive.current || request !== historyRequest.current) return;
      if (!r.ok || !r.data) throw Error(r.error ?? tr('Historie není dostupná','History unavailable'));
      setBatches(r.data.filter(batch => batch.eventId === eventId));
      setHistoryError('');
    } catch (error) {
      if (alive.current && request === historyRequest.current) setHistoryError(error instanceof Error ? error.message : tr('Historie není dostupná','History unavailable'));
    } finally {
      if (alive.current && request === historyRequest.current){setHistoryLoading(false);historyFlight.current=false;}
    }
  };
  useEffect(() => {
    alive.current = true;
    scope.current = eventId;
    setSeed(freshSeed());
    setDetail(null);
    setMediaBatch(null);
    setQuality(null);
    setDraft(null);
    setPreview(null);
    setBatches([]);
    setBusy(false);
    setMessage('');setBlueprintRevision(null);setBlueprintLoading(false);
    void load();
    return () => {
      alive.current = false;
      historyRequest.current++;
      scope.current = '';
    };
  }, [eventId]);
  useEffect(()=>{const timer=window.setInterval(()=>{if(!document.hidden)void load(true);},8000);return()=>window.clearInterval(timer);},[eventId]);
  useEffect(() => {
    if (!generating) return;
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [generating]);
  function configure() {
    setQuality(null);
    setPreview(null);
    setDraft(null);
    pendingSubmission.current=null;
    setMessage('');
  }
  async function importBlueprint(){
    if(blueprintLoading||operation.current)return;
    setBlueprintLoading(true);setMessage('');
    try{
      const result=await apiClient.getExerciseBlueprint(eventId);
      if(!alive.current||scope.current!==eventId)return;
      const blueprint=result.data?.current;
      if(!result.ok||!blueprint||blueprint.eventId!==eventId)throw Error(result.error||tr('Nejprve uložte zadání v EXCON Architect.','Save an exercise blueprint in EXCON Architect first.'));
      if(brief.trim()&&!window.confirm(tr('Nahradit současné zadání textem z blueprintu?','Replace the current brief with the blueprint?')))return;
      configure();
      // Reserve space for the primary brief; the copied text is editable and
      // explicitly bounded by the scenario data request contract.
      const title=blueprint.title.slice(0,160);
      const objective=blueprint.objectives.trim().slice(0,300);
      const body=blueprint.brief.trim().slice(0,1200-title.length-objective.length-20);
      setBrief([title,body,objective].filter(Boolean).join('\n\n').slice(0,1200));
      setBlueprintRevision(blueprint.revision);
    }catch(err){if(alive.current&&scope.current===eventId)setMessage(err instanceof Error?err.message:tr('Blueprint není dostupný.','Blueprint unavailable.'));}
    finally{if(alive.current&&scope.current===eventId)setBlueprintLoading(false);}
  }
  async function action(fn: () => Promise<void>) {
    if (operation.current || !alive.current) return;
    operation.current = true;
    setMessage('');
    setBusy(true);
    try { await fn(); } catch (e) { if (scope.current === eventId) setMessage(e instanceof Error ? e.message : tr('Operace selhala','Request failed')); }
    finally {
      operation.current = false;
      if (alive.current && scope.current === eventId) {
        setBusy(false);
        void load();
      }
    }
  }
  const payload: ScenarioDataRequest = { preset, seed: seed ?? 0, ...(preset === 'CUSTOM' && { counts }) };
  async function generateDraft(existing?: Batch) {
    setQuality(null);
    startedAt.current = Date.now();
    setElapsed(0);
    setGenerating(true);
    try {
      let current = existing;
      if (!current) {
        setDraft(null); setPreview(null);
        const input={...payload,brief,strategy: sparkStrategy};
        const key=JSON.stringify(input);
        if(pendingSubmission.current?.key!==key)pendingSubmission.current={key,id:crypto.randomUUID()};
        const r = await apiClient.startScenarioDraft(eventId, {...input,requestId:pendingSubmission.current.id});
        if (!alive.current || scope.current !== eventId) return;
        if (!r.ok || !r.data) throw Error(r.error ?? tr('Spark není dostupný','Spark unavailable'));
        current = r.data;
        if (current.eventId !== eventId || current.status !== 'DRAFT') throw Error(tr('Koncept není dostupný','Draft unavailable'));
        setDraft(current);pendingSubmission.current=null;
        setMessage(tr('Úloha je uložená na serveru. Stránku můžete zavřít.','Job saved on server. You may close this page.'));
        return;
      }
      const queued=await apiClient.queueScenarioDraft(eventId,current.id);
      if(!alive.current||scope.current!==eventId)return;
      if(!queued.ok||!queued.data)throw Error(queued.error||tr('Úlohu se nepodařilo zařadit.','Unable to queue job.'));
      setDraft(queued.data);
      setMessage(tr('Úloha je uložená na serveru. Stránku můžete zavřít.','Job saved on server. You may close this page.'));
    } finally {
      if (alive.current) {
        setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
        setGenerating(false);
      }
    }
  }
  async function runPreview() {
    if (mode === 'SPARK') await generateDraft();
    else {
      const r = await apiClient.previewScenarioData(eventId, payload);
      if (!r.ok || !r.data) throw Error(r.error ?? tr('Náhled se nepodařilo vytvořit','Preview failed'));
      if(alive.current && scope.current===eventId) setPreview(r.data);
    }
  }
  async function inspectQuality() {
    if (!draft || operation.current || qualityBusy) return;
    setQualityBusy(true); setQuality(null);
    try {
      const result = await apiClient.getScenarioDraftQuality(eventId, draft.id);
      if (!result.ok || !result.data) throw new Error(result.error || 'Quality check failed');
      if (scope.current === eventId) setQuality(result.data);
    } catch (error) {
      if (scope.current === eventId) setMessage(error instanceof Error ? error.message : 'Quality check unavailable');
    } finally { if (scope.current === eventId) setQualityBusy(false); }
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
  const progress = draft ? draftProgress(draft.prepared ?? 0, total(draft.configuration)) : null;
  const history = batches.filter(batch => (historyFilter === 'ALL' || batch.status === historyFilter) &&
    [batch.identifier, batch.brief, batch.source, batch.seed].join(' ').toLowerCase().includes(historyQuery.trim().toLowerCase()));
  const activeJob=draft?.generation?.state==='QUEUED'||draft?.generation?.state==='RUNNING';
  const activeBatches=batches.filter(b=>b.generation?.state==='QUEUED'||b.generation?.state==='RUNNING');
  const generationErrors:Record<string,string>={CAPACITY:tr('Spark je vytížený','Spark is busy'),TIMEOUT:tr('Časový limit inference','Inference timeout'),TRUNCATED:tr('Překročen limit tokenů','Token limit exceeded'),EMPTY_OUTPUT:tr('Prázdná odpověď','Empty output'),INVALID_OUTPUT:tr('Neplatný formát výstupu','Invalid output'),UNREACHABLE:tr('Spark nedostupný','Spark unreachable'),AUTH_FAILED:tr('Chyba autentizace','Authentication failed'),SPARK_UNAVAILABLE:tr('Spark nedostupný','Spark unavailable'),LEASE_EXPIRED:tr('Zpracování přerušeno','Processing interrupted'),ACCESS_REVOKED:tr('Oprávnění odebráno','Access revoked'),CONTEXT_CHANGED:tr('Kontext se změnil','Context changed'),NO_PROGRESS:tr('Dávka nepostoupila','No progress'),PROVIDER_ERROR:tr('Chyba poskytovatele','Provider error'),GENERATION_FAILED:tr('Generování selhalo','Generation failed')};
  const complete = draft?.status === 'DRAFT' && draft.prepared === total(draft.configuration)&&!activeJob;
  useEffect(()=>{
    if(!draft||!activeJob)return;
    const id=draft.id;let cancelled=false,flight=false;
    const poll=async()=>{if(cancelled||flight)return;flight=true;try{const r=await apiClient.getScenarioDataBatch(eventId,id);if(!cancelled&&r.ok&&r.data?.eventId===eventId){const next=r.data;setDraft(old=>old?.id===id?next:old);if(!['QUEUED','RUNNING'].includes(next.generation?.state??''))void load();}}catch{/* persisted job is not affected by polling failure */}finally{flight=false;}};
    void poll();const timer=window.setInterval(()=>void poll(),4000);return()=>{cancelled=true;window.clearInterval(timer);};
  },[eventId,draft?.id,activeJob]);
  const planCounts = preset === 'CUSTOM' ? counts : presets[preset as keyof typeof presets];
  const inferenceCalls = plannedInferenceCalls(Object.values(planCounts), sparkStrategy);
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
      {activeBatches.length>0&&<section aria-label={tr('Aktivní úlohy','Active jobs')}><h2>{tr('Generování na serveru','Server generation')} · {activeBatches.length}</h2><p>{tr('Úlohy běží nezávisle na této stránce. Otevřete koncept v historii pro náhled nebo pozastavení.','Jobs run independently of this page. Open a draft in history to inspect or pause it.')}</p>{activeBatches.map(b=><p key={b.id}><strong>{b.identifier}</strong> · {b.generation?.state==='QUEUED'?tr('Ve frontě','Queued'):tr('Zpracovává se','Running')} · {b.prepared??0}/{total(b.configuration)}</p>)}</section>}
      <div className={styles.columns}>
        <section><h2>{tr('Datová sada','Dataset')}</h2>
          <fieldset disabled={busy || qualityBusy}>
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
            {mode==='SPARK' && <label>{tr('Režim Sparku','Spark generation mode')}<select value={sparkStrategy} onChange={e => { configure(); setSparkStrategy(e.target.value as 'FAST' | 'DETAILED'); }}><option value="FAST">{tr('Rychlý – 1 AI návrh + propojená lokální databáze','Fast – 1 AI blueprint + linked local dataset')}</option><option value="DETAILED">{tr('Detailní – AI připravuje každý záznam (výrazně pomalejší)','Detailed – AI writes every record (much slower)')}</option></select></label>}
            {mode==='SPARK' && <p className={styles.sparkHint} role="status">{tr('V rychlém režimu Spark vytvoří jeden krátký scénářový návrh a CYRIS podle něj lokálně sestaví celou sadu; detailní režim generuje záznamy postupně. Koncept před zveřejněním vždy zkontrolujte. Obrázky lze nyní přiřadit přímo k jednotlivým záznamům v rozpracovaném konceptu. Při publikaci se automaticky uloží do registru.','Fast mode asks Spark for one short scenario blueprint and CYRIS builds a linked local dataset; Detailed mode generates records page by page. Always review before publishing. Attach images directly to records inside the draft. On publication they become registry images automatically.')}</p>}
            {mode==='SPARK'&&<div><button type="button" className="btn btn-secondary" disabled={blueprintLoading||busy} onClick={()=>void importBlueprint()}>{blueprintLoading?tr('Načítám blueprint…','Loading blueprint…'):tr('Použít zadání z EXCON Architect','Use EXCON Architect blueprint')}</button>{blueprintRevision!==null&&<small>{tr('Převzatý text z revize','Copied text from revision')} {blueprintRevision} · {tr('Lze upravit; maximálně 1 200 znaků.','Editable; at most 1,200 characters.')}</small>}</div>}
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
            {mode==='SPARK' && (preset!=='CUSTOM' || countsValid) && <p className={styles.sparkHint}>{tr('Plánovaný počet AI požadavků bez opakování','Planned AI requests without retries')}: <strong>{inferenceCalls}</strong> · {tr('Nejde o časový odhad.','This is not an ETA.')}</p>}
            {!seedValid&&<p role="alert">{tr('Seed musí být celé 32bitové číslo.','Seed must be a 32-bit integer.')}</p>}
            <button className={styles.primary} disabled={!seedValid || (preset === 'CUSTOM' && !countsValid) || (mode === 'SPARK' && !brief.trim())} onClick={() => void action(runPreview)}>{mode === 'LOCAL' ? tr('Zobrazit náhled','Preview dataset') : tr('Připravit se Sparkem','Prepare with Spark')}</button>
          </fieldset>
        </section>
        <section aria-live="polite"><h2>{tr('Náhled','Preview')}</h2>
          {(draft || generating) && <div className={styles.progressPanel}>
            <strong>{draft ? draft.identifier : tr('Zakládám koncept…','Creating draft…')}</strong>
            <span>{progress ? progress.prepared + ' / ' + progress.expected + ' · ' + progress.percent + '%' : tr('Čekám na založení konceptu','Waiting for draft creation')}</span>
            <progress aria-label={tr('Průběh generování','Generation progress')} max={progress?.expected || 1} value={progress?.prepared ?? 0}/>
            <small>{(draft?.strategy ?? sparkStrategy) === 'FAST' ? tr('Rychlý režim: jeden AI návrh, poté lokální sestavení','Fast mode: one AI blueprint, then local assembly') : tr('Detailní režim: záznamy v uložených dávkách','Detailed mode: records in saved pages')}</small>
            {generating && <small>{tr('Čas tohoto pokusu','Elapsed this attempt')}: {formatElapsed(elapsed)} · {tr('Zakládám úlohu na serveru','Submitting server job')}</small>}
            {(generating||activeJob) && (draft?.strategy ?? sparkStrategy) === 'FAST' && <small>{tr('Rychlý režim aktualizuje počet až po uložení celé sady; 0 % během AI požadavku není chyba.','Fast mode updates the count after saving the complete dataset; 0% during the AI request is normal.')}</small>}
          </div>}
          {!view && <p>{tr('Vyberte datovou sadu a zde se zobrazí ukázkové záznamy.','Choose a dataset to see sample registry records here.')}</p>}
          {view?.personDetails?.map(p => <article key={p.name}><strong>{p.name}</strong><small>{tr('Narození','Born')} {p.dateOfBirth}</small><p>{p.description}</p></article>)}
          {view?.samples && keys.filter(k => k !== 'persons' && view.samples?.[k]?.length).map(k => <p key={k}><b>{kindName(k)}</b> · {view.samples?.[k]?.join(' · ')}</p>)}
          {preview && !draft && <small>{total(preview.counts)} {tr('záznamů','records')} · {preview.estimatedRelationships} {tr('vazeb','relationships')}</small>}
          {draft?.generation&&<p role="status">{({QUEUED:tr('Ve frontě','Queued'),RUNNING:tr('Spark generuje','Spark generating'),PAUSED:tr('Pozastaveno','Paused'),FAILED:tr('Chyba generování','Generation failed'),INTERRUPTED:tr('Přerušeno','Interrupted'),COMPLETED:tr('Připraveno','Ready')})[draft.generation.state]}{draft.generation.error&&' · '+(generationErrors[draft.generation.error]??draft.generation.error)}{draft.generation.pauseRequested&&tr(' · pozastavení vyžádáno',' · pause requested')}</p>}
          {activeJob&&draft&&<button disabled={busy||draft.generation?.pauseRequested} onClick={()=>void action(async()=>{const r=await apiClient.pauseScenarioDraft(eventId,draft.id);if(!r.ok||!r.data)throw Error(r.error||'Pause failed');if(alive.current)setDraft(r.data);})}>{tr('Pozastavit po aktuální dávce','Pause after current page')}</button>}
          {!busy && !activeJob && draft?.status === 'DRAFT' && !complete && <button disabled={qualityBusy} onClick={() => void action(() => generateDraft(draft))}>{tr('Pokračovat v konceptu','Resume draft')}</button>}
          {(complete || (preview && !draft)) && <button disabled={busy || qualityBusy} className={styles.primary} onClick={() => void action(publish)}>{tr('Zveřejnit v registru','Add to registry')}</button>}
        </section>
      </div>
      {draft && draft.status === 'DRAFT' && <ScenarioDraftMediaManager key={draft.id} eventId={eventId} batch={draft} />}
      {draft && draft.status === 'DRAFT' && <section className={styles.qualityPanel}>
        <header><div>
          <h2>{tr('Kontrola kvality před publikací','Scenario preflight')}</h2>
          <p>{tr('Ověří úplnost, duplicity a vazby. Skóre je orientační, nikoli záruka faktické správnosti generovaných dat.',
            'Checks completeness, duplicates and links. The score is advisory, not a guarantee that AI-generated facts are correct.')}</p>
        </div><button type="button" disabled={busy || qualityBusy} onClick={() => void inspectQuality()}>
          {qualityBusy ? tr('Kontroluji…','Checking…') : tr('Provést kontrolu','Run preflight')}</button></header>
        {quality && quality.batchId === draft.id && <div role="status">
          <strong>{tr('Orientační skóre','Advisory score')}: {quality.score}/100</strong>
          <span> · {quality.ready ? tr('Strukturálně připraveno','Structurally ready')
            : tr('Před zveřejněním opravte zjištěné chyby','Resolve structural failures before publishing')}</span>
          <p>{quality.preparedRecords}/{quality.expectedRecords} {tr('záznamů','records')}
            · {quality.relationships} {tr('vazeb','links')}
            · {quality.images} {tr('obrázků','images')}</p>
          <ul>{quality.checks.map(check => <li key={check.code}>
            <strong>{check.status}</strong> — {check.message}
          </li>)}</ul>
        </div>}
      </section>}

      <p role="status">{message || (busy ? tr('Pracuji…','Working…') : '')}</p>
      <section><h2>{tr('Historie generování','Generation history')}</h2>
        <div className={styles.historyFilters}>
          <label>{tr('Hledat sadu','Find dataset')}<input type="search" value={historyQuery} onChange={e=>setHistoryQuery(e.target.value)} placeholder={tr('Identifikátor, zadání, seed…','Identifier, brief, seed…')}/></label>
          <label>{tr('Stav','Status')}<select value={historyFilter} onChange={e=>setHistoryFilter(e.target.value)}><option value="ALL">{tr('Všechny','All')}</option>{['DRAFT','GENERATING','COMPLETED','FAILED','CLEANED'].map(status=><option key={status} value={status}>{statusName(status)}</option>)}</select></label>
          <button type="button" disabled={historyLoading} onClick={()=>void load()}>{tr('Obnovit historii','Refresh history')}</button>
        </div>
        {historyError && <p role="alert">{historyError}</p>}
        {historyLoading && <p role="status">{tr('Načítám historii…','Loading history…')}</p>}
        {!historyLoading && !historyError && history.length === 0 && <p>{batches.length ? tr('Žádné sady neodpovídají filtru.','No datasets match the filter.') : tr('Zatím nebyla vytvořena žádná sada.','No datasets yet.')}</p>}
        {history.map(b => <div className={styles.batch} key={b.id}>
          <span><button type="button" onClick={() => setDetail(detail?.id === b.id ? null : b)}>{b.identifier}</button> · {b.source === 'SPARK' ? 'Spark' : 'Local'} · {statusName(b.status)}{b.status==='DRAFT' && ' · '+(b.prepared ?? 0)+' / '+total(b.configuration)}{b.generation&&' · '+b.generation.state}<small>{total(b.configuration)} {tr('záznamů','records')} · seed {b.seed}{b.brief && ` · ${b.brief}`}</small></span>
          {b.status === 'COMPLETED' && <button type="button" disabled={busy} aria-expanded={mediaBatch?.id===b.id} onClick={() => {
            setMediaBatch(current=>current?.id===b.id?null:b);
          }}>{mediaBatch?.id === b.id ? tr('Zavřít obrázky','Close image manager') : tr('Spravovat obrázky','Manage record images')}</button>}
          {b.status === 'DRAFT' && <button disabled={busy || qualityBusy} onClick={() => void action(async () => {
            const r = await apiClient.getScenarioDataBatch(eventId, b.id);
            if (!r.ok || !r.data) throw Error(r.error ?? tr('Koncept není dostupný','Draft unavailable'));
            if (!alive.current || scope.current !== eventId || r.data.eventId !== eventId) return;
            setQuality(null);
            setPreview(null);
            setMode('SPARK');
            setSparkStrategy(r.data.strategy ?? 'DETAILED');
            setBrief(r.data.brief ?? '');
            setPreset(r.data.preset);
            setCounts(r.data.configuration);
            setSeed(r.data.seed);
            setDraft(r.data);
          })}>{tr('Otevřít koncept','Open draft')}</button>}
          {['DRAFT', 'COMPLETED'].includes(b.status) && <button disabled={busy || qualityBusy || ['QUEUED','RUNNING'].includes(b.generation?.state??'')} onClick={() => void action(async () => {
            if (!confirm(tr(`Opravdu odstranit ${b.identifier} z tohoto cvičení?`,`Remove ${b.identifier} from this event?`))) return;
            const r = await apiClient.cleanupScenarioData(eventId, b.id);
            if (!r.ok) throw Error(r.error ?? tr('Odstranění selhalo','Removal failed'));
            if (!alive.current || scope.current !== eventId) return;
            if (draft?.id === b.id) { setDraft(null); setQuality(null); }
            if (mediaBatch?.id === b.id) setMediaBatch(null);
            if (detail?.id === b.id) setDetail(null);
          })}>{b.status === 'DRAFT' ? tr('Zahodit koncept','Discard') : tr('Odstranit sadu','Clean up')}</button>}
        </div>)}
        {mediaBatch && mediaBatch.eventId===eventId && mediaBatch.status==='COMPLETED' && <ScenarioBatchMediaManager eventId={eventId} batch={mediaBatch} />}
        {detail && <aside><h3>{detail.identifier}</h3><p>{detail.preset} · {tr('generátor','generator')} v{detail.generatorVersion} · {detail.relationshipCount} {tr('vazeb','relationships')} · {new Date(detail.createdAt).toLocaleString()}</p><p>{keys.map(k => `${detail.configuration[k]} ${kindName(k)}`).join(' · ')}</p></aside>}
      </section>
    </main>
  </AppShell>;
}
